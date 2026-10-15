import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, FileJson, Plus, Search, Trash2 } from 'lucide-react';
import type { ModuleProps } from '../types';
import { useApp, type NotebookEntry } from '../../store/appStore';
import { getInstrument } from '../../data/instruments';
import { downloadFile } from '../../lib/persistence';
import { fmtTime } from '../../lib/formatting';
import { confirmAction, Empty } from '../../components/ui';
import { Markdown } from '../../components/Markdown';

const KIND_LABEL: Record<NotebookEntry['kind'], string> = { note: 'Note', 'ai-response': 'AI answer', report: 'Report', chart: 'Chart obs.', instrument: 'Instrument' };

function toMarkdown(list: NotebookEntry[]) {
  return list
    .map((n) => `# ${n.title}\n\n- Folder: ${n.folder}\n- Kind: ${KIND_LABEL[n.kind]}\n- Tags: ${n.tags.join(', ') || '—'}\n- Created: ${n.createdAt}\n- Updated: ${n.updatedAt}${n.instrumentId ? `\n- Instrument: ${n.instrumentId}` : ''}\n\n${n.body}\n`)
    .join('\n---\n\n');
}

export default function Notebook({ frame, updateSettings }: ModuleProps) {
  const notes = useApp((s) => s.notebook);
  const selectedInst = useApp((s) => s.selectedInstrumentId);
  const { addNote, updateNote, deleteNote } = useApp.getState();
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [editing, setEditing] = useState(false);
  const selectedId = frame.settings.selectedId as string | undefined;
  const folders = useMemo(() => Array.from(new Set(notes.map((n) => n.folder))).sort(), [notes]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return notes.filter((n) => (!folder || n.folder === folder) && (!s || `${n.title} ${n.body} ${n.tags.join(' ')} ${n.folder}`.toLowerCase().includes(s)));
  }, [notes, q, folder]);
  const sel = notes.find((n) => n.id === selectedId) ?? list[0];
  const [draft, setDraft] = useState<{ title: string; body: string; folder: string; tags: string }>({ title: '', body: '', folder: '', tags: '' });

  useEffect(() => {
    setEditing(false);
    if (sel) setDraft({ title: sel.title, body: sel.body, folder: sel.folder, tags: sel.tags.join(', ') });
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = () => {
    const inst = getInstrument(selectedInst);
    const id = addNote({ title: `Note on ${inst?.symbol ?? 'market'}`, body: '', kind: 'note', folder: folder || 'General', tags: inst ? [inst.symbol] : [], instrumentId: inst?.id });
    updateSettings({ selectedId: id });
    setTimeout(() => setEditing(true), 0);
  };

  return (
    <div className="row top fill" style={{ gap: 12, alignItems: 'stretch' }}>
      <div className="col gap-2" style={{ width: 240, flex: 'none', minHeight: 0 }}>
        <div className="neu-inset row" style={{ padding: '0 8px', height: 30 }}>
          <Search size={14} className="muted" />
          <input className="input" style={{ boxShadow: 'none', background: 'transparent', height: 28 }} placeholder="Search notes, tags…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notebook" />
        </div>
        <select className="select" value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
          <option value="">All folders ({notes.length})</option>
          {folders.map((f) => <option key={f} value={f}>{f} ({notes.filter((n) => n.folder === f).length})</option>)}
        </select>
        <div className="row gap-1">
          <button className="btn sm primary grow" onClick={create}><Plus /> New note</button>
          <button className="btn icon sm" disabled={!list.length} onClick={() => downloadFile('research-notebook.md', toMarkdown(list), 'text/markdown')} aria-label="Export Markdown" data-tip="Export Markdown"><Download /></button>
          <button className="btn icon sm" disabled={!list.length} onClick={() => downloadFile('research-notebook.json', JSON.stringify({ exportedAt: new Date().toISOString(), entries: list }, null, 2))} aria-label="Export JSON" data-tip="Export JSON"><FileJson /></button>
        </div>
        <div className="scroll col gap-1 grow">
          {list.length === 0 && <span className="small muted">No notes {q || folder ? 'match' : 'yet'}.</span>}
          {list.map((n) => (
            <button key={n.id} className={`neu-soft col ${sel?.id === n.id ? 'neu-pressed' : ''}`} style={{ textAlign: 'left', padding: '8px 10px', cursor: 'pointer', gap: 2, border: sel?.id === n.id ? '1px solid var(--accent)' : undefined }} onClick={() => updateSettings({ selectedId: n.id })}>
              <span className="bold small ellipsis">{n.title}</span>
              <span className="tiny muted">{KIND_LABEL[n.kind]} · {n.folder} · {fmtTime(n.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grow col gap-2" style={{ minHeight: 0 }}>
        {!sel ? (
          <Empty icon={<BookOpen />} title="Research Notebook is empty" hint="Save AI answers, reports and notes here — they persist in this browser." />
        ) : editing ? (
          <div className="col gap-2 fill">
            <input className="input bold" value={draft.title} maxLength={140} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" />
            <div className="grid g2">
              <input className="input" value={draft.folder} maxLength={40} placeholder="Folder" onChange={(e) => setDraft({ ...draft, folder: e.target.value })} aria-label="Folder" />
              <input className="input" value={draft.tags} placeholder="tags, comma separated" onChange={(e) => setDraft({ ...draft, tags: e.target.value })} aria-label="Tags" />
            </div>
            <textarea className="input grow" style={{ minHeight: 180 }} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Markdown supported: # heading, - bullets, **bold**" aria-label="Body" />
            <div className="row end">
              <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn primary" disabled={!draft.title.trim()} onClick={() => {
                updateNote(sel.id, { title: draft.title.trim(), body: draft.body, folder: draft.folder.trim() || 'General', tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12) });
                setEditing(false);
              }}>Save</button>
            </div>
          </div>
        ) : (
          <>
            <div className="row between top">
              <div className="col" style={{ gap: 2 }}>
                <h3>{sel.title}</h3>
                <span className="tiny muted">{KIND_LABEL[sel.kind]} · {sel.folder} · created {fmtTime(sel.createdAt)} · updated {fmtTime(sel.updatedAt)}</span>
              </div>
              <div className="row gap-1">
                <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn icon sm danger" aria-label="Delete note" onClick={async () => {
                  if (await confirmAction({ title: 'Delete this note?', body: sel.title, confirmLabel: 'Delete' })) {
                    deleteNote(sel.id);
                    updateSettings({ selectedId: undefined });
                  }
                }}><Trash2 /></button>
              </div>
            </div>
            <div className="row wrap gap-1">
              {sel.tags.map((t) => <span key={t} className="chip">{t}</span>)}
              {sel.instrumentId && <button className="chip clickable accent" onClick={() => useApp.getState().selectInstrument(sel.instrumentId!)}>{getInstrument(sel.instrumentId)?.symbol}</button>}
            </div>
            <div className="scroll grow neu-inset" style={{ padding: 12 }}>
              {sel.body.trim() ? <Markdown text={sel.body} /> : <span className="muted small">Empty note — click Edit.</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

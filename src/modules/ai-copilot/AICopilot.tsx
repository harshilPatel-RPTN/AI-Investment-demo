import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { AudioLines, Bot, Copy, FileText, RotateCcw, Save, Send, Square, Trash2, X } from 'lucide-react';
import { useFin } from '../../fin/finStore';
import { CURRENT_SCREEN } from '../../workspace/screen';
import type { ModuleProps } from '../types';
import type { AIAnalysis, AIResponse } from '../../types/ai';
import { useApp } from '../../store/appStore';
import { useWorkspace } from '../../workspace/WorkspaceStore';
import { callAI } from '../../lib/ai-client';
import { buildAIContext, type ContextOptions } from '../../lib/evidence';
import { uid } from '../../lib/formatting';
import { Markdown } from '../../components/Markdown';
import { AnalysisCard, analysisToMarkdown } from '../../components/AnalysisCard';
import { LinkedPicker, useLinkedInstrument } from '../shared';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  analysis?: AIAnalysis;
  error?: string;
  code?: string;
  tokens?: number;
  model?: string;
  thinking?: string;
  contextLabel?: string;
}

/** Session-only conversation store keyed by window id (survives minimise, not reload). */
const useChats = create<{ chats: Record<string, Msg[]>; set: (id: string, fn: (m: Msg[]) => Msg[]) => void }>((set) => ({
  chats: {},
  set: (id, fn) => set((s) => ({ chats: { ...s.chats, [id]: fn(s.chats[id] ?? []) } })),
}));

const SUGGESTIONS: Record<string, string[]> = {
  General: ['Give me a balanced read on this instrument using the supplied evidence.', 'What are the strongest opposing factors right now?', 'What data is missing that would change this view?'],
  Chart: ['Explain the current trend and momentum in simple terms.', 'Where would the technical picture be invalidated?'],
  News: ['How do the supplied headlines affect the outlook?', 'Which headline is most important and why?'],
  Risk: ['What are the key risks before taking a position?', 'How does volatility affect sensible position sizing here?'],
  Learn: ['Explain RSI and MACD as they apply to this chart.', 'What does the 20-bar realised volatility number mean?'],
};

export default function AICopilot({ frame, updateSettings }: ModuleProps) {
  const { inst } = useLinkedInstrument(frame);
  const tf = useApp((s) => s.timeframe);
  const style = useApp((s) => s.aiStyle);
  const inbox = useApp((s) => s.aiInbox);
  const aiStatus = useApp((s) => s.aiStatus);
  const { set: setApp, consumeInbox, addNote, toast, saveReport } = useApp.getState();
  const msgs = useChats((s) => s.chats[frame.id] ?? []);
  const setMsgs = (fn: (m: Msg[]) => Msg[]) => useChats.getState().set(frame.id, fn);
  // One copilot per screen consumes hand-offs from that screen's modules.
  const isPrimary = useWorkspace((s) => s.active().windows.find((w) => w.type === 'ai-copilot' && !w.minimized && (w.screenId ?? 'main') === CURRENT_SCREEN)?.id === frame.id);
  const mode = (frame.settings.mode as 'chat' | 'analyze') ?? 'chat';
  const opts: ContextOptions = { technical: true, fundamentals: true, news: true, events: true, community: true, ...((frame.settings.ctx as Partial<ContextOptions>) ?? {}) };
  const [input, setInput] = useState('');
  const [extra, setExtra] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastSend = useRef<{ q: string; t: number }>({ q: '', t: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs.length, loading]);

  const send = async (question: string, ctxExtra = extra) => {
    const q = question.trim();
    if (!q || loading) return;
    const now = Date.now();
    if (lastSend.current.q === q && now - lastSend.current.t < 2000) return; // debounce accidental repeats
    lastSend.current = { q, t: now };
    const context = buildAIContext(inst, tf, opts, ctxExtra ?? undefined);
    const included = [inst.symbol, tf, ...(Object.keys(opts) as Array<keyof ContextOptions>).filter((k) => opts[k]), ...(ctxExtra ? ['extra'] : [])].join(' · ');
    const history = msgs
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.role, content: (m.text ?? (m.analysis ? m.analysis.summary : '')).slice(0, 1500) }));
    setMsgs((m) => [...m, { id: uid('m'), role: 'user', text: q, contextLabel: included }]);
    setInput('');
    setLoading(true);
    abortRef.current = new AbortController();
    const res: AIResponse = await callAI({ mode: mode === 'analyze' ? 'analyze' : 'chat', question: q, style, context, history }, abortRef.current.signal);
    setLoading(false);
    if (res.code === 'cancelled') {
      setMsgs((m) => [...m, { id: uid('m'), role: 'assistant', error: 'Stopped.', code: 'cancelled' }]);
      return;
    }
    setMsgs((m) => [
      ...m,
      res.ok
        ? { id: uid('m'), role: 'assistant', text: res.text, analysis: res.analysis, thinking: res.thinking, tokens: res.usage?.total_tokens, model: res.model }
        : { id: uid('m'), role: 'assistant', error: res.error ?? 'Unknown error', code: res.code },
    ]);
    if (res.ok) setExtra(null);
  };

  // Consume hand-offs from other modules (chart summary, screener rows, watchlist…).
  useEffect(() => {
    if (!isPrimary || !inbox.length || loading) return;
    const item = inbox[0];
    consumeInbox(item.id);
    if (item.extra) setExtra(item.extra);
    if (item.autoSend) void send(item.question, item.extra ?? null);
    else setInput(item.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox, isPrimary, loading]);

  const retry = () => {
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (!lastUser?.text) return;
    lastSend.current = { q: '', t: 0 };
    setMsgs((m) => m.slice(0, m.lastIndexOf(lastUser)));
    void send(lastUser.text);
  };

  const content = (m: Msg) => m.text ?? (m.analysis ? analysisToMarkdown(m.analysis) : '');
  const toggleCtx = (k: keyof ContextOptions) => updateSettings({ ctx: { ...opts, [k]: !opts[k] } });

  return (
    <div className="col fill" style={{ gap: 0 }}>
      <div className="col gap-2" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="row between">
          <LinkedPicker frame={frame} update={updateSettings} />
          <div className="row gap-1">
            <select className="select" style={{ height: 26 }} value={style} onChange={(e) => setApp({ aiStyle: e.target.value as typeof style })} aria-label="Response style">
              <option value="simple">Simple</option>
              <option value="balanced">Balanced</option>
              <option value="advanced">Advanced</option>
            </select>
            <button className="btn sm" onClick={() => useFin.getState().open('immersive')} aria-label="Talk to FIN" data-tip="Voice conversation with FIN">
              <AudioLines /> FIN
            </button>
            <button className="btn icon sm" onClick={() => { abortRef.current?.abort(); setMsgs(() => []); setExtra(null); }} aria-label="Reset conversation" data-tip="Reset conversation">
              <Trash2 />
            </button>
          </div>
        </div>
        <div className="row wrap gap-1" aria-label="Context sent with the next message">
          <span className="tiny muted">Context:</span>
          <span className="chip accent">{inst.symbol}</span>
          <span className="chip accent">{tf}</span>
          <span className="chip accent" title="Always included — every answer reads the news and the community first">✓ news</span>
          <span className="chip accent" title="Always included — every answer reads the news and the community first">✓ community</span>
          {(['technical', 'fundamentals', 'events'] as const).map((k) => (
            <button key={k} className={`chip clickable ${opts[k] ? 'accent' : ''}`} onClick={() => toggleCtx(k)} aria-pressed={opts[k]} title={opts[k] ? 'Included — click to remove' : 'Excluded — click to include'}>
              {opts[k] ? '✓' : '+'} {k}
            </button>
          ))}
          {extra && (
            <span className="chip info" title={extra}>
              + attached evidence
              <button onClick={() => setExtra(null)} aria-label="Remove attached evidence"><X size={11} /></button>
            </span>
          )}
        </div>
        <div className="tabs" role="group" aria-label="Answer format">
          <button className={`tab ${mode === 'chat' ? 'active' : ''}`} onClick={() => updateSettings({ mode: 'chat' })}>Chat answer</button>
          <button className={`tab ${mode === 'analyze' ? 'active' : ''}`} onClick={() => updateSettings({ mode: 'analyze' })}>Structured card</button>
        </div>
      </div>

      <div className="grow scroll col gap-2" ref={listRef} style={{ padding: 12 }}>
        {aiStatus === 'no-key' && <div className="alert-box warning small">AI is not configured. Add GEMINI_API_KEY to the project .env file. The rest of the OS keeps working.</div>}
        {aiStatus === 'offline' && <div className="alert-box error small">AI proxy is offline. Start it with <code>npm run dev</code>. The rest of the OS keeps working.</div>}
        {msgs.length === 0 && (
          <div className="col gap-2">
            <div className="row gap-2 secondary"><Bot size={18} className="accent" /> Ask about <b>{inst.symbol}</b>. I only see the context chips above, never live data.</div>
            {Object.entries(SUGGESTIONS).map(([group, list]) => (
              <div key={group} className="col gap-1">
                <span className="section-title">{group}</span>
                <div className="row wrap gap-1">
                  {list.map((s) => (
                    <button key={s} className="chip clickable" style={{ height: 'auto', padding: '4px 10px', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
              <div className="chat-msg user">{m.text}</div>
              {m.contextLabel && <span className="tiny muted">sent with: {m.contextLabel}</span>}
            </div>
          ) : m.error ? (
            <div key={m.id} className="alert-box error row between" style={{ alignSelf: 'stretch' }}>
              <span className="small">{m.error}</span>
              {m.code !== 'no_key' && (
                <button className="btn sm" onClick={retry} disabled={loading}><RotateCcw /> Retry</button>
              )}
            </div>
          ) : (
            <div key={m.id} className="chat-msg assistant col gap-2" style={{ maxWidth: '100%', alignSelf: 'stretch' }}>
              {(m.thinking || m.analysis?.reasoning?.length) && (
                <details className="ai-thinking">
                  <summary>Thinking — how this answer was reached</summary>
                  {m.thinking ? <Markdown text={m.thinking} /> : <ol className="list-clean small">{m.analysis!.reasoning!.map((r, i) => <li key={i}>{r}</li>)}</ol>}
                </details>
              )}
              {m.analysis ? <AnalysisCard a={m.analysis} compact /> : <Markdown text={m.text ?? ''} />}
              <div className="row between" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
                <span className="tiny muted">{m.model ?? 'AI'}{m.tokens ? ` · ${m.tokens} tokens (reported by API)` : ''}</span>
                <div className="row gap-1">
                  <button className="btn icon sm ghost" data-tip="Copy" aria-label="Copy response" onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(content(m));
                      toast({ title: 'Copied', tone: 'success' });
                    } catch {
                      toast({ title: 'Clipboard unavailable', tone: 'warning' });
                    }
                  }}><Copy /></button>
                  <button className="btn icon sm ghost" data-tip="Save to notebook" aria-label="Save to notebook" onClick={() => {
                    addNote({ title: `AI: ${inst.symbol} — ${(msgs[msgs.indexOf(m) - 1]?.text ?? '').slice(0, 60)}`, body: content(m), kind: 'ai-response', folder: 'AI answers', tags: ['ai', inst.symbol], instrumentId: inst.id });
                    toast({ title: 'Saved to Research Notebook', tone: 'success' });
                  }}><Save /></button>
                  {m.analysis && (
                    <button className="btn icon sm ghost" data-tip="Open as report" aria-label="Open as report" onClick={() => {
                      const id = uid('rep');
                      saveReport({ id, question: msgs[msgs.indexOf(m) - 1]?.text ?? 'Analysis', instrumentId: inst.id, timeframe: tf, createdAt: new Date().toISOString(), analysis: m.analysis!, source: 'ai', model: m.model });
                      useWorkspace.getState().openApp('report');
                    }}><FileText /></button>
                  )}
                </div>
              </div>
            </div>
          ),
        )}
        {loading && (
          <div className="chat-msg assistant row gap-2">
            <span className="spinner" /> Reading the news and the community, then thinking…
          </div>
        )}
      </div>

      <form
        className="col gap-1"
        style={{ padding: 10, borderTop: '1px solid var(--border-subtle)' }}
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="row">
          <textarea
            className="input"
            rows={2}
            maxLength={2000}
            placeholder={`Ask about ${inst.symbol}…  (Enter to send, Shift+Enter for newline)`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            style={{ minHeight: 44 }}
          />
          {loading ? (
            <button type="button" className="btn" onClick={() => abortRef.current?.abort()} aria-label="Stop"><Square /> Stop</button>
          ) : (
            <button type="submit" className="btn primary" disabled={!input.trim()} aria-label="Send"><Send /></button>
          )}
        </div>
        <span className="tiny muted">AI cannot place trades.</span>
      </form>
    </div>
  );
}

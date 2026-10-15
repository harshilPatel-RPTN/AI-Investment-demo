import { useRef, useState } from 'react';
import { Bookmark, BookmarkCheck, CandlestickChart, Flag, ImagePlus, MessageSquare, Pencil, Reply, Send, Share2, ThumbsUp, Trash2, X } from 'lucide-react';
import type { Community, CommunityPost, DiscussionTimeframe, PostAttachment, Stance } from '../../types/community';
import { DISCUSSION_TIMEFRAMES } from '../../types/community';
import { ME } from '../../data/community/seed';
import { getInstrument } from '../../data/instruments';
import { confirmAction } from '../../components/ui';
import { useApp } from '../../store/appStore';
import { useCommunity } from './communityStore';
import { commentCount, timeAgo, validatePost } from './logic';
import { AuthorButton, Avatar, ChartPreview, InstrumentChip, profileOf, ReportDialog, StanceChip } from './parts';

const MAX_IMAGE = 300_000;

export function Composer({ community, editing, onDone }: { community: Community; editing?: CommunityPost; onDone: () => void }) {
  const { createPost, editPost } = useCommunity.getState();
  const toast = useApp((s) => s.toast);
  const [body, setBody] = useState(editing?.body ?? '');
  const [instrumentId, setInstrumentId] = useState(editing?.instrumentId ?? community.instrumentIds[0]);
  const [timeframe, setTimeframe] = useState<DiscussionTimeframe | ''>(editing?.timeframe ?? '');
  const [stance, setStance] = useState<Stance | ''>(editing?.stance ?? '');
  const [attachment, setAttachment] = useState<PostAttachment | undefined>(editing?.attachment);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const errors = validatePost({ communityId: community.id, body, instrumentId });

  const pickImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast({ title: 'Not an image', body: 'Choose a PNG, JPG, GIF or WebP file.', tone: 'error' });
    if (file.size > MAX_IMAGE) return toast({ title: 'Image too large', body: 'Images are stored in this browser, so keep them under 300 KB.', tone: 'error' });
    const r = new FileReader();
    r.onload = () => setAttachment({ kind: 'image', dataUrl: String(r.result), name: file.name });
    r.readAsDataURL(file);
  };

  const submit = () => {
    setTouched(true);
    if (errors.length || busy) return;
    setBusy(true);
    const extra = { instrumentId, timeframe: timeframe || undefined, stance: stance || undefined };
    const res = editing ? editPost(editing.id, { body, ...extra }) : createPost({ communityId: community.id, body, ...extra, attachment: attachment?.kind === 'chart' ? { kind: 'chart', instrumentId } : attachment });
    setBusy(false);
    if (!res.ok) return toast({ title: editing ? 'Could not save post' : 'Could not publish', body: res.error, tone: 'error' });
    toast({ title: editing ? 'Post updated' : `Posted to ${community.name}`, tone: 'success' });
    onDone();
  };

  return (
    <div className="neu-soft card col gap-2 cm-composer" aria-label={editing ? 'Edit post' : 'Create post'}>
      <div className="row gap-2" style={{ alignItems: 'flex-start' }}>
        <Avatar id={ME} />
        <div className="col grow gap-1">
          <textarea
            className="input"
            rows={4}
            autoFocus
            maxLength={2000}
            placeholder={`Share your view with the ${community.name}…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
            aria-invalid={touched && errors.length > 0}
          />
          <div className="row between tiny muted"><span>Ctrl + Enter to {editing ? 'save' : 'publish'}</span><span>{body.trim().length}/2000</span></div>
        </div>
      </div>
      <div className="grid g3">
        <div className="field">
          <label htmlFor="cm-inst">Instrument</label>
          <select id="cm-inst" className="select" value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
            {community.instrumentIds.map((id) => <option key={id} value={id}>{getInstrument(id)?.symbol ?? id}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cm-tf">Timeframe</label>
          <select id="cm-tf" className="select" value={timeframe} onChange={(e) => setTimeframe(e.target.value as DiscussionTimeframe | '')}>
            <option value="">Not specified</option>
            {DISCUSSION_TIMEFRAMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cm-stance">Your view</label>
          <select id="cm-stance" className="select" value={stance} onChange={(e) => setStance(e.target.value as Stance | '')}>
            <option value="">No view</option>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
      </div>
      {!editing && (
        <div className="row wrap gap-1">
          <button className={`btn sm ${attachment?.kind === 'chart' ? 'active' : ''}`} aria-pressed={attachment?.kind === 'chart'} onClick={() => setAttachment(attachment?.kind === 'chart' ? undefined : { kind: 'chart', instrumentId })}>
            <CandlestickChart /> Attach chart
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}><ImagePlus /> Attach image</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}
      {!editing && attachment?.kind === 'chart' && <ChartPreview instrumentId={instrumentId} />}
      {!editing && attachment?.kind === 'image' && (
        <div className="cm-image">
          <img src={attachment.dataUrl} alt={attachment.name} />
          <button className="btn icon sm" aria-label="Remove image" onClick={() => setAttachment(undefined)}><X /></button>
        </div>
      )}
      {touched && errors.length > 0 && <div className="alert-box error small" role="alert">{errors.join(' ')}</div>}
      <div className="row end gap-1">
        <button className="btn" onClick={onDone}>Cancel</button>
        <button className="btn primary" onClick={submit} disabled={busy}><Send /> {editing ? 'Save changes' : 'Publish'}</button>
      </div>
    </div>
  );
}

export function PostCard({ post, community, now, onOpenProfile }: { post: CommunityPost; community: Community; now: number; onOpenProfile: (id: string) => void }) {
  const comments = useCommunity((s) => commentCount(s.comments, post.id));
  const saved = useCommunity((s) => s.saved.includes(post.id));
  const reported = useCommunity((s) => s.reports.some((r) => r.targetId === post.id));
  const { toggleHelpful, toggleSave, deletePost } = useCommunity.getState();
  const toast = useApp((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const mine = post.authorId === ME;
  const helped = post.helpfulBy.includes(ME);

  if (editing) return <Composer community={community} editing={post} onDone={() => setEditing(false)} />;

  const share = async () => {
    const link = `${window.location.origin}${window.location.pathname}#community/${post.communityId}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Link copied', body: 'It opens on devices that have this post stored locally.', tone: 'success' });
    } catch {
      toast({ title: 'Copy failed', body: link, tone: 'warning' });
    }
  };

  return (
    <article className="neu-soft card col gap-2 cm-post" aria-label={`Post by ${profileOf(post.authorId).displayName}`}>
      <header className="row gap-2">
        <Avatar id={post.authorId} />
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <AuthorButton id={post.authorId} onOpen={onOpenProfile} />
          <span className="tiny muted">
            <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>{timeAgo(post.createdAt, now)}</time>
            {post.editedAt && ' · edited'} · <span style={{ color: community.accent }}>{community.short}</span>
          </span>
        </div>
        {mine && (
          <div className="row gap-1">
            <button className="btn icon sm ghost" aria-label="Edit post" data-tip="Edit" onClick={() => setEditing(true)}><Pencil /></button>
            <button className="btn icon sm ghost danger" aria-label="Delete post" data-tip="Delete" onClick={async () => {
              if (await confirmAction({ title: 'Delete this post?', body: 'The post and its comments will be removed.', confirmLabel: 'Delete' })) {
                const r = deletePost(post.id);
                toast(r.ok ? { title: 'Post deleted', tone: 'success' } : { title: 'Could not delete', body: r.error, tone: 'error' });
              }
            }}><Trash2 /></button>
          </div>
        )}
      </header>
      {(post.instrumentId || post.timeframe || post.stance) && (
        <div className="row wrap gap-1">
          {post.instrumentId && <InstrumentChip id={post.instrumentId} />}
          {post.stance && <StanceChip stance={post.stance} />}
          {post.timeframe && <span className="chip">{post.timeframe}</span>}
        </div>
      )}
      <p className="cm-body">{post.body}</p>
      {post.attachment?.kind === 'chart' && <ChartPreview instrumentId={post.attachment.instrumentId} />}
      {post.attachment?.kind === 'image' && <div className="cm-image"><img src={post.attachment.dataUrl} alt={post.attachment.name} loading="lazy" /></div>}
      <footer className="row wrap gap-1 cm-actions">
        <button className={`btn sm ghost ${helped ? 'active' : ''}`} aria-pressed={helped} disabled={mine} onClick={() => toggleHelpful('post', post.id)} data-tip={mine ? 'You cannot mark your own post helpful' : 'Helpful'}>
          <ThumbsUp /> {post.helpfulBy.length}
        </button>
        <button className={`btn sm ghost ${open ? 'active' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}><MessageSquare /> {comments}</button>
        <button className="btn sm ghost" onClick={share} aria-label="Copy share link"><Share2 /> Share</button>
        <button className={`btn sm ghost ${saved ? 'active' : ''}`} aria-pressed={saved} onClick={() => { toggleSave(post.id); toast({ title: saved ? 'Removed from saved' : 'Post saved', tone: 'info' }); }}>
          {saved ? <BookmarkCheck /> : <Bookmark />} {saved ? 'Saved' : 'Save'}
        </button>
        {!mine && (
          <button className="btn sm ghost" disabled={reported} onClick={() => setReporting(true)} style={{ marginLeft: 'auto' }}>
            <Flag /> {reported ? 'Reported' : 'Report'}
          </button>
        )}
      </footer>
      {open && <CommentThread targetId={post.id} now={now} onOpenProfile={onOpenProfile} />}
      {reporting && <ReportDialog targetId={post.id} what="post" onClose={() => setReporting(false)} />}
    </article>
  );
}

function CommentBox({ onSubmit, placeholder, autoFocus }: { onSubmit: (body: string) => boolean; placeholder: string; autoFocus?: boolean }) {
  const [v, setV] = useState('');
  const send = () => { if (onSubmit(v)) setV(''); };
  return (
    <div className="row gap-1">
      <input className="input grow" value={v} maxLength={1000} placeholder={placeholder} autoFocus={autoFocus} aria-label={placeholder}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
      <button className="btn sm primary" onClick={send} disabled={!v.trim()} aria-label="Send"><Send /></button>
    </div>
  );
}

export function CommentThread({ targetId, now, onOpenProfile }: { targetId: string; now: number; onOpenProfile: (id: string) => void }) {
  const all = useCommunity((s) => s.comments);
  const { addComment, deleteComment, toggleHelpful } = useCommunity.getState();
  const toast = useApp((s) => s.toast);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const list = all.filter((c) => c.targetId === targetId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const top = list.filter((c) => !c.parentId);

  const submit = (body: string, parentId: string | null) => {
    const r = addComment(targetId, body, parentId);
    if (!r.ok) toast({ title: 'Could not comment', body: r.error, tone: 'error' });
    else setReplyTo(null);
    return r.ok;
  };

  const render = (c: (typeof list)[number], isReply: boolean) => {
    const mine = c.authorId === ME;
    return (
      <div key={c.id} className={`cm-comment ${isReply ? 'reply' : ''}`}>
        <Avatar id={c.authorId} size={24} />
        <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
          <div className="row wrap gap-1"><AuthorButton id={c.authorId} onOpen={onOpenProfile} /><span className="tiny muted">{timeAgo(c.createdAt, now)}</span></div>
          <p className="small cm-body">{c.body}</p>
          <div className="row gap-1">
            <button className={`btn sm ghost ${c.helpfulBy.includes(ME) ? 'active' : ''}`} disabled={mine} aria-pressed={c.helpfulBy.includes(ME)} onClick={() => toggleHelpful('comment', c.id)}><ThumbsUp /> {c.helpfulBy.length}</button>
            {!isReply && <button className="btn sm ghost" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}><Reply /> Reply</button>}
            {mine && <button className="btn sm ghost danger" onClick={() => deleteComment(c.id)} aria-label="Delete comment"><Trash2 /></button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="col gap-2 cm-thread">
      {top.length === 0 && <span className="small muted">No comments yet — start the discussion.</span>}
      {top.map((c) => (
        <div key={c.id} className="col gap-1">
          {render(c, false)}
          {list.filter((r) => r.parentId === c.id).map((r) => render(r, true))}
          {replyTo === c.id && <div className="cm-comment reply"><CommentBox autoFocus placeholder="Write a reply…" onSubmit={(b) => submit(b, c.id)} /></div>}
        </div>
      ))}
      <CommentBox placeholder="Add a comment…" onSubmit={(b) => submit(b, null)} />
    </div>
  );
}

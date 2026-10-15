import { useState } from 'react';
import { BellOff, Check, X } from 'lucide-react';
import { useApp, type NotificationCategory } from '../store/appStore';
import { fmtTime } from '../lib/formatting';
import { Empty } from '../components/ui';

const CATS: Array<{ id: NotificationCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'price', label: 'Price' },
  { id: 'screener', label: 'Screener' },
  { id: 'ai', label: 'AI' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'event', label: 'Events' },
  { id: 'system', label: 'System' },
];

const SEV_COLOR = { info: 'var(--sev-info)', warning: 'var(--sev-warn)', critical: 'var(--sev-crit)', success: 'var(--positive)' };

export function NotificationCentre() {
  const items = useApp((s) => s.notifications);
  const { markRead, dismissNotification, clearNotifications } = useApp.getState();
  const [cat, setCat] = useState<NotificationCategory | 'all'>('all');
  const list = items.filter((n) => cat === 'all' || n.category === cat);
  return (
    <div className="popover neu-raised" role="dialog" aria-label="Notification centre">
      <div className="row between" style={{ padding: '12px 14px 8px' }}>
        <h3>Notifications</h3>
        <div className="row gap-1">
          <button className="btn sm" onClick={() => markRead()} disabled={!items.some((n) => !n.read)}>
            <Check /> Read all
          </button>
          <button className="btn sm danger" onClick={clearNotifications} disabled={!items.length}>
            Clear all
          </button>
        </div>
      </div>
      <div style={{ padding: '0 12px 8px' }}>
        <div className="row wrap gap-1">
          {CATS.map((c) => (
            <button key={c.id} className={`chip clickable ${cat === c.id ? 'accent' : ''}`} onClick={() => setCat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {list.length === 0 && <Empty icon={<BellOff />} title="No notifications" />}
        {list.map((n) => (
          <div key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => markRead(n.id)}>
            <span className="dot" style={{ background: SEV_COLOR[n.severity] }} />
            <div className="grow">
              <div className="row between">
                <span className="bold">{n.title}</span>
                <span className="chip tiny">{n.category}</span>
              </div>
              <div className="small secondary">{n.body}</div>
              <div className="tiny muted">{fmtTime(n.createdAt)}</div>
            </div>
            <button className="btn icon sm ghost" aria-label="Dismiss" onClick={(e) => { e.stopPropagation(); dismissNotification(n.id); }}>
              <X />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

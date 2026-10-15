import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useApp } from '../store/appStore';

const ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };
const COLOR = { info: 'var(--info)', success: 'var(--positive)', warning: 'var(--warning)', error: 'var(--negative)' };

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className="toast neu-raised" role="status">
            <Icon size={18} style={{ color: COLOR[t.tone], flex: 'none', marginTop: 1 }} />
            <div className="grow">
              <div className="bold">{t.title}</div>
              {t.body && <div className="small secondary">{t.body}</div>}
            </div>
            <button className="btn icon sm ghost" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X />
            </button>
          </div>
        );
      })}
    </div>
  );
}

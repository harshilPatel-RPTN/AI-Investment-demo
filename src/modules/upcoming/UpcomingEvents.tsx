import { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { ModuleProps } from '../types';
import { Empty } from '../../components/ui';
import { apiFetch } from '../../lib/apiFetch';

interface LiveEvent {
  id: string;
  name: string;
  title: string;
  timeUtc: string;
  allDay: boolean;
  impact: 'high' | 'medium' | 'low';
  category: 'central-bank' | 'data';
  consensus: string | null;
  prior: string | null;
  actual: string | null;
  url: string;
  region: string;
  affects: string[];
}

const REGION_NAME: Record<string, string> = { US: 'United States', EU: 'Euro area', UK: 'United Kingdom', JP: 'Japan', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand', CH: 'Switzerland', CN: 'China', IN: 'India' };

function dayLabel(d: Date) {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((d0 - t0) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Live economic calendar (financecalendar.com): what's coming up that can move gold, silver, oil and forex. */
export default function UpcomingEvents({ frame, updateSettings }: ModuleProps) {
  const highOnly = frame.settings.highOnly !== false;
  const [events, setEvents] = useState<LiveEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await apiFetch('/api/live/calendar?days=14');
        const j = (await r.json()) as { ok: boolean; events?: LiveEvent[]; error?: string };
        if (!alive) return;
        if (j.ok) {
          setEvents(j.events ?? []);
          setError(null);
        } else setError(j.error ?? 'Calendar unavailable');
      } catch {
        if (alive) setError('Calendar server unreachable');
      }
    };
    void load();
    const t = setInterval(load, 30 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const groups = useMemo(() => {
    const now = Date.now() - 2 * 3600_000; // keep releases from the last 2h (to show actuals)
    const list = (events ?? []).filter((e) => new Date(e.timeUtc).getTime() >= now && (!highOnly || e.impact === 'high'));
    const m = new Map<string, LiveEvent[]>();
    for (const e of list) {
      const k = dayLabel(new Date(e.timeUtc));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return Array.from(m.entries());
  }, [events, highOnly]);

  return (
    <div className="ue">
      <div className="mn-head">
        <div className="mn-filters" role="tablist" aria-label="Importance">
          <button role="tab" aria-selected={highOnly} className={`mn-chip ${highOnly ? 'on' : ''}`} onClick={() => updateSettings({ highOnly: true })}>High impact</button>
          <button role="tab" aria-selected={!highOnly} className={`mn-chip ${!highOnly ? 'on' : ''}`} onClick={() => updateSettings({ highOnly: false })}>All</button>
        </div>
        <span className="tiny muted">Next 14 days · your local time</span>
      </div>

      <div className="mn-list">
        {!events && !error && [0, 1, 2].map((i) => <div key={i} className="mn-skel"><div className="skeleton" style={{ width: '70%' }} /><div className="skeleton" style={{ width: '40%' }} /></div>)}
        {error && !events && <Empty icon={<CalendarClock />} title="Calendar unavailable" hint={error} />}
        {events && !groups.length && <Empty icon={<CalendarClock />} title="Nothing scheduled" hint={highOnly ? 'No high-impact releases in the next 14 days. Try “All”.' : undefined} />}
        {groups.map(([day, list]) => (
          <div key={day} className="ue-day">
            <div className="ue-dayname">{day}</div>
            {list.map((e) => {
              const t = new Date(e.timeUtc);
              const past = t.getTime() < Date.now();
              return (
                <a key={e.id} className={`ue-row ${past ? 'past' : ''}`} href={e.url} target="_blank" rel="noopener noreferrer">
                  <span className="ue-time">{e.allDay ? 'All day' : t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={`ue-dot ${e.impact}`} title={`${e.impact} impact`} />
                  <span className="ue-main">
                    <span className="ue-name">
                      <span className="ue-flag" title={REGION_NAME[e.region] ?? e.region}>{e.region}</span>{e.name}
                      {e.category === 'central-bank' && <span className="ue-cb">rate decision</span>}
                    </span>
                    <span className="ue-sub">
                      {e.actual ? <><b>Actual</b> {e.actual} · </> : null}
                      {e.consensus ? <>Forecast {e.consensus} · </> : null}
                      {e.prior ? <>Prior {e.prior}</> : null}
                      {!e.actual && !e.consensus && !e.prior && <>Moves: {e.affects.join(', ')}</>}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mn-foot">
        <span className="live-dot" /> Live · data from <a href="https://www.financecalendar.com" target="_blank" rel="noopener noreferrer">financecalendar.com</a>
      </div>
    </div>
  );
}

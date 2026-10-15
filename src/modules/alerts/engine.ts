import { useEffect } from 'react';
import { useApp, type AlertRule } from '../../store/appStore';
import { getInstrument, getInstruments } from '../../data/instruments';
import { allMetrics, computeMetrics } from '../../lib/calculations/metrics';
import { runScreen } from '../../lib/calculations/screener';
import { getEvents } from '../../data/events';
import { fmtPct, fmtPrice } from '../../lib/formatting';
import { IS_MAIN_SCREEN } from '../../workspace/screen';

export interface AlertCheck {
  triggered: boolean;
  message: string;
}

/** Evaluates a rule against the current simulated snapshot. Optional price override supports simulated moves. */
export function checkAlert(rule: AlertRule, override?: { instrumentId: string; price: number; changePercent: number }): AlertCheck {
  const inst = rule.instrumentId ? getInstrument(rule.instrumentId) : undefined;
  const px = inst && override?.instrumentId === inst.id ? override.price : inst?.price;
  const chg = inst && override?.instrumentId === inst.id ? override.changePercent : inst?.changePercent;
  const t = rule.threshold ?? NaN;
  switch (rule.kind) {
    case 'price-above':
      if (!inst || px == null) return { triggered: false, message: 'Instrument missing' };
      return { triggered: px > t, message: `${inst.symbol} at ${fmtPrice(inst, px)} is ${px > t ? 'above' : 'not above'} ${fmtPrice(inst, t)} ${inst.quoteCurrency}` };
    case 'price-below':
      if (!inst || px == null) return { triggered: false, message: 'Instrument missing' };
      return { triggered: px < t, message: `${inst.symbol} at ${fmtPrice(inst, px)} is ${px < t ? 'below' : 'not below'} ${fmtPrice(inst, t)} ${inst.quoteCurrency}` };
    case 'pct-move':
      if (!inst || chg == null) return { triggered: false, message: 'Instrument missing' };
      return { triggered: Math.abs(chg) >= Math.abs(t), message: `${inst.symbol} day move ${fmtPct(chg)} vs threshold ±${Math.abs(t)}%` };
    case 'rsi-above':
    case 'rsi-below': {
      if (!inst) return { triggered: false, message: 'Instrument missing' };
      const r = computeMetrics(inst).rsi14;
      if (r == null) return { triggered: false, message: 'RSI unavailable (insufficient data)' };
      const hit = rule.kind === 'rsi-above' ? r > t : r < t;
      return { triggered: hit, message: `${inst.symbol} RSI(14) ${r.toFixed(1)} ${rule.kind === 'rsi-above' ? '>' : '<'} ${t}: ${hit ? 'yes' : 'no'}` };
    }
    case 'screener': {
      const sc = useApp.getState().screens.find((s) => s.id === rule.screenId);
      if (!sc) return { triggered: false, message: 'Saved screen not found' };
      const res = runScreen(sc, getInstruments(), allMetrics());
      return { triggered: res.length > 0, message: `Screen “${sc.name}” matches ${res.length} instrument(s)${res.length ? `: ${res.slice(0, 4).map((r) => r.inst.symbol).join(', ')}` : ''}` };
    }
    case 'event': {
      const ev = getEvents().find((e) => e.id === rule.eventId);
      if (!ev) return { triggered: false, message: 'Event not found' };
      return { triggered: true, message: `Scheduled event: ${ev.title} (${ev.date.slice(0, 10)})` };
    }
  }
}

export function fireAlert(rule: AlertRule, message: string, prefix = 'Alert') {
  const app = useApp.getState();
  app.notify({ title: `${prefix}: ${rule.name}`, body: `${message}.`, category: rule.kind === 'screener' ? 'screener' : rule.kind === 'event' ? 'event' : 'price', severity: rule.severity });
  app.upsertAlert({ ...rule, lastTriggeredAt: new Date().toISOString() });
}

/** Re-evaluates enabled rules when rules or the demo data set change. Fires each rule at most once until it resets. */
export function useAlertEngine() {
  const alerts = useApp((s) => s.alerts);
  const epoch = useApp((s) => s.dataEpoch);
  useEffect(() => {
    if (!IS_MAIN_SCREEN) return; // only the main screen evaluates rules; notifications sync to other screens
    for (const rule of alerts) {
      if (!rule.enabled || rule.kind === 'event') continue;
      const res = checkAlert(rule);
      if (res.triggered && !rule.lastTriggeredAt) fireAlert(rule, res.message);
      else if (!res.triggered && rule.lastTriggeredAt) useApp.getState().upsertAlert({ ...rule, lastTriggeredAt: undefined }); // re-arm
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => `${a.id}:${a.enabled}:${a.kind}:${a.threshold}:${a.instrumentId}:${a.screenId}`).join('|'), epoch]);
}

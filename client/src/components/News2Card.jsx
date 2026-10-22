import { RISK_CADENCE, RISK_LABEL, RISK_SEVERITY } from '@vitalwatch/shared/news2.js';
import { Card, cx } from './ui';

const PART_LABELS = {
  rr: 'Respiration',
  spo2: 'SpO₂',
  oxygen: 'Supplemental O₂',
  sbp: 'Systolic BP',
  hr: 'Pulse',
  consciousness: 'Consciousness',
  temp: 'Temperature',
};

const TONE = {
  critical: 'bg-danger text-white',
  warning: 'bg-warn text-white',
  info: 'bg-sunken text-ink',
  ok: 'bg-okSoft text-ok',
};

/**
 * The aggregate score, broken out by parameter.
 *
 * A bare number is not actionable — the reason the score is 6 is the whole
 * point, so each contributing parameter is shown with what it added. This is
 * the panel that explains an alert nothing else on the page would justify.
 */
export default function News2Card({ score }) {
  if (!score) {
    return (
      <Card className="grid place-items-center py-10 text-[13px] text-muted">
        Not enough parameters yet
      </Card>
    );
  }

  const tone = RISK_SEVERITY[score.risk] ?? 'ok';
  const parts = Object.entries(score.parts).filter(([, v]) => v != null);

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-4">
        <div
          className={cx('grid h-16 w-16 shrink-0 place-items-center rounded-tile', TONE[tone])}
        >
          <span className="tabular text-2xl font-extrabold leading-none">{score.total}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            NEWS2 aggregate
          </p>
          <p className="font-bold leading-tight">{RISK_LABEL[score.risk]}</p>
          <p className="text-[13px] text-muted">Observations: {RISK_CADENCE[score.risk]}</p>
        </div>
      </div>

      {!score.complete && (
        <p className="rounded-tile bg-warnSoft px-3 py-2 text-[12px] font-semibold text-warn">
          Partial score — one or more devices are offline, so this reads lower than the
          patient's true score.
        </p>
      )}

      <div className="space-y-1">
        {parts.map(([key, value]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-[12px] font-semibold text-muted">
              {PART_LABELS[key]}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <div
                className={cx(
                  'h-full rounded-full transition-all',
                  value >= 3 ? 'bg-danger' : value >= 2 ? 'bg-warn' : 'bg-ok',
                )}
                style={{ width: `${(value / 3) * 100}%` }}
              />
            </div>
            <span
              className={cx(
                'tabular w-7 shrink-0 text-right text-[12px] font-bold',
                value >= 3 ? 'text-danger' : value >= 1 ? 'text-warn' : 'text-muted',
              )}
            >
              +{value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

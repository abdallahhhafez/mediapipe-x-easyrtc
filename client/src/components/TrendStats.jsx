import { cx } from './ui';
import { Chart } from '../lib/icons';

/**
 * The shape of the series, not the last reading in it.
 *
 * Time in range is the headline because it is the number chronic-disease care
 * is actually managed on — an average hides a day spent swinging between 50
 * and 300 behind a respectable-looking mean.
 */

const ARROW = { rising: '↑', falling: '↓', steady: '→' };

const tirTone = (pct) => (pct == null ? 'bg-sunken' : pct >= 0.7 ? 'bg-okSoft text-ok' : pct >= 0.5 ? 'bg-warnSoft text-warn' : 'bg-danger/10 text-danger');

function Tile({ label, value, hint, className }) {
  return (
    <div className={cx('rounded-tile p-4', className || 'bg-sunken')}>
      <p className="text-[12px] font-semibold opacity-70">{label}</p>
      <p className="tabular mt-1 text-xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] opacity-70">{hint}</p>}
    </div>
  );
}

export default function TrendStats({ spec, insights, className }) {
  if (!insights) return null;
  const { timeInRange, inRangeOf, mean7, cv, trend, streakDays, estimatedA1c } = insights;
  const round = (v, dp = 0) => (v == null ? '—' : (Math.round(v * 10 ** dp) / 10 ** dp).toFixed(dp));

  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">
        <Chart size={14} /> {spec.label} — last 7 days
      </p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Tile
          label="Time in range"
          value={timeInRange == null ? '—' : `${Math.round(timeInRange * 100)}%`}
          hint={inRangeOf ? `${inRangeOf} readings` : undefined}
          className={tirTone(timeInRange)}
        />
        <Tile label="Average" value={mean7 == null ? '—' : `${round(mean7, spec.unit === '%' ? 1 : 0)}`} hint={spec.unit} />
        <Tile
          label="Variability"
          value={cv == null ? '—' : `${Math.round(cv * 100)}%`}
          hint={cv == null ? undefined : cv < 0.36 ? 'stable' : 'erratic'}
        />
        <Tile
          label="Direction"
          value={`${ARROW[trend?.direction] ?? '→'} ${trend?.direction ?? 'steady'}`}
          hint={streakDays > 0 ? `${streakDays}-day streak in range` : '14-day trend'}
        />
      </div>
      {estimatedA1c != null && (
        <p className="mt-2 px-1 text-[12px] text-muted">
          Estimated HbA1c from these readings: <span className="font-bold text-ink">{estimatedA1c}%</span> — an indicator
          between lab tests, not a replacement for one.
        </p>
      )}
    </div>
  );
}

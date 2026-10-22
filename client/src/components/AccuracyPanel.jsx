import { METRICS } from '@vitalwatch/shared/metrics.js';
import { Card, cx } from './ui';

const ENGINE_LABEL = {
  mediapipe: 'MediaPipe ImageClassifier',
  segments: 'Seven-segment decoder',
  starting: 'Starting…',
  unsupported: 'Not supported in this browser',
};

/**
 * How well the vision pipeline is reading the screen, right now.
 *
 * Two numbers matter and they are different: agreement is whether the digits
 * it committed to were right, and abstention is how often it refused to commit.
 * A reader at 100% agreement that abstains on nine frames in ten is not
 * working, and only showing the first number would hide that.
 */
export default function AccuracyPanel({ engine, stats }) {
  const pct = stats?.windowed;
  const tone = pct == null ? 'muted' : pct >= 0.99 ? 'ok' : pct >= 0.95 ? 'warn' : 'danger';
  const detector = stats?.detector;
  const abstainRate =
    detector && detector.accepted + detector.rejected > 0
      ? detector.rejected / (detector.accepted + detector.rejected)
      : null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Reader accuracy
          </p>
          <p
            className={cx(
              'tabular text-3xl font-extrabold leading-tight',
              tone === 'ok' && 'text-ok',
              tone === 'warn' && 'text-warn',
              tone === 'danger' && 'text-danger',
              tone === 'muted' && 'text-muted',
            )}
          >
            {pct == null ? '—' : `${(pct * 100).toFixed(1)}%`}
          </p>
          <p className="text-[12px] text-muted">
            last {stats?.samples ?? 0} comparisons vs. the telemetry
          </p>
          {stats?.feedDelayMs != null && (
            <p className="mt-1 text-[12px] text-muted">
              feed running{' '}
              <span className="tabular font-bold text-ink">{stats.feedDelayMs} ms</span> behind
            </p>
          )}
        </div>

        <div className="text-right">
          <span className="chip text-[12px]">{ENGINE_LABEL[engine] ?? engine}</span>
          {abstainRate != null && (
            <p className="mt-2 text-[12px] text-muted">
              abstained on{' '}
              <span className="tabular font-bold text-ink">
                {(abstainRate * 100).toFixed(1)}%
              </span>{' '}
              of readings
            </p>
          )}
        </div>
      </div>

      {stats?.perMetric && (
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(stats.perMetric).map(([metric, m]) => {
            const total = m.correct + m.wrong;
            const rate = total ? m.correct / total : null;
            return (
              <div key={metric} className="rounded-tile bg-sunken px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  {METRICS[metric]?.short ?? metric}
                </p>
                <p
                  className={cx(
                    'tabular text-sm font-extrabold',
                    rate != null && rate < 0.99 && 'text-warn',
                    rate != null && rate < 0.95 && 'text-danger',
                  )}
                >
                  {rate == null ? '—' : `${(rate * 100).toFixed(0)}%`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {stats?.mismatches?.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Recent misreads
          </p>
          <ul className="space-y-1">
            {stats.mismatches.slice(0, 4).map((m, i) => (
              <li key={i} className="tabular text-[12px] text-muted">
                {m.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

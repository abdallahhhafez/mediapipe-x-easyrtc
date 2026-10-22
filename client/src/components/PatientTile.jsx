import { Link } from 'react-router-dom';
import { METRICS, formatValue } from '@vitalwatch/shared/metrics.js';
import { severityFor } from '@vitalwatch/shared/bands.js';
import { RISK_LABEL, RISK_SEVERITY } from '@vitalwatch/shared/news2.js';
import { Avatar, cx } from './ui';
import Sparkline from './Sparkline';
import { freshness } from '../lib/format';

/** The four a nurse scans first. The rest are one click away on the monitor. */
const TILE_METRICS = ['hr', 'spo2', 'rr', 'bp'];

const SCORE_TONE = {
  critical: 'bg-danger text-white',
  warning: 'bg-warn text-white',
  info: 'bg-sunken text-ink',
  ok: 'bg-okSoft text-ok',
};

const EDGE = {
  critical: 'ring-2 ring-danger/40',
  warning: 'ring-2 ring-warn/35',
};

/**
 * One patient on the ward board.
 *
 * Everything on it answers "do I need to walk over there": the NEWS2 score at
 * card size, four values with their own band colouring, and an unmistakable
 * state for a patient whose devices have gone quiet — because silence is the
 * failure mode that looks most like everything being fine.
 */
export default function PatientTile({ patient, live }) {
  const score = live?.score;
  const risk = score?.risk ?? 'none';
  const tone = RISK_SEVERITY[risk] ?? 'ok';
  const alerts = live?.alerts ?? patient.alerts ?? {};
  const offline = isOffline(live);
  const worst = alerts.critical ? 'critical' : alerts.warning ? 'warning' : null;

  return (
    <Link
      to={`/station/${patient._id}`}
      className={cx(
        'card block p-5 transition hover:shadow-lift',
        !offline && worst && EDGE[worst],
        offline && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar src={patient.avatar} name={patient.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{patient.name}</p>
          <p className="truncate text-[12px] text-muted">
            {patient.room} · {patient.condition}
          </p>
        </div>

        <div
          className={cx(
            'grid h-12 w-12 shrink-0 place-items-center rounded-tile',
            offline ? 'bg-sunken text-muted' : SCORE_TONE[tone],
          )}
          title={`NEWS2 — ${RISK_LABEL[risk]}`}
        >
          <span className="tabular text-xl font-extrabold leading-none">
            {offline || score == null ? '–' : score.total}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {TILE_METRICS.map((key) => {
          const spec = METRICS[key];
          const reading = live?.latest?.[key];
          const sev = reading ? severityFor(spec, reading.value, reading.value2) : null;

          return (
            <div key={key} className="rounded-tile bg-sunken px-2 py-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {spec.short}
              </p>
              <p
                className={cx(
                  'tabular text-[15px] font-extrabold leading-tight',
                  sev === 'critical' && 'text-danger',
                  sev === 'warning' && 'text-warn',
                )}
              >
                {offline || !reading
                  ? '––'
                  : spec.dual && reading.value2 != null
                    ? `${formatValue(spec, reading.value)}/${formatValue(spec, reading.value2)}`
                    : formatValue(spec, reading.value)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Sparkline
          series={live?.series?.spo2 ?? []}
          tone={worst === 'critical' ? 'danger' : worst === 'warning' ? 'warn' : 'ink'}
          className="flex-1"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cx(
            'inline-flex items-center gap-1.5 text-[12px] font-semibold',
            offline ? 'text-muted' : 'text-ok',
          )}
        >
          <span
            className={cx(
              'h-2 w-2 rounded-full',
              offline ? 'bg-muted' : 'animate-pulse bg-ok',
            )}
          />
          {offline ? 'No signal' : freshness(live?.lastSeen)}
        </span>

        {worst && (
          <span
            className={cx(
              'rounded-full px-2.5 py-0.5 text-[11px] font-bold',
              worst === 'critical' ? 'bg-dangerSoft text-danger' : 'bg-warnSoft text-warn',
            )}
          >
            {(alerts.critical ?? 0) + (alerts.warning ?? 0)} open
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * Matches the server's staleness threshold.
 *
 * Presence events alone are not enough: a device that stopped before this nurse
 * opened the board produced its disconnect while nobody was subscribed, so the
 * tile would sit there green with a quietly ageing timestamp. Silence has to be
 * derived from the clock, not only from an event someone might have missed.
 */
const STALE_MS = 20_000;

export function isOffline(live) {
  if (!live?.online) return true;
  if (!live.lastSeen) return true;
  return Date.now() - live.lastSeen > STALE_MS;
}

/**
 * Board order. Acuity first, and an offline patient is ranked as a problem
 * rather than sorted to the bottom — a device that stopped reporting is not
 * the same as a patient who is well.
 */
export function acuity(patient, live) {
  if (isOffline(live)) return 900;
  const alerts = live.alerts ?? patient.alerts ?? {};
  return (
    (alerts.critical ?? 0) * 1000 +
    (alerts.warning ?? 0) * 100 +
    (live.score?.total ?? 0) * 10
  );
}

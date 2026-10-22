import { useMemo } from 'react';
import { severityFor } from '@vitalwatch/shared/bands.js';
import { cx } from './ui';
import { dayjs } from '../lib/format';

/**
 * A live vitals trace.
 *
 * Adapted from the homecare reading chart — same visual language (shaded
 * target band, hairline gridlines, severity-coloured dots) — but the x-axis is
 * a rolling wall-clock window rather than a run of calendar days, and it is
 * expected to redraw every second for hours without being remounted.
 */

const W = 640;
const H = 150;
const PAD = { top: 10, right: 10, bottom: 20, left: 40 };

const DOT = { critical: 'fill-danger', warning: 'fill-warn', ok: 'fill-ok' };

export default function ReadingChart({ series = [], spec, windowSec = 300, className }) {
  const model = useMemo(() => {
    if (series.length < 2) return null;

    const t1 = series[series.length - 1].ts;
    const t0 = t1 - windowSec * 1000;
    const points = series.filter((p) => p.ts >= t0);
    if (points.length < 2) return null;

    const values = points.flatMap((p) =>
      spec.dual && p.value2 != null ? [p.value, p.value2] : [p.value],
    );
    const edges = [spec.target?.min, spec.target?.max, spec.target?.min2, spec.target?.max2].filter(
      (v) => v != null,
    );

    let lo = Math.min(...values, ...edges);
    let hi = Math.max(...values, ...edges);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const span = hi - lo;
    lo -= span * 0.12;
    hi += span * 0.12;

    const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
    const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    const path = (pick) =>
      points
        .filter((p) => pick(p) != null)
        .map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(pick(p)).toFixed(1)}`)
        .join(' ');

    // Four ticks regardless of window length — enough to orient, few enough to
    // stay legible at this height.
    const ticks = [0, 1, 2, 3].map((i) => t0 + ((t1 - t0) * i) / 3);

    return { lo, hi, x, y, path, ticks, points, t0, t1 };
  }, [series, spec, windowSec]);

  if (!model) {
    return (
      <div
        className={cx(
          'grid place-items-center rounded-tile bg-sunken text-[13px] text-muted',
          className,
        )}
        style={{ height: 110 }}
      >
        Waiting for readings
      </div>
    );
  }

  const { x, y, path, ticks, points, lo, hi } = model;

  const band = (min, max) =>
    min == null && max == null
      ? null
      : {
          top: y(Math.min(hi, max ?? hi)),
          bottom: y(Math.max(lo, min ?? lo)),
        };

  const target = band(spec.target?.min, spec.target?.max);
  const target2 = spec.dual ? band(spec.target?.min2, spec.target?.max2) : null;
  const yLabels = [lo + (hi - lo) * 0.85, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.15];
  // At 1 Hz a five-minute window is 300 points; dots stop being readable long
  // before that, and the line alone carries the shape.
  const showDots = points.length <= 120;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cx('w-full', className)}
      role="img"
      aria-label={`${spec.label} over the last ${Math.round(windowSec / 60)} minutes`}
    >
      {[target2, target].filter(Boolean).map((b, i) => (
        <rect
          key={i}
          x={PAD.left}
          y={b.top}
          width={W - PAD.left - PAD.right}
          height={Math.max(0, b.bottom - b.top)}
          className="fill-ok/10"
        />
      ))}

      {yLabels.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(v)}
            y2={y(v)}
            className="stroke-hairline"
            strokeDasharray="3 5"
          />
          <text
            x={PAD.left - 6}
            y={y(v) + 3.5}
            textAnchor="end"
            className="fill-muted text-[10px] font-semibold"
          >
            {v.toFixed(spec.decimals)}
          </text>
        </g>
      ))}

      {ticks.map((t, i) => (
        <text
          key={t}
          x={x(t)}
          y={H - 5}
          textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
          className="fill-muted text-[10px] font-semibold"
        >
          {dayjs(t).format('HH:mm:ss')}
        </text>
      ))}

      <path
        d={path((p) => p.value)}
        fill="none"
        className="stroke-ink"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {spec.dual && (
        <path
          d={path((p) => p.value2)}
          fill="none"
          className="stroke-muted"
          strokeWidth="1.4"
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
      )}

      {showDots &&
        points.map((p) => {
          const sev = severityFor(spec, p.value, p.value2);
          return (
            <circle
              key={p.ts}
              cx={x(p.ts)}
              cy={y(p.value)}
              r={sev ? 3.5 : 2}
              className={DOT[sev ?? 'ok']}
            />
          );
        })}
    </svg>
  );
}

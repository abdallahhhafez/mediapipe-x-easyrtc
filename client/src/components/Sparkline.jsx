import { useMemo } from 'react';
import { cx } from './ui';

/**
 * A tile-sized trace. No axes, no labels — at this size the only readable
 * information is the shape, so everything else is left off deliberately.
 */
export default function Sparkline({ series = [], className, tone = 'ink', height = 28 }) {
  const path = useMemo(() => {
    if (series.length < 2) return null;
    const values = series.map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;
    const W = 100;

    return series
      .map((p, i) => {
        const x = (i / (series.length - 1)) * W;
        const y = height - 2 - ((p.value - lo) / span) * (height - 4);
        return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [series, height]);

  if (!path) {
    return <div className={cx('rounded bg-sunken', className)} style={{ height }} />;
  }

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={cx('w-full', className)}
      style={{ height }}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={tone === 'danger' ? 'stroke-danger' : tone === 'warn' ? 'stroke-warn' : 'stroke-ink'}
      />
    </svg>
  );
}

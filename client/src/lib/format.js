import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export { dayjs };

/** Avatar fallback when a patient has no photo. */
export const initials = (name = '') =>
  name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

export const clockTime = (t) => dayjs(t).format('HH:mm:ss');
export const shortTime = (t) => dayjs(t).format('HH:mm');
export const sinceNow = (t) => (t ? dayjs(t).fromNow() : 'never');

/** Seconds-precision "2s ago" — vitals go stale far faster than dayjs's minute granularity. */
export function freshness(t) {
  if (!t) return 'no data';
  const s = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 1000));
  if (s < 3) return 'live';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return dayjs(t).fromNow();
}

export const ALERT_STATUS_LABELS = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
};

/**
 * Severity colours come from the semantic tokens, not Tailwind's stock palette,
 * so the accessible colour-vision theme reaches every pill in the app by
 * swapping four CSS variables rather than every class string.
 */
export const SEVERITY_TONE = {
  critical: 'bg-dangerSoft text-danger',
  warning: 'bg-warnSoft text-warn',
  info: 'bg-infoSoft text-info',
  ok: 'bg-okSoft text-ok',
};

/** A glyph per severity, so state never rests on hue alone. */
export const SEVERITY_GLYPH = { critical: '▲', warning: '◆', info: '●', ok: '✓' };

export const SEVERITY_LABELS = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
  ok: 'Stable',
};

export const STATUS_TONE = {
  ...SEVERITY_TONE,
  open: 'bg-dangerSoft text-danger',
  acknowledged: 'bg-warnSoft text-warn',
  resolved: 'bg-sunken text-muted',
  online: 'bg-okSoft text-ok',
  offline: 'bg-sunken text-muted',
  stale: 'bg-warnSoft text-warn',
};

export const STATUS_GLYPH = {
  ...SEVERITY_GLYPH,
  open: '▲',
  acknowledged: '◔',
  resolved: '✓',
  online: '●',
  offline: '⊘',
  stale: '◔',
};

export const STATUS_LABELS = {
  ...SEVERITY_LABELS,
  ...ALERT_STATUS_LABELS,
  online: 'Online',
  offline: 'Offline',
  stale: 'Stale',
};

/** Alerts carry a `source` so the two detectors stay distinguishable in the feed. */
export const SOURCE_LABELS = {
  server: 'Server rules',
  mediapipe: 'MediaPipe CV',
};

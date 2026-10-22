import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useLive } from '../store/live';
import { cx } from './ui';
import { iconFor } from './metricIcons';
import { SOURCE_LABELS } from '../lib/format';

/**
 * How an alert actually reaches a nurse who is looking at something else.
 *
 * Three channels, deliberately: the toast for a nurse at the station, a tone
 * for one across the room, and a system notification for one who has the tab
 * in the background. A monitoring system whose alerts only appear in a UI
 * nobody is looking at is not a monitoring system.
 */

const TONES = {
  critical: 'border-danger/25 bg-danger/[0.06] text-danger',
  warning: 'border-warn/25 bg-warnSoft text-warn',
  info: 'border-hairline bg-infoSoft text-info',
};

/** Critical alerts hold until dismissed; lesser ones clear themselves. */
const DISMISS_AFTER = { warning: 25_000, info: 12_000 };

export default function AlertToaster() {
  const alerts = useLive((s) => s.alerts);
  const [queue, setQueue] = useState([]);
  const seen = useRef(new Set());
  const audio = useRef(null);

  useEffect(() => {
    for (const alert of alerts) {
      // Escalation gets its own key, so an alert that turns critical announces
      // itself again rather than sitting silently as an already-seen warning.
      const key = `${alert._id}:${alert.severity}`;
      if (seen.current.has(key) || alert.status !== 'open') continue;
      seen.current.add(key);

      setQueue((q) => {
        // One toast per condition per detector. The same alert recurring, or
        // being updated, replaces its toast in place rather than stacking —
        // otherwise a flapping reading fills the screen and hides both the
        // other patients and the controls underneath.
        const id = `${alert.dedupeKey}:${alert.source}`;
        return [
          alert,
          ...q.filter(
            // By id as well as by condition. React keys these by `_id`, and an
            // alert whose payload arrives with a different (or missing)
            // dedupeKey — an escalation, a re-fetch — slipped past a
            // condition-only filter and put the same `_id` in the list twice.
            // Duplicate keys are unsupported: children get dropped or doubled.
            (a) => a._id !== alert._id && `${a.dedupeKey}:${a.source}` !== id,
          ),
        ].slice(0, 3);
      });
      chime(audio, alert.severity);
      notify(alert);

      const after = DISMISS_AFTER[alert.severity];
      if (after) setTimeout(() => dismiss(setQueue, alert._id), after);
    }
  }, [alerts]);

  return (
    /**
     * Anchored bottom-right and stacked upward.
     *
     * Never top-right: the page header carries the monitor's actions, and a
     * toast stack over that corner covers them exactly when a nurse most needs
     * to reach them. `flex-col-reverse` puts the newest toast (index 0) nearest
     * the corner and grows the stack away from it, so the container's height
     * never pushes anything back over the header.
     */
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col-reverse items-center gap-2 p-4 sm:inset-x-auto sm:left-auto sm:right-0 sm:items-end sm:p-6">
      {/* popLayout takes an exiting toast out of the flow immediately, rather
          than letting it hold its slot for the length of its exit animation and
          keep the stack tall long after it is invisible. */}
      <AnimatePresence initial={false} mode="popLayout">
        {queue.map((alert) => {
          const Icon = iconFor(alert.metric);
          return (
            <motion.div
              key={alert._id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className={cx(
                'pointer-events-auto w-full max-w-sm rounded-tile border p-4 shadow-lift backdrop-blur',
                TONES[alert.severity] ?? TONES.info,
              )}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface/80">
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold opacity-70">
                    {alert.patient?.name ?? 'Patient'}
                    {alert.patient?.room ? ` · ${alert.patient.room}` : ''}
                  </p>
                  <p className="font-bold leading-snug">{alert.title}</p>
                  {alert.body && (
                    <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{alert.body}</p>
                  )}
                  <div className="mt-2.5 flex items-center gap-3">
                    <Link
                      to={`/station/${alert.patient?._id ?? alert.patient}`}
                      onClick={() => dismiss(setQueue, alert._id)}
                      className="rounded-full bg-surface/80 px-3 py-1.5 text-[12px] font-bold text-ink transition hover:bg-surface"
                    >
                      Open patient
                    </Link>
                    <span className="text-[11px] font-semibold opacity-60">
                      {SOURCE_LABELS[alert.source] ?? alert.source}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => dismiss(setQueue, alert._id)}
                  className="shrink-0 rounded-full p-1 opacity-60 transition hover:opacity-100"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

const dismiss = (setQueue, id) => setQueue((q) => q.filter((a) => a._id !== id));

/**
 * Synthesised rather than bundled as an audio file: two urgent beeps for
 * critical, one soft tone otherwise. Keeps the client dependency-free and the
 * pitch distinguishable across a noisy ward.
 */
function chime(ref, severity) {
  if (severity === 'info') return;
  try {
    ref.current ??= new (window.AudioContext || window.webkitAudioContext)();
    const ctx = ref.current;
    if (ctx.state === 'suspended') ctx.resume();

    const beeps = severity === 'critical' ? [0, 0.22] : [0];
    for (const at of beeps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = severity === 'critical' ? 880 : 620;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.2);
    }
  } catch {
    // Autoplay policy blocks audio until the nurse has interacted with the
    // page. Silence is acceptable; a thrown error mid-alert is not.
  }
}

function notify(alert) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'default') Notification.requestPermission();
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  new Notification(`${alert.patient?.name ?? 'Patient'} — ${alert.title}`, {
    body: alert.body,
    tag: alert._id,
    requireInteraction: alert.severity === 'critical',
  });
}

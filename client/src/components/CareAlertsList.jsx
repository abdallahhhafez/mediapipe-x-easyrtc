import dayjs from 'dayjs';
import { cx } from './ui';
import { Shield, Bell, Message, Pill, Check, Chart, Heart, Note, Droplet } from '../lib/icons';

const TONES = {
  danger: 'border-danger/25 bg-danger/[0.06] text-danger',
  warn: 'border-warn/25 bg-warnSoft text-warn',
  info: 'border-hairline bg-infoSoft text-info',
};

/** Past its service level and still nobody has looked at it. */
const overdue = (a) =>
  a.slaMinutes && Date.now() - new Date(a.createdAt).getTime() > a.slaMinutes * 60_000;

const KIND_ICON = {
  reading_out_of_range: Shield,
  missed_medication: Pill,
  missed_checkin: Bell,
  nudge: Message,
  trend: Chart,
  episode: Heart,
  plan_updated: Note,
  lab_result: Droplet,
  escalation: Shield,
};

/**
 * Shared alert feed — the patient's smart notifications and the same list on
 * the clinician's dashboard. Nudges read as messages, with the sender's name
 * and clinic; system alerts carry their severity tone.
 */
export default function CareAlertsList({
  alerts = [],
  emptyLabel = 'No alerts — everything is on track.',
  onAction,
  actionLabel,
  onSecondary,
  secondaryLabel,
  className,
}) {
  if (!alerts.length) {
    return (
      <p className={cx('flex items-center gap-2 rounded-tile bg-okSoft px-4 py-3 text-[13px] font-semibold text-ok', className)}>
        <Check size={15} /> {emptyLabel}
      </p>
    );
  }

  return (
    <div className={cx('space-y-2.5', className)}>
      {alerts.map((alert) => {
        const Icon = KIND_ICON[alert.kind] || Bell;
        const isNudge = alert.kind === 'nudge';
        return (
          <div key={alert._id} className={cx('rounded-tile border p-4', TONES[alert.severity] || TONES.info)}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface/70">
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="font-bold leading-snug">{alert.title}</p>
                  <span className="shrink-0 text-[11px] font-semibold opacity-70">
                    {dayjs(alert.createdAt).format('D MMM · HH:mm')}
                  </span>
                </div>
                {alert.body && <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{alert.body}</p>}
                {isNudge && alert.senderOrgName && (
                  <p className="mt-1.5 text-[12px] font-semibold opacity-70">
                    {alert.senderName} · {alert.senderOrgName}
                  </p>
                )}
                {alert.status !== 'open' && (
                  <span className="mt-2 inline-block rounded-full bg-surface/70 px-2.5 py-0.5 text-[11px] font-bold capitalize">
                    {alert.status}
                    {alert.acknowledgedByName && alert.status === 'acknowledged' ? ` by ${alert.acknowledgedByName}` : ''}
                    {alert.resolvedByName && alert.status === 'resolved' ? ` by ${alert.resolvedByName}` : ''}
                  </span>
                )}
                {/* Escalated supersedes overdue: the clock running out is the
                    reason for the escalation, so saying both is saying it twice. */}
                {alert.status === 'open' && alert.escalatedAt && (
                  <span className="mt-2 inline-block rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-bold text-white">
                    Escalated {dayjs(alert.escalatedAt).format('D MMM · HH:mm')}
                  </span>
                )}
                {alert.status === 'open' && !alert.escalatedAt && overdue(alert) && (
                  <span className="mt-2 inline-block rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-bold text-danger">
                    Overdue — unacknowledged past {Math.round(alert.slaMinutes / 60)}h
                  </span>
                )}
              </div>
              {alert.status === 'open' && (onAction || onSecondary) && (
                <div className="flex shrink-0 flex-col gap-1.5">
                  {onAction && (
                    <button
                      onClick={() => onAction(alert)}
                      className="rounded-full bg-surface/80 px-3 py-1.5 text-[12px] font-bold text-ink transition hover:bg-surface"
                    >
                      {actionLabel}
                    </button>
                  )}
                  {onSecondary && (
                    <button
                      onClick={() => onSecondary(alert)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-semibold opacity-70 transition hover:opacity-100"
                    >
                      {secondaryLabel}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

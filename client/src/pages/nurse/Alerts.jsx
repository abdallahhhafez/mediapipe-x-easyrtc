import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useLive } from '../../store/live';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  PageHeader,
  Segmented,
  Skeleton,
  cx,
} from '../../components/ui';
import { iconFor } from '../../components/metricIcons';
import { dayjs, SOURCE_LABELS } from '../../lib/format';
import { Bell, Check } from '../../lib/icons';

const STATUS = [
  { value: 'open,acknowledged', label: 'Active' },
  { value: 'open', label: 'Unacknowledged' },
  { value: 'resolved', label: 'Resolved' },
];

const SOURCE = [
  { value: '', label: 'Both detectors' },
  { value: 'server', label: 'Server rules' },
  { value: 'mediapipe', label: 'MediaPipe CV' },
];

const TONES = {
  critical: 'border-danger/25 bg-danger/[0.06] text-danger',
  warning: 'border-warn/25 bg-warnSoft text-warn',
  info: 'border-hairline bg-infoSoft text-info',
};

const overdue = (a) =>
  a.status === 'open' && a.slaMinutes && Date.now() - +new Date(a.createdAt) > a.slaMinutes * 60_000;

export default function Alerts() {
  const [status, setStatus] = useState('open,acknowledged');
  const [source, setSource] = useState('');
  const queryClient = useQueryClient();
  const liveAlerts = useLive((s) => s.alerts);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', status, source],
    queryFn: () => api.get('/alerts', { status, source, limit: 200 }),
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status: next }) => api.patch(`/alerts/${id}`, { status: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const acknowledgeAll = useMutation({
    mutationFn: (ids) => api.post('/alerts/acknowledge', { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  // Merge the socket feed over the fetched page so an alert that arrives while
  // this page is open appears without a refetch.
  const alerts = useMemo(() => {
    const wanted = new Set(status.split(','));
    const byId = new Map(data?.alerts?.map((a) => [a._id, a]) ?? []);
    for (const a of liveAlerts) {
      const merged = { ...(byId.get(a._id) ?? {}), ...a };
      if (wanted.has(merged.status) && (!source || merged.source === source)) {
        byId.set(a._id, merged);
      }
    }
    return [...byId.values()]
      .filter((a) => wanted.has(a.status) && (!source || a.source === source))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [data, liveAlerts, status, source]);

  const unacknowledged = alerts.filter((a) => a.status === 'open').map((a) => a._id);

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle="Everything both detectors have raised, newest first."
        right={
          unacknowledged.length > 0 && (
            <Button
              variant="outline"
              loading={acknowledgeAll.isPending}
              onClick={() => acknowledgeAll.mutate(unacknowledged)}
            >
              <Check size={16} /> Acknowledge {unacknowledged.length}
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={status} onChange={setStatus} options={STATUS} />
        <Segmented size="sm" value={source} onChange={setSource} options={SOURCE} />
      </div>

      <ErrorNote error={setStatusMutation.error ?? acknowledgeAll.error} className="mb-3" />

      {isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : alerts.length ? (
        <div className="space-y-2.5">
          {alerts.map((alert) => {
            const Icon = iconFor(alert.metric);
            return (
              <div
                key={alert._id}
                className={cx('rounded-tile border p-4', TONES[alert.severity] ?? TONES.info)}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface/70">
                    <Icon size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="font-bold leading-snug">{alert.title}</p>
                      <span className="shrink-0 text-[11px] font-semibold opacity-70">
                        {dayjs(alert.createdAt).format('D MMM · HH:mm:ss')}
                      </span>
                    </div>

                    {alert.patient?.name && (
                      <Link
                        to={`/station/${alert.patient._id}`}
                        className="text-[13px] font-semibold underline decoration-current/30 underline-offset-2"
                      >
                        {alert.patient.name}
                        {alert.patient.room ? ` · ${alert.patient.room}` : ''}
                      </Link>
                    )}

                    {alert.body && (
                      <p className="mt-1 text-[13px] leading-relaxed text-ink/80">{alert.body}</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-surface/70 px-2.5 py-0.5 text-[11px] font-bold">
                        {SOURCE_LABELS[alert.source] ?? alert.source}
                      </span>
                      {alert.occurrences > 1 && (
                        <span
                          className="tabular rounded-full bg-surface/70 px-2.5 py-0.5 text-[11px] font-bold"
                          title="This condition has recurred — one alert, not many"
                        >
                          ×{alert.occurrences}
                          {alert.lastOccurredAt
                            ? ` · last ${dayjs(alert.lastOccurredAt).format('HH:mm:ss')}`
                            : ''}
                        </span>
                      )}
                      {alert.escalatedAt && (
                        <span className="rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-bold text-white">
                          Escalated {dayjs(alert.escalatedAt).format('HH:mm')}
                        </span>
                      )}
                      {!alert.escalatedAt && overdue(alert) && (
                        <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-[11px] font-bold text-danger">
                          Overdue past {alert.slaMinutes}m
                        </span>
                      )}
                      {alert.status === 'acknowledged' && (
                        <span className="rounded-full bg-surface/70 px-2.5 py-0.5 text-[11px] font-bold">
                          Acknowledged{alert.acknowledgedBy?.name ? ` by ${alert.acknowledgedBy.name}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {alert.status !== 'resolved' && (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      {alert.status === 'open' && (
                        <button
                          onClick={() =>
                            setStatusMutation.mutate({ id: alert._id, status: 'acknowledged' })
                          }
                          className="rounded-full bg-surface/80 px-3 py-1.5 text-[12px] font-bold text-ink transition hover:bg-surface"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setStatusMutation.mutate({ id: alert._id, status: 'resolved' })
                        }
                        className="rounded-full px-3 py-1.5 text-[12px] font-semibold opacity-70 transition hover:opacity-100"
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Bell}
            title="Nothing to show"
            body="No alerts match this filter. Every patient is inside their bands."
          />
        </Card>
      )}
    </div>
  );
}

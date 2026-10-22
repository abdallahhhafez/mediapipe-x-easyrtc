import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuth } from '../../store/auth';
import { useLive } from '../../store/live';
import { Card, EmptyState, PageHeader, Segmented, Skeleton, cx } from '../../components/ui';
import PatientTile, { acuity, isOffline } from '../../components/PatientTile';
import { Hospital } from '../../lib/icons';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'alerting', label: 'Alerting' },
  { value: 'offline', label: 'Offline' },
];

export default function Station() {
  const user = useAuth((s) => s.user);
  const wardId = user?.wards?.[0];
  const [filter, setFilter] = useState('all');
  const [, setTick] = useState(0);

  // Staleness is measured against the clock, so the board has to re-render on
  // its own. Without this, a ward that goes completely silent would freeze on
  // its last good frame — every tile still green, nothing moving, no re-render
  // to notice. That is the one failure a monitoring board must never have.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const live = useLive((s) => s.patients);
  const alerts = useLive((s) => s.alerts);
  const seed = useLive((s) => s.seed);
  const seedAlerts = useLive((s) => s.seedAlerts);

  const { data, isLoading } = useQuery({
    queryKey: ['patients', wardId],
    queryFn: () => api.get('/patients', { wardId }),
    enabled: Boolean(wardId),
  });

  const { data: alertData } = useQuery({
    queryKey: ['alerts', 'open'],
    queryFn: () => api.get('/alerts', { status: 'open,acknowledged', limit: 200 }),
  });

  useEffect(() => {
    if (data?.patients) seed(data.patients);
  }, [data, seed]);

  useEffect(() => {
    if (alertData?.alerts) seedAlerts(alertData.alerts);
  }, [alertData, seedAlerts]);

  // One ward subscription for the whole board. Summaries, not full frames —
  // six samples a second per patient across a ward would be pointless traffic.
  useEffect(() => {
    if (!wardId) return;
    getSocket().emit('subscribe:station', { wardId });
  }, [wardId]);

  const patients = data?.patients ?? [];

  // Alert counts come from the socket feed, not the initial fetch, so a tile
  // turns red the moment an alert lands rather than on the next poll.
  const openByPatient = useMemo(() => {
    const map = {};
    for (const a of alerts) {
      if (a.status === 'resolved') continue;
      const id = String(a.patient?._id ?? a.patient);
      const entry = (map[id] ??= { critical: 0, warning: 0, info: 0 });
      entry[a.severity] = (entry[a.severity] ?? 0) + 1;
    }
    return map;
  }, [alerts]);

  const rows = useMemo(() => {
    const merged = patients.map((p) => {
      const id = String(p._id);
      const l = { ...(live[id] ?? {}), alerts: openByPatient[id] ?? { critical: 0, warning: 0 } };
      return { patient: p, live: l, rank: acuity(p, l) };
    });

    const filtered = merged.filter(({ live: l }) => {
      if (filter === 'offline') return isOffline(l);
      if (filter === 'alerting') return (l.alerts.critical ?? 0) + (l.alerts.warning ?? 0) > 0;
      return true;
    });

    return filtered.sort((a, b) => b.rank - a.rank);
  }, [patients, live, openByPatient, filter]);

  const counts = useMemo(() => {
    const list = Object.values(live);
    return {
      patients: patients.length,
      offline: list.filter((l) => isOffline(l)).length,
      open: alerts.filter((a) => a.status === 'open').length,
      critical: alerts.filter((a) => a.status !== 'resolved' && a.severity === 'critical').length,
    };
  }, [patients, live, alerts]);

  return (
    <div>
      <PageHeader
        title="Ward board"
        subtitle={wardId ? `${wardId} · monitoring continuously` : 'No ward assigned'}
        right={<Segmented size="sm" value={filter} onChange={setFilter} options={FILTERS} />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Patients" value={counts.patients} />
        <Stat label="Open alerts" value={counts.open} tone={counts.open ? 'warn' : null} />
        <Stat label="Critical" value={counts.critical} tone={counts.critical ? 'danger' : null} />
        <Stat
          label="Devices offline"
          value={counts.offline}
          tone={counts.offline ? 'warn' : null}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : rows.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ patient, live: l }) => (
            <PatientTile key={patient._id} patient={patient} live={l} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Hospital}
          title={filter === 'all' ? 'No patients on this ward' : 'Nothing matches that filter'}
          body={
            filter === 'alerting'
              ? 'Every patient is inside their bands right now.'
              : 'Try a different filter.'
          }
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cx(
          'tabular mt-1 text-2xl font-extrabold',
          tone === 'danger' && 'text-danger',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </p>
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { METRIC_ORDER, resolveSpecs } from '@vitalwatch/shared/metrics.js';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useLive } from '../../store/live';
import { useConsult, STREAM_CAMERA, STREAM_DEVICES } from '../../store/consult';
import { useVision } from '../../vision/useVision';
import {
  Button,
  Card,
  PageHeader,
  Section,
  Segmented,
  Skeleton,
  cx,
} from '../../components/ui';
import VitalsVideo from '../../components/VitalsVideo';
import AccuracyPanel from '../../components/AccuracyPanel';
import News2Card from '../../components/News2Card';
import ReadingChart from '../../components/ReadingChart';
import VideoPanel from '../../components/VideoPanel';
import { iconFor } from '../../components/metricIcons';
import { ArrowLeft, Video, Eye } from '../../lib/icons';
import { freshness, SOURCE_LABELS, dayjs } from '../../lib/format';

const WINDOWS = [
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 3600, label: '1h' },
];

export default function Monitor() {
  const { patientId } = useParams();
  const queryClient = useQueryClient();
  const [windowSec, setWindowSec] = useState(300);
  const [showRoi, setShowRoi] = useState(false);
  const [cameraAsked, setCameraAsked] = useState(false);

  const live = useLive((s) => s.patients[patientId]);
  const openConsult = useConsult((s) => s.open);
  const closeConsult = useConsult((s) => s.close);
  const deviceStream = useConsult((s) => s.remote[STREAM_DEVICES]);
  const cameraStream = useConsult((s) => s.remote[STREAM_CAMERA]);
  // Selectors must return a stable reference: filtering inside one builds a new
  // array on every store tick — once a second per metric — and React treats
  // each as a change, which is an infinite render loop rather than a slow page.
  const allAlerts = useLive((s) => s.alerts);
  const alerts = useMemo(
    () => allAlerts.filter((a) => String(a.patient?._id ?? a.patient) === patientId),
    [allAlerts, patientId],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => api.get(`/patients/${patientId}`),
  });

  useEffect(() => {
    const socket = getSocket();
    socket.emit('subscribe:patient', { patientId });
    return () => socket.emit('unsubscribe:patient', { patientId });
  }, [patientId]);

  /**
   * Join the patient's peer room straight away, without waiting for anyone to
   * ask. The device-screen video is the monitoring channel — the readings have
   * no other way out of the house — so it is not something a nurse opts into.
   * The patient's own camera is separate and still requires their consent.
   */
  useEffect(() => {
    openConsult('nurse', patientId);
    return () => closeConsult();
  }, [patientId, openConsult, closeConsult]);

  const patient = data?.patient;
  const specs = useMemo(() => resolveSpecs(patient?.thresholds), [patient?.thresholds]);

  // The vision pipeline reads the same stream the nurse is watching. `truth` is
  // the telemetry, used only to score the reader — never to feed it.
  const vision = useVision({
    patientId,
    thresholds: patient?.thresholds,
    truth: live?.latest,
    enabled: Boolean(patient),
  });

  const setAlertStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/alerts/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const requestCamera = () => {
    getSocket().emit('camera:request', { patientId });
    setCameraAsked(true);
  };

  if (isLoading || !patient) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  const open = alerts.filter((a) => a.status !== 'resolved');

  return (
    <div>
      <Link
        to="/station"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition hover:text-ink"
      >
        <ArrowLeft size={14} /> Ward board
      </Link>

      <PageHeader
        title={patient.name}
        subtitle={`${patient.room} · ${patient.condition} · ${
          live?.online ? `readings ${freshness(live.lastSeen)}` : 'no signal'
        }`}
        right={
          <div className="flex items-center gap-2">
            <Button
              variant={showRoi ? 'accent' : 'outline'}
              size="sm"
              onClick={() => setShowRoi((v) => !v)}
            >
              <Eye size={16} /> ROI overlay
            </Button>
            <Button size="sm" onClick={requestCamera} disabled={cameraAsked}>
              <Video size={16} /> {cameraAsked ? 'Camera requested' : 'Request camera'}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Section
            title="Vitals stream"
            action={
              <span className="text-[12px] font-semibold text-muted">
                {deviceStream
                  ? 'MediaPipe is reading the patient’s device screens'
                  : 'MediaPipe is reading this feed'}
              </span>
            }
          >
            <VitalsVideo
              patient={patient}
              specs={specs}
              latest={live?.latest}
              remoteStream={deviceStream}
              showRoi={showRoi}
              predictions={vision.predictions}
              onVideo={vision.attach}
            />
          </Section>

          <Section
            title="Trends"
            action={
              <Segmented size="sm" value={windowSec} onChange={setWindowSec} options={WINDOWS} />
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {METRIC_ORDER.map((key) => {
                const spec = specs[key];
                const Icon = iconFor(key);
                const reading = live?.latest?.[key];
                return (
                  <Card key={key} className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px] font-bold">
                        <Icon size={15} /> {spec.label}
                      </span>
                      <span className="tabular text-[13px] font-extrabold">
                        {reading
                          ? `${reading.value}${
                              spec.dual && reading.value2 != null ? `/${reading.value2}` : ''
                            } ${spec.unit}`
                          : '—'}
                      </span>
                    </div>
                    <ReadingChart
                      series={live?.series?.[key] ?? []}
                      spec={spec}
                      windowSec={windowSec}
                    />
                  </Card>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Early warning score">
            <News2Card score={live?.score} />
          </Section>

          <Section
            title="What MediaPipe reads"
            action={
              <span className="text-[12px] font-semibold text-muted">from the pixels</span>
            }
          >
            <AccuracyPanel engine={vision.engine} stats={vision.stats} />
          </Section>

          <Section title={`Alerts · ${open.length} open`}>
            {open.length ? (
              <div className="space-y-2">
                {open.map((alert) => (
                  <div
                    key={alert._id}
                    className={cx(
                      'rounded-tile border p-3',
                      alert.severity === 'critical'
                        ? 'border-danger/25 bg-danger/[0.06] text-danger'
                        : 'border-warn/25 bg-warnSoft text-warn',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-bold leading-snug">{alert.title}</p>
                      <span className="shrink-0 text-[11px] font-semibold opacity-70">
                        {dayjs(alert.createdAt).format('HH:mm:ss')}
                      </span>
                    </div>
                    {alert.body && (
                      <p className="mt-1 text-[12px] leading-relaxed text-ink/80">{alert.body}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="rounded-full bg-surface/70 px-2 py-0.5 text-[10px] font-bold">
                        {SOURCE_LABELS[alert.source] ?? alert.source}
                      </span>
                      {alert.status === 'open' && (
                        <button
                          onClick={() =>
                            setAlertStatus.mutate({ id: alert._id, status: 'acknowledged' })
                          }
                          className="rounded-full bg-surface/80 px-2.5 py-1 text-[11px] font-bold text-ink"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => setAlertStatus.mutate({ id: alert._id, status: 'resolved' })}
                        className="rounded-full px-2.5 py-1 text-[11px] font-semibold opacity-70"
                      >
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-tile bg-okSoft px-4 py-3 text-[13px] font-semibold text-ok">
                No open alerts — this patient is inside their bands.
              </p>
            )}
          </Section>

          <Section title="Camera">
            <VideoPanel requested={cameraAsked} stream={cameraStream} />
          </Section>
        </div>
      </div>
    </div>
  );
}

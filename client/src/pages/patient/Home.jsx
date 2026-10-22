import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { METRIC_ORDER, METRICS, formatValue } from '@vitalwatch/shared/metrics.js';
import { useAuth } from '../../store/auth';
import { useDevices } from '../../store/device';
import { useLive } from '../../store/live';
import { Card, Section, StatusPill, cx } from '../../components/ui';
import { freshness } from '../../lib/format';
import CameraConsent from '../../components/CameraConsent';
import CaptureSourcePicker from '../../components/CaptureSourcePicker';
import { METRIC_ICON } from '../../components/metricIcons';

/**
 * What the patient sees. Almost nothing, on purpose: a green light saying the
 * monitoring is working, and honest information about the camera.
 */
export default function PatientHome() {
  const user = useAuth((s) => s.user);
  // The device loop itself is started by PatientShell, so it keeps running
  // across every patient screen.
  const { running, latest, lastAt, scenario, patient } = useDevices();
  const cameraRequest = useLive((s) => s.cameraRequest);

  return (
    <div className="space-y-8">
      <Card
        className={cx(
          'flex items-center gap-5 p-8 transition',
          running ? 'bg-accent text-accentInk' : 'bg-sunken',
        )}
      >
        <span className="relative grid h-14 w-14 shrink-0 place-items-center">
          <span
            className={cx(
              'absolute inset-0 rounded-full',
              running ? 'animate-ping bg-accentInk/20' : 'bg-hairline',
            )}
          />
          <span
            className={cx(
              'relative h-4 w-4 rounded-full',
              running ? 'bg-accentInk' : 'bg-muted',
            )}
          />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {running ? 'Monitoring active' : 'Starting monitoring…'}
          </h1>
          <p className="mt-1 text-[15px] opacity-80">
            {running
              ? 'Your readings are going to the nursing station right now. You do not need to do anything.'
              : 'Connecting to your devices.'}
          </p>
        </div>
      </Card>

      {scenario && (
        <div className="flex items-start gap-3 rounded-card bg-warnSoft p-5 text-warn">
          <span className="mt-0.5 text-lg leading-none">◆</span>
          <div>
            <p className="font-bold">Simulating: {scenario.label}</p>
            <p className="mt-1 text-sm">{scenario.blurb}</p>
          </div>
        </div>
      )}

      <Section
        title="Your devices"
        action={
          <span className="text-[13px] font-semibold text-muted">
            updated {freshness(lastAt)}
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {METRIC_ORDER.map((key) => {
            const spec = METRICS[key];
            const Icon = METRIC_ICON[key];
            const sample = latest[key];
            const stale = !sample || Date.now() - sample.ts > 20_000;

            return (
              <Card key={key} className="flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sunken text-muted">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{spec.label}</p>
                  <p className="tabular text-[13px] text-muted">
                    {sample
                      ? `${formatValue(spec, sample.value)}${
                          spec.dual && sample.value2 != null
                            ? `/${formatValue(spec, sample.value2)}`
                            : ''
                        } ${spec.unit}`
                      : 'waiting for first reading'}
                  </p>
                </div>
                <StatusPill status={stale ? 'offline' : 'online'} />
              </Card>
            );
          })}
        </div>
      </Section>

      <CaptureSourcePicker />

      <CameraConsent request={cameraRequest} patient={patient} />

      <p className="px-1 text-center text-[13px] text-muted">
        Something not right?{' '}
        <Link to="/home/dev" className="font-semibold text-ink underline">
          Open the simulator panel
        </Link>{' '}
        to try a scenario.
      </p>
    </div>
  );
}

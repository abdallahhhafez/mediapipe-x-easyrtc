import { Link } from 'react-router-dom';
import { SCENARIOS } from '../../devices/scenarios';
import { useDevices } from '../../store/device';
import { Button, Card, PageHeader, cx } from '../../components/ui';
import { ArrowLeft } from '../../lib/icons';

const TONE = {
  danger: 'border-danger/25 bg-danger/[0.06]',
  warn: 'border-warn/25 bg-warnSoft',
};

/**
 * The demo console. Everything here injects a real event into the real device
 * stream — nothing is faked further downstream, so an alert raised from this
 * page travelled the same path a genuine deterioration would.
 */
export default function DevPanel() {
  const { scenario, trigger, clearScenario, running } = useDevices();

  return (
    <div>
      <Link
        to="/home"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition hover:text-ink"
      >
        <ArrowLeft size={14} /> Monitoring
      </Link>

      <PageHeader
        title="Simulator"
        subtitle="Inject a clinical event or a device fault into the live reading stream."
        right={
          scenario && (
            <Button variant="outline" onClick={clearScenario}>
              Stop “{scenario.label}”
            </Button>
          )
        }
      />

      {!running && (
        <p className="mb-4 rounded-tile bg-warnSoft px-4 py-3 text-sm font-medium text-warn">
          Devices are not running yet — open the monitoring screen first.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {SCENARIOS.map((s) => {
          const active = scenario?.id === s.id;
          return (
            <Card
              key={s.id}
              className={cx(
                'flex flex-col gap-3 border p-5 transition',
                active ? TONE[s.tone] : 'border-transparent',
              )}
            >
              <div>
                <p className="font-bold">{s.label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.blurb}</p>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant={active ? 'soft' : s.tone === 'danger' ? 'danger' : 'outline'}
                  disabled={!running}
                  onClick={() => (active ? clearScenario() : trigger(s.id))}
                >
                  {active ? 'Running — stop' : 'Trigger'}
                </Button>
                {s.durationSec && (
                  <span className="text-[12px] font-semibold text-muted">
                    ramps over {Math.round(s.durationSec / 60)} min
                  </span>
                )}
                {s.mode && (
                  <span className="chip text-[12px]">device fault</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 px-1 text-[13px] leading-relaxed text-muted">
        Clinical events ramp gradually, so the alert fires from the trend rather than a
        step change — the same way a real deterioration would present. Device faults are
        expected to raise a “check the sensor” alert and no clinical alert at all.
      </p>
    </div>
  );
}

import { SOURCES, sourceAvailability } from '../devices/captureSource';
import { useDevices } from '../store/device';
import { Button, Card, Section, cx } from './ui';

/**
 * How the patient's equipment gets seen.
 *
 * This is the one place the "no API" problem is actually solved, so it is worth
 * showing rather than hiding in configuration: the readings leave the house as
 * video, and this chooses which video.
 */
export default function CaptureSourcePicker() {
  const source = useDevices((s) => s.source);
  const setSource = useDevices((s) => s.setSource);
  const error = useDevices((s) => s.sourceError);
  const running = useDevices((s) => s.running);
  const available = sourceAvailability();

  return (
    <Section
      title="What the nurse sees"
      action={<span className="text-[13px] font-semibold text-muted">sent as video</span>}
    >
      <div className="space-y-3">
        {Object.values(SOURCES).map((s) => {
          const active = source === s.id;
          const usable = available[s.id] && running;

          return (
            <Card
              key={s.id}
              className={cx(
                'flex items-start gap-4 border p-5 transition',
                active ? 'border-accentMuted bg-accentSoft' : 'border-transparent',
              )}
            >
              <span
                className={cx(
                  'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2',
                  active ? 'border-accentDeep' : 'border-hairline',
                )}
              >
                {active && <span className="h-2.5 w-2.5 rounded-full bg-accentDeep" />}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-bold">{s.label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.blurb}</p>
                {!available[s.id] && (
                  <p className="mt-1 text-[12px] font-semibold text-warn">
                    Not available in this browser.
                  </p>
                )}
              </div>

              {!active && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!usable}
                  onClick={() => setSource(s.id)}
                >
                  {s.id === 'simulated' ? 'Use' : 'Choose…'}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 rounded-tile bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      {source !== 'simulated' && (
        <p className="mt-3 rounded-tile bg-warnSoft px-4 py-3 text-[13px] leading-relaxed text-warn">
          The nurse is now seeing your real feed. Reading numbers off it needs the
          crop regions calibrated for this particular device first — until that is
          done the station shows the picture but cannot recognise the values.
        </p>
      )}
    </Section>
  );
}

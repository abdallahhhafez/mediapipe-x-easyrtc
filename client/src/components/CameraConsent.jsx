import { useEffect, useRef, useState } from 'react';
import { useDevices } from '../store/device';
import { useLive } from '../store/live';
import { Button, Card } from './ui';
import { Video, X } from '../lib/icons';
import { getCameraStream } from '../lib/fakeCamera';
import { useConsult, STREAM_CAMERA } from '../store/consult';

/**
 * The camera side of the patient kiosk.
 *
 * Off by default and never opened without the patient saying yes. The readings
 * are what run continuously; the camera is a thing a nurse has to ask for, and
 * the patient can end at any moment. That asymmetry is the point of the whole
 * design, so it is stated plainly on screen rather than buried in a setting.
 */
export default function CameraConsent({ request, patient }) {
  const { cameraLive, setCameraLive } = useDevices();
  const setCameraRequest = useLive((s) => s.setCameraRequest);
  const publish = useConsult((s) => s.publish);
  const unpublish = useConsult((s) => s.unpublish);
  const [stream, setStream] = useState(null);
  const [simulated, setSimulated] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    if (previewRef.current && stream) previewRef.current.srcObject = stream;
  }, [stream]);

  const accept = async () => {
    setBusy(true);
    try {
      const media = await getCameraStream();
      setStream(media.stream);
      setSimulated(media.simulated);
      // Added to the peer connection the device screens already ride on,
      // rather than opening a second one — EasyRTC's client is a singleton.
      publish(STREAM_CAMERA, media.stream);
      setCameraLive(true);
      setCameraRequest(null);
      setError(null);
    } catch (err) {
      // Only a refusal reaches here — a missing camera falls back instead.
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was blocked for this site. Allow it in your browser to continue.'
          : err.message,
      );
    } finally {
      setBusy(false);
    }
  };

  const end = () => {
    stream?.getTracks().forEach((t) => t.stop());
    unpublish(STREAM_CAMERA);
    setStream(null);
    setSimulated(false);
    setCameraLive(false);
    setCameraRequest(null);
  };

  if (cameraLive && stream) {
    return (
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
            <p className="font-bold">Your camera is on</p>
          </div>
          <Button variant="danger" onClick={end}>
            <X size={16} /> End camera
          </Button>
        </div>
        <video
          ref={previewRef}
          autoPlay
          playsInline
          muted
          className="w-full rounded-tile bg-ink/90"
        />
        {simulated && (
          <p className="rounded-tile bg-warnSoft px-4 py-2.5 text-[13px] font-semibold text-warn">
            No camera on this device — sending a clearly marked stand-in feed so the
            connection can still be tested.
          </p>
        )}
      </Card>
    );
  }

  if (request) {
    return (
      <Card className="border border-accentMuted bg-accentSoft">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-accentDeep">
            <Video size={20} />
          </span>
          <div className="flex-1">
            <p className="font-bold">{request.by?.name || 'Your nurse'} would like to see you</p>
            <p className="mt-1 text-sm text-ink/80">
              Your readings are already being monitored. Turning the camera on is optional,
              and you can end it whenever you want.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={accept} loading={busy}>
                Turn camera on
              </Button>
              <Button variant="ghost" onClick={() => setCameraRequest(null)}>
                Not now
              </Button>
            </div>
            {error && <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex items-center gap-4 bg-sunken">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-muted">
        <Video size={20} />
      </span>
      <div>
        <p className="font-bold">Camera is off</p>
        <p className="mt-0.5 text-[13px] text-muted">
          Your readings are still being monitored. Nobody can see you unless you agree.
        </p>
      </div>
    </Card>
  );
}

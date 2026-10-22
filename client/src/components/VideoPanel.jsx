import { useEffect, useRef } from 'react';
import { Card, Spinner, cx } from './ui';
import { Video, VideoOff } from '../lib/icons';

/**
 * The patient's camera, as the nurse sees it.
 *
 * Purely presentational. The peer connection is owned by the shared consult
 * channel (store/consult.js) because EasyRTC's client is a singleton — a
 * component that opened its own would tear down the device-screen feed, which
 * is the one thing on this page that must never drop.
 *
 * A nurse can ask for the camera; they cannot open it. Until the patient
 * accepts, there is nothing here but the request.
 */
export default function VideoPanel({ requested, stream }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);

  if (!requested && !stream) {
    return (
      <Card className="flex items-center gap-4 bg-sunken py-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-muted">
          <VideoOff size={18} />
        </span>
        <div>
          <p className="text-sm font-bold">Camera off</p>
          <p className="text-[12px] text-muted">
            Device readings are monitored continuously either way.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-3">
      <div
        className="relative overflow-hidden rounded-tile bg-ink/90"
        style={{ aspectRatio: '4 / 3' }}
      >
        <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" />
        {!stream && (
          <div className="absolute inset-0 grid place-items-center text-center text-white/70">
            <div>
              <Spinner className="mx-auto h-5 w-5" />
              <p className="mt-2 text-[13px] font-semibold">
                Waiting for the patient to accept
              </p>
            </div>
          </div>
        )}
      </div>
      <p
        className={cx(
          'flex items-center gap-2 px-1 text-[12px] font-semibold',
          stream ? 'text-ok' : 'text-muted',
        )}
      >
        <Video size={14} />
        {stream ? 'Camera live' : 'Requested — the patient can decline'}
      </p>
    </Card>
  );
}

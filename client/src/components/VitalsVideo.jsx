import { useEffect, useRef, useState } from 'react';
import { createVitalsWall } from '../vision/vitalsWall';
import { WALL } from '../vision/roi';
import RoiOverlay from './RoiOverlay';
import { cx } from './ui';

/**
 * The device-screen feed, as the nurse sees it.
 *
 * Two sources, in priority order:
 *
 *   remote — video of the patient's actual device displays, arriving over the
 *            peer connection. This is the real path: the devices expose no API,
 *            so their readings exist only as pixels and this is the only way
 *            they leave the house.
 *
 *   local  — the same wall rendered here from telemetry, used when no peer
 *            stream is up. A fallback for development, and clearly labelled,
 *            because a nurse must never be unsure whether they are looking at
 *            the patient's equipment or at a local re-drawing of it.
 *
 * Whichever is showing is what MediaPipe reads, so the reader is exercised
 * identically either way.
 */
export default function VitalsVideo({
  patient,
  specs,
  latest,
  remoteStream,
  showRoi,
  predictions,
  onVideo,
}) {
  const videoRef = useRef(null);
  const wallRef = useRef(null);
  const [ready, setReady] = useState(false);

  const props = useRef({ patient, specs, latest });
  props.current = { patient, specs, latest };

  /**
   * Handed over as a getter rather than a node. The source flips between the
   * remote track and the local canvas at runtime, and a snapshot taken once
   * would leave the reader parsing whichever one it happened to catch — a
   * stopped canvas keeps its last frame, so that failure would be silent.
   */
  const getSource = useRef(() =>
    remoteRef.current ? videoRef.current : wallRef.current?.canvas,
  );
  const remoteRef = useRef(false);
  remoteRef.current = Boolean(remoteStream);

  // ---- local fallback wall ------------------------------------------------
  useEffect(() => {
    if (remoteStream) return;

    const wall = createVitalsWall();
    wallRef.current = wall;
    wall.setPatient(props.current.patient, props.current.specs);
    wall.update(props.current.latest);
    const stream = wall.start();

    const video = videoRef.current;
    video.srcObject = stream;
    video.play().catch(() => {});
    setReady(true);
    onVideo?.(getSource.current);

    return () => {
      wall.stop();
      stream.getTracks().forEach((t) => t.stop());
      wallRef.current = null;
    };
  }, [remoteStream, onVideo]);

  // ---- the real thing -----------------------------------------------------
  useEffect(() => {
    if (!remoteStream) return;
    const video = videoRef.current;
    video.srcObject = remoteStream;
    video.play().catch(() => {});
    setReady(true);
    onVideo?.(getSource.current);
  }, [remoteStream, onVideo]);

  useEffect(() => {
    wallRef.current?.setPatient(patient, specs);
  }, [patient, specs]);

  useEffect(() => {
    wallRef.current?.update(latest);
  }, [latest]);

  return (
    <div
      className="relative overflow-hidden rounded-card bg-[#0d1117]"
      style={{ aspectRatio: `${WALL.width} / ${WALL.height}` }}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="h-full w-full"
        aria-label="Device screens"
      />
      {ready && showRoi && <RoiOverlay predictions={predictions} />}

      {/* Bottom-left: the wall's own header carries the patient's name and the
          clock along the top, and a badge there covers them. */}
      <span
        className={cx(
          'absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur',
          remoteStream ? 'bg-ok/20 text-ok' : 'bg-warn/20 text-warn',
        )}
      >
        {remoteStream ? '● Live from the patient' : '○ Local render — no peer feed'}
      </span>
    </div>
  );
}

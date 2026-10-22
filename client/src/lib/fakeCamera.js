/**
 * A stand-in camera for machines without one.
 *
 * The patient kiosk is meant to run on a tablet with a front camera. Plenty of
 * the machines this gets demonstrated on — VMs, CI, a headless browser, a
 * desktop with the lens taped over — have none, and `getUserMedia` there fails
 * with NotFoundError. Without a fallback the whole consult path becomes
 * untestable on exactly the machines it most needs testing on.
 *
 * This produces a real `MediaStream` from a canvas, so every downstream piece —
 * the local preview, EasyRTC's peer connection, the nurse's `<video>` — is
 * exercised for real. It is drawn to be unmistakably synthetic: the nurse must
 * never wonder whether they are looking at a patient.
 */

const W = 640;
const H = 480;
const FPS = 15;

export function createFakeCameraStream(label = 'Simulated camera') {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  let frame = 0;
  const draw = () => {
    frame++;
    const t = frame / FPS;

    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, W, H);

    // A slow sweep, so it is obvious at a glance that the feed is live and
    // moving rather than a frozen frame.
    const x = W / 2 + Math.sin(t * 0.9) * (W * 0.28);
    const y = H / 2 + Math.cos(t * 0.6) * (H * 0.16);
    const glow = ctx.createRadialGradient(x, y, 8, x, y, 150);
    glow.addColorStop(0, 'rgba(216,244,92,0.55)');
    glow.addColorStop(1, 'rgba(216,244,92,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }

    ctx.fillStyle = '#e8f4ff';
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, H / 2 - 8);

    ctx.fillStyle = 'rgba(232,244,255,0.55)';
    ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('no camera on this device', W / 2, H / 2 + 20);
    ctx.fillText(new Date().toLocaleTimeString('en-GB'), W / 2, H / 2 + 48);
  };

  draw();
  // A timer, not requestAnimationFrame: a kiosk in a background tab must keep
  // producing frames or the nurse's video freezes without explanation.
  const timer = setInterval(draw, 1000 / FPS);

  const stream = canvas.captureStream(FPS);
  // Stopping the track has to stop the painting too, or the interval outlives
  // the call and leaks for as long as the page is open.
  const [track] = stream.getVideoTracks();
  const stop = track.stop.bind(track);
  track.stop = () => {
    clearInterval(timer);
    stop();
  };

  return stream;
}

/**
 * The patient's camera, or a clearly-labelled stand-in.
 * @returns {Promise<{stream: MediaStream, simulated: boolean, reason?: string}>}
 */
export async function getCameraStream() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return { stream, simulated: false };
  } catch (err) {
    // Permission denied is the patient's decision and must be surfaced, not
    // papered over with a fake feed.
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') throw err;
    return { stream: createFakeCameraStream(), simulated: true, reason: err.name };
  }
}

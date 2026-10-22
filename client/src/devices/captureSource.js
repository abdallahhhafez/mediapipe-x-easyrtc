/**
 * Where the device-screen video comes from.
 *
 * Everything downstream — the peer connection, the nurse's `<video>`, the crop
 * boxes, the recogniser, the alerting — consumes a `MediaStream` and nothing
 * else. So "how do we see the readings" is answered entirely here, and the
 * three real answers differ only in which browser API produces that stream:
 *
 *   simulated — a canvas emulating the device displays. No hardware needed;
 *               what the demo runs on.
 *
 *   screen    — getDisplayMedia(). The patient shares the window or screen the
 *               device's own software is displaying on, exactly like sharing a
 *               screen on a video call. This is the cleanest real option when
 *               the device has a companion app, a web dashboard, or an HDMI
 *               output going into a capture card.
 *
 *   camera    — getUserMedia() on a rear/USB camera pointed at the equipment's
 *               physical display. The fallback for a device that has no output
 *               of any kind — which is the situation that started all this.
 *
 * Note what is *not* different between them: none of them requires the device
 * to expose an API, and none of them changes a line of the reading pipeline.
 */

export const SOURCES = {
  simulated: {
    id: 'simulated',
    label: 'Simulated devices',
    blurb: 'A rendered stand-in for the equipment. No hardware required.',
  },
  screen: {
    id: 'screen',
    label: 'Share a screen or window',
    blurb:
      "Share whatever is displaying the readings — the device's own app, a web dashboard, or a capture-card feed.",
  },
  camera: {
    id: 'camera',
    label: 'Camera pointed at the device',
    blurb: 'For equipment with no output at all: film its display directly.',
  },
};

/**
 * @param {'screen'|'camera'} kind
 * @returns {Promise<MediaStream>}
 */
export async function captureDeviceScreen(kind) {
  if (kind === 'screen') {
    // `displaySurface: 'monitor'` is only a hint; the patient still chooses.
    // Detail over framerate for the same reason the canvas track does: this
    // feed exists to be read, and the numbers change once a second.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 10, displaySurface: 'monitor' },
      audio: false,
    });
    for (const track of stream.getVideoTracks()) track.contentHint = 'detail';
    return stream;
  }

  if (kind === 'camera') {
    const stream = await navigator.mediaDevices.getUserMedia({
      // A rear camera where there is one — the patient points it at the device.
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      audio: false,
    });
    for (const track of stream.getVideoTracks()) track.contentHint = 'detail';
    return stream;
  }

  throw new Error(`unknown capture source: ${kind}`);
}

/**
 * Whether this browser can offer a source at all.
 *
 * getDisplayMedia needs a secure context and is absent in some embedded
 * webviews; a kiosk tablet may have no camera. The picker greys out what it
 * cannot do rather than failing at the moment the patient tries to use it.
 */
export function sourceAvailability() {
  const media = navigator.mediaDevices;
  return {
    simulated: true,
    screen: typeof media?.getDisplayMedia === 'function',
    camera: typeof media?.getUserMedia === 'function',
  };
}

/**
 * A 1 Hz clock that keeps running when the tab is not in front.
 *
 * setInterval is throttled hard in a background tab — to once a minute after a
 * few minutes hidden. On the nurse's station that would only make the display
 * stutter, but on the patient kiosk it stops the readings, and the ward board
 * correctly reports the patient as having gone offline. A device that stops
 * reporting because someone opened another tab is not a monitoring device.
 *
 * Timers inside a Worker are not throttled the same way, so the tick is
 * generated there and the work still happens on the main thread.
 */

const SOURCE = `
  let timer = null;
  self.onmessage = (e) => {
    if (e.data.type === 'start') {
      clearInterval(timer);
      timer = setInterval(() => self.postMessage('tick'), e.data.intervalMs);
    } else {
      clearInterval(timer);
      timer = null;
    }
  };
`;

export function createTicker(intervalMs, onTick) {
  let worker = null;
  let fallback = null;

  return {
    start() {
      try {
        const url = URL.createObjectURL(new Blob([SOURCE], { type: 'text/javascript' }));
        worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = onTick;
        worker.postMessage({ type: 'start', intervalMs });
      } catch {
        // Blob workers can be blocked by a strict CSP. A throttled tick beats
        // no tick, and the server's staleness alert covers the gap either way.
        fallback = setInterval(onTick, intervalMs);
      }
    },

    stop() {
      worker?.postMessage({ type: 'stop' });
      worker?.terminate();
      worker = null;
      clearInterval(fallback);
      fallback = null;
    },
  };
}

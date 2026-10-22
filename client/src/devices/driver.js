/**
 * The device seam.
 *
 * Everything upstream of this file — the socket, the rules engine, the vitals
 * stream, MediaPipe — only ever sees `onFrame(samples)`. Swapping the simulator
 * for real hardware therefore means writing one more module that satisfies this
 * contract and nothing else changes.
 *
 * A real USB implementation would look like:
 *
 *   export function createSerialDriver({ filters }) {
 *     let port, reader, running = false;
 *     return {
 *       id: 'serial',
 *       label: 'USB device',
 *       metrics: ['spo2', 'hr'],
 *       async start(onFrame) {
 *         // Web Serial requires a user gesture — call this from a button.
 *         port = await navigator.serial.requestPort({ filters });
 *         await port.open({ baudRate: 9600 });
 *         reader = port.readable.pipeThrough(new TextDecoderStream()).getReader();
 *         running = true;
 *         while (running) {
 *           const { value, done } = await reader.read();
 *           if (done) break;
 *           onFrame(parseVendorFrame(value));   // -> [{ metric, value, ts }]
 *         }
 *       },
 *       async stop() { running = false; await reader?.cancel(); await port?.close(); },
 *     };
 *   }
 *
 * `metrics` matters: the kiosk shows one connection tile per driver, and a
 * driver going quiet is what the server's staleness check reports as a device
 * dropping off.
 *
 * @typedef {object} DeviceDriver
 * @property {string} id
 * @property {string} label
 * @property {string[]} metrics
 * @property {(onFrame: (samples: Sample[]) => void) => void|Promise<void>} start
 * @property {() => void|Promise<void>} stop
 *
 * @typedef {{ metric: string, value: number, value2?: number, ts: number }} Sample
 */

export const DRIVER_KINDS = {
  simulator: 'Simulated devices',
  serial: 'USB (Web Serial)',
};

/** Sanity-check a driver at registration rather than at 3am. */
export function assertDriver(driver) {
  for (const field of ['id', 'label', 'metrics', 'start', 'stop']) {
    if (driver?.[field] == null) throw new Error(`driver is missing "${field}"`);
  }
  return driver;
}

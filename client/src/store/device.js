import { create } from 'zustand';
import { createSimulator } from '../devices/simulator';
import { createVitalsWall } from '../vision/vitalsWall';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { useConsult, STREAM_DEVICES } from './consult';
import { captureDeviceScreen } from '../devices/captureSource';

/**
 * The patient kiosk's device loop.
 *
 * Lives in a store rather than a component so it keeps running while the
 * patient moves between the monitoring screen and the simulator panel — the
 * readings are the one thing on this device that must never stop.
 */

let driver = null;
/** The rendered device displays, published to the nurse as video. */
let deviceScreen = null;
/** A shared screen or camera feed, when the patient has chosen one. */
let captured = null;

/**
 * Guards against starting twice.
 *
 * `running` cannot do this job on its own: it is only set *after* the patient
 * record is fetched, so two calls that arrive during that await both see
 * `running === false` and both build a simulator. React mounts effects twice in
 * development, which is exactly two calls — and the second one overwrites
 * `driver`, orphaning the first where nothing can ever stop it.
 *
 * Two simulators means two independent random walks emitting for one patient at
 * 1 Hz each. The readings alternate between two unrelated bodies, the charts
 * turn into square waves, and the detectors flap between them and raise alerts
 * without end. Holding the in-flight promise makes the guard synchronous.
 */
let starting = null;

export const useDevices = create((set, get) => ({
  running: false,
  patient: null,
  lastFrame: null,
  lastAt: null,
  /** metric -> most recent sample, for the connection tiles */
  latest: {},
  scenario: null,
  cameraLive: false,
  /** Which capture source feeds the `devices` stream. */
  source: 'simulated',
  sourceError: null,

  start(patientId) {
    if (driver || starting) return starting ?? Promise.resolve();

    starting = (async () => {
      // The patient's own bands drive the simulated baseline, so a COPD patient
      // idles at their target rather than in permanent alarm.
      const { patient } = await api.get(`/patients/${patientId}`);

      // A stop() while the fetch was in flight must win.
      if (starting === null) return;

      driver = createSimulator({
        thresholds: patient.thresholds,
        onFrame: (samples) => {
          const latest = { ...get().latest };
          for (const s of samples) latest[s.metric] = s;
          // Straight onto the device screen — this is the only path the
          // readings genuinely have to the nurse.
          deviceScreen?.update(latest);

          /**
           * The numeric socket is a simulator convenience, not part of the
           * real design. Devices with no API cannot feed it, so with real
           * hardware this line does not exist: it survives here to run the
           * server's safety net and to give the reader's accuracy figure
           * something to be scored against.
           */
          getSocket().emit('reading:frame', { samples });

          set({ lastFrame: samples, lastAt: Date.now(), latest });
        },
      });

      driver.start();
      set({ running: true, patient });

      /**
       * Publish the device screens.
       *
       * The medical devices have no API — their readings exist only as pixels
       * on their own displays — so what reaches the nurse is a video of those
       * displays, and the numbers are recovered from it by computer vision at
       * the far end. This wall stands in for filming the real equipment; swap
       * `createVitalsWall()` for a camera stream and nothing downstream changes.
       *
       * It carries no consent gate: it shows equipment, not a person.
       */
      const wall = createVitalsWall();
      wall.setPatient(patient, driver.specs);
      const screen = wall.start();
      deviceScreen = wall;

      const consult = useConsult.getState();
      await consult.open('patient', patientId);
      consult.publish(STREAM_DEVICES, screen);
      set({ screenPublished: true });

      // Lets the end-to-end checks inject a scenario without driving the UI:
      //   __devices.getState().trigger('desaturation')
      if (import.meta.env.DEV) window.__devices = useDevices;
    })();

    return starting;
  },

  /**
   * Swap what the `devices` stream is showing.
   *
   * The whole point of the pipeline being video-in is that this is the only
   * place that changes. Publishing a shared window or a camera feed instead of
   * the rendered stand-in touches nothing downstream — the peer connection, the
   * nurse's element, the reader and the alerting are all unaware.
   */
  async setSource(kind) {
    if (kind === get().source) return;
    set({ sourceError: null });

    try {
      const stream =
        kind === 'simulated' ? deviceScreen?.stream() : await captureDeviceScreen(kind);
      if (!stream) throw new Error('no stream produced');

      // The patient can stop a shared screen from the browser's own bar; that
      // has to put the kiosk back to a source it controls, not leave a dead
      // track published as though monitoring were still running.
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (get().source === kind) get().setSource('simulated');
        });
      }

      if (captured && captured !== stream) captured.getTracks().forEach((t) => t.stop());
      captured = kind === 'simulated' ? null : stream;

      useConsult.getState().publish(STREAM_DEVICES, stream);
      set({ source: kind });
    } catch (err) {
      // A patient cancelling the share dialog is a decision, not a failure.
      const cancelled = err.name === 'NotAllowedError' || err.name === 'AbortError';
      set({ sourceError: cancelled ? null : err.message });
    }
  },

  stop() {
    starting = null;
    captured?.getTracks().forEach((t) => t.stop());
    captured = null;
    driver?.stop();
    driver = null;
    deviceScreen?.stop();
    deviceScreen = null;
    useConsult.getState().close();
    set({ running: false, latest: {}, scenario: null, screenPublished: false, source: 'simulated' });
  },

  trigger(id) {
    const scenario = driver?.trigger(id);
    set({ scenario });
  },

  clearScenario() {
    driver?.clear();
    set({ scenario: null });
  },

  setCameraLive(live) {
    getSocket().emit('camera:state', { live });
    set({ cameraLive: live });
  },

  get driver() {
    return driver;
  },
}));

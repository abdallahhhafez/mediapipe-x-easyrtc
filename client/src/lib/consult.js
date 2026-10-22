import { APP_NAME, DEFAULT_ROOM, loadEasyrtc, roomForPatient } from './easyrtc';
import { tokenStore } from './api';

/**
 * The peer channel between a patient's home and the nursing station.
 *
 * It carries two *named* streams, and the distinction matters:
 *
 *   devices — video of the medical devices' own screens. This is the
 *             monitoring channel. The devices expose no API of any kind, so
 *             their readings exist nowhere except as pixels on their displays;
 *             filming those displays is the only way to get the numbers out.
 *             It runs continuously and needs no consent, because it shows
 *             equipment, not a person.
 *
 *   default — the patient's own camera. Off unless they say yes, endable by
 *             them at any moment, and never required for monitoring.
 *
 * One EasyRTC connection per page. `window.easyrtc` is a singleton, so two
 * components each calling connect() would fight over the same client and one
 * would tear down the other's session — hence a single manager that both the
 * device stream and the camera publish through.
 */

export const STREAM_DEVICES = 'devices';
export const STREAM_CAMERA = 'default';

export function createConsult({ role, patientId, onStream, onStatus }) {
  const room = roomForPatient(patientId);
  const published = new Map();
  const dialed = new Set();
  let rtc = null;
  let connected = false;
  let closed = false;

  const report = (status, detail) => !closed && onStatus?.(status, detail);

  /**
   * Only the patient ever places a call.
   *
   * The usual answer to two peers dialling at once is a glare rule ("lower id
   * dials"), but that would sometimes have the nurse initiate — and the nurse
   * publishes nothing, so the offer would carry no media for the patient to
   * answer. Media only flows one way here, so calls do too.
   */
  function dialEveryone(occupants) {
    if (role !== 'patient') return;
    for (const id of Object.keys(occupants || {})) {
      if (dialed.has(id)) continue;
      dialed.add(id);
      rtc.call(
        id,
        () => report('live'),
        (code, text) => {
          dialed.delete(id);
          report('error', text || code);
        },
        undefined,
        [...published.keys()],
      );
    }
  }

  return {
    async connect() {
      rtc = await loadEasyrtc();
      if (closed) return;

      // Must precede connect(): the server checks this token, and then checks
      // room membership separately when joinRoom arrives.
      rtc.setCredential({ token: tokenStore.get() });

      // Neither side lets EasyRTC open a camera on its own. The patient hands
      // over streams it already owns; the nurse takes no media at all, which
      // is what makes their side genuinely receive-only.
      rtc.enableVideo(false);
      rtc.enableAudio(false);
      rtc.enableDataChannels(false);
      rtc.setUsername(role === 'patient' ? 'Patient' : 'Clinician');

      rtc.setStreamAcceptor((id, stream, streamName) => {
        onStream?.(streamName || STREAM_CAMERA, stream, id);
        report('live');
      });

      rtc.setOnStreamClosed((id, stream, streamName) => {
        dialed.delete(id);
        onStream?.(streamName || STREAM_CAMERA, null, id);
        report('waiting');
      });

      rtc.setRoomOccupantListener((roomName, occupants) => {
        if (roomName !== room) return;
        dialEveryone(occupants);
      });

      report('connecting');
      await new Promise((resolve) => {
        rtc.connect(
          APP_NAME,
          () => {
            rtc.joinRoom(
              room,
              null,
              () => {
                // EasyRTC auto-joins a shared "default" room on connect;
                // staying in it would let every peer in the deployment see
                // every other one.
                rtc.leaveRoom(DEFAULT_ROOM);
                connected = true;
                report('waiting');
                resolve();
              },
              (_code, text) => {
                report('error', text);
                resolve();
              },
            );
          },
          (_code, message) => {
            report('error', message);
            resolve();
          },
        );
      });
    },

    /** Publish a named stream, adding it to any call already in progress. */
    publish(name, stream) {
      if (!rtc || !stream) return;
      published.set(name, stream);
      rtc.register3rdPartyLocalMediaStream(stream, name);
      for (const id of dialed) rtc.addStreamToCall(id, name);
    },

    unpublish(name) {
      published.delete(name);
    },

    get connected() {
      return connected;
    },

    close() {
      closed = true;
      dialed.clear();
      published.clear();
      try {
        rtc?.hangupAll();
        rtc?.disconnect();
      } catch {
        // Tearing down a connection that never came up is not an error.
      }
    },
  };
}

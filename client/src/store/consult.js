import { create } from 'zustand';
import { createConsult, STREAM_CAMERA, STREAM_DEVICES } from '../lib/consult';

/**
 * One consult channel per page, held outside React.
 *
 * Same reason the device loop lives in a store: the connection has to outlive
 * any particular screen, and creating it inside a component would tear the peer
 * connection down and rebuild it every time something re-rendered.
 */

let channel = null;
let starting = null;

export const useConsult = create((set, get) => ({
  status: 'idle',
  error: null,
  /** streamName -> MediaStream received from the peer */
  remote: {},

  /**
   * @param {'patient'|'nurse'} role
   */
  open(role, patientId) {
    if (channel || starting) return starting ?? Promise.resolve();

    starting = (async () => {
      const next = createConsult({
        role,
        patientId,
        onStream: (name, stream) => {
          const remote = { ...get().remote };
          if (stream) remote[name] = stream;
          else delete remote[name];
          set({ remote });
        },
        onStatus: (status, detail) =>
          set({ status, error: status === 'error' ? detail : null }),
      });
      // Assigned before connect() so a close() mid-handshake still finds it.
      channel = next;
      await next.connect();
    })();

    return starting;
  },

  publish(name, stream) {
    channel?.publish(name, stream);
  },

  unpublish(name) {
    channel?.unpublish(name);
  },

  close() {
    starting = null;
    channel?.close();
    channel = null;
    set({ status: 'idle', remote: {}, error: null });
  },
}));

export { STREAM_CAMERA, STREAM_DEVICES };

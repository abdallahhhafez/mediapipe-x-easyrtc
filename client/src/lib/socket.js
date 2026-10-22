import { io } from 'socket.io-client';
import { tokenStore } from './api';

/**
 * One telemetry socket per tab, shared by every component that needs it.
 *
 * Nurses subscribe to a ward board and, when they open a patient, to that
 * patient's room as well; patients publish their device readings on the same
 * connection. Reconnection is left to socket.io — a home broadband dropout
 * must not need the kiosk to be touched.
 */

let socket = null;

export function getSocket() {
  if (socket) return socket;
  socket = io('/telemetry', {
    auth: { token: tokenStore.get() },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}

/** Subscribe helper that returns its own unsubscribe, for use in effects. */
export function on(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

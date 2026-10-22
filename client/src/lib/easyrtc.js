/**
 * Loader for the EasyRTC browser client.
 *
 * EasyRTC ships its client as a global script served by its own Express route,
 * not as an npm module, and it expects socket.io's client to already be on the
 * page — so both are injected in order rather than imported. Everything is
 * same-origin, which is why Vite proxies /easyrtc and /socket.io to the API in
 * development.
 */

let loader = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(el);
  });
}

export function loadEasyrtc() {
  if (window.easyrtc) return Promise.resolve(window.easyrtc);
  if (loader) return loader;

  loader = (async () => {
    // Order matters: easyrtc.js expects io() to exist at evaluation time.
    await injectScript('/socket.io/socket.io.js');
    await injectScript('/easyrtc/easyrtc.js');
    if (!window.easyrtc) throw new Error('easyrtc client did not initialise');
    return window.easyrtc;
  })().catch((err) => {
    loader = null;
    throw err;
  });

  return loader;
}

export const APP_NAME = 'vitalwatch.consult';

/**
 * EasyRTC validates room names against `/^[a-z0-9_.-]{1,32}$/i` and silently
 * rejects the whole message otherwise — the socket is dropped with a generic
 * "bad structure" warning that says nothing about the name. So no colon here,
 * even though the telemetry socket's own rooms use `patient:<id>`: those are
 * socket.io rooms and have no such rule.
 *
 * `p-` plus a 24-character Mongo id is 26, comfortably inside the 32 limit.
 */
export const PATIENT_ROOM_PREFIX = 'p-';
export const roomForPatient = (id) => `${PATIENT_ROOM_PREFIX}${id}`;

/**
 * EasyRTC auto-joins a room called "default" on connect, so without leaving it
 * every peer in the deployment sees every other peer regardless of which
 * patient they are looking at. Leaving it is not optional here.
 */
export const DEFAULT_ROOM = 'default';

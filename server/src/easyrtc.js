import easyrtc from 'open-easyrtc';
import { verifyToken } from './middleware/auth.js';
import { Patient } from './models/index.js';

export const EASYRTC_APP = 'vitalwatch.consult';

/**
 * Must match client/src/lib/easyrtc.js. EasyRTC validates room names against
 * `/^[a-z0-9_.-]{1,32}$/i` and rejects the entire message if they fail —
 * dropping the socket with a generic "bad structure" warning that never
 * mentions the name. A colon in here is enough to break all signalling.
 */
const PATIENT_ROOM_PREFIX = 'p-';
export const roomForPatient = (id) => `${PATIENT_ROOM_PREFIX}${id}`;

/**
 * Who is behind each signalling connection, by easyrtcid.
 *
 * The room check has to happen on `roomJoin`, which is the only event that
 * knows the room name — but by then the JWT is long gone, because clients
 * connect first and join afterwards. This carries the identity from one event
 * to the other.
 */
const connections = new Map();

/**
 * EasyRTC signalling, mounted on the same Express app and the same socket.io
 * server as everything else — it serves its own client from /easyrtc and needs
 * to share the socket, so it cannot run on a separate port.
 *
 * Unlike the reference setup this was ported from, signalling is authenticated.
 * Without it, anyone who can reach the socket can join any room and receive a
 * patient's camera, which is not acceptable for a medical system. Two hooks:
 *
 *   authenticate — verifies the JWT and remembers who this connection is
 *   roomJoin     — the room name only exists here, so this is where membership
 *                  is actually enforced
 */
export function attachEasyrtc(app, io) {
  easyrtc.setOption('logLevel', 'warning');
  easyrtc.setOption('demosEnable', false);
  easyrtc.setOption('appDefaultName', EASYRTC_APP);

  /**
   * Signature is fixed by open-easyrtc:
   *   (socket, easyrtcid, appName, username, credential, authMessage, next)
   * `next(err)` denies the connection; `next(null)` lets it through.
   */
  easyrtc.events.on(
    'authenticate',
    (socket, easyrtcid, appName, username, credential, authMessage, next) => {
      const token = credential?.token;
      if (!token) return next(new Error('signalling requires a token'));

      try {
        const user = verifyToken(token);
        connections.set(easyrtcid, user);
        socket.once('disconnect', () => connections.delete(easyrtcid));
        next(null);
      } catch (err) {
        next(new Error(`signalling auth failed: ${err.message}`));
      }
    },
  );

  /** Signature: (connectionObj, roomName, roomParameter, callback). */
  easyrtc.events.on('roomJoin', async (connectionObj, roomName, roomParameter, callback) => {
    if (!roomName.startsWith(PATIENT_ROOM_PREFIX)) {
      // EasyRTC's own "default" room and anything else keeps stock behaviour.
      return easyrtc.events.defaultListeners.roomJoin(
        connectionObj,
        roomName,
        roomParameter,
        callback,
      );
    }

    const user = connections.get(connectionObj.getEasyrtcid());
    const patientId = roomName.slice(PATIENT_ROOM_PREFIX.length);

    if (!(await mayJoin(user, patientId))) {
      return callback(new Error('not permitted in this room'));
    }
    easyrtc.events.defaultListeners.roomJoin(connectionObj, roomName, roomParameter, callback);
  });

  easyrtc.listen(app, io, undefined, (err) => {
    if (err) console.error('[easyrtc] failed to start', err);
    else console.log('[easyrtc] video signalling ready');
  });
}

async function mayJoin(user, patientId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'patient') return user.patient === patientId;
  if (user.role !== 'nurse') return false;

  const patient = await Patient.findById(patientId).select('wardId assignedNurses').lean();
  if (!patient) return false;
  if (user.wards?.includes(patient.wardId)) return true;
  return (patient.assignedNurses ?? []).some((n) => String(n) === user.sub);
}

import { Router } from 'express';
import { Alert, Patient } from '../models/index.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { snapshot } from '../monitor/runner.js';

export const patientsRouter = Router();
patientsRouter.use(authRequired);

/**
 * The ward board. Returns every patient with their live snapshot folded in, so
 * the board paints fully on first load and the socket only has to carry
 * changes from then on.
 */
patientsRouter.get('/', requireRole('nurse'), async (req, res) => {
  const wardId = req.query.wardId || req.user.wards?.[0];
  const patients = await Patient.find(wardId ? { wardId } : {}).lean();

  const openCounts = await Alert.aggregate([
    { $match: { status: { $in: ['open', 'acknowledged'] } } },
    { $group: { _id: { patient: '$patient', severity: '$severity' }, n: { $sum: 1 } } },
  ]);

  const bySeverity = new Map();
  for (const row of openCounts) {
    const key = String(row._id.patient);
    const entry = bySeverity.get(key) || { critical: 0, warning: 0, info: 0 };
    entry[row._id.severity] = row.n;
    bySeverity.set(key, entry);
  }

  res.json({
    patients: patients.map((p) => ({
      ...p,
      alerts: bySeverity.get(String(p._id)) || { critical: 0, warning: 0, info: 0 },
      live: snapshot(p._id) ? summarise(snapshot(p._id)) : null,
    })),
  });
});

patientsRouter.get('/:id', async (req, res) => {
  // A patient may read their own record; nurses may read any in their ward.
  if (req.user.role === 'patient' && req.user.patient !== req.params.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const patient = await Patient.findById(req.params.id).lean();
  if (!patient) return res.status(404).json({ error: 'not found' });

  const snap = snapshot(req.params.id);
  res.json({ patient, live: snap ? summarise(snap) : null });
});

/** Context NEWS2 needs that no device can report. */
patientsRouter.patch('/:id/context', requireRole('nurse'), async (req, res) => {
  const { onOxygen, consciousness } = req.body ?? {};
  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    {
      ...(onOxygen !== undefined ? { onOxygen } : {}),
      ...(consciousness !== undefined ? { consciousness } : {}),
    },
    { new: true },
  ).lean();
  if (!patient) return res.status(404).json({ error: 'not found' });
  res.json({ patient });
});

const summarise = (snap) => ({
  latest: snap.latest,
  score: snap.score,
  lastSeen: snap.lastSeen,
});

import { Router } from 'express';
import { Alert } from '../models/index.js';
import { authRequired, requireRole } from '../middleware/auth.js';

export const alertsRouter = Router();
alertsRouter.use(authRequired);

alertsRouter.get('/', async (req, res) => {
  const { patient, status, severity, source, limit = 100 } = req.query;
  const query = {};
  if (patient) query.patient = patient;
  if (status) query.status = { $in: String(status).split(',') };
  if (severity) query.severity = { $in: String(severity).split(',') };
  if (source) query.source = source;
  // A patient may only ever see their own.
  if (req.user.role === 'patient') query.patient = req.user.patient;

  const alerts = await Alert.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit), 500))
    .populate('patient', 'name avatar wardId room')
    .populate('acknowledgedBy', 'name')
    .lean();

  res.json({ alerts });
});

alertsRouter.patch('/:id', requireRole('nurse'), async (req, res) => {
  const { status } = req.body ?? {};
  if (!['acknowledged', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'status must be acknowledged or resolved' });
  }

  const patch =
    status === 'acknowledged'
      ? { status, acknowledgedBy: req.user.sub, acknowledgedAt: new Date() }
      : { status, resolvedAt: new Date() };

  const alert = await Alert.findByIdAndUpdate(req.params.id, patch, { new: true })
    .populate('acknowledgedBy', 'name')
    .lean();
  if (!alert) return res.status(404).json({ error: 'not found' });

  req.app.get('telemetry')?.to(`patient:${alert.patient}`).emit('alert:update', alert);
  req.app.get('telemetry')?.to(`station:${req.body.wardId}`).emit('alert:update', alert);
  res.json({ alert });
});

/** Bulk acknowledge — the "I've seen the board" action after a busy few minutes. */
alertsRouter.post('/acknowledge', requireRole('nurse'), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });

  await Alert.updateMany(
    { _id: { $in: ids }, status: 'open' },
    { status: 'acknowledged', acknowledgedBy: req.user.sub, acknowledgedAt: new Date() },
  );
  const alerts = await Alert.find({ _id: { $in: ids } }).lean();
  for (const a of alerts) {
    req.app.get('telemetry')?.to(`patient:${a.patient}`).emit('alert:update', a);
  }
  res.json({ alerts });
});

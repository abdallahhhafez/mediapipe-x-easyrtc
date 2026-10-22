import { Router } from 'express';
import { Reading } from '../models/index.js';
import { authRequired } from '../middleware/auth.js';
import { history } from '../monitor/runner.js';

export const readingsRouter = Router();
readingsRouter.use(authRequired);

const MAX_POINTS = 900;

/**
 * Chart history. Short windows are served from the monitor's in-memory ring —
 * which is the common case, since a nurse mostly looks at the last few minutes
 * — and only a longer lookback touches the collection.
 */
readingsRouter.get('/:patientId', async (req, res) => {
  const { patientId } = req.params;
  const metric = req.query.metric;
  const windowSec = Math.min(Number(req.query.windowSec) || 300, 24 * 3600);
  const since = Date.now() - windowSec * 1000;

  if (!metric) return res.status(400).json({ error: 'metric required' });

  const hot = history(patientId, metric, since);
  if (hot.length && hot[0].ts <= since + 2000) {
    return res.json({ metric, series: downsample(hot) });
  }

  const docs = await Reading.find({ patient: patientId, metric, ts: { $gte: new Date(since) } })
    .sort({ ts: 1 })
    .limit(20_000)
    .lean();

  res.json({
    metric,
    series: downsample(docs.map((d) => ({ value: d.value, value2: d.value2, ts: +d.ts }))),
  });
});

/**
 * An hour of 1 Hz data is 3,600 points behind a chart 640px wide. Thinning it
 * server-side keeps the payload small without changing what the nurse sees.
 */
function downsample(series) {
  if (series.length <= MAX_POINTS) return series;
  const step = Math.ceil(series.length / MAX_POINTS);
  const out = [];
  for (let i = 0; i < series.length; i += step) out.push(series[i]);
  // Always keep the newest sample — it is the one being alerted on.
  if (out[out.length - 1] !== series[series.length - 1]) out.push(series[series.length - 1]);
  return out;
}

import 'express-async-errors';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';

import { connectDb } from './db.js';
import { attachEasyrtc } from './easyrtc.js';
import { attachTelemetry } from './realtime/telemetry.js';
import { authRouter } from './routes/auth.js';
import { patientsRouter } from './routes/patients.js';
import { readingsRouter } from './routes/readings.js';
import { alertsRouter } from './routes/alerts.js';
import { seedIfEmpty } from './scripts/seed.js';

const PORT = Number(process.env.PORT) || 4100;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/readings', readingsRouter);
app.use('/api/alerts', alertsRouter);

app.use((err, _req, res, _next) => {
  console.error('[api]', err);
  res.status(err.status || 500).json({ error: err.message || 'server error' });
});

const uri = await connectDb();
console.log(`[db] connected — ${uri}`);
await seedIfEmpty();

// Order matters: the HTTP server wraps the fully-configured app, socket.io
// wraps the HTTP server, and EasyRTC is handed the Express app (not the server)
// because it mounts its own static route for the client script.
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: true } });

const telemetry = attachTelemetry(io);
app.set('telemetry', telemetry);
attachEasyrtc(app, io);

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

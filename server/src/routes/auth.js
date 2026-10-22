import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User } from '../models/index.js';
import { authRequired, signToken } from '../middleware/auth.js';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

authRouter.post('/login', async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'email and password required' });

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: 'Those credentials did not match' });
  }

  res.json({ token: signToken(claims(user)), user: publicUser(user) });
});

authRouter.get('/me', authRequired, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(401).json({ error: 'unknown user' });
  res.json({ user: publicUser(user) });
});

/**
 * The socket handshake carries this same token, so everything the telemetry
 * plane needs to route a connection has to be in the claims — a patient socket
 * must know its own patient id without a database round trip on every frame.
 */
function claims(user) {
  return {
    sub: String(user._id),
    name: user.name,
    role: user.role,
    wards: user.wards ?? [],
    patient: user.patient ? String(user.patient) : undefined,
  };
}

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar,
  wards: u.wards ?? [],
  patient: u.patient ? String(u.patient) : undefined,
});

import bcrypt from 'bcryptjs';
import { Patient, User } from '../models/index.js';

/**
 * Demo ward. Seeds only into an empty database, so it costs nothing on a real
 * deployment and means `npm run dev` gives you a working ward with no setup.
 */

const WARD = 'ward-a';
const PASSWORD = 'vitalwatch';

const PATIENTS = [
  { name: 'Maryam Farouk', room: '12A', condition: 'Post-operative — day 2', age: 64 },
  { name: 'Daniel Osei', room: '12B', condition: 'Community-acquired pneumonia', age: 71 },
  {
    name: 'Priya Raman',
    room: '14A',
    condition: 'COPD exacerbation',
    age: 68,
    // The reason band overrides exist: this patient lives at 88–92%, and
    // without the override every reading would alert all night.
    thresholds: { spo2: { target: { min: 88, max: 94 }, danger: { min: 84, max: 100 } } },
    onOxygen: true,
  },
  { name: 'Tomás Herrera', room: '14B', condition: 'Type 2 diabetes — glycaemic control', age: 55 },
  { name: 'Grace Whitfield', room: '16A', condition: 'Heart failure — fluid management', age: 79 },
  { name: 'Ibrahim Nasser', room: '16B', condition: 'Sepsis watch — post-discharge', age: 47 },
];

const DEVICES = [
  { id: 'oximeter', label: 'Pulse oximeter', metrics: ['spo2', 'hr'] },
  { id: 'resp', label: 'Respiration band', metrics: ['rr'] },
  { id: 'bp-cuff', label: 'BP cuff', metrics: ['bp'] },
  { id: 'thermometer', label: 'Skin thermometer', metrics: ['temp'] },
  { id: 'cgm', label: 'Continuous glucose monitor', metrics: ['glucose'] },
];

export async function seedIfEmpty() {
  if (await User.countDocuments()) return false;
  await seed();
  return true;
}

export async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const nurse = await User.create({
    name: 'Nadia Haddad',
    email: 'nurse@vitalwatch.test',
    passwordHash,
    role: 'nurse',
    wards: [WARD],
  });

  for (const [i, p] of PATIENTS.entries()) {
    const patient = await Patient.create({
      name: p.name,
      wardId: WARD,
      room: p.room,
      condition: p.condition,
      dob: new Date(new Date().getFullYear() - p.age, 3, 12),
      assignedNurses: [nurse._id],
      thresholds: p.thresholds ?? {},
      onOxygen: p.onOxygen ?? false,
      devices: DEVICES.map((d) => ({ ...d, serial: `SN-${1000 + i}-${d.id}` })),
    });

    await User.create({
      name: p.name,
      email: `patient${i + 1}@vitalwatch.test`,
      passwordHash,
      role: 'patient',
      patient: patient._id,
    });
  }

  console.log(
    `[seed] ward "${WARD}" — nurse@vitalwatch.test / patient1..${PATIENTS.length}@vitalwatch.test, password "${PASSWORD}"`,
  );
}

// `npm run seed` re-seeds from scratch.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { connectDb, disconnectDb } = await import('../db.js');
  await connectDb();
  await Promise.all([User.deleteMany({}), Patient.deleteMany({})]);
  await seed();
  await disconnectDb();
}

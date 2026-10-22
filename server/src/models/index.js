import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['nurse', 'patient', 'admin'], required: true },
    avatar: String,
    // Nurses are scoped to the wards whose boards they may open.
    wards: [String],
    // Set on patient accounts, linking the login to the monitored record.
    patient: { type: Schema.Types.ObjectId, ref: 'Patient' },
  },
  { timestamps: true },
);

const patientSchema = new Schema(
  {
    name: { type: String, required: true },
    avatar: String,
    dob: Date,
    wardId: { type: String, required: true, index: true },
    room: String,
    condition: String,
    assignedNurses: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    /**
     * Per-patient band overrides, merged over the shared catalogue by
     * resolveSpecs(). A COPD patient sits at 88–92% SpO₂ without every alert in
     * the ward firing, and without any other spec property drifting.
     */
    thresholds: { type: Schema.Types.Mixed, default: {} },
    /** Context NEWS2 needs but no device reports. */
    onOxygen: { type: Boolean, default: false },
    consciousness: { type: String, default: 'alert' },
    devices: [
      {
        id: String,
        label: String,
        metrics: [String],
        // Populated by the driver at connect time; the real USB path fills the
        // same fields from the device descriptor.
        serial: String,
      },
    ],
  },
  { timestamps: true },
);

/**
 * Raw telemetry. High volume and only ever read back for the history charts —
 * the detectors run off an in-memory ring buffer, never off this collection.
 */
const readingSchema = new Schema({
  patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
  metric: { type: String, required: true },
  value: { type: Number, required: true },
  value2: Number,
  ts: { type: Date, required: true },
});
readingSchema.index({ patient: 1, metric: 1, ts: -1 });
// A week of 1 Hz telemetry per patient is plenty for the charts, and keeps the
// collection from growing without bound on a long-running deployment.
readingSchema.index({ ts: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

const alertSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    /** Dedupe key from the detector, e.g. "spo2:out_of_range". */
    dedupeKey: { type: String, required: true },
    kind: { type: String, required: true },
    metric: String,
    severity: { type: String, enum: ['info', 'warning', 'critical'], required: true },
    title: String,
    body: String,
    value: Number,
    value2: Number,
    /**
     * Which detector raised it. The server rules engine reads the numbers;
     * MediaPipe reads the pixels of the vitals stream. Keeping both lets the
     * feed show the same event found two independent ways.
     */
    source: { type: String, enum: ['server', 'mediapipe'], default: 'server' },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
      index: true,
    },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    resolvedAt: Date,
    /** Minutes before an unacknowledged alert escalates. Set from severity. */
    slaMinutes: Number,
    escalatedAt: Date,
    /**
     * How many times this condition has recurred.
     *
     * A patient hovering on a threshold crosses it repeatedly, and each crossing
     * is the same clinical fact. Recording it as one alert that happened N times
     * is both more useful and more honest than N identical alerts — and it stops
     * one unstable reading from burying every other patient on the board.
     */
    occurrences: { type: Number, default: 1 },
    lastOccurredAt: Date,
  },
  { timestamps: true },
);
alertSchema.index({ patient: 1, dedupeKey: 1, status: 1 });

export const User = model('User', userSchema);
export const Patient = model('Patient', patientSchema);
export const Reading = model('Reading', readingSchema);
export const Alert = model('Alert', alertSchema);

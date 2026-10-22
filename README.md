# VitalWatch

Continuous monitoring for patients at home. Medical devices stream readings to a
nurse's station around the clock; the patient's camera stays off unless they
agree to turn it on.

```bash
npm install
npm run dev        # server :4100, client :5175
```

No database setup — the server falls back to an in-process MongoDB and seeds a
demo ward. Sign in at <http://localhost:5175>:

| | |
|---|---|
| Nurse station | `nurse@vitalwatch.test` |
| Patient kiosk | `patient1@vitalwatch.test` … `patient6@vitalwatch.test` |
| Password | `vitalwatch` |

Open the kiosk and the station in **two separate tabs** — that is the whole
system: one tab is the patient's home, the other is the ward. Sessions are
per-tab (`sessionStorage`), so they do not sign each other out.

The tabs find each other on their own. The kiosk joins the patient's peer room
as soon as it signs in and starts publishing its device screens; opening that
patient on the ward board joins the same room and the video connects. Nobody has
to press anything, because 24/7 monitoring cannot depend on someone pressing
something.

---

## Why the readings arrive as video

**The medical devices expose no API.** Their readings exist nowhere except as
pixels on their own displays, so the only way to get a number out of one is to
look at it. That single constraint is what the whole system is shaped around.

So the patient's home streams **video of the device screens** to the station,
and MediaPipe recovers the numbers from that video at the nurse's end. There is
no data feed to fall back on, which is why the video channel is the monitoring
channel rather than a nice-to-have.

Two streams travel the peer connection, and the difference matters:

| Stream | What it shows | Consent |
|---|---|---|
| `devices` | the equipment's own displays | none — it is equipment, not a person |
| `default` | the patient's camera | required, and endable by them at any time |

Turning the camera off does not stop monitoring. That asymmetry is the point.

```
PATIENT'S HOME                      SERVER (:4100)              NURSE STATION
──────────────                      ──────────────              ─────────────
devices ─▶ device screen (canvas)   open-easyrtc signalling
             │ captureStream                                    <video> (remote)
             └──── peer video ══════(same io, same port)═══════▶   │
                   "devices"                                       ▼
  camera OFF by default             socket.io /telemetry      worker: crop → classify
  ◀── camera:request ──────────     ├ persist (TTL 7d)              ▼
  └── peer video "default" ════▶    ├ rules engine ◀── 24/7    numbers → detector
                                    └ persist Alert                 ▼
                                                                  alert
```

`createVitalsWall()` on the patient side stands in for filming real equipment.
Swap it for a camera stream and nothing downstream changes — the nurse's reader
never knew the difference.

### Two things worth stating plainly

**MediaPipe Tasks Vision has no OCR task.** Digit recognition needs a model, so
[`tools/digit-model/`](tools/digit-model/) trains one and exports the `.task`
bundle `ImageClassifier` consumes. Until you run it, the reader uses a
seven-segment decoder that scores each crop against per-digit templates — real
image processing, no model. The *What MediaPipe reads* panel names whichever
engine is live.

**The numeric socket is a simulator convenience, not part of the design.**
Devices with no API cannot feed it. It survives so the server's safety net has
something to run on, and so the reader's output has something to be scored
against — every recognised value is compared with what the screen was showing,
and the panel reports a rolling accuracy figure, an abstention rate, and how far
behind the feed is running. With real hardware that comparison is a bench
exercise, not a production feature.

## Two detectors, one feed

Both run [`shared/detector.js`](shared/detector.js) — the same bands, the same
debounce, the same NEWS2 — so a disagreement between them is a disagreement
about what the numbers *were*, never about what counts as abnormal. Alerts carry
a `source`, and `/alerts` filters on it.

They are not redundant. They fail differently:

- **Server rules** see the telemetry itself. They are the 24/7 path: they run
  with no browser open anywhere, they own persistence and escalation, and they
  own everything about the *hardware* — a frozen sensor, an implausible reading,
  a device gone silent. The CV reader is three removes from the hardware and
  deliberately raises none of those.
- **MediaPipe CV** sees only what a human at the station would see. It catches a
  display that has drifted from the data, and it is the path that would still
  work against a bedside monitor with no data port at all.

## The 24/7 property

Close the nurse's browser entirely, trigger a deterioration from the patient's
simulator panel, and reopen: the alert is already there. Monitoring does not
depend on anyone watching.

A few decisions exist only to hold that line, and each one was a bug first:

- The wall repaints on a **timer, not `requestAnimationFrame`** — browsers pause
  rAF in a background tab, which froze the display and left the reader parsing a
  stale frame while the picture looked fine.
- The kiosk's device clock runs in a **worker** — background tabs throttle
  `setInterval` to once a minute, which stopped the readings and correctly (but
  uselessly) reported the patient as offline.
- The device loop starts in the **patient shell, not on a page** — monitoring
  must not stop because the patient opened a different screen.
- Crop boxes are **rescaled to the frame's real size** — WebRTC downscales a
  track freely under bandwidth pressure, and a 1280×720 screen arriving as
  640×360 put every ROI in the top-left quadrant. It read as a screen full of
  blanks rather than as an error.
- The device-screen track is tagged **`contentHint = 'detail'`** — otherwise the
  encoder trades resolution for framerate, and seven-segment digits stop being
  legible long before the picture looks bad to a human. This feed exists to be
  read, and the numbers only change once a second.
- Nothing is read until the remote element **actually has a frame** — a track
  serves grey placeholders before the first decode, and those are just bright
  enough to look like a dim `1` in every cell. A confident wrong number is worse
  than an obvious blank.
- EasyRTC room names are **`p-<id>`, never `patient:<id>`** — EasyRTC validates
  room names against `/^[a-z0-9_.-]{1,32}$/i` and rejects the whole message on a
  colon, dropping the socket with a generic "bad structure" warning that never
  mentions the name.

When no peer feed is up, the monitor falls back to rendering the wall locally
and says so on the video. A nurse must never be unsure whether they are looking
at the patient's equipment or at a local re-drawing of it.

## Alarms that stay believable

A monitor that cries wolf gets muted, so most of the detector is about *not*
alerting:

- **N-of-M debounce** — abnormal in 5 of the last 8 before anything fires.
- **Plausibility gate** — a probe falling off reads as a sensor fault, never as
  an arrest.
- **Smoothed trends** — the rate-of-change check runs on an EWMA and must
  persist, so one dropout is not a cliff edge.
- **Per-patient bands** — the COPD patient in 14A lives at 88–92% SpO₂ and the
  ward does not alarm all night. The simulator anchors each patient's baseline
  inside *their* bands.
- **Hysteresis** — five consecutive in-range readings to clear.
- **Flatline thresholds scaled per metric** — a healthy integer SpO₂ really does
  sit on 97 for a minute; temperature genuinely holds steady for far longer.

The regression guard for all of it is a stable-patient trace with realistic
sensor noise that must produce **zero** alerts.

## Verifying it

```bash
npm test                                          # detector, NEWS2, bands
node server/src/scripts/e2e-telemetry.js desaturation   # full socket → alert path
```

`e2e-telemetry.js` replays a recorded trace over the real telemetry socket and
asserts the alerts that landed in the database. Traces: `noisyStable`,
`desaturation`, `sepsisOnset`, `probeOff`, `frozenSensor` — each on its own bed,
since detectors and alerts are per-patient.

```bash
cd tools/digit-model
python generate_dataset.py --per-class 40 --out /tmp/ds
python verify_dataset.py --data /tmp/ds          # renderers still agree?
```

`segments.py` and `segments.js` are two implementations of one formula. Nothing
enforces that they stay in step, and drift would silently train the model on
glyphs the wall never draws — `verify_dataset.py` decodes the generated images
with a port of the JavaScript decoder and fails if they disagree.

In the browser, the *ROI overlay* toggle on the monitor page draws every crop
box over the stream with its prediction and confidence, and `window.__vision`
exposes the reader's last frame in development.

## Layout

```
shared/     metrics · bands · news2 · detector      ← both detectors run this
server/     express + socket.io + open-easyrtc on one port
  monitor/  the 24/7 loop: ring buffer, alerts, SLA escalation
client/
  vision/   vitalsWall · roi · segments · digitReader.worker · accuracy
  devices/  driver (the USB seam) · simulator · scenarios · ticker
tools/digit-model/   dataset generation, training, renderer-agreement check
```

## Plugging in real devices

[`client/src/devices/driver.js`](client/src/devices/driver.js) is the only place
that knows a device exists. It documents the contract and carries a worked Web
Serial implementation in its header. Nothing upstream — sockets, rules engine,
vitals stream, MediaPipe — changes when the simulator is replaced.

## Known limits

- `digits.task` is not committed; the seven-segment decoder handles every frame
  until you train one. See [`tools/digit-model/README.md`](tools/digit-model/README.md).
- The demo database is in-memory, so a server restart reseeds it and invalidates
  existing sessions. Set `MONGODB_URI` for anything persistent.
- EasyRTC signalling is authenticated (JWT, plus a room-membership check), but
  the media itself is peer-to-peer with no TURN server configured — it will not
  traverse a symmetric NAT as-is.
- The patient's face camera needs a real camera and a permission grant. Where
  there is none, the kiosk publishes a clearly-marked stand-in feed so the
  consult path stays testable; a genuine refusal is surfaced, never faked. The
  device-screen stream is unaffected — it needs no camera at all.
- Reading a *filmed* device display, rather than the rendered stand-in, is where
  the trained model earns its place: glare, angle and focus break the
  fixed-template assumption the seven-segment decoder relies on.

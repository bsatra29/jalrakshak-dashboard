# JalRakshak Government Dashboard

Web dashboard for district water officers, block maintenance staff and the state pollution control
board. It reads and writes **Firebase** (Firestore + Auth) and replaces the earlier single-device
Jalraksha One dashboard. The Android app and firmware in this repository are unchanged.

Product context (who it is for, the five status colours, the confidence tiers, the features that
must survive any refactor) is in [`CONTEXT.md`](CONTEXT.md) in this folder.

## Run it

```bash
cd dashboard
npm install
cp .env.example .env.local      # then fill in the six NEXT_PUBLIC_FIREBASE_* values
npm run dev                     # http://localhost:3000
```

Sign in with an officer account. **Signing in is not enough:** the account also needs a profile
document at `officers/{uid}` (see below), otherwise the dashboard shows "Not an authorised officer".

### Without a Firebase project (the hosted build)

If the `NEXT_PUBLIC_FIREBASE_*` values are not set (or `NEXT_PUBLIC_DEMO_MODE=1`), `next.config.ts`
swaps the `firebase/*` imports for the in-browser data layer in `src/demo/`. It serves
`public/data/fleet.json` (regenerate with `npm run demo-data`, which uses `scripts/seed.mjs`), shifts
its timestamps to "now" on every load, and keeps an officer's own actions in that browser's
localStorage. The readings are generated, not measured. Sign in as `admin@jalrakshak.in`,
`anita.kumari@jalrakshak.in`, `rajesh.oraon@jalrakshak.in` or `s.mahto@jalrakshak.in`; the password is
`DEMO_PASSWORD` in `src/demo/store.ts`. Add the six Firebase values and redeploy to use a real project.

Deploy to Vercel from this folder: `npx vercel deploy --prod`. The build uses webpack
(`next build --webpack`) because Turbopack fails to fetch Google Fonts on Windows.

### Village map and contacts

- `public/data/villages.json` and `public/data/jharkhand-boundary.json`: real villages, hamlets and
  the state outline from OpenStreetMap (© OpenStreetMap contributors, ODbL), fetched with the
  Overpass query in `scripts/villages.overpassql`.
- `src/lib/authorities.ts`: who to contact for each kind of detection in Jharkhand. Contact
  details are deliberately blank; fill them with verified numbers before relying on them.

### Try it with demo data and no risk to your real project

The emulator needs Java. From `dashboard/`:

```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-jalrakshak
```

In a second terminal, seed it and point the app at it (`NEXT_PUBLIC_USE_EMULATOR=1` in `.env.local`):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
SEED_PASSWORD=demo-password-1 npm run seed -- --confirm
```

Demo logins (password is whatever you set in `SEED_PASSWORD`): `anita.kumari@jalrakshak.in`,
`rajesh.oraon@jalrakshak.in`, `s.mahto@jalrakshak.in`, `admin@jalrakshak.in`.

To seed a real Firebase project instead, set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account
JSON and run `npm run seed -- --confirm`. The data is invented: every mine, operator and reading is
fictional. Re-running overwrites the same documents; it never touches `auditLog`.

## Screens

| Route | Screen |
| --- | --- |
| `/` | **Live Map**: pins by status, mining overlay with radius rings, contamination heatmap, filters, top counters, unacknowledged alerts with the 24 h countdown |
| `/units/[id]` | **Unit Detail**: sensors with confidence tiers, before/after across tap points, class and cartridge, life bar, cycle counter, field-test clock, maintenance |
| `/accountability` | **Mine Accountability**: upstream vs downstream, event timeline vs rainfall and mining activity, per-mine scorecard, neutral-pH flag, tamper-proof export |
| `/seasonal` | **Seasonal & Trend**: pre/post monsoon, post-monsoon leaching alerts, groundwater vs surface, 12-month trends |
| `/operations` | **Operations**: maintenance queue by urgency, offline units, consumables forecast, bio-media calendar, spent media |
| `/lab` | **Lab Referral Queue**: pending samples, last-verified clock (sortable), result entry |
| `/reports` | **Citizen Reports**: log, map, geographic clusters, response time per officer, escalation |
| `/health` | **Health & Vulnerability**: nitrate → infants, fluoride and chromium → children, population served |
| `/audit` | **Audit**: hash-chained log, chain verification, CSV / JSON export |

English and Hindi (toggle in the sidebar). Hindi strings live in `src/lib/i18n.ts`; anything not
translated falls back to English. **Have a Hindi-speaking officer review it before deployment.**

## Firestore data model

Timestamps are epoch **milliseconds** (numbers). Types are in `src/lib/types.ts`.

```
officers/{uid}                 name, role (district|block|spcb|admin), district?, block?
units/{unitId}                 the Unit in CONTEXT.md, plus the additions below
  readings/{id}                unitId, timestamp, tapPoint, pH, turbidity, tds, ec, temperature, orp,
                               flow, pressureDrop, rainfallMm?, confidenceTier
  chemTests/{id}               unitId, timestamp, parameter, value, method, tapPoint?, confidenceTier
  maintenance/{id}             unitId, timestamp, kind, note, officerName
fieldTests/{id}                unitId, sampleId, type (uranium|arsenic|bacterial), gps, collectedDate,
                               status (pending|resulted), result (pass|fail|null), value, resultDate
alerts/{id}                    unitId, type, severity, pattern (event|trend), message, messageHi?,
                               raisedAt, acknowledgedBy/Uid/At, escalatedAt, autoBroadcast
citizenReports/{id}            unitId, type, reportedAt, acknowledgedBy/Uid/At, location, note?
cartridges/{id}                unitId, slot, mediaType, installedDate, litresProcessed,
                               predictedLifeLitres, dpStartKpa/dpNowKpa/dpLimitKpa, status, hazardous?, disposal?
mineFeatures/{id}              name, type, operator, lat, lng
mineEvents/{id}                mineId, type (blasting|discharge|overflow|dump-slide), timestamp, note?
auditLog/{seq}                 append-only hash chain (written only by the dashboard)
auditMeta/head                 { seq, hash }
```

**Fields added to `units` beyond the CONTEXT.md sketch**, which the unit sync service must write:
`populationServed`, `infantsUnder2`, `childrenUnder12`, `dailyLitres`, `streamId` and
`mineBetweenId` (pair two units on one stream: one `upstream`, one `downstream` in `mineProfile.position`),
`nearestMineId`, `openFaults[]`, `estimates.microbialRisk {p, lo, hi, at}`, and `latest`, a snapshot of
the newest raw-source value per parameter (`{ value, tier, at }`) so the map never has to page readings.

`readings` and `chemTests` are subcollections of the unit so they need no composite indexes.

## Behaviour worth knowing

- **The dashboard only ever downgrades a unit's status.** Grey if the unit has not synced for 24 h.
  Red if the latest lab result for any test type failed. Blue if the unit is in a uranium district and
  has no passing uranium lab result under 60 days old, even if the unit itself says green. Entering a
  passing lab result clears blue.
- **Uranium and arsenic are never shown as measured.** They appear only as "unverified, lab sample
  pending" with a lab-referral action; lab results show pass/fail and the date.
- **Neutral-pH leachate**: EC and hardness up 20 % or more (last 30 days vs the prior 30–150) while
  pH moves by 0.3 or less and stays in 6.5–8.5.
- **Event vs trend**: a reading above 1.8× the median of the previous five is an event; drift is a
  regression over weekly means.
- **Status is never colour alone**: every status and tier carries a glyph and a text label.
- **Offline-tolerant**: Firestore's on-device cache keeps the last data readable without a network.

## Audit trail

Every write the dashboard makes (acknowledging an alert or report, entering a lab result, requesting
a sample, logging maintenance, marking spent media, exporting) goes through `src/lib/audit.ts`. The
change and its audit entry are committed in **one transaction**. Each entry stores the SHA-256 hash of
the previous one, so editing or removing any entry breaks every hash after it; the Audit screen's
**Verify chain** recomputes them all. `firestore.rules` refuses update and delete on `auditLog`.

Honest limit: an administrator with direct database access can still rewrite history *and* recompute
the hashes. For evidence that stands up against that, also export the head hash periodically to a
system outside Firebase (a signed email, a government record). The JSON export includes the head
hash for exactly this.

## Deploying security rules

`firestore.rules` is written for the new collections. **Firestore rules are per project**, so if the
Android app already has rules in this Firebase project, merge these blocks into them rather than
deploying the file over the top. The citizen app also needs its own `create` permission on
`/citizenReports` (marked in the file).

```bash
npx firebase-tools deploy --only firestore:rules
```

## Not built here

- **The 24 h auto-broadcast itself.** The dashboard shows the countdown and marks alerts that have
  passed it; sending the notification to citizens needs a server-side job (a scheduled Cloud
  Function that finds unacknowledged alerts past 24 h, sets `autoBroadcast` / `escalatedAt` and pushes
  through the mobile app's messaging).
- **Map tiles** come from OpenStreetMap and need internet access. For a production government
  deployment, host your own tiles or use a licensed provider.
- Bio-media seed availability months in Operations are indicative placeholders.

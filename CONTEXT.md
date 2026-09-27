# JalRakshak Government Dashboard — Project Context

> Drop this file in the repo root. It gives any coding session the full product
> context without needing prior conversation history.

---

## What the product is

JalRakshak is a smart water purification and quality monitoring system for rural
and mining-affected villages in Jharkhand. Each deployed unit sits at a community
water point. It continuously monitors water, runs periodic chemical tests, treats
water through a gravity-fed multi-stage filter column, and only releases water to
the village supply if it passes safety thresholds.

This dashboard is the **government-facing side** — used by district administration,
block officers and the state pollution control board. There is a separate citizen
mobile app; this repo is not that.

---

## Who uses it

- **District water officers** — monitoring many units at once
- **Block-level maintenance staff** — responding to faults
- **Pollution control board** — attributing contamination to mining operators

Not villagers. Villagers use the separate mobile app.

---

## What a "unit" is

A single treatment station at one village water point. Each unit has:

- **Continuous sensors**: pH, turbidity, TDS, EC, temperature, ORP, flow,
  differential pressure
- **Carousel of sample tanks with a camera** for colorimetric tests: iron,
  fluoride, nitrate, hardness, sulphate, chromium(VI), free chlorine
- **Mine Profile**, set once at installation: mining type nearby
  (coal / uranium / chromite / iron ore / quarry / none), distance to nearest pit
  or tailing pond, upstream or downstream, groundwater or surface water
- **Filter column** with a swappable "Slot X" cartridge chosen by the software
  based on the contaminant detected
- **Periodic manual field tests** for uranium, arsenic and bacteria, sent to a
  district lab

---

## Core concepts the UI must express

### 1. Three confidence tiers

Every value carries one:

| Tier | Meaning |
|---|---|
| `MEASURED` | Directly read by a sensor, high confidence |
| `ESTIMATED` | Inferred with a confidence band (microbial risk, cartridge life, mining signature) |
| `UNVERIFIABLE` | Cannot be established on-site (uranium, arsenic speciation, live pathogen count) |

### 2. Five status colours, not three

| Colour | Meaning |
|---|---|
| Green | Safe |
| Amber | Being treated / wait |
| Red | Do not drink |
| **Blue** | **Treated, but unverified** — used in uranium districts where the unit can never claim green without a lab result |
| Grey | Unit offline |

### 3. Water class A–E

Assigned per batch:

| Class | Meaning | Action |
|---|---|---|
| A | Microbial / particles only | Treat locally |
| B | Heavy particles, coal fines | Treat locally |
| C | High dissolved salts / sulphate | Refer to block RO plant |
| D | Specific toxic ion | Fit the correct cartridge |
| E | Cannot verify | Refuse to certify, lab sample required |

### 4. Cycle counter

Failed water loops back through treatment. Maximum **3 cycles**, then the unit
declares "beyond local treatment" and refers out.

---

## Screens required

| Screen | Purpose |
|---|---|
| **Live Map** | Landing page. Units as coloured pins. Mining overlay (collieries, tailing ponds, washeries, dumps) with radius rings. Contamination heatmap scored by distance from mining features. Filters by district / block / mine type / status / contaminant. Top counters: units online, units red, lab tests overdue, unacknowledged alerts |
| **Unit Detail** | All live sensor values with confidence tags. Before/after comparison across filter tap points. Current class and fitted cartridge. Cartridge life bar (litres used vs predicted breakthrough). Cycle counter. Field test log with days-since clock. Maintenance history |
| **Mine Accountability** | Upstream vs downstream comparison for paired units on one stream. Event timeline plotted against rainfall and mining activity. Per-mine scorecard of spike frequency. Neutral-pH leachate flag. Tamper-proof export |
| **Seasonal & Trend** | Pre-monsoon vs post-monsoon comparison. Post-monsoon leaching alerts. Groundwater vs surface water split. 12-month per-parameter trends |
| **Operations** | Units needing maintenance ranked by urgency. Offline / dead units. Consumables forecast. Bio-media supply calendar (mango/jackfruit seed availability is seasonal). Spent media tracking |
| **Lab Referral Queue** | Pending uranium / arsenic / bacterial samples with ID, GPS, date, days pending. Overdue flags. Results entry that clears blue status |
| **Citizen Reports** | Complaint log (smell / taste / colour / illness) mapped. Response time tracking per officer. Escalation status. Geographic clustering |
| **Health & Vulnerability** | Contaminant-specific risk flags: nitrate → infants, fluoride → children, chromium/arsenic → children. Population served per unit |
| **Audit** | Immutable log viewer. Who acknowledged what, when. Export for legal proceedings |

---

## Distinctive features that must survive any refactor

These are the project's novelties. **Do not simplify them away.**

1. **Mining-proximity contamination heatmap** — contamination scored against
   distance from pits, tailing ponds, washeries, overburden dumps
2. **Upstream/downstream attribution** — the difference between two units on one
   stream is attributable to the mine between them
3. **Neutral-pH leachate detection** — flags units where EC and hardness rise
   while pH stays flat. This is the coal-mining signature that pH-only systems
   miss entirely
4. **Event vs trend separation** — a sudden spike (blasting, discharge) is
   displayed and handled differently from slow drift (post-monsoon leaching)
5. **Cartridge life prediction** — litres counted plus pressure trend predicts
   media exhaustion before output quality degrades
6. **"Last verified" clock** — since uranium, arsenic and bacteria are periodic
   manual tests, every unit shows days since last lab verification. Amber at 30
   days, red at 60. Sortable
7. **Alert escalation with a timer** — unacknowledged by an officer within 24
   hours auto-broadcasts to citizens. The dashboard shows the countdown
8. **Response time tracking per officer** — makes institutional silence visible
9. **Declared blind spots** — the UI must never render uranium or arsenic as a
   measured value. Always shown as unverified with a lab referral action
10. **Tamper-proof audit export** — timestamped, immutable, intended to be usable
    in RTI requests and NGT petitions

---

## Data model sketch

```
Unit: id, name, village, block, district, lat, lng, status,
      mineProfile{type, distanceM, position, sourceType},
      currentClass, fittedCartridge, cycleCount, lastSeen

Reading: unitId, timestamp, tapPoint,
         pH, turbidity, tds, ec, temperature, orp, flow, pressureDrop,
         confidenceTier

ChemTest: unitId, timestamp, parameter, value, method, confidenceTier

FieldTest: unitId, sampleId, type(uranium|arsenic|bacterial),
           gps, collectedDate, status, result, resultDate

Alert: unitId, type, severity, raisedAt, acknowledgedBy, acknowledgedAt,
       escalatedAt, autoBroadcast

CitizenReport: unitId, type(smell|taste|colour|illness),
               reportedAt, acknowledgedAt, location

Cartridge: unitId, mediaType, installedDate, litresProcessed,
           predictedLifeLitres, status

MineFeature: id, type(colliery|tailingPond|washery|dump),
             operator, lat, lng
```

---

## Design constraints

- **Offline-tolerant**: units sync when network returns, so timestamps and
  "last seen" matter more than live polling
- Officers use this on **desktop**, sometimes on **tablet** in the field
- **Colour is load-bearing** — but never colour alone, always paired with an icon
  or label
- **Hindi language support** where officer-facing text is displayed
- Data is **legally sensitive**: the audit trail cannot be edited after write

---

## Tone of the product

Honest about limitations. The system's identity is that it **declares what it
cannot measure** rather than overclaiming.

UI copy should reflect that — *"unverified, lab sample pending"*, not *"safe"*,
when uranium status is unknown.

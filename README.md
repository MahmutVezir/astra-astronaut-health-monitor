# ASTRA — Astronaut Health Monitoring

**Know your baseline. Notice the change. Act with evidence.**

ASTRA is a small, offline-first web prototype for astronaut health monitoring during long-duration missions. It gathers manually entered or simulated indicators, compares each available value with an illustrative personal reference band, and explains whether the entry is within that demo band, needs review, or is missing.

> **Important:** ASTRA is a student prototype, not a validated medical device. It does not diagnose, predict an event, prescribe treatment, or replace a flight surgeon or mission medical protocol. All readings in the demo are simulated or manually entered. The reference bands are demonstration settings, not medical thresholds or NASA standards.

## What works in this version

- Responsive browser dashboard with four signals: heart rate, blood oxygen (SpO₂), body temperature, and sleep duration.
- Manual data entry with basic input validation and explicit missing-data handling.
- Three reproducible scenarios: nominal day, baseline shift, and incomplete data.
- Personal-reference comparison with transparent, inspectable rules.
- Daily crew wellbeing self-report (sleep quality, perceived stress, fatigue, and mood).
- Local mission log, browser persistence, and CSV export.
- NASA OSDR research context panel showing the published sample-collection timepoints for Inspiration4 study OSD-575.
- Service-worker app-shell cache for use after the first successful online load.

## Run the application

No third-party JavaScript packages or build step are required.

1. Clone or download this repository.
2. In the project folder, run `python -m http.server 8000` (Python 3) or use another local static web server.
3. Open `http://localhost:8000` in a browser.
4. Try all three demo scenarios, edit readings under **Health signals**, save a wellbeing check-in, and export the mission log.

Opening `index.html` directly also allows the core interface to run, but service-worker caching requires an HTTP(S) origin such as localhost or GitHub Pages.

## Automated logic tests

Requires Node.js 18 or newer. There are no npm dependencies.

```bash
npm test
```

The tests cover missing data, inclusive boundaries, readings outside demo bands, invalid inputs, limited assessments, and the three nominal/review conditions. Passing unit tests does not replace browser-level QA; use [QA_CHECKLIST.md](QA_CHECKLIST.md) and record actual device/browser results.

## NASA research used

ASTRA includes research context from these NASA sources:

- **NASA Open Science Data Repository — OSD-575, Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays.** The application includes the study metadata and its reported pre-flight/post-flight sample timepoints. The study page lists 28 samples and a CC0-1.0 license. The assays are biospecimen-based research; they are **not** a continuous heart-rate or SpO₂ feed. ASTRA does not claim to ingest or calculate results from the raw assay files in this prototype. [Open OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575).
- **NASA Human Research Program — Human Spaceflight Hazards.** This explains the mission context, including radiation, isolation and confinement, distance from Earth, altered gravity, and closed environments. [Read NASA HRP](https://www.nasa.gov/hrp/hazards/).
- **NASA Standard Measures.** This research describes measurements across multiple body systems, including activity/light exposure, sleep reports, immune-related samples, cognition, and sensorimotor function. [Read NASA Standard Measures](https://www.nasa.gov/reference/standard-measures/).
- **Official 2026 challenge brief.** [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/).

The app distinguishes source-derived research metadata from simulated or user-entered demo values. It does not treat OSD-575 sample records as live telemetry.

## Transparent assessment logic

For each signal, the engine:
1. Distinguishes a blank field from a numeric value.
2. Rejects non-numeric or out-of-app-range entries.
3. Compares valid values with that signal's illustrative demo reference band.
4. Returns **Within baseline**, **Review**, or **No data** for that individual signal.
5. Makes the overall assessment **Limited** when readings are missing; missing information is never silently treated as normal.

The bands currently configured in `health-engine.js` are fictional example settings for demonstrating software behavior. They must not be interpreted as healthy/unhealthy thresholds, clinical advice, or operational NASA flight rules.

## Privacy and safety

- The app stores its demo/manual entries in the current browser's local storage.
- The app has no account system, server database, encryption layer, wearable connection, or remote telemetry service.
- Do not enter real, identifiable, or sensitive health information.
- CSV exports should be treated as local user data and handled carefully.
- Any real mission deployment would require medical, human-factors, cybersecurity, privacy, and operational validation.

## Team roles

- **Mahmut:** project lead, application integration, data model, and technical explanation.
- **Teammate 1:** interface review, usability, and responsive-browser testing.
- **Teammate 2 (if present):** NASA source verification, QA execution, documentation, and demo.

## Project structure

- `index.html` — application views and forms
- `styles.css` — responsive visual system
- `app.js` — application state, local persistence, scenarios, and CSV export
- `health-engine.js` — pure, testable assessment rules
- `research-data.js` — NASA OSDR study metadata used by the research timeline
- `sw.js` and `manifest.webmanifest` — app-shell cache and install metadata
- `tests/health-engine.test.js` — automated rule tests

ASTRA is an independent student project created for the NASA Space Apps Challenge. It is not an official NASA product and is not endorsed by NASA.

# ASTRA — Astronaut Health Monitoring

**Know your baseline. Notice the change. Act with evidence.**

ASTRA is an offline-first astronaut health-monitoring prototype with two clearly separated views. **NASA Research Mode** is the default entry point and presents traceable study metadata and data-access status. **Demo & Manual Mode** contains simulated or manually entered indicators, compares each available value with a locally configurable illustrative reference band, and explains whether an entry is within that demo band, needs review, or is missing.

> **Important:** ASTRA is a student prototype, not a validated medical device. It does not diagnose, predict an event, prescribe treatment, or replace a flight surgeon or mission medical protocol. All readings in the demo are simulated or manually entered. The reference bands are demonstration settings, not medical thresholds or NASA standards.

## What works in this version

- Responsive browser dashboard with four signals: heart rate, blood oxygen (SpO₂), body temperature, and sleep duration.
- Manual data entry with basic input validation and explicit missing-data handling.
- Three reproducible scenarios: nominal day, baseline shift, and incomplete data.
- Configurable reference-band comparison with transparent, inspectable rules.
- Daily crew wellbeing self-report (sleep quality, perceived stress, fatigue, and mood).
- Local mission log, browser persistence, and CSV export.
- Research-first landing view for NASA OSDR study OSD-575, including metadata provenance, the latest file-access audit, and all seven recorded sample-collection timepoints.
- Separate Demo & Manual Mode for simulated or user-entered signals; it is not presented as a live NASA feed.
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

The Research Mode also records a NASA source portfolio: OSD-575 (Inspiration4 serum biospecimens), NLSP BRSMACT (bed-rest actigraphy), NLSP BRSMCF (bed-rest cardiovascular-function assessments), DSO 602 (in-flight Holter ECG and arterial-pressure monitoring; raw variables currently listed as restricted), DSO 603 (event-phase cardiovascular monitoring around entry/landing; exact files unverified), and DSO 470 (in-flight cerebral blood-flow and cardiovascular candidate). Catalogue or experiment-page visibility is not treated as file validation: each source remains clearly marked until its exact downloadable files, reuse terms, byte hashes, schema, units, and scientific scope have been inspected. See [the source portfolio and acquisition gates](docs/nasa-research-data-portfolio-2026-11-14.md).

**Current OSD-575 evidence status (14 November 2026):** the NASA metadata API verifies study version 3, four participants, 28 serum samples, and the HDCVD9 transformed-file name. The version-specific file-catalog response returned HTTP 200 but contained zero file records (`hits=0`, `total_hits=1`, empty `studies`). The transformed CSV was not downloaded; therefore no source-file SHA-256 or biomarker analysis exists yet. NASA Research Mode displays this limitation explicitly and abstains from rendering unverified measurements. See [the latest audit run](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43596179113).
This is the **last live data-access audit**, not a result from the revised acquisition code. The current `main` branch tests three NASA-documented catalog request forms (versioned paginated, versioned bare, and unversioned bare), but that updated sequence has **not yet been run against NASA live services**. There is still no verified HDCVD9 download, source-file hash, actual column map, or biomarker analysis. Separately, the software test/deploy workflow for commit `b40e3fac167e31851964c5c4c4d92233081ad244` completed successfully (47 tests passed and GitHub Pages deployment succeeded); software CI success does not prove NASA data acquisition. [Open CI run #68](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43599747660).

NASA's historical cardiovascular research adds more relevant candidates: DSO 602 used continuous 24-hour Holter ECG with automatic blood pressure at 20-minute intervals while awake and 30-minute intervals during sleep in a 12-astronaut cohort; the retrieved NLSP record exposes a public collection timetable but lists ECG/BP variables as restricted. DSO 603 documented continuous ECG with HR and arterial-pressure outputs at 2-minute intervals during launch/entry/landing phases in a 34-subject study. Neither has been integrated as a raw data source. See the [source audit and access gates](docs/nasa-research-data-portfolio-2026-11-14.md).

## Transparent assessment logic

For each signal, the engine:
1. Distinguishes a blank field from a numeric value.
2. Rejects non-numeric or out-of-app-range entries.
3. Compares valid values with that signal's illustrative demo reference band.
4. Returns **Within baseline**, **Review**, or **No data** for that individual signal.
5. Makes the overall assessment **Limited** when readings are missing; missing information is never silently treated as normal.

The initial reference bands are fictional example settings. Users can configure different lower/upper values locally for the demo profile, but this does not clinically validate them. They must not be interpreted as healthy/unhealthy thresholds, clinical advice, or operational NASA flight rules.

## AI assistance disclosure

ChatGPT (OpenAI) was used during the hackathon to help draft and review application code, test cases, and documentation. The team is responsible for reviewing, testing, and explaining the submitted work. No AI model or external LLM API is integrated into the running application; the dashboard uses transparent deterministic rules. Simulated values are labelled and are not presented as NASA observations.

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

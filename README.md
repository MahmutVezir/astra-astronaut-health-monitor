# ASTRA — Astronaut Health Monitoring

**Know your baseline. Notice the change. Act with evidence.**

ASTRA is an offline-first astronaut health-monitoring prototype with clearly separated research and demonstration workflows. **NASA Research Mode** uses the preserved NASA OSDR OSD-575 Version 3 HDCVD9 transformed serum-assay file and its official ISA sample map to build retrospective participant-level biomarker profiles after source-integrity and analysis checks pass. **Demo & Manual Mode** keeps simulated or manually entered vital-sign indicators separate from NASA observations. OSD-575 is a biospecimen study, not a continuous heart-rate, SpO₂, blood-pressure, temperature, or sleep feed.

> **Important:** ASTRA is a student prototype, not a validated medical device. It does not diagnose, predict an event, prescribe treatment, or replace a flight surgeon or mission medical protocol. All readings in the demo are simulated or manually entered. The reference bands are demonstration settings, not medical thresholds or NASA standards.

## What works in this version

- Responsive browser dashboard with four signals: heart rate, blood oxygen (SpO₂), body temperature, and sleep duration.
- Manual data entry with basic input validation and explicit missing-data handling.
- Three reproducible scenarios: nominal day, baseline shift, and incomplete data.
- Configurable reference-band comparison with transparent, inspectable rules.
- Daily crew wellbeing self-report (sleep quality, perceived stress, fatigue, and mood).
- Local mission log, browser persistence, and CSV export.
- Research Mode with the exact downloaded OSD-575 HDCVD9 transformed CSV, a preserved NASA ISA sample map, SHA-256 pin, 28/28 sample join, and nine-analyte baseline-normalization audit.
- Participant-level descriptive biomarker trends across seven reported collection timepoints; browser-side checks re-verify the local CSV bytes, schema, sample map, and normalization before any measurements are rendered.
- A clear LIMITED_EVIDENCE decision: four independent participants, 28 repeated samples, raw assay data unavailable, and fibrinogen flagged for assay-suitability review.
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

The Research Mode also records a NASA source portfolio: OSD-575 (Inspiration4 serum biospecimens), NLSP BRSMACT (bed-rest actigraphy), NLSP BRSMCF (bed-rest cardiovascular-function assessments), DSO 602 (in-flight Holter ECG and arterial-pressure protocol documented in NASA's EDOMP report; its exact NLSP data record remains to be found), experiment 3.1.2 (a distinct NASA-Mir study with a public collection timetable but restricted ECG/BP variables), DSO 603 (event-phase cardiovascular monitoring around entry/landing; exact files unverified), and DSO 470 (in-flight cerebral blood-flow and cardiovascular candidate). Catalogue or experiment-page visibility is not treated as file validation: each source remains clearly marked until its exact downloadable files, reuse terms, byte hashes, schema, units, and scientific scope have been inspected. See [the source portfolio and acquisition gates](docs/nasa-research-data-portfolio-2026-11-14.md). See the [detailed in-flight cardiovascular source audit](docs/nasa-inflight-cardiovascular-source-audit-2026-11-14.md) for the NASA protocol and access review.
**DSO-470 discovery status (14 November 2026):** The public NLSP application shell and 77 first-/second-level application bundles were inspected in [discovery run 43615678402](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43615678402). The audit found authentication, navigation-template, and filter-lookup requests, but no exact DSO-470 measurement endpoint or downloadable file reference. **Zero DSO-470 measurement files were downloaded or integrated.** Its source card remains a candidate only; see the [NLSP discovery audit](docs/nasa-research-data-portfolio-2026-11-14.md#dso-470-nlsp-application-discovery--14-november-2026).

**Current OSD-575 evidence status (14 November 2026; live acquisition run #9):** GitHub Actions run [43612460864](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612460864) retrieved the exact NASA OSDR Version 3 HDCVD9 transformed CSV from the versioned catalog. The catalog record matched the exact filename, declared 6,207 bytes, and marked the file unrestricted. The catalog-provided download was followed to the recorded ALSDA S3 object and returned HTTP 200.

The preserved CSV has 6,207 bytes and SHA-256 `fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c`. This is a project-maintained reproducibility pin, not a NASA-published checksum or digital signature. The CSV contains 28 sample rows and 19 columns. All 28 unique sample names join one-to-one to the NASA ISA metadata, which identifies four independent participants (C001–C004) and seven collection timepoints per participant. Nine concentration columns and their nine paired normalized-percentage columns were checked; all nine percentage columns reproduce the mean of the 12 crew pre-flight samples as denominator, with maximum absolute formula difference below (5 × 10^{-8}).

The exact CSV, sample map, raw NASA metadata/catalog responses, manifest and pilot report are preserved under `data/osdr/OSD-575/`. The browser loader independently fetches the three required local files and rechecks the SHA-256, file shape, one-to-one sample join, participant/timepoint coverage, numeric assay values and normalization before it renders biomarker plots. A successful server-side import is not enough by itself to unlock the chart.

**Scientific decision: LIMITED_EVIDENCE.** These are retrospective transformed serum-assay measurements from four people, not 28 independent participants and not continuous in-flight vital-sign telemetry. NASA's study record marks the raw assay data unavailable; ASTRA uses the transformed file only. No population-level significance, diagnosis, event prediction, personal risk score, or clinical recommendation is made. Fibrinogen is preserved for traceability but flagged because vendor documentation says it cannot be measured in serum; do not interpret that marker biologically until the discrepancy is resolved.

OSD-575 therefore supports retrospective descriptive biomarker exploration, not live physiological monitoring. ASTRA does not claim that this dataset supplies heart rate, SpO₂, blood pressure, body temperature or sleep telemetry. The separate demo/manual workflow remains explicitly labelled and is never merged into NASA research observations. See the [live acquisition run #9](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612460864), the [successful verified-source import](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612482985), the [OSD-575 source-data audit](docs/osd575-hdcvd9-live-data-audit-2026-11-14.md), and the [NASA OSD-575 record](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575).

A project-maintained SHA-256 pin and successful automated tests do not independently authenticate NASA's source. They establish that the exact downloaded byte sequence is preserved and can be checked again.
## Transparent assessment logic

For each demo signal, the engine:
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
- `research-data.js` — NASA OSDR study metadata, verified source paths, and research-source status registry
- `research-data-loader.js` — browser-side SHA-256, NASA ISA sample-join, CSV-schema, and normalization gates before Research Mode renders biomarker values
- `data/osdr/OSD-575/` — exact downloaded NASA source CSV, NASA ISA sample map, and post-download audit record (imported only after the live artifact passes strict validation)
- `scripts/fetch-osd575.js` and `src/core/osd575-pilot.js` — live OSDR acquisition, immutable byte preservation, metadata-backed analysis, and evidence decision
- `sw.js` and `manifest.webmanifest` — app-shell cache and install metadata
- `tests/health-engine.test.js`, `tests/osdr-pilot.test.js`, `tests/research-data-loader.test.js`, `tests/osd575-source-data.test.js`, and `tests/research-dashboard-integration.test.js` — deterministic logic, acquisition, integrity, mapping, normalization, and an end-to-end test that renders the committed NASA source in Research Mode (missing source files fail closed)

ASTRA is an independent student project created for the NASA Space Apps Challenge. It is not an official NASA product and is not endorsed by NASA.
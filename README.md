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

The Research Mode also records a NASA source portfolio: OSD-575 (Inspiration4 serum biospecimens), NLSP BRSMACT (bed-rest actigraphy), NLSP BRSMCF (bed-rest cardiovascular-function assessments), DSO 602 (in-flight Holter ECG and arterial-pressure protocol documented in NASA's EDOMP report; its exact NLSP data record remains to be found), experiment 3.1.2 (a distinct NASA-Mir study with a public collection timetable but restricted ECG/BP variables), DSO 603 (event-phase cardiovascular monitoring around entry/landing; exact files unverified), and DSO 470 (in-flight cerebral blood-flow and cardiovascular candidate). Catalogue or experiment-page visibility is not treated as file validation: each source remains clearly marked until its exact downloadable files, reuse terms, byte hashes, schema, units, and scientific scope have been inspected. See [the source portfolio and acquisition gates](docs/nasa-research-data-portfolio-2026-11-14.md). See the [detailed in-flight cardiovascular source audit](docs/nasa-inflight-cardiovascular-source-audit-2026-11-14.md) for the NASA protocol and access review.

**Current OSD-575 evidence status (14 November 2026):** live workflow run #7 downloaded the exact NASA OSDR Version 3 HDCVD9 transformed CSV. The target filename matched the NASA file-catalog record, which declared 6,207 bytes and `restricted=false`. The catalog-provided download URL redirected to the recorded ALSDA S3 object and returned HTTP 200.

The preserved source file has 6,207 bytes and SHA-256 `fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c`. This digest is a project-maintained reproducibility pin calculated from the downloaded bytes; it is **not** a NASA-published checksum or digital signature. The CSV has 28 rows and 19 columns: one sample identifier, nine concentration columns and nine corresponding percentage-normalized columns. Its 28 unique sample names match the 28 entries in the NASA ISA metadata table, which supplies participant identity (`Source Name`) and collection time (`Factor Value: Time`). The study has four independent participants, each with seven samples.

An independent calculation over the downloaded file reproduced all nine percentage columns using the mean concentration across the 12 crew pre-flight samples (four people × three pre-flight timepoints); the largest absolute difference was below `5 × 10^-8`. The running evidence pipeline now repeats this check and refuses to render measurements unless the new live audit artifact, exact source bytes, SHA-256 pin, one-to-one NASA ISA join, and all nine normalization checks agree. The next successful live audit is imported by the repository's artifact-import workflow; until that post-mapping audit is recorded, the Research Mode chart remains closed.

**Scientific decision: LIMITED_EVIDENCE.** The 28 rows are repeated samples from four people, not 28 independent participants. OSDR marks the raw assay data unavailable; ASTRA currently uses the transformed file only. No population-level significance claim, diagnosis, event prediction, personal risk score, or clinical recommendation is made. Fibrinogen is retained in the original source but explicitly flagged: the assay vendor states that fibrinogen cannot be measured in serum, so the value must not be interpreted biologically until the discrepancy is resolved. See the [live run #7 artifact](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43608345184), the [OSD-575 source-data audit](docs/osd575-hdcvd9-live-data-audit-2026-11-14.md), and the [NASA OSD-575 record](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575).

A project-maintained SHA-256 pin and successful automated tests do not independently authenticate NASA's source. They establish that the exact downloaded byte sequence is preserved and can be checked again. The project's current live acquisition and post-download analysis records are separate from the UI's demo inputs.

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
- `tests/health-engine.test.js`, `tests/osdr-pilot.test.js`, `tests/research-data-loader.test.js`, and `tests/osd575-source-data.test.js` — deterministic logic, acquisition, integrity, mapping, normalization, and imported-source tests (the final source-data test stays skipped until the verified post-mapping artifact is imported)

ASTRA is an independent student project created for the NASA Space Apps Challenge. It is not an official NASA product and is not endorsed by NASA.
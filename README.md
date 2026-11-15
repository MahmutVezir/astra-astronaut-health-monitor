# ASTRA — Astronaut Health Monitoring

**Know your baseline. Notice the change. Act with evidence.**

ASTRA is an offline-first astronaut health-monitoring research and demonstration workspace with three distinct evidence modes. **NASA Research Mode** uses the preserved NASA OSDR OSD-575 Version 3 HDCVD9 transformed serum-assay file and its official ISA sample map to build retrospective participant-level biomarker profiles after source-integrity and analysis checks pass. **Demo & Manual Mode** keeps simulated or manually entered indicators separate from NASA observations. **Mission Replay** plays back a deterministic, 30-day synthetic mission profile and runs an experimental MLP locally in the browser. OSD-575 is a biospecimen study, not a continuous heart-rate, SpO₂, blood-pressure, temperature, or sleep feed.

> **Important:** ASTRA is a student prototype, not a validated medical device. It does not diagnose, predict an event, prescribe treatment, or replace a flight surgeon or mission medical protocol. All readings in the demo are simulated or manually entered. The reference bands are demonstration settings, not medical thresholds or NASA standards.

## What works in this version

- Responsive browser dashboard with four signals: heart rate, blood oxygen (SpO₂), body temperature, and sleep duration.
- Manual data entry with basic input validation and explicit missing-data handling.
- Three reproducible scenarios: nominal day, baseline shift, and incomplete data. The baseline-shift scenario compares its readings with an explicit nominal simulated baseline rather than relying only on fixed bands.
- Two distinct signal comparisons: configurable fixed demo reference bands and per-signal absolute deviation from a user-captured reference snapshot. The snapshot is one complete reading set, not a multi-day statistical baseline. Demo tolerances are explicit and are not clinical cutoffs.
- Daily crew wellbeing self-report (sleep quality, perceived stress, fatigue, and mood) is evaluated through separate, transparent self-report rules and shown as context alongside signal comparisons.
- A cross-domain review note surfaces when baseline deviations and wellbeing self-report flags co-occur. It does not calculate a composite medical risk score or infer causation.
- Heart-rate history plots only saved readings; one reading is shown as one point and is never duplicated to imply a trend.
- Local mission log, browser persistence, and CSV export.
- Mission Replay with seven deterministic 30-day synthetic scenarios: nominal, cardiovascular departure, oxygen-signal departure, sleep/fatigue co-occurrence, temperature drift, multi-signal deviation, and sensor dropout. Playback supports pause, step, restart, speed control, daily charts, a seven-day data-quality window, and full replay CSV export.
- An offline, browser-local MLP v2 pattern screen that evaluates nine features from the rolling seven-day synthetic replay. It recognises four generated deviation families; sensor dropout remains a separate deterministic data-quality gate and causes abstention when coverage is insufficient. The displayed 0–1 model score is not calibrated and is not a medical probability. The largest standardized feature departures are descriptive inputs, not causal explanations.
- The active MLP v2 was trained on generated synthetic windows only: 16,000 nominal and 16,000 deviation training windows, with a separate 5,000 + 5,000 synthetic hold-out set. It uses four generated deviation families; missing sensor telemetry is handled by the deterministic abstention gate, not a fifth model label. Its validation metrics apply only to that generator and do not estimate real astronaut or clinical performance. See the [model card](docs/mission-ml-model-card.md) and [reproducible training script](scripts/train_mission_model.py).
- Research Mode with the exact downloaded OSD-575 HDCVD9 transformed CSV, a preserved NASA ISA sample map, SHA-256 pin, 28/28 sample join, and nine-analyte baseline-normalization audit.
- Participant-level descriptive biomarker trends across seven reported collection timepoints; browser-side checks re-verify the local CSV bytes, schema, sample map, and normalization before any measurements are rendered.
- A clear LIMITED_EVIDENCE decision: four independent participants, 28 repeated samples, raw assay data unavailable, and fibrinogen flagged for assay-suitability review.
- Separate Demo & Manual Mode for simulated or user-entered signals; it is not presented as a live NASA feed.
- The PWA manifest declares the app identity and scalable ASTRA SVG icon; the icon is also the browser favicon.
- Service-worker v7 installation pre-caches the latest app shell, Mission Replay UI and model bundle, Research Mode loader, verified OSD-575 CSV, ISA sample map, audit record, and app icon. On update, the older ASTRA shell cache is removed so existing installations receive the latest replay interface. Offline Research Mode is available after a successful online installation; external links and new uncached resources still require connectivity.

## Run the application

No third-party JavaScript packages or build step are required.

1. Clone or download this repository.
2. In the project folder, run `python -m http.server 8000` (Python 3) or use another local static web server.
3. Open `http://localhost:8000` in a browser.
4. Try the three Demo & Manual scenarios, edit readings under **Health signals**, save a wellbeing check-in, and export the mission log.
5. Open **Mission replay**, select each synthetic scenario, use Play / Next day / Restart, inspect the rolling model/data-quality panels, and export the replay CSV. To test missing-data abstention, select **DATA LOSS TEST — Sensor dropout (model abstains)**; gaps begin on day 10, and the final seven-day window is available at day 30. All replay values are synthetic.

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

**Current OSD-575 evidence status (14 November 2026; latest live audit run #10):** The initial exact-file acquisition completed in [run #9 (43612460864)](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612460864). A subsequent live re-audit completed successfully in [run #10 (43616651617)](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43616651617), re-downloading the same NASA OSDR Version 3 HDCVD9 transformed CSV and confirming the same exact filename, 6,207-byte length, and project-maintained SHA-256 pin. The latest run therefore revalidates the preserved byte sequence; it does not change the scientific scope or limitations.

The preserved CSV has 6,207 bytes and SHA-256 `fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c`. This is a project-maintained reproducibility pin, not a NASA-published checksum or digital signature. The CSV contains 28 sample rows and 19 columns. All 28 unique sample names join one-to-one to the NASA ISA metadata, which identifies four independent participants (C001–C004) and seven collection timepoints per participant. Nine concentration columns and their nine paired normalized-percentage columns were checked; all nine percentage columns reproduce the mean of the 12 crew pre-flight samples as denominator, with maximum absolute formula difference below (5 × 10^{-8}).

The exact CSV, sample map, raw NASA metadata/catalog responses, manifest and pilot report are preserved under `data/osdr/OSD-575/`. The browser loader independently fetches the three required local files and rechecks the SHA-256, file shape, one-to-one sample join, participant/timepoint coverage, numeric assay values and normalization before it renders biomarker plots. A successful server-side import is not enough by itself to unlock the chart.

**Scientific decision: LIMITED_EVIDENCE.** These are retrospective transformed serum-assay measurements from four people, not 28 independent participants and not continuous in-flight vital-sign telemetry. NASA's study record marks the raw assay data unavailable; ASTRA uses the transformed file only. No population-level significance, diagnosis, event prediction, personal risk score, or clinical recommendation is made. Fibrinogen is preserved for traceability but flagged because vendor documentation says it cannot be measured in serum; do not interpret that marker biologically until the discrepancy is resolved.

OSD-575 therefore supports retrospective descriptive biomarker exploration, not live physiological monitoring. ASTRA does not claim that this dataset supplies heart rate, SpO₂, blood pressure, body temperature or sleep telemetry. The separate demo/manual workflow remains explicitly labelled and is never merged into NASA research observations. See the [initial exact-file acquisition run #9](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612460864), the [latest successful re-audit run #10](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43616651617), the [verified-source import run](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612482985), the [OSD-575 source-data audit](docs/osd575-hdcvd9-live-data-audit-2026-11-14.md), and the [NASA OSD-575 record](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575).

A project-maintained SHA-256 pin and successful automated tests do not independently authenticate NASA's source. They establish that the exact downloaded byte sequence is preserved and can be checked again.
## Transparent assessment logic

The demo engine keeps three evidence layers separate:

1. **Fixed reference-band comparison:** checks each valid reading against a user-configurable illustrative demo band.
2. **Reference-snapshot comparison:** after a complete set of four readings is saved, the user can capture those exact values as a local reference snapshot. New readings are compared with that snapshot using explicit absolute tolerances: 15 BPM for heart rate, 2 percentage points for SpO₂, 0.5 °C for temperature, and 1.5 hours for sleep. One captured set is not a multi-day statistical baseline, population reference, or clinical limit. These are prototype demonstration sensitivities only.
3. **Wellbeing self-report:** a saved check-in is reviewed separately. The illustrative flags are sleep quality ≤2, perceived stress ≥4, fatigue ≥4, or mood ≤2 on the app's 1–5 sliders.

A combined context note is produced only when both a complete baseline comparison and a saved wellbeing check-in exist. When both contain flags, the interface reports their co-occurrence as a reason for human review; it does not claim correlation, causation, diagnosis, or a medical condition. The main signal assessment remains separate from this context and no composite risk score is calculated.

Blank values stay missing, invalid entries are rejected, and an incomplete comparison is labelled **Limited**. Missing data is never silently imputed. The Baseline Shift scenario uses a clearly labelled nominal simulated reference snapshot; manually entered readings do not become a comparison snapshot unless the user explicitly captures them.

All fixed bands, comparison tolerances, and self-report rules are illustrative software settings. They must not be interpreted as healthy/unhealthy thresholds, clinical advice, or operational NASA flight rules.

## AI assistance disclosure

ChatGPT (OpenAI) assisted during the hackathon with research synthesis, code drafting and modification, debugging, code review, test design, data/analysis interpretation, and documentation. The project lead reviewed and tested the AI-assisted changes and remains responsible for the submitted work. ASTRA includes the project-trained, browser-local ASTRA-SYNTH-MLP-2, trained only on generated synthetic telemetry windows; it was not trained on NASA participant records or clinical datasets. The MLP has no external inference API and is not a medical model. No external LLM is called by the running application. NASA research data, synthetic replay data, and manually entered values remain clearly separated.

## Privacy and safety

- The app stores its demo/manual entries in the current browser's local storage.
- The app has no account system, server database, encryption layer, wearable connection, or remote telemetry service.
- Do not enter real, identifiable, or sensitive health information.
- CSV exports should be treated as local user data and handled carefully.
- Any real mission deployment would require medical, human-factors, cybersecurity, privacy, and operational validation.

## Team roles

- **Mahmut:** project lead, application integration, data model, and technical explanation.

Only confirmed team members and their actual contributions should be added here; no placeholder roles are used.

## Project structure

- `index.html` — application views and forms
- `styles.css` — responsive visual system
- `app.js` — application state, local persistence, scenarios, and CSV export
- `health-engine.js` — pure, testable demo assessment rules
- `mission-engine.js` and `mission-replay-ui.js` — deterministic synthetic mission generation, rolling data-quality analysis, local MLP inference and replay interface
- `data/models/mission-anomaly-mlp-v2.json` and `.js` — model weights, training metadata and offline browser bundle
- `scripts/train_mission_model.py`, `requirements-model-training.txt` and `docs/mission-ml-model-card.md` — reproducible synthetic-only model training, pinned development dependencies and model limitations
- `THIRD_PARTY_NOTICES.md` — license and source register for NASA data, challenge research pages, project code and training tools
- `research-data.js` — NASA OSDR study metadata, verified source paths, and research-source status registry
- `research-data-loader.js` — browser-side SHA-256, NASA ISA sample-join, CSV-schema, and normalization gates before Research Mode renders biomarker values
- `data/osdr/OSD-575/` — exact downloaded NASA source CSV, NASA ISA sample map, and post-download audit record (imported only after the live artifact passes strict validation)
- `scripts/fetch-osd575.js` and `src/core/osd575-pilot.js` — live OSDR acquisition, immutable byte preservation, metadata-backed analysis, and evidence decision
- `sw.js` and `manifest.webmanifest` — app-shell cache and PWA metadata
- `icons/astra.svg` — scalable ASTRA application icon and favicon
- `tests/health-engine.test.js`, `tests/osdr-pilot.test.js`, `tests/research-data-loader.test.js`, `tests/osd575-source-data.test.js`, and `tests/research-dashboard-integration.test.js` — deterministic logic, acquisition, integrity, mapping, normalization, and an end-to-end test that renders the committed NASA source in Research Mode (missing source files fail closed)

ASTRA is an independent student project created for the NASA Space Apps Challenge. It is not an official NASA product and is not endorsed by NASA.
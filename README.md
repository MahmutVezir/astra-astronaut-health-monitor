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

**Current OSD-575 evidence status (14 November 2026):** live audit run #5 verified the metadata for OSD-575 version 3 and found the exact HDCVD9 transformed CSV in NASA's versioned bare file-catalog response (/files/575.3). The response contained nine study-file records; the exact target record declared 6,207 bytes and restricted=false, and supplied a catalog remote_url. The subsequent download was not accepted because the final redirect host fell outside the downloader's strict NASA HTTPS allowlist. The file was **not** saved: there is still no source-file SHA-256, actual column map, observed measurement table, or biomarker analysis. ASTRA continues to abstain from rendering unverified measurements. [Open live audit run #5](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43600280830).

This supersedes the earlier run #4 observation where the paginated catalog response had hits=0; the bare versioned endpoint exposed the file record. Software CI and live data acquisition remain separate gates: a passing test suite does not establish that NASA bytes were downloaded.
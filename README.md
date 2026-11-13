# ASTRA — Astronaut Health Intelligence

**Know your baseline. Notice the change. Act with evidence.**

ASTRA is an offline-first astronaut health monitoring and decision-support prototype for long-duration space missions. It brings selected physiological indicators and crew self-reports into one clear view, compares available readings with an individual's illustrative reference bands, and explains when a value needs review or when the data is incomplete.

> **Prototype status:** ASTRA is a concept demonstration, not a validated medical device. All crew details and readings shown in the web app are simulated. Its reference bands are illustrative demo settings, not clinical thresholds. It does not diagnose, prescribe, or replace flight surgeons.

## The problem

NASA's 2026 Space Apps Challenge brief highlights that long-duration missions expose astronauts to space radiation, isolation and confinement, altered gravity, and hostile or closed environments. Crew members may need to recognize changes in their own health while far from immediate support.

## What the prototype demonstrates

- A crew dashboard for heart rate, oxygen saturation, body temperature, and sleep duration.
- Personal-reference comparison rather than a one-size-fits-all score.
- Transparent status labels: **Within baseline**, **Review**, and **No data**.
- An explicit incomplete-data state: missing readings are never silently treated as normal.
- Optional wellbeing self-report for sleep quality, perceived stress, fatigue, and mood.
- Local browser storage, CSV export, and an app-shell cache for offline-first use after the first load.
- Three interactive demo scenarios: nominal day, baseline shift, and incomplete data.

## Run locally

No build step or package installation is required.

1. Download or clone this repository.
2. Open index.html in a local web server (recommended for service-worker/offline behavior).
3. Try the three demo scenarios and the Health signals and Wellbeing views.

For GitHub Pages, open **Settings → Pages**, select **Deploy from a branch**, choose **main** and **/ (root)**, then save. The site will be published at the Pages URL shown by GitHub.

## Project structure

- index.html — application structure and views
- styles.css — responsive dashboard styling
- app.js — demo data, comparison logic, local persistence, CSV export
- sw.js — offline app-shell cache
- manifest.webmanifest — installable web app metadata

## Transparent comparison logic

For each signal, ASTRA:
1. Checks whether a reading is present and numeric.
2. Compares it with the demo crew member's configured personal reference band.
3. Labels it Within baseline, Review, or No data.
4. Explains the reason in plain language.

The prototype deliberately avoids a diagnostic score. The rules are simple and inspectable, and missing data reduces the completeness of the assessment.

## Team workflow

- **Developer — Mahmut:** implement features, maintain the code, and document changes.
- **Tester / QA — teammate:** test normal, boundary, invalid, and missing-data cases; report reproducible defects; retest fixes.

A feature is considered complete only after its expected behavior has been checked and critical defects are resolved.

## Scientific context

- [NASA Space Apps Challenge 2026 — Health Monitoring Software](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
- [NASA Human Research Program — Five Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/)
- [NASA Human Research Program — Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/)

## Near-term roadmap

1. Validate the web prototype with structured QA cases.
2. Improve the personal-baseline configuration and explainability.
3. Evaluate suitable public NASA research datasets before making any data-driven claims.
4. Refine mission/offline workflows and prepare a short demonstration video.

ASTRA is an independent student prototype created for the NASA Space Apps Challenge. It is not an official NASA product and is not endorsed by NASA.
# ASTRA research data portfolio and acquisition gates

**Review date:** 14 November 2026  
**Purpose:** Select real, traceable datasets for the NASA Research Mode without presenting catalog metadata as analyzed measurements.

## Decision summary

OSD-575 remains the primary commercial-spaceflight biospecimen source. Live run #9 retrieved the exact Version 3 HDCVD9 transformed CSV from the versioned OSDR catalog, verified its 6,207 bytes and project-maintained SHA-256 pin, joined all 28 samples to the NASA ISA table, and passed nine-analyte baseline-normalization checks. The source is imported into this repository; its browser-side loader repeats the integrity and analysis gates before rendering retrospective biomarker profiles. It must not block the broader research portfolio.

NASA's Life Sciences Data Archive, exposed through the NASA Life Sciences Portal (NLSP), lists complementary human datasets from ground-based bed-rest analogues and older Shuttle investigations. This source portfolio records what the public catalogue and NASA technical reports establish, not what ASTRA has downloaded. The DSO 602/603 review finds flight-relevant cardiovascular protocols, but does not establish open access to their raw measurement values. Every candidate must pass file-level QA before its values are ingested.

## Candidate source register

| Source | Setting / data class | Variables relevant to ASTRA | Catalogue evidence | Current ASTRA status |
|---|---|---|---|---|
| [OSD-575 — Inspiration4](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Human commercial spaceflight; serum biospecimens | HDCVD9 transformed immune/cardiovascular-related serum assay values | Live run #9 retrieved the exact 6,207-byte CSV; 28/28 sample names joined to the NASA ISA table; 4 participants, 7 timepoints; all 9 baseline-normalization checks passed. | Source CSV, sample map, raw API envelopes and audit reports imported in this repository; browser-side SHA-256 and analysis gate protects chart rendering. Scientific status remains LIMITED_EVIDENCE; not continuous vital-sign telemetry. |
| [BRSMACT — UTMB Bedrest Campaign 1 Actigraphy](https://nlsp.nasa.gov/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS) | Human ground-based head-down bed-rest analogue; processed actigraphy | Sleep duration, sleep latency and sleep efficiency | NLSP lists it as “Available online”; three files are listed. Summary means are reported for BR−2 through BR+6. | Public catalogue listing verified; file download, exact schema, license and SHA-256 not yet audited. |
| [BRSMCF — Bed Rest Standard Measures: Cardiovascular Function](https://nlsp.nasa.gov/search/data/details/9af6f9ba-3730-54ab-a82a-1a32798667ae?dataType=EXPERIMENTS) | Human ground-based bed-rest / artificial-gravity analogues; processed cardiovascular research | Echocardiography-derived cardiac function, ejection fraction, stroke volume and other cardiac structural/function measures | NLSP marks the experiment data complete and publicly available; the record lists 14 open-access datasets. Examples include CFT70 cardiac-function tabular data (3 files; 76.2 KB), UTMB Campaign 1 echocardiography (6 files; 445.6 KB), and Campaign 3 echocardiography (5 files; 82.9 KB). | Public catalogue listing verified; exact files, columns, cohort counts, license and SHA-256 not yet audited. |
| [DSO 602 — Blood Pressure Variability During Space Flight](https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000561?dataType=HARDWARE) | Shuttle spaceflight; 12 astronauts on 4–14-day missions in the NASA EDOMP report | Continuous 24-hour ECG/Holter; heart rate and rhythm; automated BP every 20 min awake and 30 min asleep | NASA's EDOMP technical report documents the 12-subject protocol. The NLSP Continuous Blood Pressure Device hardware record lists Blood Pressure Variability During Space Flight (DSO 602) among associated experiments. An experiment-specific DSO 602 detail page and file inventory have not yet been identified. | High-priority in-flight HR/BP candidate; exact record and file-level access remain unresolved. |
| [Experiment 3.1.2 — Studies of Mechanisms Underlying Orthostatic Intolerance](https://nlsp.nasa.gov/search/data/details/f8e3f755-5caa-522c-b628-7153cfe446f5?dataType=EXPERIMENTS) | NASA-Mir Program; STS-71 and Mir 18 | Continuous 24-hour ECG/Holter; HR and rhythm; automated BP every 20 min awake and 30 min asleep; baroreflex and Valsalva protocols | The NLSP record explicitly identifies this as experiment 3.1.2 (not DSO 602). It lists one open-access data-collection timetable spreadsheet and seven restricted-access variable groups, including ECG and blood pressure. | Public protocol/timetable evidence; the physiological values ASTRA would need are restricted in the retrieved record. |
| [DSO 603 — Orthostatic Function During Entry, Landing and Egress](https://nlsp.nasa.gov/search/data/details/IDP-LSDA_MISSION-0000000000000326?dataType=MISSIONS) | Shuttle launch, entry, landing and post-landing phases; 34 subjects in the NASA EDOMP report | Continuous ECG; HR and arterial pressure derived at 2-minute intervals; systolic, diastolic, mean and pulse pressure | NASA's EDOMP report documents the protocol and subject count; the STS-42 NLSP mission record lists DSO 603 among its experiments. An experiment-specific downloadable file inventory has not yet been verified. | Strong event-phase cardiovascular candidate; no file-level integration until access, schema and exact records are confirmed. |
| [DSO 470 — NASA NLSP experiment index](https://nlsp.nasa.gov/explore) | Shuttle flights: STS-29, STS-34 and STS-42 | Index-listed heart rate, diastolic blood pressure and cerebral artery blood-flow velocity | Static NLSP index returned HTTP 200; live same-origin app audit inspected 40 nested and 37 second-level JavaScript bundles from 15 parent modules. No DSO-470 detail link appeared in the index HTML. | **Not integrated.** No experiment-specific API result, file inventory or measurement download URL was verified; 0 data files downloaded. Only authentication, navigation-template and /lookups filter-service calls were identified in the inspected request references. |

### Important interpretation limits

- **BRSMAct is an Earth-based bed-rest analogue.** Its actigraphy summaries can support analysis of sleep trends under an analogue protocol. They are not observations from astronauts in orbit and are not continuous live telemetry.
- **BRSMCF is a cardiovascular-function research collection.** Echocardiography-derived measurements are not interchangeable with continuous heart rate or blood-pressure signals.
- **DSO 602 is a strong in-flight HR/BP candidate, but the exact experiment-specific NLSP data record has not yet been located.** NASA's EDOMP technical report describes 12 astronauts and continuous 24-hour Holter ECG with automatic BP every 20 minutes while awake and every 30 minutes during sleep. The NLSP hardware catalogue associates the Continuous Blood Pressure Device with DSO 602; that hardware page is not a data-file listing and does not prove public access.
- **Experiment 3.1.2 is a distinct NASA-Mir study, not DSO 602.** Its NLSP record explicitly labels the identifier 3.1.2, lists STS-71 and Mir 18, and describes 24-hour Holter ECG plus automatic BP at 20/30-minute awake/sleep intervals. It exposes one open-access collection-timetable spreadsheet and seven restricted-access variable groups, including ECG and BP. The timetable is not a set of physiological readings.
- **DSO 603 is event-phase data, not a 24-hour baseline stream.** NASA's report describes continuous ECG and HR/arterial-pressure outputs at two-minute intervals around launch, entry, landing and egress, across 34 subjects. The STS-42 NLSP mission page lists DSO 603, but an exact public data file and its access terms remain unverified.
- **DSO 470 remains a separate in-flight cerebral-hemodynamics candidate.** The NLSP experiment index lists heart rate, diastolic blood pressure and cerebral artery blood-flow velocity, and reports the data complete/public. The exact data files, sampling rate, completeness, cohort structure, and license still need file-level verification.
- **DSO 463 is historical context for Holter monitoring.** NASA's later EDOMP review describes 24-hour pre-, in- and post-flight Holter recordings on five crew members. An earlier 1988–1990 status report recorded one completed subject at that time; these are different reporting dates, not a verified public data file.
- **OSD-575 is a retrospective biospecimen assay study, not a wearable signal source.** Its exact transformed CSV is now imported and passes the source hash, 28-sample ISA join and nine-analyte normalization audit. ASTRA may show descriptive biomarker profiles only after the browser-side loader repeats those checks. The cohort is four independent participants, raw assay data are unavailable, and this source cannot supply continuous vital signs.
- A catalogue's “public” or “available online” status is not a substitute for checking the exact file, associated rights, its schema, missingness, units, cohort and SHA-256.

## Recommended ingestion order

1. **Retrieve and inspect experiment 3.1.2's public timetable.** It is a real, open NLSP file and can validate the NASA Life Sciences Portal file-acquisition process and clarify the protocol timeline; it is not a physiological measurement dataset. Keep its ECG/BP variables marked restricted.
2. **Resolve DSO 602's exact experiment record and access.** NASA's technical report makes it a high-value in-flight HR/BP study, but the detailed NLSP record and public/restricted file inventory have not been found. Do not substitute experiment 3.1.2.
3. **Audit DSO 603's exact experiment record and files.** Its two-minute event-phase HR/BP design and 34-subject cohort are promising for launch/entry/egress monitoring, but public downloadability is not yet established.
4. **Audit DSO 470's experiment-specific file listing.** Its index variables add cerebral blood-flow velocity to HR/DBP; first resolve the exact detail page, files and terms.
5. **Download and audit BRSMACT.** It offers a narrower, publicly listed sleep dataset and a practical first validation of NASA NLSP file handling.
6. **Audit BRSMCF.** Select one well-documented campaign and inspect the actual data columns before deciding whether it supports a defensible cardiovascular-function summary.
7. **Maintain OSD-575 reproducibility and scientific limits.** Run #9 has completed exact-file retrieval, byte preservation, SHA-256 pinning, metadata mapping and nine-analyte normalization. Keep the browser-side fail-closed validation in place, retain the fibrinogen flag, and do not present the serum assay as live vital-sign telemetry.
8. **Maintain a separately labelled demo/manual stream** for vital signs not supported by an accessible research file. Synthetic signals must never be merged into research observations.

## DSO-470 NLSP application discovery — 14 November 2026

The public NLSP exploration shell and its same-origin JavaScript application were audited in [GitHub Actions run 43615678402](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43615678402). The run completed successfully and preserved artifact `nlsp-dso470-discovery-43615678402` (1,441,155 bytes; SHA-256 `53e0f0c7c45802b016c6b5e2bb91faf3475ee67f37a8f7114e7287249983122e`).

The audit inspected:
- The official NLSP index (HTTP 200), which contained two script references.
- One same-origin application bundle.
- **40/40** nested application bundles.
- **37/37** second-level bundles, discovered from 15 parent modules.
- The search, research-detail, dataset-file-explorer, lookup, and query-related first-party modules.

The index HTML exposed no DSO-470 experiment detail link (`candidate_links: []`). The observed HTTP-client request references included authentication routes (`/auth/me`, `/auth/logout`), navigation-template routes, the filter lookup service (`/lookups`), and template routes. The application bundle declares an `/api/v1` base, but the inspected code did not reveal a specific public DSO-470 experiment search result or measurement-file download request. The `/lookups` route is a lookup/filter service; it is not evidence of physiological measurements. Client-side paths such as `/search/data/details` are UI routes, not verified data APIs.

**Acquisition result: zero measurement files downloaded.** No DSO-470 sample values, HR, diastolic BP, cerebral blood-flow values, sampling cadence, subject count, or license have been independently verified at file level. A record-like example string in a JavaScript bundle is not treated as a NASA observation because it lacks a traceable DSO-470 source record and downloadable-file provenance.

**Decision: DSO-470 remains an unintegrated research candidate.** The next acceptance gate is an exact experiment record from the NLSP catalogue, a file inventory with source-provided download references, access/reuse terms, then original-byte preservation, SHA-256, schema, units, cohort/timepoint and missingness review. Do not infer a download URL from the `/api/v1` root or from the client-side UI route.

## Mandatory file-level QA gate

A catalogue candidate can move to “data integrated” only after all of the following are recorded:

- Exact catalogue record and exact filename / remote download URL, with no constructed URL.
- HTTP status, content type, expected and actual byte length.
- Original downloaded bytes preserved unchanged.
- SHA-256 of the downloaded bytes.
- License / terms of reuse recorded from the authoritative source; do not infer a license from public accessibility alone.
- File format and schema inspected; columns, units, sampling or collection cadence, missing values, participant pseudonyms, and timepoints documented.
- Scientific fit and scope documented, including the difference between spaceflight, ground analogue, biospecimen, summary statistic, and telemetry.
- A deterministic parser and tests that fail closed on schema drift or missing evidence.

Until then, the Research Mode may display catalogue metadata, the audit status, and links to the NASA record, but it must not render sample values, participant trends, live-state alerts, or derived risk scores from that source.

## Evidence used

- NASA OSDR FAQ: describes the repository's spaceflight / analog research data types, file downloads, public API, and the distinction between public processed data and controlled-access files: https://science.nasa.gov/reference/osdr-faq/
- NASA NLSP public portal: https://nlsp.nasa.gov/
- BRSMACT dataset record: https://nlsp.nasa.gov/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS
- BRSMCF experiment record: https://nlsp.nasa.gov/search/data/details/9af6f9ba-3730-54ab-a82a-1a32798667ae?dataType=EXPERIMENTS
- DSO 470 appears in the NLSP public experiment index; its experiment-specific record and downloadable files remain to be checked: https://nlsp.nasa.gov/explore
- NASA EDOMP technical report, *Cardiovascular Deconditioning*: DSO 463, DSO 602 and DSO 603 protocols, subject counts and sampling cadence: https://ntrs.nasa.gov/citations/20040201532
- NLSP Continuous Blood Pressure Device hardware record; lists DSO 602 among associated experiments: https://nlsp.nasa.gov/search/data/details/IDP-LSDA_HARDWARE-0000000000000561?dataType=HARDWARE
- Experiment 3.1.2 NLSP record (one open-access timetable; restricted-access ECG/BP variables; explicitly not DSO 602): https://nlsp.nasa.gov/search/data/details/f8e3f755-5caa-522c-b628-7153cfe446f5?dataType=EXPERIMENTS
- STS-42 NLSP mission record listing DSO 603: https://nlsp.nasa.gov/search/data/details/IDP-LSDA_MISSION-0000000000000326?dataType=MISSIONS
- NASA 1988–1990 DSO status report (contemporaneous interim status for DSO 463): https://ntrs.nasa.gov/api/citations/20240013498/downloads/DSOs%201988-1990.pdf

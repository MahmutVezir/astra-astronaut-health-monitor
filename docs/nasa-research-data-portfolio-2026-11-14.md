# ASTRA research data portfolio and acquisition gates

**Review date:** 14 November 2026  
**Purpose:** Select real, traceable datasets for the NASA Research Mode without presenting catalog metadata as analyzed measurements.

## Decision summary

OSD-575 remains the primary commercial-spaceflight biospecimen source, but its HDCVD9 transformed CSV is not currently downloadable through the versioned OSDR catalog response audited by ASTRA. It must not block the whole project.

NASA's Life Sciences Data Archive, exposed through the NASA Life Sciences Portal (NLSP), lists complementary human datasets from ground-based bed-rest analogues and older Shuttle investigations. This source portfolio records what the public catalogue and NASA technical reports establish, not what ASTRA has downloaded. The DSO 602/603 review finds flight-relevant cardiovascular protocols, but does not establish open access to their raw measurement values. Every candidate must pass file-level QA before its values are ingested.

## Candidate source register

| Source | Setting / data class | Variables relevant to ASTRA | Catalogue evidence | Current ASTRA status |
|---|---|---|---|---|
| [OSD-575 — Inspiration4](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Human commercial spaceflight; serum biospecimens | HDCVD9 transformed immune/cardiovascular-related serum assay values | Metadata version 3 verified; 4 participants, 28 samples, 7 reported collection timepoints. Versioned file response was HTTP 200 but `hits=0`, `total_hits=1`, `studies={}`. | Metadata verified; target CSV not downloaded; no file SHA-256; `INSUFFICIENT_EVIDENCE`. |
| [BRSMACT — UTMB Bedrest Campaign 1 Actigraphy](https://nlsp.nasa.gov/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS) | Human ground-based head-down bed-rest analogue; processed actigraphy | Sleep duration, sleep latency and sleep efficiency | NLSP lists it as “Available online”; three files are listed. Summary means are reported for BR−2 through BR+6. | Public catalogue listing verified; file download, exact schema, license and SHA-256 not yet audited. |
| [BRSMCF — Bed Rest Standard Measures: Cardiovascular Function](https://nlsp.nasa.gov/search/data/details/9af6f9ba-3730-54ab-a82a-1a32798667ae?dataType=EXPERIMENTS) | Human ground-based bed-rest / artificial-gravity analogues; processed cardiovascular research | Echocardiography-derived cardiac function, ejection fraction, stroke volume and other cardiac structural/function measures | NLSP marks the experiment data complete and publicly available; the record lists 14 open-access datasets. Examples include CFT70 cardiac-function tabular data (3 files; 76.2 KB), UTMB Campaign 1 echocardiography (6 files; 445.6 KB), and Campaign 3 echocardiography (5 files; 82.9 KB). | Public catalogue listing verified; exact files, columns, cohort counts, license and SHA-256 not yet audited. |
| [DSO 602 — Blood Pressure Variability During Space Flight](https://nlsp.nasa.gov/search/data/details/f8e3f755-5caa-522c-b628-7153cfe446f5?dataType=EXPERIMENTS) | Shuttle spaceflight; 12 astronauts on 4–14-day missions in the NASA EDOMP report | Continuous 24-hour ECG/Holter; heart rate and rhythm; automated BP every 20 min awake and 30 min asleep | NASA's EDOMP report documents the protocol and cohort. The NLSP experiment record lists one open-access collection-timetable spreadsheet, while ECG, BP and related measurement variables are in the restricted-access section. | Best-matched in-flight HR/BP candidate, but raw values are not currently public in the retrieved record; access and exact file schema must be verified. |
| [DSO 603 — Orthostatic Function During Entry, Landing and Egress](https://nlsp.nasa.gov/search/data/details/IDP-LSDA_MISSION-0000000000000326?dataType=MISSIONS) | Shuttle launch, entry, landing and post-landing phases; 34 subjects in the NASA EDOMP report | Continuous ECG; HR and arterial pressure derived at 2-minute intervals; systolic, diastolic, mean and pulse pressure | NASA's EDOMP report documents the protocol and subject count; the STS-42 NLSP mission record lists DSO 603 among its experiments. An experiment-specific downloadable file inventory has not yet been verified. | Strong event-phase cardiovascular candidate; no file-level integration until access, schema and exact records are confirmed. |
| [DSO 470 — NASA NLSP experiment index](https://nlsp.nasa.gov/explore) | Shuttle flight investigations: STS-29, STS-34 and STS-42 | Heart rate, diastolic blood pressure and cerebral artery blood-flow velocity | NLSP's public experiment index labels the record complete/public and lists these variables. The exact experiment detail page and file inventory have not yet been independently verified. | High-priority in-flight candidate; do not ingest until exact detail record, file links, access terms and bytes are verified. |

### Important interpretation limits

- **BRSMAct is an Earth-based bed-rest analogue.** Its actigraphy summaries can support analysis of sleep trends under an analogue protocol. They are not observations from astronauts in orbit and are not continuous live telemetry.
- **BRSMCF is a cardiovascular-function research collection.** Echocardiography-derived measurements are not interchangeable with continuous heart rate or blood-pressure signals.
- **DSO 602 is the closest fit to an in-flight HR/BP research stream, but its raw values are not currently available as an open download in the retrieved NLSP record.** NASA's technical report describes continuous Holter ECG and automatic BP measurements every 20 minutes while awake and every 30 minutes during sleep for 12 astronauts. The NLSP page lists one open-access collection-timetable spreadsheet and places ECG, blood pressure and related variables under restricted access. Do not use the timetable as if it contained physiological readings.
- **DSO 603 is event-phase data, not a 24-hour baseline stream.** NASA's report describes continuous ECG and HR/arterial-pressure outputs at two-minute intervals around launch, entry, landing and egress, across 34 subjects. The STS-42 NLSP mission page lists DSO 603, but an exact public data file and its access terms remain unverified.
- **DSO 470 remains a separate in-flight cerebral-hemodynamics candidate.** The NLSP experiment index lists heart rate, diastolic blood pressure and cerebral artery blood-flow velocity, and reports the data complete/public. The exact data files, sampling rate, completeness, cohort structure, and license still need file-level verification.
- **DSO 463 is historical context for Holter monitoring.** NASA's later EDOMP review describes 24-hour pre-, in- and post-flight Holter recordings on five crew members. An earlier 1988–1990 status report recorded one completed subject at that time; these are different reporting dates, not a verified public data file.
- **OSD-575 remains a biospecimen assay study.** It is not a wearable signal source. Until the target CSV is retrieved, no marker measurements, biomarker trends, or health scores may be calculated from it.
- A catalogue's “public” or “available online” status is not a substitute for checking the exact file, associated rights, its schema, missingness, units, cohort and SHA-256.

## Recommended ingestion order

1. **Resolve DSO 602 access first.** It is the best conceptual match for flight HR/BP monitoring, but the retrieved NLSP record exposes only a public collection timetable and lists ECG/BP values as restricted. Establish whether an authorized data request or a separate open data product exists; do not attempt to bypass access controls.
2. **Audit DSO 603's exact experiment record and files.** Its two-minute event-phase HR/BP design and 34-subject cohort are promising for launch/entry/egress monitoring, but public downloadability is not yet established.
3. **Audit DSO 470's experiment-specific file listing.** Its index variables add cerebral blood-flow velocity to HR/DBP; first resolve the exact detail page, files and terms.
4. **Download and audit BRSMACT.** It offers a narrower, publicly listed sleep dataset and a practical first validation of NASA NLSP file handling.
5. **Audit BRSMCF.** Select one well-documented campaign and inspect the actual data columns before deciding whether it supports a defensible cardiovascular-function summary.
6. **Retry OSD-575 only when a new live run or NASA-provided file record changes the catalog evidence.** The current code tests three documented API forms, but this revised sequence has not yet been run live.
7. **Maintain a separately labelled demo/manual stream** for vital signs not supported by an accessible research file. Synthetic signals must never be merged into research observations.

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
- DSO 602 NLSP experiment record (one open-access timetable; restricted-access ECG/BP variables): https://nlsp.nasa.gov/search/data/details/f8e3f755-5caa-522c-b628-7153cfe446f5?dataType=EXPERIMENTS
- STS-42 NLSP mission record listing DSO 603: https://nlsp.nasa.gov/search/data/details/IDP-LSDA_MISSION-0000000000000326?dataType=MISSIONS
- NASA 1988–1990 DSO status report (contemporaneous interim status for DSO 463): https://ntrs.nasa.gov/api/citations/20240013498/downloads/DSOs%201988-1990.pdf

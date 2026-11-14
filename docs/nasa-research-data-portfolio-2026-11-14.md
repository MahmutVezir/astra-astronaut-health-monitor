# ASTRA research data portfolio and acquisition gates

**Review date:** 14 November 2026  
**Purpose:** Select real, traceable datasets for the NASA Research Mode without presenting catalog metadata as analyzed measurements.

## Decision summary

OSD-575 remains the primary commercial-spaceflight biospecimen source, but its HDCVD9 transformed CSV is not currently downloadable through the versioned OSDR catalog response audited by ASTRA. It must not block the whole project.

NASA's Life Sciences Data Archive, exposed through the NASA Life Sciences Portal (NLSP), lists complementary human datasets from ground-based bed-rest analogues and older Shuttle investigations. This source portfolio records what the public catalogue says, not what ASTRA has downloaded. Every candidate must pass file-level QA before its values are ingested.

## Candidate source register

| Source | Setting / data class | Variables relevant to ASTRA | Catalogue evidence | Current ASTRA status |
|---|---|---|---|---|
| [OSD-575 — Inspiration4](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) | Human commercial spaceflight; serum biospecimens | HDCVD9 transformed immune/cardiovascular-related serum assay values | Metadata version 3 verified; 4 participants, 28 samples, 7 reported collection timepoints. Versioned file response was HTTP 200 but `hits=0`, `total_hits=1`, `studies={}`. | Metadata verified; target CSV not downloaded; no file SHA-256; `INSUFFICIENT_EVIDENCE`. |
| [BRSMACT — UTMB Bedrest Campaign 1 Actigraphy](https://nlsp.nasa.gov/search/data/details/e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6?dataType=DATASETS) | Human ground-based head-down bed-rest analogue; processed actigraphy | Sleep duration, sleep latency and sleep efficiency | NLSP lists it as “Available online”; three files are listed. Summary means are reported for BR−2 through BR+6. | Public catalogue listing verified; file download, exact schema, license and SHA-256 not yet audited. |
| [BRSMCF — Bed Rest Standard Measures: Cardiovascular Function](https://nlsp.nasa.gov/search/data/details/9af6f9ba-3730-54ab-a82a-1a32798667ae?dataType=EXPERIMENTS) | Human ground-based bed-rest / artificial-gravity analogues; processed cardiovascular research | Echocardiography-derived cardiac function, ejection fraction, stroke volume and other cardiac structural/function measures | NLSP marks the experiment data complete and publicly available; the record lists 14 open-access datasets. Examples include CFT70 cardiac-function tabular data (3 files; 76.2 KB), UTMB Campaign 1 echocardiography (6 files; 445.6 KB), and Campaign 3 echocardiography (5 files; 82.9 KB). | Public catalogue listing verified; exact files, columns, cohort counts, license and SHA-256 not yet audited. |
| [DSO 470 — NASA NLSP experiment index](https://nlsp.nasa.gov/explore) | Shuttle flight investigations: STS-29, STS-34 and STS-42 | Heart rate, diastolic blood pressure and cerebral artery blood-flow velocity | NLSP's public experiment index labels the record complete/public and lists these variables. The exact experiment detail page and file inventory have not yet been independently verified. | High-priority in-flight candidate; do not ingest until exact detail record, file links, access terms and bytes are verified. |

### Important interpretation limits

- **BRSMAct is an Earth-based bed-rest analogue.** Its actigraphy summaries can support analysis of sleep trends under an analogue protocol. They are not observations from astronauts in orbit and are not continuous live telemetry.
- **BRSMCF is a cardiovascular-function research collection.** Echocardiography-derived measurements are not interchangeable with continuous heart rate or blood-pressure signals.
- **DSO 470 is promising because it is an in-flight Shuttle experiment.** The catalogue index lists heart rate and diastolic blood pressure, but that does not yet prove a downloadable file or reveal its sampling rate, completeness, participant structure, or license. Its current label is a candidate, not a validated ASTRA dataset.
- **OSD-575 remains a biospecimen assay study.** It is not a wearable signal source. Until the target CSV is retrieved, no marker measurements, biomarker trends, or health scores may be calculated from it.
- A catalogue's “public” or “available online” status is not a substitute for checking the exact file, associated rights, its schema, missingness, units, cohort and SHA-256.

## Recommended ingestion order

1. **Audit DSO 470 file-level access.** It is the strongest candidate for in-flight human cardiovascular measurements, but only if its detail record and downloadable data can be verified.
2. **Download and audit BRSMACT.** It offers a narrower but clearly described sleep dataset and a practical first validation of NASA NLSP file handling.
3. **Audit BRSMCF.** Select one well-documented campaign and inspect the actual data columns before deciding whether it supports a defensible cardiovascular-function summary.
4. **Keep retrying OSD-575 only when the file catalogue or NASA-provided download record changes.** Do not invent or brute-force alternative `files/...` paths.
5. **Maintain a separately labelled demo/manual stream** for vital signs not supported by an accessible research file. Synthetic signals must never be merged into research observations.

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

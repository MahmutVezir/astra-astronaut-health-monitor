# ASTRA — OSDR Dataset Audit v1

**Audit date:** 2026-11-14  
**Repository baseline inspected:** `e2cd04d65a903559446ea1ee061a9e2d205dd52d` (`main`)  
**Scope:** OSD-575 (required pilot dataset) and OSD-53 (second-phase candidate). OSD-919 is explicitly out of scope.  
**Audit status:** Study-page metadata verified; live API response, full file download and local checksum are pending execution of the pilot.

**Historical note (15 November 2026):** This v1 planning audit was captured before the successful live acquisition of the HDCVD9 transformed CSV. Its pending-download/checksum statements describe the state at that time and are superseded by the [later live-data audit](osd575-hdcvd9-live-data-audit-2026-11-14.md) and [current NASA source portfolio](nasa-research-data-portfolio-2026-11-14.md). The raw HDCVD9 assay file itself remains unavailable; ASTRA uses the transformed CSV only. The earlier working title “ASTRA-MED” referred to this same project, not a separate product.

## 1. Executive decision

OSD-575 is suitable for a narrowly scoped **descriptive, participant-level exploration of measured serum biomarkers across sample-collection timepoints**. It is not suitable for cardiovascular disease-risk prediction, diagnosis, or any claim that a serum assay is a live physiological signal. The study page identifies four Inspiration4 crew members and 28 serum samples. These are four independent participants and 28 repeated biospecimen samples, not 28 independent people.

OSD-53 is a possible later reference dataset for a different biological measurement domain: whole-blood gene-expression microarray data. It is not part of the first pilot. NASA's study description states that the original raw data were lost after physical damage at Tulane University during Hurricane Katrina, while processed values were retained. Its license was not established in this audit and must not be assumed to be CC0 merely because the dataset is publicly discoverable.

## 2. Dataset comparison

| Audit field | OSD-575 — required | OSD-53 — second phase |
|---|---|---|
| NASA study page | <https://osdr.nasa.gov/bio/repo/data/studies/OSD-575> | <https://osdr.nasa.gov/bio/repo/data/studies/OSD-53> |
| Dataset version | Version 3; page shows update date 2024-06-11 | Version 3; version update date must be rechecked before acquisition |
| DOI / repository identifier | DOI `10.26030/mc5d-p710`; ALSDA ID `LSDS-8` | DOI `10.25966/qsf7-cr81`; GeneLab ID `GLDS-53`; source accession `E-GEOD-47126` |
| Access | Public NASA OSDR study record; direct file retrieval must be checked at run time | Public NASA OSDR study record; processed-data access must be checked at run time |
| License | `CC0-1.0` shown on the study page | **NOT VERIFIED** in the accessible study-page metadata; do not infer a license |
| Organism | *Homo sapiens* | *Homo sapiens* |
| Independent participant count | **4** crew members (coded sources `C001`–`C004`) | **6** astronauts (study text and sample metadata identify six subjects) |
| Sample count | **28** serum sample records (`n=28` on the study page) | **13** sample records (`n=13` on the study page) |
| Measurement type | Serum comprehensive metabolic panel (CMP) plus multiplex immunoassay/protein biomarker panels, including cytokine and cardiovascular-related markers | Whole-blood transcription profiling by DNA microarray; 234 preselected stress-response genes |
| Timepoints | Study narrative lists `L-92`, `L-44`, `L-3`, `R+1`, `R+45`, `R+82`. The sample table also contains `R+194`; include it in the provisional observed list and resolve from the downloaded sample metadata before analysis | Whole blood collected at `L-10` and approximately 2–3 hours after return; inspect the sample table for the exact per-subject distribution |
| Metadata formats | `OSD-575_metadata_OSD-575-ISA.zip`; sample/assay ISA tables are `.txt` files within the archive | `OSD-53_metadata_OSD-53-ISA.zip`; sample/assay ISA tables are `.txt` files within the archive |
| Measurement-file formats | HDCVD9 assay table names submitted and transformed `.csv` files. The dataset page's HDCVD9 assay table labels the raw data file `Not Available`. Other assay formats/statuses must be checked separately | Processed data archives named `GLDS-53_microarray_E-GEOD-47126.processed.zip` and `GLDS-53_microarray_E-GEOD-47126.additional.zip`; tabular metadata is in `.txt` files within the metadata archive |
| Raw / processed status | The first pilot uses the **transformed/processed HDCVD9 CSV**. Raw HDCVD9 assay data are marked `Not Available` in the assay table. This statement is assay-specific, not a claim that every OSD-575 assay lacks raw data | Original raw microarray files are reported as no longer available after physical damage; processed values were retained in redundant locations and submitted to GEO |
| Initial suitability | **LIMITED_EVIDENCE** is the expected conservative status for broad claims: only four independent participants, repeated samples, and processed data for the chosen HDCVD9 target | Deferred; useful only for a separately defined gene-expression question, with license and data provenance checked first |

### 2.1 Count definitions — do not conflate them

- `participant_count` is the number of independent people/subjects represented by unique subject identifiers. For OSD-575 this is 4, not 28.
- `sample_count` is the number of biospecimen sample records. For OSD-575 this is 28.
- Multiple samples from the same person are repeated observations. They may support within-person descriptions, but they do not increase the number of independent participants.
- The full-study sample count and the count present in a particular assay file are different fields. An assay file may contain a subset; the pipeline reports coverage and must not silently replace the full-study count with the file's row count.

### 2.2 Timepoint discrepancy in OSD-575

The OSD-575 study narrative lists six planned/summary collection points (`L-92`, `L-44`, `L-3`, `R+1`, `R+45`, `R+82`). The displayed sample table includes `R+194` rows as well. The v1 pilot records seven provisional observed timepoints and treats the sample-level metadata table as the source of truth for the final count. The discrepancy must be documented in the run manifest rather than silently dropping `R+194` or changing the official narrative.

## 3. OSDR API and download verification

NASA documents both a study metadata/file API and a newer Biological Data API. API documentation is available, but **this audit did not record a successful live API response or a completed file download**. Therefore no HTTP 200 claim, file size, byte count or SHA-256 value is fabricated here.

| Verification item | OSD-575 target | Status at audit time | Evidence to persist on execution |
|---|---|---|---|
| Study page | `/bio/repo/data/studies/OSD-575` | `VERIFIED_PAGE_METADATA` | Study version, DOI, license, page retrieval date |
| Legacy metadata API | `https://osdr.nasa.gov/osdr/data/osd/meta/575` | `ENDPOINT_DOCUMENTED_LIVE_CALL_PENDING` | HTTP status, retrieval timestamp, response SHA-256, accession/version in payload |
| Legacy file catalog API | `https://osdr.nasa.gov/osdr/data/osd/files/575/?page=0&size=25&all_files=true` | `ENDPOINT_DOCUMENTED_LIVE_CALL_PENDING` | HTTP status, page number, file count, exact filename, `remote_url`, pagination evidence |
| Preferred pilot file | `LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv` | `STUDY_ASSAY_TABLE_LISTED_API_MATCH_PENDING` | Exact filename match in OSDR catalog; do not substitute another file if absent |
| Download URL | Construct from the `remote_url` returned in the OSDR catalog, using `https://osdr.nasa.gov` as documented by NASA | `NOT_DOWNLOADED_IN_THIS_AUDIT` | HTTPS URL, HTTP status, content type, content length, actual byte count |
| File integrity | SHA-256 of downloaded bytes | `NOT_COMPUTED` | `file_sha256`, optional match against a separately frozen expected digest |
| CSV parsing | Parse selected transformed result file | `NOT_RUN` | Header list, row count, parser errors, sample-ID and participant-ID coverage |
| Sample metadata | Extract unique subject/source IDs, sample IDs and timepoint values from the metadata archive | `NOT_DOWNLOADED_IN_THIS_AUDIT` | Archive SHA-256, member path, unique participant count, unique sample count, observed timepoints |

NASA's published API documentation describes the legacy study file endpoint as JSON and identifies `study_files[].remote_url` as the file retrieval path. It also describes the newer Biological Data API's dataset/file REST records and direct file URLs. The pilot module uses the documented legacy catalog format because its `remote_url` field is explicit in the API documentation. The API base and response assumptions are isolated in `src/core/osdr-client.js` so they can be changed without touching the UI.

Reference endpoints:

- Legacy OSDR API documentation: <https://api.nasa.gov/> (Open Science Data Repository Public API section)
- OSDR Biological Data API: <https://visualization.osdr.nasa.gov/biodata/api/>
- NASA OSDR FAQ and download guidance: <https://science.nasa.gov/reference/osdr-faq/>
- OSDR study navigation/file guidance: <https://osdr-tutorials.readthedocs.io/en/latest/pages/guides/navigate_an_osdr_study_page.html>

## 4. First end-to-end pilot contract — OSD-575

### 4.1 Pilot target and allowed question

**Selected file:** `LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv`  
**Assay:** Eve Technologies HDCVD9 multiplex serum panel  
**Input status:** transformed/processed CSV; the assay table lists the raw data file as `Not Available`  
**Allowed analysis question:** “Does the transformed OSD-575 HDCVD9 file contain sufficiently traceable repeated measurements for a descriptive, participant-level summary across sample-collection timepoints?”

This pilot may assess file integrity, sample coverage, participant/timepoint traceability, missingness and the availability of numeric assay values. It may produce descriptive summaries only after the evidence gate permits them. It must not produce a cardiovascular disease-risk estimate, individual diagnosis, medical alert threshold, or prediction of a medical event. Serum assay values are not heart-rate/SpO₂ telemetry.

The exact column mapping is a run-time input because the complete downloaded CSV header has not yet been verified. The operator must inspect the real header and provide explicit participant, sample, timepoint and numeric measurement column names. No guessed column aliases are accepted.

### 4.2 Module boundaries

| Module | Responsibility | Must not do |
|---|---|---|
| `src/core/osdr-client.js` | Fetch study metadata, enumerate paginated file records, select one exact filename, resolve NASA `remote_url`, download bytes and record HTTP/content-length metadata | Select a similarly named substitute, trust arbitrary hosts, or claim live API success before a real request |
| `src/core/integrity.js` | Compute SHA-256 and compare against an independently frozen digest | Treat a first-seen calculated hash as a trusted baseline |
| `src/core/csv.js` | Parse quoted CSV, BOM, commas and CRLF; reject malformed or ragged data | Infer missing identifiers or silently repair a malformed file |
| `src/core/evidence-engine.js` | Count unique participants and samples separately; assess identifier completeness, repeated timepoints, numeric coverage and raw/processed limitations | Inflate participant n using repeated samples or make clinical predictions |
| `src/core/trace-contract.js` | Validate and construct the one-record traceability contract and decision enum | Emit a non-analyzable decision without reason codes/messages |
| `src/core/osd575-pilot.js` | Orchestrate metadata → file catalog → exact download → integrity → parse → evidence gate → trace record | Render UI, infer unverified column mappings, or return a blank result |
| `scripts/run-osd575-pilot.js` | Provide a Node CLI to run the pilot and print a JSON trace record | Modify the existing dashboard or local demo state |

### 4.3 Single-run trace record contract

Every run emits one record with these fields and no hidden reliance on UI state:

```json
{
  "dataset_id": "OSD-575",
  "dataset_version": "3",
  "source_url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
  "license": "CC0-1.0",
  "file_sha256": "<64-character-lowercase-sha256-or-null>",
  "participant_count": 4,
  "sample_count": 28,
  "measurement_type": "Serum multiplex immunoassay; Eve Technologies HDCVD9; transformed values",
  "timepoints": ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"],
  "analysis_question": "Descriptive participant-level timepoint coverage only; no disease-risk prediction.",
  "decision": "LIMITED_EVIDENCE",
  "decision_reasons": [
    {
      "code": "LOW_INDEPENDENT_PARTICIPANT_COUNT",
      "message": "Only four independent participants are represented; repeated samples do not increase n."
    }
  ]
}
```

`decision_reasons` is an array of `{code, message}` objects. It must contain at least one item for every non-`ANALYZABLE` decision. `file_sha256` is `null` before a successful download; a null digest cannot be described as an integrity-verified file.

### 4.4 Decision policy

| Decision | Rule | Output behaviour |
|---|---|---|
| `INVALID_DATA` | Frozen SHA-256 mismatch; malformed/non-rectangular CSV; observed participant/sample identifiers exceed official study metadata; or an integrity contradiction | Stop analysis. Show the concrete validation failure and affected file/source |
| `INSUFFICIENT_EVIDENCE` | No data rows; unmapped/missing required identifier columns; no numeric assay values; or fewer than two participants have numeric observations at two or more distinct timepoints | Abstain from the requested temporal comparison and state exactly what is missing |
| `LIMITED_EVIDENCE` | Structurally usable data but fewer than 10 independent participants; assay file covers fewer than the full-study participant/sample counts; measurement missingness exceeds 20%; raw assay data are unavailable/unverified; or the digest has not yet been pinned to a reviewed reference | Permit only a constrained description, list limitations, suppress generalization and risk claims |
| `ANALYZABLE` | Traceable participant/sample/timepoint fields; at least 10 independent participants; at least two participants with paired timepoints; at least 80% numeric measurement coverage; no integrity/schema failures; raw-data status explicitly recorded; and a supplied frozen SHA-256 matches | Allow the named descriptive analysis only; this never authorizes a diagnosis or risk prediction |

The thresholds above are conservative **software evidence gates for this prototype**, not NASA thresholds, clinical standards, or statistical proof of representativeness. OSD-575 has four participants, so the full-study pilot cannot meet the 10-participant gate. A valid run is therefore expected to return `LIMITED_EVIDENCE` at best for this broad exploratory question. It may return `INSUFFICIENT_EVIDENCE` or `INVALID_DATA` when actual file/header/integrity checks fail.

### 4.5 First-run and repeat-run integrity protocol

1. Query the OSDR study metadata endpoint and require a study entry for `OSD-575`.
2. Query the OSDR file catalog and unwrap the documented `studies[\"OSD-575\"].study_files` response shape; require an exact match for the configured HDCVD9 transformed CSV filename.
3. Download only the NASA-provided URL; retain HTTP status, content type, byte length and the exact filename. Reject a final response URL outside the approved NASA HTTPS host policy.
4. Compute SHA-256 from the received bytes. The first run may create a candidate digest, but that alone is not a comparison against a trusted baseline.
5. Review the filename, NASA source, byte count, parse result and digest; then freeze the digest in a reviewed run manifest outside the downloaded dataset.
6. On later runs, pass the frozen digest as `--expected-sha256`. Any mismatch is `INVALID_DATA` and stops the pipeline.
7. Parse the real CSV. Record exact headers, row count, unique participant IDs, unique sample IDs, observed timepoints, mapped numeric columns and missingness.
8. Store the trace record with the dataset version and exact analysis question. Do not overwrite the previous run record; use a distinct run artifact for each acquisition.

Example command (replace the column labels with the actual downloaded file headers):

```bash
node scripts/run-osd575-pilot.js \
  --file "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv" \
  --participant-column "<exact participant header>" \
  --sample-column "<exact sample header>" \
  --timepoint-column "<exact timepoint header>" \
  --measurement-columns "<numeric marker header 1>|<numeric marker header 2>" \
  --expected-sha256 "<frozen 64-character SHA-256>"
```

If the first acquisition has no frozen digest yet, omit `--expected-sha256`; the pipeline will calculate a digest but force at least `LIMITED_EVIDENCE` with reason `SHA256_NOT_PINNED` until that digest is reviewed and frozen.

## 5. Verification checklist

### OSD-575 — required before accepting a pilot run

- [ ] Confirm the study page still reports version 3, DOI `10.26030/mc5d-p710`, and license `CC0-1.0`.
- [ ] Save the live metadata API response and its retrieval timestamp.
- [ ] Save every file-catalog page needed to enumerate the study files; preserve pagination fields.
- [ ] Confirm the exact HDCVD9 transformed CSV filename appears in the OSDR catalog and retain its `remote_url`.
- [ ] Record download HTTP status, content type, content length and actual bytes received.
- [ ] Compute SHA-256; review and freeze it before calling later downloads reproducible.
- [ ] Download and parse `OSD-575_metadata_OSD-575-ISA.zip`; verify 28 sample records and four unique source/participant IDs from the actual sample table.
- [ ] Resolve the `R+194` timepoint discrepancy from the downloaded sample metadata; preserve all observed timepoint values.
- [ ] Inspect the selected CSV header and map participant/sample/timepoint/measurement columns explicitly.
- [ ] Compare assay-specific coverage with full-study totals; do not treat missing assay rows as additional people.
- [ ] Record missingness and the number of participants with at least two valid measured timepoints.
- [ ] Confirm raw/processed status for the selected assay; do not generalize HDCVD9 raw-data status to every OSD-575 assay.
- [ ] Confirm the final trace record passes `validateTraceRecord` and every abstention includes reason codes/messages.
- [ ] Verify that no output is labelled as live telemetry, a cardiovascular risk prediction, diagnosis, or medical recommendation.

### OSD-53 — before second-phase adoption

- [ ] Confirm current version, study metadata and participant/sample counts directly from NASA OSDR.
- [ ] Establish the license from an explicit authoritative record; until then keep it `NOT_VERIFIED` and do not redistribute/use it under an assumed CC0 grant.
- [ ] Retrieve and hash the metadata archive and both processed microarray archives.
- [ ] Verify the processed-file formats, matrix dimensions, exact 13 sample identifiers and six unique subjects.
- [ ] Confirm the stated raw-data loss and GEO source/provenance against the current study record.
- [ ] Define a separate gene-expression research question, analysis plan and evidence thresholds. Do not reuse the OSD-575 serum-panel assumptions.

## 6. Test plan and acceptance criteria

Automated tests are in `tests/osdr-pilot.test.js` and run through the existing `npm test` script. They cover:

1. CSV BOM, escaped quotes, commas and CRLF parsing.
2. Rejection of unterminated fields and ragged rows.
3. SHA-256 calculation, pinned-digest match and mismatch.
4. Trace-schema validation, supported decision enum and required abstention reasons.
5. Four participants vs 28 samples: participant `n` remains four and the result is limited, not treated as 28 independent participants.
6. One timepoint only: a temporal comparison abstains as `INSUFFICIENT_EVIDENCE`.
7. Observed participant counts above official metadata: `INVALID_DATA`.
8. An injected end-to-end OSDR catalog/download flow with exact filename selection and digest capture.
9. A frozen checksum mismatch: `INVALID_DATA` and no parsing/analysis.

**Acceptance gate:** the unit tests must pass; one real OSDR download must complete; its checksum must be reviewed/frozen; the sample metadata counts and timepoints must be reproduced locally; and the output must be the trace record with transparent reasons. Passing mocked network tests alone does not prove NASA's live endpoint or a real file has been downloaded successfully.

## 7. Scope exclusions and non-claims

- OSD-919 is not part of this audit or pilot.
- No live sensor, wearable, spacecraft telemetry or real-time physiological monitoring is implemented by this dataset pipeline.
- OSD-575 serum biomarkers are not converted into cardiovascular disease-risk scores.
- The pilot is a provenance and evidence-adequacy pipeline, not a validated medical device or clinical decision support system.
- `ANALYZABLE` means only that a narrowly specified descriptive data task passed this prototype's technical evidence gates. It is not proof of scientific validity, clinical relevance, or generalizability.

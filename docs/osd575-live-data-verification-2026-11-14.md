# OSD-575 live-data verification attempt — 2026-11-14

## Status

**Outcome: access blocked in the execution environment; no real file was downloaded, parsed, or hashed.** This is an access finding, not an `INVALID_DATA` finding. No synthetic or third-party checksum is substituted.

## Evidence from the NASA OSDR study page

The public NASA study page currently identifies:

- Accession: `OSD-575`
- Selected study version: `3`
- Study title: *SpaceX Inspiration4 Blood Serum Metabolic Panel and Immune/Cardiac Cytokine Arrays*
- License displayed on the study page: `CC0-1.0`
- DOI: `10.26030/mc5d-p710`; ALSDA ID: `LSDS-8`
- Organism: `Homo sapiens`
- Study sample count: 28; four crew members are represented by source IDs `C001`–`C004`
- Sample time labels shown in the study table: `L-92`, `L-44`, `L-3`, `R+1`, `R+45`, `R+82`, and `R+194`
- HDCVD9 assay: Eve Technologies Panel HDCVD9; the assay table identifies the transformed file as `LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv`
- The same assay table labels its raw data file `Not Available` and identifies a submitted-results CSV separately.

Source: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575

These are study-page facts, not a successful retrieval of the live JSON API or the CSV bytes. The HDCVD9 raw-data status must not be generalized to the other OSD-575 assays.

## API attempts

The implementation's documented endpoints were attempted from the execution environment:

1. `GET https://osdr.nasa.gov/osdr/data/osd/meta/575`
2. `GET https://osdr.nasa.gov/osdr/data/osd/files/575`

The HTTP client could not resolve the NASA host: `Temporary failure in name resolution`. The web retrieval layer also reported the direct API URLs as inaccessible. Therefore no HTTP status, response JSON, API version field, file-catalog entry, or API-level license field could be inspected in this run.

NASA documents these metadata and file-catalog endpoint patterns and explains that file records expose a `remote_url` for HTTPS downloads:
https://api.nasa.gov/

## Download and integrity

- Exact HDCVD9 transformed filename: confirmed on the public study page.
- Exact live catalog record / `remote_url`: **not retrieved**.
- Raw file bytes: **not downloaded**.
- Byte length / content type / HTTP status: **not observed**.
- SHA-256: **not calculated**; `file_sha256` remains `null`.
- Local raw-file preservation: **not performed**, because no bytes were received.

A checksum must only be pinned after downloading the exact catalog-listed file and hashing its unchanged bytes. A hash copied from another repository, a different OSD-575 assay, or a third-party project is not acceptable.

## Schema observations and parser tests

The study page's sample table establishes `R+194` as a real timepoint label. The existing OSD-575 pilot constant already includes it; a regression test now explicitly protects it.

The actual HDCVD9 CSV header row and its missing-value conventions could not be inspected because the file was not downloaded. A parser regression test verifies only that the generic CSV parser preserves literal `NA`, `NaN`, and empty cells as distinct strings; it does not claim those are the actual tokens in the NASA file. No automatic missing-value coercion was introduced.

## Pilot decision

No real-data pilot was run. The correct run-level state is:

- `decision`: `INSUFFICIENT_EVIDENCE`
- `file_sha256`: `null`
- `participant_count`: 4 (study-page count; not recounted from downloaded assay rows)
- `sample_count`: 28 (study-page count; not recounted from downloaded assay rows)
- `timepoints`: study-page labels listed above
- `decision_reasons`: `OSDR_API_DNS_UNAVAILABLE`, `OSDR_FILE_NOT_DOWNLOADED`, `CSV_SCHEMA_UNOBSERVED`

This is an access/schema-verification abstention, not evidence that the dataset itself is invalid. Do not issue a real-file trace record with a fabricated digest or inferred CSV column map.

## Required next execution

Run the existing pilot from an environment with outbound HTTPS/DNS access to `osdr.nasa.gov`. Save the exact metadata and catalog JSON responses, download the catalog-listed HDCVD9 transformed file without rewriting it, record HTTP headers and byte length, compute SHA-256, and inspect the true header, missing tokens, participant/sample IDs, and timepoint values. Only then freeze the digest and map columns. If the actual CSV contradicts the study-page sample metadata, preserve the discrepancy and return `INVALID_DATA` or a reasoned abstention according to the contract.

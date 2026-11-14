# OSD-575 live-data verification attempt — 2026-11-14

## Status

**Updated outcome:** the original execution environment could not resolve NASA DNS. A subsequent GitHub Actions run did reach the legacy metadata JSON endpoint (HTTP 200) and captured its response, but the run then stopped at the obsolete SPA HTML check. The file catalog and actual CSV have not yet been downloaded. This is an access/workflow blocker, not an `INVALID_DATA` finding. No synthetic or third-party checksum is substituted.

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

The original local execution environment could not resolve the NASA host: `Temporary failure in name resolution`. The web retrieval layer also reported direct API URLs as inaccessible. The later GitHub Actions run did receive HTTP 200 from the metadata endpoint and saved the full JSON response. The file catalog had not yet been requested because the old SPA page check failed first.

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

## Follow-up: GitHub Actions metadata response captured

The manual GitHub Actions run 43592311262 reached the NASA legacy metadata endpoint successfully before the old SPA-page check failed.

- Metadata endpoint HTTP status: 200
- Captured response: metadata-response.json in artifact osd575-live-audit-43592311262
- Artifact SHA-256: 12e6c66a22900d50483a1075211b9b6f204d2fad42d792bf92c7cb6ca006d157
- study[OSD-575].version: numeric 3
- study[OSD-575].studies[]: record with identifier OSD-575, study title, and public release date
- additionalInformation.samples[s_OSD-575-txt].raw: 28 sample rows; source identifiers C001-C004; seven raw time strings including Return plus 194
- HDCVD9 assay metadata under additionalInformation.assays: the transformed filename appears in the Transformed Files field alongside the ALSDA Transformed Data protocol label; its Raw Data File field is Not Available
- A recursive inspection of the complete captured JSON found no license/rights field and no CC0-1.0 value. The known CC0-1.0 value therefore remains sourced from the official NASA study record, not from this legacy JSON endpoint.

This captured API response is now the schema basis for extractStudyMetadata(). The revised script no longer requests or parses the SPA HTML page. It validates the version and HDCVD9 transformation metadata from the JSON response, then proceeds to the file catalog and exact remote download.

The CSV itself remains unobserved until the revised manual workflow completes successfully. No file SHA-256 for the HDCVD9 CSV is available yet.

## Follow-up: version-aware file catalog diagnosis and fix

The next manual GitHub Actions run (43593461341) successfully retrieved the OSD-575 metadata JSON but returned no file records from the unversioned request:

- Request: https://osdr.nasa.gov/osdr/data/osd/files/575/?page=0&size=25&all_files=true
- HTTP status: 200
- Response fields: hits=0, total_hits=1, page_number=0, page_size=25, page_total=1, studies={}
- No study_files array or remote_url was returned.

The study metadata API had already verified OSD-575 version 3. NASA's Data File API documents version-specific accessions using a decimal suffix (for example, OSD-153 version 2 as 153.2). The file API request now uses the metadata-verified versioned accession 575.3 rather than the unversioned 575.

The catalog client now:

- follows every page reported by page_total;
- uses total_hits as an additional pagination lower bound when present;
- checks the study_files count against the returned study file_count and fails on an incomplete listing;
- deduplicates records across pages;
- accepts the versioned study key OSD-575.3 and the unversioned OSD-575 response key;
- matches the exact requested filename using file_name aliases or the filename/path suffix carried by remote_url (including its file query parameter);
- reports every returned CSV candidate and page metadata when the exact target is absent.

The manual workflow must still be run after this code change to establish whether versioned endpoint 575.3 returns the HDCVD9 file. No live CSV SHA-256 is claimed until those bytes are downloaded.
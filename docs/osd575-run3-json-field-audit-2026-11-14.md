# OSD-575 run 3: raw JSON file-reference audit (2026-11-14)

## Run and artifact identity

- GitHub Actions workflow: **Fetch and audit NASA OSD-575**
- Workflow run number: **3**
- Run ID: `43594467608`
- Run head SHA: `f8b458a57902947dd71ef417bcdf43d85d59ffff`
- Artifact: `osd575-live-audit-43594467608`
- Artifact ID: `14112959480`
- Artifact SHA-256: `334b8342959bd4a207259e15f76edf4adf88f576658dd0ba87a91fa6a772a87e`

The artifact contains the raw `metadata-response.json`, `file-catalog-response.json`, and the derived study metadata summary.

## What the raw responses actually contain

The captured metadata request is:

```
https://osdr.nasa.gov/osdr/data/osd/meta/575
```

The exact transformed filename

`LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv`

appears in two metadata locations:

1. The ISA assay table under:

   `study.OSD-575.additionalInformation.assays["a_OSD-575_immunoassay_multiplex_Eve Technologies Panel HDCVD9-txt"].raw[*].a100014parametervaluetransformedfiles`

   The matching header entry has title `Parameter Value: Transformed Files` and field `a100014parametervaluetransformedfiles`.

2. The ISA study graph under:

   `study.OSD-575.studies[0].assays[0].processSequence[2].parameterValues[1].value`

These are filename references, not download URLs. The HDCVD9 assay's `dataFiles[0]` item says `name: "Not Available"` and `type: "Raw Data File"`; that entry describes the raw-data-file slot and must not be misrepresented as a transformed-file URL.

An exhaustive walk of the captured `meta/575` JSON found no `remote_url`, `download_url`, or URL-valued field associated with this transformed CSV. The metadata response therefore proves that the assay references the transformed filename, but it does not provide bytes or a URL to retrieve them.

The captured versioned catalog request is:

```
https://osdr.nasa.gov/osdr/data/osd/files/575.3/?page=0&size=25&all_files=true
```

Its raw JSON body was:

```json
{
  "hits": 0,
  "input": "575.3",
  "page_number": 0,
  "page_size": 25,
  "page_total": 1,
  "studies": {},
  "success": true,
  "total_hits": 1,
  "valid_input": ["575"]
}
```

The response has `success: true` and `total_hits: 1`, but `hits: 0` and an empty `studies` object. The current evidence does not disclose a file record, filename field, or download URL in this endpoint response. The discrepancy is recorded as observed; it is not repaired by guessing another URL.

## Resulting audit behavior

The fetch script now extracts the exact transformed filename from the two observed metadata paths and stores those paths in `pilot-report.json` and `manifest.json`.

- If the catalog does not return the matching file record, the run completes with an explicit `INSUFFICIENT_EVIDENCE` trace record, a null `file_sha256`, both raw JSON responses, and the reason code `METADATA_FILE_REFERENCE_WITHOUT_CATALOG_DOWNLOAD_RECORD`.
- If a matching catalog record exists but does not contain a usable `remote_url`/download URL, the run also abstains; no URL is synthesized.
- If a matching record has a NASA-hosted download URL, the script downloads the response bytes, saves them unchanged, calculates `file_sha256`, and invokes `runOsd575Pilot` against the captured metadata/catalog responses and those same downloaded bytes.
- A malformed or structurally inconsistent response is reported as `INVALID_DATA`; a missing file record or unavailable network evidence is reported as `INSUFFICIENT_EVIDENCE`.

An abstention is a completed audit outcome rather than a runner exception. The workflow artifact is still uploaded, and the report makes clear that no CSV was downloaded and no digest was calculated.

## Scientific interpretation

The metadata filename references establish assay provenance only. They do not establish that the transformed CSV was retrieved, that any measurement values were analyzed, or that the file contents are reproducible. Those claims remain blocked until the OSDR catalog provides a verifiable file record and download URL and the downloaded bytes are hashed.

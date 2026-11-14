# OSD-575 catalog discovery and analysis-gate review

**Review date:** 14 November 2026  
**Scope:** Run #4's empty paginated catalog response, run #5's successful bare-endpoint file discovery, Gemini's review, redirect validation, and offline analysis test design.

## 1. Independent assessment of Gemini's review

### Correct warnings

1. **Passing unit tests do not establish that NASA data was downloaded.** Run #4 completed successfully because the audit correctly captured the response and abstained. It did not calculate a source CSV hash or produce participant-level measurements. The distinction between software correctness and live-data validation is essential.

2. **`total_hits: 1` with `hits: 0` and an empty `studies` object is an unresolved API response, not proof that the target file does not exist.** One empty response from one request form is insufficient to close the catalog investigation.

3. **Offline analysis fixtures should test both success and insufficiency paths.** Existing tests already covered the positive synthetic CSV path (four participants, seven timepoints), the column-mapping function, low independent participant counts, and the single-timepoint paired-evidence rule. So the claim that these layers had never been tested was too broad. What was missing was a complete offline test where the metadata/catalog/download flow succeeds but the downloaded bytes intentionally contain inadequate temporal evidence. This revision adds that test.

### Where the review needed qualification

- A missing participant does not always require `INSUFFICIENT_EVIDENCE`. If several other independent participants retain repeated timepoints, a descriptive analysis may still be possible but must be labelled `LIMITED_EVIDENCE`. The evidence engine should reserve `INSUFFICIENT_EVIDENCE` for cases where the stated comparison cannot be supported, such as no participant having two distinct measured timepoints.
- Preserving raw JSON and writing a decision artifact is not merely a reporting detour. It preserves provenance, enables reproducibility, and lets a reviewer distinguish a missing file record from malformed or unavailable API evidence. The improvement is to retain those artifacts while separating acquisition from analysis.

## 2. Official NASA API facts used for the revised lookup

NASA's OSDR Public API documentation states that:

- The Data File API is `/osdr/data/osd/files/{OSD_STUDY_IDs}`.
- The study ID may be an integer or a decimal accession; a decimal accession specifies a study version (the documentation gives `153.2` as an example).
- The documentation includes the bare single-study request `/files/87` and the bare specific-version request `/files/87.1`.
- The paginated form supports page numbers beginning at 0 and a maximum page size of 25. `all_files=true` includes hidden files.
- The returned `study_files` record contains `remote_url`, which NASA says is the download link after prefixing it with `https://osdr.nasa.gov`.

Sources:
- NASA OSDR Public API: https://api.nasa.gov/
- NASA OSDR FAQ on public API and file downloads: https://science.nasa.gov/reference/osdr-faq/
- Official OSD-575 version 3 study page and HDCVD9 transformed-file name: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575

These facts support testing the documented versioned and unversioned forms. They do **not** authorize constructing a download URL when a real `remote_url` has not been returned.

## 3. Revised acquisition sequence

The OSD-575 fetch now runs the following bounded sequence, stopping as soon as the exact transformed filename is returned:

1. Repeat the observed versioned paginated request: `/files/575.3/?page=0&size=25&all_files=true`.
2. Test NASA's documented bare decimal-version request: `/files/575.3`.
3. Test NASA's documented bare unversioned request: `/files/575`.

The versionless lookup is not treated as an arbitrary version override. The same run first verifies that `meta/575` reports the expected OSD-575 version 3; the exact file name must match the HDCVD9 metadata reference; and the selected catalog record must expose a real NASA download URL. The report records which request form supplied the file record.

The artifact retains every raw JSON response, the request URL, HTTP status, record count, CSV filename candidates, and whether the exact target was found.

If no form returns a matching record, the decision reason is now `NO_CATALOG_MATCH_AFTER_DOCUMENTED_LOOKUPS`. Its message explicitly says this is a catalog-resolution failure, **not proof that the file does not exist**. No download URL is synthesized and no substitute CSV is selected.

## 4. Acquisition and analysis are now separate stages

The download script saves the exact response bytes unchanged and records:

- The selected catalog record and the request form that returned it.
- The real download URL from the catalog.
- Byte length and SHA-256 of the downloaded bytes.
- Whether the original bytes were successfully written to the artifact directory.
- CSV parse result, inferred column map, and observed participant/sample/timepoint structure.
- The trace-contract decision returned by the shared byte-analysis function.

`analyzeOsd575FileBytes` performs integrity checking, CSV parsing, evidence evaluation, and trace-record construction without making any network request. The online pilot and the fetch script can therefore share the same analysis path. A downloaded file with inadequate temporal coverage can still be parsed and hashed while receiving `INSUFFICIENT_EVIDENCE`; a technically complete data pipeline must not be confused with scientifically sufficient evidence.

The report separates the transport/schema gate (`analysis_gate.data_pipeline_completed`) from the scientific decision (`trace_contract.decision`).

## 5. Offline synthetic test design

The expanded tests cover these deliberately different situations:

| Synthetic fixture | Expected decision | Why |
|---|---|---|
| Four participants, seven timepoints | `LIMITED_EVIDENCE` | The file can be parsed and traced, but four independent participants are still a low-n exploratory sample. |
| Three of four expected participants, each with repeated timepoints | `LIMITED_EVIDENCE` | Coverage is incomplete, but paired observations remain for multiple independent participants. |
| Four participants with only one timepoint each | `INSUFFICIENT_EVIDENCE` | No within-participant temporal comparison can be made. |
| Exact file supplied only by the documented unversioned catalog form, with one timepoint per participant | `INSUFFICIENT_EVIDENCE` after successful download, SHA-256, CSV parse and mapping | The acquisition and technical pipeline can succeed while the scientific question remains unsupported. |

These are synthetic test fixtures, not NASA observations. They validate the analysis and abstention logic, not the contents of the live HDCVD9 file.

## 6. What remains unproven after live run #5

The exact HDCVD9 catalog record and its NASA-provided remote_url are verified by live run #5. The record declares a 6,207-byte file and restricted=false. The download did not complete because the redirect destination was outside the allowlist that existed during run #5. PR #17 now allows only the exact hostname `nasa-osdr.s3.us-west-2.amazonaws.com`, derived from NASA's documented public bucket name/region and AWS's documented virtual-hosted S3 endpoint syntax, while requiring the final URL's filename to match the catalog record. However, run #5 did not record the final redirect URL, so the actual redirect host and object path have **not yet been independently observed**. A new live run must confirm that the real redirect matches this narrow allowlist before any bytes are accepted. The CSV bytes remain **not downloaded**, and there is still no live file SHA-256, actual column map, observed measurement table, or biomarker result.

Even after a successful download, the HDCVD9 panel is a transformed serum multiplex assay, not continuous heart-rate or blood-pressure telemetry. Its outputs can support only a carefully bounded, descriptive participant-level assay analysis. The project must not turn a cytokine concentration into a clinical diagnosis or a real-time crew alert.

## 7. Next live validation

The catalog-discovery step is no longer the blocker. The next run must capture and validate the actual redirect returned by the catalog-provided NASA URL. NASA documents the public bucket as `nasa-osdr` in `us-west-2`; AWS documents the virtual-hosted endpoint pattern used to derive the allowlisted hostname. Those documents establish the bucket and endpoint convention, but they do not prove which exact host/path the OSDR download endpoint will return for this file. The code must continue to reject arbitrary external redirects and require the exact HDCVD9 filename. Only after the live response matches the allowlist should it save original bytes and compute SHA-256, byte length, parsed schema, column map, and observed structure. Do not construct a direct S3 object key from assumptions; use the actual redirect returned by the NASA catalog URL.

## 8. Live run #5 evidence (14 November 2026)

- Workflow: [Fetch and audit NASA OSD-575, run #5](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43600280830).
- The first paginated versioned request still returned HTTP 200 with hits=0, total_hits=1, and no study entry.
- The documented bare versioned request /osdr/data/osd/files/575.3 returned HTTP 200, hits=1, one study (OSD-575), and nine file records.
- The exact record was LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv, with file_size=6207, restricted=false, and the catalog-provided relative remote_url /geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv.
- The downloader rejected the final redirect because it was outside the existing NASA HTTPS host allowlist. The artifact records OSDR_FILE_DOWNLOAD_UNAVAILABLE; file_sha256=null, byte_length=null, raw_bytes_preserved=false, and all parse/mapping/observation gates remain false.
- This is a **catalog-resolution success but a download-validation failure**. It is not a completed data acquisition and not a scientific result.
- NASA documents the public OSDR bucket name `nasa-osdr` and region `us-west-2`; AWS documents the virtual-hosted URL pattern `https://bucket-name.s3.region.amazonaws.com/key`. PR #17 derives the exact host `nasa-osdr.s3.us-west-2.amazonaws.com` from those facts. The live run #5 artifact did not capture the final redirect URL, so this host/path match remains pending live confirmation. Sources: [NASA OSDR AWS guide](https://www.nasa.gov/reference/osdr-help-getting-started-with-aws-and-osdr-data/), [AWS S3 virtual hosting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html), and [Registry of Open Data entry](https://registry.opendata.aws/nasa-osdr/).


## 9. Redirect-validation change in PR #17

PR #17 adds a strict redirect validator that continues to require HTTPS and accepts only NASA hosts or the single OSDR bucket host `nasa-osdr.s3.us-west-2.amazonaws.com`. For the bucket host it also requires the final path component to equal the exact catalog filename. Unit tests reject arbitrary external hosts, other S3 buckets, HTTP, and mismatched filenames.

This change is grounded in two separate source facts: NASA identifies the public bucket as `nasa-osdr` in `us-west-2`; AWS documents the virtual-hosted S3 endpoint pattern `https://bucket-name.s3.region.amazonaws.com/key`. The resulting hostname is therefore a narrowly derived allowlist entry, **not a redirect destination already observed in run #5**. A live run must still confirm the actual redirect URL before this acquisition path can be considered validated.

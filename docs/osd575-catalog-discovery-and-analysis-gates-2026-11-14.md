# OSD-575 catalog discovery and analysis-gate review

**Review date:** 14 November 2026  
**Scope:** The run #4 empty `files/575.3` response; Gemini's review; acquisition and offline analysis test design.

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

The exact HDCVD9 catalog record and its NASA-provided remote_url are now verified by live run #5. The catalog record declares a 6,207-byte file and restricted=false. However, the download did not complete: the final redirect host fell outside the current strict NASA HTTPS allowlist. Therefore the CSV bytes remain **not downloaded**, and there is still no live file SHA-256, actual column map, observed measurement table, or biomarker result.

Even after a successful download, the HDCVD9 panel is a transformed serum multiplex assay, not continuous heart-rate or blood-pressure telemetry. Its outputs can support only a carefully bounded, descriptive participant-level assay analysis. The project must not turn a cytokine concentration into a clinical diagnosis or a real-time crew alert.

## 7. Next live validation

The catalog-discovery step is no longer the blocker. The next run must test the catalog-provided redirect against the exact official OSDR public-bucket host documented by NASA. The code must continue to reject arbitrary external redirects, and it must verify that the final object name is the exact HDCVD9 CSV. Only then should it save the original bytes and compute the SHA-256, byte length, parsed schema, column map, and observed structure. Do not construct a direct S3 object key from assumptions; use the actual redirect returned by the NASA catalog URL.

## 8. Live run #5 evidence (14 November 2026)

- Workflow: [Fetch and audit NASA OSD-575, run #5](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43600280830).
- The first paginated versioned request still returned HTTP 200 with hits=0, total_hits=1, and no study entry.
- The documented bare versioned request /osdr/data/osd/files/575.3 returned HTTP 200, hits=1, one study (OSD-575), and nine file records.
- The exact record was LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv, with file_size=6207, restricted=false, and the catalog-provided relative remote_url /geode-py/ws/studies/OSD-575/download?source=datamanager&file=LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv.
- The downloader rejected the final redirect because it was outside the existing NASA HTTPS host allowlist. The artifact records OSDR_FILE_DOWNLOAD_UNAVAILABLE; file_sha256=null, byte_length=null, raw_bytes_preserved=false, and all parse/mapping/observation gates remain false.
- This is a **catalog-resolution success but a download-validation failure**. It is not a completed data acquisition and not a scientific result.
- NASA documents a public OSDR AWS bucket named nasa-osdr in us-west-2; the redirect validator will be extended only for that exact host, not for arbitrary S3 or third-party domains. See the [NASA OSDR AWS guide](https://www.nasa.gov/reference/osdr-help-getting-started-with-aws-and-osdr-data/) and [Registry of Open Data entry](https://registry.opendata.aws/nasa-osdr/).

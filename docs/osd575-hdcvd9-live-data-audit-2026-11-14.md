# OSD-575 HDCVD9 live data audit — 14 November 2026

## Scope and provenance

This audit records the first verified live download of the exact NASA OSDR OSD-575 Version 3 HDCVD9 cardiovascular-related serum multiplex transformed CSV.

- Study: [NASA OSDR OSD-575, Version 3](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575)
- Metadata API: \`https://osdr.nasa.gov/osdr/data/osd/meta/575\`
- File catalog request that exposed the exact record: \`https://osdr.nasa.gov/osdr/data/osd/files/575.3\`
- Exact file: \`LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv\`
- GitHub Actions workflow run: [43608345184](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43608345184)
- Artifact: \`osd575-live-audit-43608345184\` (artifact ID \`14118837120\`)

The parameterized paginated catalog URL returned HTTP 200 with \`hits=0\`. NASA's documented bare versioned endpoint returned nine exact file records, including the target CSV. The target catalog record had \`restricted=false\`, a catalog-provided \`remote_url\`, and a declared file size of 6,207 bytes. The downloaded response followed an HTTPS redirect to the ALSDA S3 host and returned HTTP 200 with content type \`text/csv\`. The redirect destination was recorded in the audit artifact; no URL was synthesized.

## Byte-level integrity

- Downloaded byte length: **6,207**
- SHA-256: \`fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c\`
- Raw bytes preserved without text re-encoding: **yes**
- CSV parse: **passed**
- CSV data shape: **28 rows × 19 columns**
- Unique sample names: **28**
- Empty cells in the 28 × 18 assay-value matrix: **0**
- Non-numeric assay-value cells: **0**
- Duplicate sample names: **0**

The SHA-256 above is a project-maintained reproducibility pin calculated from the first exact catalog download and independently recalculated before being committed. NASA did not provide this checksum. The pin checks future downloads against this reviewed byte sequence; it is not a NASA-published authenticity signature.

## Sample traceability and value structure

The transformed CSV contains only `Sample Name` plus assay-value columns; it does not contain explicit participant and timepoint columns. The raw NASA OSDR metadata response contains an ISA sample table with `Source Name`, `Sample Name`, and `Factor Value: Time`. A separate offline inspection of the two files confirmed a one-to-one match across all 28 sample identifiers:

- Participants: C001, C002, C003, C004 — **4 independent participants**
- Samples: **28**, seven per participant
- Collection points: L-92, L-44, L-3, R+1, R+45, R+82, R+194
- Each participant has one sample at each of the seven listed collection points

The updated production acquisition code implements this exact metadata join. **Run #7 predates that change**: its pilot report has no column map and therefore reports `INSUFFICIENT_EVIDENCE`. That result reflects the old inability to map CSV rows, not a biological conclusion about the assay. The next live run must demonstrate the updated mapping and normalization checks in its own `pilot-report.json` before Research Mode can unlock the biomarker plots.

Nine concentration columns are treated as primary numeric assay measurements. The nine paired `*_percent` columns are normalized representations, not nine additional independent biomarkers.

## Normalization cross-check

NASA's study description says the assay data are normalized by the average of pre-flight values from all crew. The transformed file's percent columns were independently recalculated against:

`percent = 100 × row concentration / mean concentration across all crew pre-flight samples`

The reference set comprises the 12 samples at L-92, L-44 and L-3 (four participants × three pre-flight collections). All nine paired percent columns reproduced the formula across all 28 rows; the largest absolute difference was below (5 × 10^{-8}), consistent with rounding in the CSV.

This independent offline calculation confirms the arithmetic relationship in the downloaded transformed file. It does not validate the assay laboratory's calibration or the vendor's underlying raw measurements. The revised production pipeline repeats the same check and records a structured normalization audit; that production check remains pending the next live workflow run.

## Scientific decision and limitations

The source acquisition and byte-integrity stages are complete. The 28-row metadata join and nine-analyte normalization formula have passed a separate offline review of the downloaded artifact, but the live production pilot report has not yet recorded those revised analysis gates. A new run is required before the end-to-end data pipeline can be marked complete.

The evidence decision remains **LIMITED_EVIDENCE**, not ANALYZABLE for general inference:

1. There are four independent participants. The 28 rows are repeated samples from those four people; they are not 28 independent participants.
2. Raw assay data are listed as unavailable in the OSDR metadata. This audit uses the ALSDA transformed values only.
3. The project uses a minimum independent-participant threshold of 10 for broader exploratory inference. OSD-575 cannot meet it.
4. The CSV includes a fibrinogen concentration column, but the current [Eve Technologies HDCVD9 product page](https://www.evetechnologies.com/product/human-cardiovascular-disease-panel-3-9-plex-discovery-assay-array-hdcvd9/) states that fibrinogen cannot be measured in serum samples. Since this study uses serum, fibrinogen must be flagged and excluded from biological interpretation until the apparent discrepancy is clarified with the study authors or assay provider. The numeric column is preserved, not silently deleted.
5. These are serum multiplex biomarkers collected at discrete pre- and post-flight timepoints. They are not continuous ECG, heart-rate, oxygen-saturation or blood-pressure telemetry.
6. No diagnosis, cardiovascular event prediction, individual risk score, or clinical recommendation is supported by this dataset.

## Permitted next analysis

After the revised live pipeline report passes, the defensible next analysis is a participant-level descriptive profile of the non-flagged markers across the seven collection points, accompanied by all four individual trajectories and clearly stated units/normalization. Any cross-participant summaries must report \(n=4\) and remain descriptive; no population-level significance claim should be made from this cohort alone.

## Source references

- NASA OSDR OSD-575 study description, sample table, assay methods and license: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
- Eve Technologies HDCVD9 assay description and serum fibrinogen caveat: https://www.evetechnologies.com/product/human-cardiovascular-disease-panel-3-9-plex-discovery-assay-array-hdcvd9/


## Production repeat audit — live run #9 (14 November 2026)

The follow-up live workflow [run 43612460864](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612460864) executed the updated metadata-backed analysis and completed successfully. Its artifact `osd575-live-audit-43612460864` was imported by [verified-source import run 43612482985](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612482985).

The production audit independently recorded:

- Exact file: `LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv`
- Byte length: **6,207**
- Project-maintained SHA-256: `fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c`
- CSV shape: **28 rows × 19 columns**
- NASA ISA mapping: **28/28** unique sample names matched one-to-one
- Participants: **4** (C001–C004), with **7** collection timepoints each
- Normalization: **PASS** for all **9** concentration/percentage pairs, using the mean of the 12 all-crew pre-flight samples as denominator
- Maximum absolute difference between recorded percentages and recomputed percentages: approximately **4.98 × 10⁻⁸**
- Scientific decision: **LIMITED_EVIDENCE**
- Raw assay data: **Not Available**

The source-level import stores the original CSV bytes, the derived ISA sample map, the raw NASA metadata/catalog response envelopes, the manifest, the pilot report and the structured source-audit record under `data/osdr/OSD-575/`. The SHA-256 is a reproducibility pin maintained by this project; NASA did not publish it as a signature.

The Research Mode browser loader performs a second gate over the committed files. It verifies the exact SHA-256 and byte length, parses the 28 × 19 CSV, checks the 28-sample join and four participant IDs, confirms all seven timepoints and verifies all nine numeric concentration/percentage pairs before biomarker plots are displayed. If any of these checks fail, measurements remain hidden.

This update supersedes the earlier statement above that the live mapping/normalization gate was still pending. It does **not** change the scientific limitations: the study has four independent participants, observations are repeated serum samples, raw assay data are unavailable, and fibrinogen remains flagged because of the vendor's serum suitability statement. OSD-575 is not a source of continuous heart-rate, blood-pressure, SpO₂, temperature or sleep telemetry.
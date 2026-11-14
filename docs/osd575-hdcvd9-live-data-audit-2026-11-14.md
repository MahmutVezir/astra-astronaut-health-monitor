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

The transformed CSV contains only \`Sample Name\` plus assay-value columns; it does not contain explicit participant and timepoint columns. The authoritative OSDR ISA sample table exposes \`Source Name\`, \`Sample Name\`, and \`Factor Value: Time\`. A one-to-one exact join on \`Sample Name\` resolves all 28 CSV rows to the metadata table:

- Participants: C001, C002, C003, C004 — **4 independent participants**
- Samples: **28**, seven per participant
- Collection points: L-92, L-44, L-3, R+1, R+45, R+82, R+194
- Participant/timepoint pairing: all four participants have repeated observations at all seven listed collection points

The analysis pipeline now uses that explicit metadata join rather than guessing participant/timepoint values from text patterns in the CSV. It does not alter the stored source CSV.

Nine concentration columns are treated as the primary numeric assay measurements. The paired \`*_percent\` columns are retained as normalized representations, not counted as additional independent biomarkers.

## Normalization cross-check

NASA's study description states that HDCVD9 concentrations were extrapolated with a four- or five-parameter logistic standard curve and that measurements were normalized by the average of pre-flight values from all crew. The transformed file's percent columns were independently checked against:

\`percent = 100 × row concentration / mean concentration across all crew pre-flight samples\`

The pre-flight reference set comprises the 12 samples at L-92, L-44 and L-3 (four crew members × three collection points). All nine paired percent columns reproduced the formula over all 28 rows. The maximum absolute difference was below \(5 × 10^{-8}\), consistent with rounding in the CSV.

This verifies the mathematical relationship in the downloaded transformed file. It does not independently validate the assay's laboratory calibration or the vendor's underlying raw data.

## Scientific decision and limitations

The data pipeline is now complete: exact catalog match, verified download URL and redirect destination, preserved source bytes, matching pinned SHA-256, successful CSV parsing, complete metadata-backed row mapping, and a passing normalization cross-check.

The evidence decision remains **LIMITED_EVIDENCE**, not ANALYZABLE for general inference:

1. There are four independent participants. The 28 rows are repeated samples from those four people; they are not 28 independent participants.
2. Raw assay data are listed as unavailable in the OSDR metadata. This audit uses the ALSDA transformed values only.
3. The project uses a minimum independent-participant threshold of 10 for broader exploratory inference. OSD-575 cannot meet it.
4. The CSV includes a fibrinogen concentration column, but the current [Eve Technologies HDCVD9 product page](https://www.evetechnologies.com/product/human-cardiovascular-disease-panel-3-9-plex-discovery-assay-array-hdcvd9/) states that fibrinogen cannot be measured in serum samples. Since this study uses serum, fibrinogen must be flagged and excluded from biological interpretation until the apparent discrepancy is clarified with the study authors or assay provider. The numeric column is preserved, not silently deleted.
5. These are serum multiplex biomarkers collected at discrete pre- and post-flight timepoints. They are not continuous ECG, heart-rate, oxygen-saturation or blood-pressure telemetry.
6. No diagnosis, cardiovascular event prediction, individual risk score, or clinical recommendation is supported by this dataset.

## Permitted next analysis

The defensible next step is a participant-level descriptive profile of the non-flagged markers across the seven collection points, accompanied by all four individual trajectories and clearly stated units/normalization. Any cross-participant summaries must report \(n=4\) and remain descriptive; no population-level significance claim should be made from this cohort alone.

## Source references

- NASA OSDR OSD-575 study description, sample table, assay methods and license: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
- Eve Technologies HDCVD9 assay description and serum fibrinogen caveat: https://www.evetechnologies.com/product/human-cardiovascular-disease-panel-3-9-plex-discovery-assay-array-hdcvd9/

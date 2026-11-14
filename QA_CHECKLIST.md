# ASTRA — QA Checklist

**Build:** 0.1 prototype · main commit `0e47ee5a` (validation commit below)  
**Rule:** Do not mark a test passed until a person has actually executed it. Record date, device, browser, result, and evidence.

## Automated logic tests

Run `npm test` with Node.js 18+.

- Blank and missing values return `NO_DATA`.
- Configured reference-band endpoints are inclusive.
- Values outside the configured bands return `REVIEW`.
- Non-numeric and out-of-input-range values return `INVALID`.
- Missing readings cause an overall `LIMITED` assessment.
- Fully populated out-of-band readings produce `REVIEW`.
- The nominal demo scenario produces `WITHIN`.
- Custom reference bands are respected and invalid lower/upper pairs are rejected.
- Static integration tests verify that app.js element IDs exist in index.html and all referenced offline-shell assets exist.

## NASA OSD-575 Research Mode gates

- [x] Live catalog lookup found the exact OSD-575 v3 HDCVD9 transformed file.
- [x] Download returned HTTP 200 from the catalog-provided URL via the observed ALSDA redirect.
- [x] Original download is 6,207 bytes and independently hashes to the project pin recorded in README.
- [x] CSV is 28 × 19 with 28 unique sample identifiers and nine concentration/percentage pairs.
- [x] The downloaded sample names were independently compared with the 28 NASA ISA metadata sample identifiers.
- [x] The nine percentage columns were independently recalculated against the all-crew pre-flight mean (12 samples); maximum absolute difference is below 5 × 10^-8.
- [x] Live acquisition run #9 (GitHub Actions run 43612460864) completed with all 28 sample mappings and all nine normalization checks recorded in pilot-report.json.
- [x] Verified-source import run 43612482985 committed the exact original CSV bytes, isa-sample-map.json, raw NASA API envelopes, and source-audit.json to main.
- [x] tests/osd575-source-data.test.js passed against the committed source bundle; missing required files now fail the test rather than being skipped.
- [x] Automated Research Mode integration test loads the committed NASA CSV, ISA map, and audit record, then verifies the 28/28 join, nine analytes, chart/table rendering, and fibrinogen flag.
- [ ] Open the deployed Research Mode in a real browser; confirm layout, chart readability, keyboard/select behavior, and download link on desktop and mobile. This manual visual check has not been performed by the GitHub Actions test runner.
- [x] Automated integration test selects CRP and fibrinogen; verifies the unit change and persistent fibrinogen interpretation warning.
- [ ] Manually select each marker in a real browser; confirm units and participant trajectories change consistently.
- [ ] Confirm fibrinogen displays a persistent interpretation warning and is not included in biological conclusions.
- [ ] Download the source CSV from the page; recalculate its SHA-256 and compare with the documented project pin.
- [ ] Confirm all demo HR/SpO₂/temperature/sleep inputs remain in Demo & Manual Mode and are never presented as NASA OSD-575 measurements.


## NASA NLSP DSO-470 discovery — 14 November 2026

- [x] Official NLSP index shell fetched successfully (HTTP 200).
- [x] Same-origin application bundle and nested search/detail/file-explorer modules inspected.
- [x] Live run [43615678402](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43615678402) inspected 40 nested and 37 second-level bundles from 15 parent modules.
- [x] Discovery artifact preserved: `nlsp-dso470-discovery-43615678402`, 1,441,155 bytes, SHA-256 `53e0f0c7c45802b016c6b5e2bb91faf3475ee67f37a8f7114e7287249983122e`.
- [x] The audit explicitly recorded zero measurement files downloaded; no sample values were ingested.
- [ ] Locate the exact DSO-470 experiment-specific NLSP record and source-provided file inventory.
- [ ] Confirm file access/reuse terms, exact source URL, bytes, SHA-256, schema, units, cohort and sampling cadence.
- [ ] Only after those gates pass, implement a separate DSO-470 data loader and tests.

## Current automated validation evidence — 14 November 2026

- Commit: `0e47ee5acaebbcaf0fbf2b3d3c74a841a6b5fa59`
- GitHub Actions run: [43616190629](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43616190629)
- JavaScript syntax checks: passed.
- Automated test suite: **72 passed, 0 failed, 0 skipped**.
- End-to-end Research Mode integration: passed against the committed NASA OSD-575 files; source hash, 28/28 sample mapping, nine-analyte normalization, participant charts/table, and fibrinogen flag behavior were verified.
- DSO-470 UI source card test: passed with the updated audit status; it does not present unverified files as integrated.
- GitHub Pages deployment: successful.
- NLSP DSO-470 discovery: [run 43615678402](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43615678402) succeeded; discovery artifact preserved; zero measurement files downloaded.
- NASA live acquisition: [run 43612460864](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612460864).
- Verified source import: [run 43612482985](https://github.com/MahmutVezir/astra-astronaut-health-monitor/actions/runs/43612482985).

The team still needs to perform and record the manual real-browser checks below. CI success is not a substitute for that visual QA.

## Browser functional tests

| ID | Test | Steps | Expected result | Actual result |
|---|---|---|---|---|
| QA-01 | Initial load | Open app in a fresh browser profile | Nominal simulated readings appear; demo label is visible | Not yet recorded |
| QA-02 | Nominal scenario | Load “Nominal day” | Four signals are inside their illustrative bands | Not yet recorded |
| QA-03 | Baseline shift | Load “Baseline shift” | Four signals show “Review”; explanation names the demo band | Not yet recorded |
| QA-04 | Incomplete data | Load “Incomplete data” | Two signals show “No data”; overall assessment is “Limited” | Not yet recorded |
| QA-05 | Manual entry | Enter valid values and submit | Cards, assessment, timestamp, trend, and log update | Not yet recorded |
| QA-06 | Missing manual value | Clear one field and submit | Field remains “No data”; assessment becomes “Limited” | Not yet recorded |
| QA-07 | Invalid entry | Enter text or a value outside the field's input range | Entry is rejected with a correction message | Not yet recorded |
| QA-08 | Boundaries | Enter exact lower and upper configured-band values | Both endpoints are labelled “Within configured band” | Not yet recorded |
| QA-17 | Configure bands | Set a lower value at or above the upper value and submit | The form rejects the invalid pair; a valid pair is saved locally | Not yet recorded |
| QA-09 | Wellbeing | Move all four sliders and save | Confirmation appears and values persist after reload | Not yet recorded |
| QA-10 | Persistence | Save readings and reload | The saved local state returns without invented readings | Not yet recorded |
| QA-11 | CSV export | Export mission log | A CSV downloads and contains the recorded entries | Not yet recorded |
| QA-12 | Clear log | Clear the log | Log empties; current readings remain unchanged | Not yet recorded |
| QA-13 | Reset demo | Load another scenario and select reset | Nominal values and default wellbeing values return | Not yet recorded |
| QA-14 | NASA source panel | Open Sources & limits | OSD-575 details and NASA source links are visible | Not yet recorded |
| QA-15 | Mobile layout | Test a narrow viewport | Tabs remain usable, cards stack, and page has no horizontal overflow | Not yet recorded |
| QA-16 | Offline shell | Load once online, then disable network and reload on localhost/HTTPS | App shell is served from cache; external links are unavailable offline | Not yet recorded |

## Defect report template

- **Bug ID:**
- **Test case:**
- **Date / browser / device:**
- **Build / commit:**
- **Steps to reproduce:**
- **Expected result:**
- **Actual result:**
- **Severity:** Critical / High / Medium / Low
- **Evidence:** screenshot, recording, or console output
- **Retest result:**

## Completion gate

The prototype is ready to demonstrate only after the team has run the browser tests, recorded actual results, fixed critical defects, verified all public links, and checked the application on the intended demo device. Passing unit tests alone is not enough.

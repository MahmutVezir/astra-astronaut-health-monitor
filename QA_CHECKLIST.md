# ASTRA Prototype — QA Checklist

**Tester / QA owner:** teammate  
**Developer:** Mahmut  
**Target:** Web prototype 0.1  
**Rule:** Record actual result, browser/device, date, and evidence for every test. Do not mark a test passed without executing it.

## Functional test cases

| ID | Test | Steps | Expected result |
|---|---|---|---|
| QA-01 | Initial dashboard | Open the site for the first time | Nominal demo loads; 4 signals are present; status is “Within personal reference”; demo-data label is visible |
| QA-02 | Baseline-shift scenario | Select “Baseline shift” | HR 101, SpO₂ 94.5, temperature 37.5, sleep 4.3; status changes to “Baseline deviation to review”; affected signals show “Review” |
| QA-03 | Incomplete-data scenario | Select “Incomplete data” | SpO₂ and temperature show “No data”; status becomes “Assessment is limited”; availability shows 2 / 4 |
| QA-04 | Missing manual input | Open Health signals, clear one field, run assessment | Cleared field is shown as “No data”; it is not silently replaced with a normal value |
| QA-05 | Personal-reference boundaries | Enter exact lower/upper bounds for each configured reference | Exact lower and upper bounds are “Within baseline”; one unit below/above is “Review” |
| QA-06 | Manual readings | Change all four numeric values and run assessment | Dashboard cards, status, assessment list, and chart update without page reload |
| QA-07 | Wellbeing self-report | Change all four sliders and save check-in | Confirmation appears; values are saved locally; a mission-log entry is created |
| QA-08 | Reload persistence | Save check-in and readings, then reload the page | Saved readings and self-report values return; no data is fabricated |
| QA-09 | CSV export | Select export | A CSV downloads and labels the values as simulated demo data |
| QA-10 | Mission log | Run a scenario and save a check-in, then open Mission log | Newest activity appears at the top with a timestamp and summary |
| QA-11 | Clear log | Select Clear log | Log becomes empty; current health readings are not changed |
| QA-12 | Reset demo | Change scenario, then select Reset demo | Default demo values and check-in sliders return; status is nominal |
| QA-13 | Source and limitation notes | Open Sources & limitations | Official challenge and NASA HRP links open; limitations are visible |
| QA-14 | Mobile layout | Test a narrow mobile viewport | Navigation remains usable; cards stack; no horizontal page overflow |

## Offline test

1. Open the app once while online and wait for the app shell to cache.
2. Disconnect the network and reload.
3. Verify that the application shell loads and local readings remain available.
4. Record any resources that do not work offline (for example, remote web fonts).

**Expected:** core HTML/CSS/JavaScript and locally stored demo data remain available after the first successful cache. This does not prove sensor connectivity or real-time mission operations.

## Defect report template

- **Bug ID:**
- **Test case:**
- **Device / browser:**
- **Build / commit:**
- **Steps to reproduce:**
- **Expected result:**
- **Actual result:**
- **Severity:** Critical / High / Medium / Low
- **Evidence:** screenshot, recording, or console output
- **Retest result:**

## Completion gate

A feature is complete only when its normal, missing-data, and relevant boundary cases have been tested; observed defects are recorded; fixes are retested; and no critical defect remains open.
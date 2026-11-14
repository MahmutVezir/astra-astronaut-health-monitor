# ASTRA — QA Checklist

**Build:** 0.1 prototype  
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

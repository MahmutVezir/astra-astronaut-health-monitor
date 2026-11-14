"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  makeSearchUrl, makeDetailUrl, makeFileDownloadUrl, parseDocumentList, collectMetadataHints, getRecordId, getRecordTitle,
  parseCsvTable, parseClockDurationMinutes, parseMonthDayYear, summarizeActigraphyCsv,
  summarizeBRSMCFCsv
} = require("../scripts/audit-nlsp-public-records.js");

test("search uses the observed NLSP experiments route and encodes the search term", () => {
  const url = new URL(makeSearchUrl("EXPERIMENTS", "DSO-470"));
  assert.equal(url.origin, "https://nlsp.nasa.gov");
  assert.equal(url.pathname, "/api/v1/data/experiments");
  assert.equal(url.searchParams.get("search"), "DSO-470");
  assert.equal(url.searchParams.get("limit"), "25");
});
test("dataset search uses the observed type mapping", () => {
  const url = new URL(makeSearchUrl("DATASETS", "BRSMACT Campaign 1 Actigraphy"));
  assert.equal(url.pathname, "/api/v1/data/datasets");
  assert.equal(url.searchParams.get("search"), "BRSMACT Campaign 1 Actigraphy");
});
test("search refuses blank terms and unsupported data types", () => {
  assert.throws(() => makeSearchUrl("EXPERIMENTS", " "));
  assert.throws(() => makeSearchUrl("HARDWARE", "blood pressure"));
});
test("detail request requires an actual returned record ID and encodes it", () => {
  const url = new URL(makeDetailUrl("EXPERIMENTS", "experiment/470"));
  assert.equal(url.pathname, "/api/v1/data/experiments/experiment%2F470/full");
  assert.throws(() => makeDetailUrl("EXPERIMENTS", ""));
  assert.throws(() => makeDetailUrl("UNKNOWN", "123"));
});
test("document parser accepts only documents/data arrays", () => {
  assert.deepEqual(parseDocumentList({ documents: [{ id: 1 }] }), [{ id: 1 }]);
  assert.deepEqual(parseDocumentList({ data: [{ id: 2 }] }), [{ id: 2 }]);
  assert.deepEqual(parseDocumentList({ results: [{ id: 3 }] }), []);
  assert.deepEqual(parseDocumentList(null), []);
});
test("record identity and title extraction preserve returned values", () => {
  assert.equal(getRecordId({ _id: "abc" }), "abc");
  assert.equal(getRecordTitle({ experiment_title: "DSO-470" }), "DSO-470");
  assert.equal(getRecordId({}), null);
});
test("file metadata hints preserve only values present in the record", () => {
  const record = {
    dataFiles: [{ file_name: "heart-rate.csv", remote_url: "https://nlsp.nasa.gov/files/heart-rate.csv" }],
    license: "CC0-1.0",
    participantCount: 12
  };
  const hints = collectMetadataHints(record);
  assert.ok(hints.some((item) => item.value === "heart-rate.csv"));
  assert.ok(hints.some((item) => item.value === "https://nlsp.nasa.gov/files/heart-rate.csv"));
  assert.ok(hints.some((item) => item.value === "CC0-1.0"));
  assert.equal(hints.some((item) => item.value === "12"), false);
});


test("actigraphy CSV parser handles BOM, CRLF, quoted commas and strict rectangular rows", () => {
  const parsed = parseCsvTable('\uFEFFid,note,value\r\n1,"alpha, beta",2.5\r\n');
  assert.deepEqual(parsed.headers, ["id", "note", "value"]);
  assert.equal(parsed.rows[0].note, "alpha, beta");
  assert.equal(parsed.rows[0].value, "2.5");
  assert.throws(() => parseCsvTable("a,b\n1\n"), /unexpected column count/);
  assert.throws(() => parseCsvTable('a,b\n1,"unfinished'), /unterminated quoted field/);
});

test("clock-duration parser respects HH:mm and HH:mm:ss values", () => {
  assert.equal(parseClockDurationMinutes("0:14"), 14);
  assert.equal(parseClockDurationMinutes("7:44"), 464);
  assert.equal(parseClockDurationMinutes("7:44:00"), 464);
  assert.equal(parseClockDurationMinutes("2:03:30"), 123.5);
  assert.equal(parseClockDurationMinutes("7:99"), null);
  assert.equal(parseClockDurationMinutes("NA"), null);
});

test("month/day/year parser rejects impossible dates and normalizes valid dates", () => {
  assert.equal(parseMonthDayYear("9/7/2004").iso, "2004-09-07");
  assert.equal(parseMonthDayYear("11/09/2004").iso, "2004-11-09");
  assert.equal(parseMonthDayYear("2/30/2004"), null);
  assert.equal(parseMonthDayYear("2004-09-07"), null);
});

test("BRSMACT schema audit reports actual participants, phases, date order, missingness and duplicates", () => {
  const csv = [
    "ID,Subject,Test_Phase,BR_Day,Date,Sleep Latency (hours),Sleep Duration (hours),Sleep Efficiency (%),Notes",
    '1,C1G0001,PRE_TEST,1,9/7/2004,0:14,7:44:00,92.1,NA',
    '2,C1G0001,IN_TEST,2,9/8/2004,0:06,7:50:00,95.8,NA',
    '3,C1G0002,IN_TEST,1,9/8/2004,NA,7:40:00,80.0,"note,with comma"',
    '4,C1G0002,POST_TEST,2,11/9/2004,0:30,7:20:00,,NA',
    '5,C1G0002,POST_TEST,3,11/9/2004,0:20,7:30:00,75.0,NA'
  ].join("\r\n");
  const result = summarizeActigraphyCsv(csv);
  assert.equal(result.row_count, 5);
  assert.equal(result.column_count, 9);
  assert.deepEqual(result.participant_ids, ["C1G0001", "C1G0002"]);
  assert.deepEqual(result.phase_counts, { PRE_TEST: 1, IN_TEST: 2, POST_TEST: 2 });
  assert.equal(result.observed_date_values_count, 3);
  assert.equal(result.earliest_date_iso, "2004-09-07");
  assert.equal(result.latest_date_iso, "2004-11-09");
  assert.equal(result.missing_counts["Sleep Latency (hours)"], 1);
  assert.equal(result.missing_counts["Sleep Efficiency (%)"], 1);
  assert.equal(result.sleep_latency.valid_count, 4);
  assert.equal(result.sleep_latency.minimum_minutes, 6);
  assert.equal(result.sleep_latency.maximum_minutes, 30);
  assert.equal(result.sleep_duration.valid_count, 5);
  assert.equal(result.sleep_duration.minimum_minutes, 440);
  assert.equal(result.sleep_duration.maximum_minutes, 470);
  assert.equal(result.sleep_efficiency.valid_count, 4);
  assert.equal(result.sleep_efficiency.minimum_percent, 75);
  assert.equal(result.sleep_efficiency.maximum_percent, 95.8);
  assert.equal(result.duplicate_subject_date_pairs, 1);
});


test("file download URLs use the observed NLSP same-origin download route", () => {
  const url = new URL(makeFileDownloadUrl("file/id with spaces"));
  assert.equal(url.origin, "https://nlsp.nasa.gov");
  assert.equal(url.pathname, "/api/v1/files/file%2Fid%20with%20spaces/download");
  assert.throws(() => makeFileDownloadUrl(" "));
});


test("BRSMCF participant CSV audit summarizes cohort, phases, dates and named cardiac variables without inferring units", () => {
  const csv = [
    "ID,Campaign,Subject,Test_Phase,BR_Day,Date,SBP,DBP,EF pre,SV pre,CO pre",
    "1,C3A,101,PRE_TEST,5,9/3/2004,110,70,62.4,46.3,3.43",
    "2,C3A,101,IN_TEST,10,9/8/2004,108,68,64.2,48.0,3.55",
    "3,C3B,202,POST_TEST,15,9/13/2004,114,72,NA,50.1,#DIV/0!"
  ].join("\r\n");
  const result = summarizeBRSMCFCsv(csv);
  assert.equal(result.row_count, 3);
  assert.equal(result.column_count, 11);
  assert.equal(result.record_granularity, "PARTICIPANT_LEVEL_ROWS");
  assert.deepEqual(result.participant_ids, ["101", "202"]);
  assert.deepEqual(result.phase_counts, { PRE_TEST: 1, IN_TEST: 1, POST_TEST: 1 });
  assert.deepEqual(result.campaign_counts, { C3A: 2, C3B: 1 });
  assert.equal(result.earliest_date_iso, "2004-09-03");
  assert.equal(result.latest_date_iso, "2004-09-13");
  assert.equal(result.candidate_numeric_metrics.SBP.minimum, 108);
  assert.equal(result.candidate_numeric_metrics.SBP.maximum, 114);
  assert.equal(result.candidate_numeric_metrics["EF pre"].valid_numeric_count, 2);
  assert.equal(result.candidate_numeric_metrics["EF pre"].missing_or_non_numeric_count, 1);
  assert.equal(result.candidate_numeric_metrics["EF pre"].unit, "NOT_INFERRED_FROM_COLUMN_NAME");
  assert.equal(result.nonnumeric_error_token_count, 1);
  assert.equal(result.units_inferred, false);
});

test("BRSMCF average-file audit identifies period aggregates rather than participant records", () => {
  const csv = [
    "ID,Period Covered,Statistic,EF pre,SV pre",
    "1,BR-5 to BR-4,AVERAGE,62.1,44.2",
    "2,BR-4 to BR-3,AVERAGE,60.7,42.9"
  ].join("\n");
  const result = summarizeBRSMCFCsv(csv);
  assert.equal(result.record_granularity, "PERIOD_AGGREGATE_ROWS");
  assert.equal(result.participant_count, 0);
  assert.deepEqual(result.period_values, ["BR-4 to BR-3", "BR-5 to BR-4"]);
  assert.deepEqual(result.statistic_counts, { AVERAGE: 2 });
});

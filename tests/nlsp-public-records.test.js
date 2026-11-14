"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  makeSearchUrl, makeDetailUrl, parseDocumentList, collectMetadataHints, getRecordId, getRecordTitle
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

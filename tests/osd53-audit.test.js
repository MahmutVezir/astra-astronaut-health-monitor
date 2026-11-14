"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getStudyRecord,
  isNumericVersion,
  findExplicitLicense,
  summarizeFiles,
  selectExactPublicFile,
  EXPECTED_FILES,
  MAX_ARCHIVE_BYTES
} = require("../scripts/audit-osd53.js");

test("requires the exact OSD-53 identifier in NASA metadata", () => {
  const payload = { study: { "OSD-53": {
    version: 3,
    studies: [{ identifier: "OSD-53", title: "Study title" }]
  } } };
  assert.equal(getStudyRecord(payload).record.identifier, "OSD-53");
  assert.throws(() => getStudyRecord({ study: {} }), /does not contain study/);
});

test("accepts only numeric OSDR version strings", () => {
  assert.equal(isNumericVersion("3"), true);
  assert.equal(isNumericVersion("12"), true);
  assert.equal(isNumericVersion("3-beta"), false);
  assert.equal(isNumericVersion(""), false);
  assert.equal(isNumericVersion(null), false);
});

test("does not invent a license when metadata omits one", () => {
  assert.equal(findExplicitLicense({ study: { "OSD-53": { title: "Study" } } }), null);
  assert.equal(findExplicitLicense({ rights: { license: "CC0-1.0" } }), "CC0-1.0");
  assert.equal(findExplicitLicense({ items: [{ name: "License", value: "CC-BY-4.0" }] }), "CC-BY-4.0");
});

test("summarizes public, restricted and unknown file access separately", () => {
  const result = summarizeFiles([
    { file_name: "public.zip", file_size: 100, restricted: false, remote_url: "https://osdr.nasa.gov/a" },
    { file_name: "private.zip", file_size: 200, restricted: true, remote_url: "https://osdr.nasa.gov/b" },
    { file_name: "unknown.zip", file_size: null }
  ]);
  assert.equal(result.record_count, 3);
  assert.equal(result.public_count, 1);
  assert.equal(result.restricted_count, 1);
  assert.equal(result.unknown_access_count, 1);
  assert.equal(result.files[2].file_size_bytes, null);
});

test("expected OSD-53 archive names are unique", () => {
  assert.equal(new Set(EXPECTED_FILES).size, EXPECTED_FILES.length);
  assert.equal(EXPECTED_FILES.length, 3);
});

test("selects only one exact catalog filename explicitly marked public", () => {
  const expected = EXPECTED_FILES[0];
  const record = { file_name: expected, restricted: false, file_size: 100, remote_url: "https://osdr.nasa.gov/download" };
  assert.equal(selectExactPublicFile([record], expected), record);
  assert.throws(() => selectExactPublicFile([], expected), /found 0/);
  assert.throws(() => selectExactPublicFile([record, { ...record }], expected), /found 2/);
});

test("refuses restricted, unknown, oversized and URL-less OSD-53 files", () => {
  const expected = EXPECTED_FILES[0];
  const base = { file_name: expected, restricted: false, file_size: 100, remote_url: "https://osdr.nasa.gov/download" };
  assert.throws(() => selectExactPublicFile([{ ...base, restricted: true }], expected), /not explicitly mark it unrestricted/);
  assert.throws(() => selectExactPublicFile([{ ...base, restricted: null }], expected), /not explicitly mark it unrestricted/);
  assert.throws(() => selectExactPublicFile([{ ...base, file_size: MAX_ARCHIVE_BYTES + 1 }], expected), /exceeds the 25 MiB audit limit/);
  assert.throws(() => selectExactPublicFile([{ ...base, remote_url: null }], expected), /no remote URL/);
});

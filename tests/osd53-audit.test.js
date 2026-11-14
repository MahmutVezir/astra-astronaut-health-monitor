"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getStudyRecord,
  isNumericVersion,
  findExplicitLicense,
  summarizeFiles
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
    { file_name: "unknown.zip", file_size: 300 }
  ]);
  assert.equal(result.record_count, 3);
  assert.equal(result.public_count, 1);
  assert.equal(result.restricted_count, 1);
  assert.equal(result.unknown_access_count, 1);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash, webcrypto } = require("node:crypto");
const {
  parseCsv,
  loadOds575Evidence
} = require("../research-data-loader.js");

const TIMEPOINTS = [
  { code: "L-92", label: "Launch minus 92" },
  { code: "L-44", label: "Launch minus 44" },
  { code: "L-3", label: "Launch minus 3" },
  { code: "R+1", label: "Return plus 1" },
  { code: "R+45", label: "Return plus 45" },
  { code: "R+82", label: "Return plus 82" },
  { code: "R+194", label: "Return plus 194" }
];

const MARKERS = [
  ["a2_macroglobulin", "nanogram"],
  ["agp", "nanogram"],
  ["crp", "picogram"],
  ["fetuin_a36", "nanogram"],
  ["fibrinogen", "nanogram"],
  ["haptoglobin", "nanogram"],
  ["l_selectin", "picogram"],
  ["pf4", "nanogram"],
  ["sap", "picogram"]
];

function buildFixture() {
  const headers = ["Sample Name"];
  MARKERS.forEach(([stem, unit]) => {
    headers.push(stem + "_concentration_" + unit + "_per_milliliter");
    headers.push(stem + "_percent");
  });

  const rows = [];
  const metadataRecords = [];
  for (let participantIndex = 1; participantIndex <= 4; participantIndex += 1) {
    const participant = "C00" + participantIndex;
    for (let timeIndex = 0; timeIndex < TIMEPOINTS.length; timeIndex += 1) {
      const timepoint = TIMEPOINTS[timeIndex];
      const sampleName = participant + "_serum_" + timepoint.code;
      metadataRecords.push({
        source_name: participant,
        sample_name: sampleName,
        time_label: timepoint.label
      });
      const row = { "Sample Name": sampleName };
      MARKERS.forEach(([stem, unit], markerIndex) => {
        const column = stem + "_concentration_" + unit + "_per_milliliter";
        const value = 1000 + markerIndex * 100 + participantIndex * 13 + timeIndex * (7 + markerIndex);
        row[column] = String(value);
      });
      rows.push(row);
    }
  }

  MARKERS.forEach(([stem, unit]) => {
    const concentrationColumn = stem + "_concentration_" + unit + "_per_milliliter";
    const baselineValues = rows
      .filter((row) => metadataRecords.some((record) =>
        record.sample_name === row["Sample Name"] && record.time_label.startsWith("Launch minus")
      ))
      .map((row) => Number(row[concentrationColumn]));
    const baselineMean = baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length;
    rows.forEach((row) => {
      row[stem + "_percent"] = (100 * Number(row[concentrationColumn]) / baselineMean).toFixed(8);
    });
  });

  const csvLines = [headers.join(",")];
  rows.forEach((row) => {
    csvLines.push(headers.map((header) => row[header]).join(","));
  });
  const csvText = "\uFEFF" + csvLines.join("\r\n") + "\r\n";
  const csvBytes = Buffer.from(csvText, "utf8");
  const sha256 = createHash("sha256").update(csvBytes).digest("hex");
  const metadata = {
    dataset_id: "OSD-575",
    dataset_version: "3",
    records: metadataRecords
  };
  const audit = {
    dataset_id: "OSD-575",
    dataset_version: "3",
    sha256,
    sha256_is_project_maintained_pin_not_nasa_signature: true,
    metadata_sample_join: "PASS",
    normalization_audit: { status: "PASS", analyte_count: 9 },
    scientific_decision: "LIMITED_EVIDENCE"
  };
  const evidence = {
    csvPath: "/source.csv",
    metadataPath: "/isa-sample-map.json",
    auditPath: "/source-audit.json",
    sha256
  };

  const fetchImpl = async (url) => {
    if (url === evidence.csvPath) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => csvBytes.buffer.slice(
          csvBytes.byteOffset,
          csvBytes.byteOffset + csvBytes.byteLength
        )
      };
    }
    if (url === evidence.metadataPath) {
      return { ok: true, status: 200, json: async () => structuredClone(metadata) };
    }
    if (url === evidence.auditPath) {
      return { ok: true, status: 200, json: async () => structuredClone(audit) };
    }
    throw new Error("Unexpected fixture request: " + url);
  };

  return { headers, rows, csvBytes, sha256, metadata, audit, evidence, fetchImpl };
}

test("browser CSV parser handles UTF-8 BOM, CRLF, commas and escaped quotes", () => {
  const parsed = parseCsv('\uFEFFid,note,value\r\n1,"alpha, ""beta""",2.5\r\n');
  assert.deepEqual(parsed.headers, ["id", "note", "value"]);
  assert.equal(parsed.rows[0].note, 'alpha, "beta"');
  assert.equal(parsed.rows[0].value, "2.5");
});

test("browser parser rejects ragged rows and unterminated quoted fields", () => {
  assert.throws(() => parseCsv("a,b\n1\n"), /columns; expected/);
  assert.throws(() => parseCsv('a,b\n1,"unterminated'), /unterminated/);
});

test("verified OSD-575 browser loader maps all samples and validates nine baseline-normalized markers", async () => {
  const fixture = buildFixture();
  const result = await loadOds575Evidence({
    evidence: fixture.evidence,
    fetchImpl: fixture.fetchImpl,
    cryptoImpl: webcrypto
  });

  assert.equal(result.datasetId, "OSD-575");
  assert.equal(result.datasetVersion, "3");
  assert.equal(result.fileBytes, fixture.csvBytes.length);
  assert.equal(result.sha256, fixture.sha256);
  assert.equal(result.rowCount, 28);
  assert.equal(result.columnCount, 19);
  assert.equal(result.matchedSampleCount, 28);
  assert.equal(result.metadataSampleCount, 28);
  assert.deepEqual(result.participantIds, ["C001", "C002", "C003", "C004"]);
  assert.deepEqual(result.timepoints, ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]);
  assert.equal(result.measurementCellCount, 252);
  assert.equal(result.normalizationAudit.status, "PASS");
  assert.equal(result.normalizationAudit.baselineSampleCount, 12);
  assert.equal(result.normalizationAudit.analyteCount, 9);
  assert.equal(result.markers.length, 9);
  assert.ok(result.markers.every((marker) => marker.normalizationMaxAbsoluteError <= 1e-6));
  assert.deepEqual(result.markers[0].participants.C001.map((point) => point.timepoint), result.timepoints);
  assert.equal(result.markers.find((marker) => marker.id === "fibrinogen").flaggedForInterpretation, true);
  assert.equal(result.markers.find((marker) => marker.id === "crp").unit, "pg/mL");
});

test("browser loader refuses source bytes with a mismatched SHA-256 pin", async () => {
  const fixture = buildFixture();
  await assert.rejects(
    () => loadOds575Evidence({
      evidence: fixture.evidence,
      expectedSha256: "0".repeat(64),
      fetchImpl: fixture.fetchImpl,
      cryptoImpl: webcrypto
    }),
    /does not match the reviewed project pin/
  );
});

test("browser loader refuses a CSV row that cannot be joined to NASA ISA sample metadata", async () => {
  const fixture = buildFixture();
  const metadataPath = fixture.evidence.metadataPath;
  const originalFetch = fixture.fetchImpl;
  const fetchImpl = async (url, options) => {
    const response = await originalFetch(url, options);
    if (url !== metadataPath) return response;
    const payload = await response.json();
    payload.records[0].sample_name = "C999_serum_L-92";
    return { ok: true, status: 200, json: async () => payload };
  };

  await assert.rejects(
    () => loadOds575Evidence({
      evidence: fixture.evidence,
      fetchImpl,
      cryptoImpl: webcrypto
    }),
    /cannot be uniquely joined to NASA ISA sample metadata/
  );
});

test("browser loader refuses a post-download audit that has not passed normalization QA", async () => {
  const fixture = buildFixture();
  const auditPath = fixture.evidence.auditPath;
  const originalFetch = fixture.fetchImpl;
  const fetchImpl = async (url, options) => {
    const response = await originalFetch(url, options);
    if (url !== auditPath) return response;
    const payload = await response.json();
    payload.normalization_audit.status = "NOT_VERIFIABLE";
    return { ok: true, status: 200, json: async () => payload };
  };

  await assert.rejects(
    () => loadOds575Evidence({
      evidence: fixture.evidence,
      fetchImpl,
      cryptoImpl: webcrypto
    }),
    /does not verify the exact source, metadata join, normalization/
  );
});

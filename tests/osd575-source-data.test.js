"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const { loadOds575Evidence } = require("../research-data-loader.js");

const root = path.resolve(__dirname, "..", "data", "osdr", "OSD-575");
const evidenceSha = () => "fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c";
const csvPath = path.join(root, "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv");
const metadataPath = path.join(root, "isa-sample-map.json");
const auditPath = path.join(root, "source-audit.json");
const rawMetadataPath = path.join(root, "raw-metadata-response.json");
const rawCatalogPath = path.join(root, "raw-file-catalog-response.json");
const manifestPath = path.join(root, "live-audit", "manifest.json");
const pilotPath = path.join(root, "live-audit", "pilot-report.json");

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const sourceFilesAvailable = Promise.all([
  exists(csvPath),
  exists(metadataPath),
  exists(auditPath),
  exists(rawMetadataPath),
  exists(rawCatalogPath),
  exists(manifestPath),
  exists(pilotPath)
]).then((values) => values.every(Boolean));

test("committed NASA OSD-575 source bytes pass hash, sample-join and normalization verification", async (t) => {
  if (!await sourceFilesAvailable) {
    t.skip("The post-mapping live NASA artifact has not yet been imported to this branch.");
    return;
  }

  const csvBytes = await fs.readFile(csvPath);
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
  const rawMetadataEnvelope = JSON.parse(await fs.readFile(rawMetadataPath, "utf8"));
  const rawCatalogEnvelope = JSON.parse(await fs.readFile(rawCatalogPath, "utf8"));
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const pilot = JSON.parse(await fs.readFile(pilotPath, "utf8"));

  const metadataBody = Array.isArray(rawMetadataEnvelope)
    ? rawMetadataEnvelope.find((item) => item && item.body && typeof item.body === "object")?.body
    : rawMetadataEnvelope;
  assert.ok(metadataBody, "the raw NASA metadata response must preserve its JSON body");
  const study = metadataBody.study?.["OSD-575"];
  const sampleTables = Object.values(study?.additionalInformation?.samples || {});
  const sampleTable = sampleTables.find((table) => {
    const titles = new Set((table.header || []).map((item) => item.title));
    return titles.has("Source Name") && titles.has("Sample Name") && titles.has("Factor Value: Time");
  });
  assert.ok(sampleTable, "the raw NASA ISA sample table must be preserved");
  const fieldMap = Object.fromEntries(sampleTable.header.map((item) => [item.title, item.field]));
  const rawSampleNames = sampleTable.raw.map((row) => row[fieldMap["Sample Name"]]);
  assert.equal(rawSampleNames.length, 28);
  assert.deepEqual([...rawSampleNames].sort(), metadata.records.map((item) => item.sample_name).sort());
  assert.ok(Array.isArray(rawCatalogEnvelope) && rawCatalogEnvelope.length > 0);

  assert.equal(manifest.file_name, path.basename(csvPath));
  assert.equal(manifest.file_sha256, evidenceSha());
  assert.equal(manifest.byte_length, 6207);
  assert.equal(manifest.raw_bytes_preserved, true);
  assert.equal(manifest.download_response?.final_host, "genelab-alsda-repo-prod.s3.amazonaws.com");
  assert.equal(manifest.download_response?.http_status, 200);
  assert.equal(pilot.analysis_gate?.data_pipeline_completed, true);
  assert.equal(pilot.row_mapping_provenance?.full_study_sample_coverage, true);
  assert.equal(pilot.baseline_percent_normalization_audit?.status, "PASS");
  const evidence = {
    csvPath,
    metadataPath,
    auditPath,
    sha256: evidenceSha()
  };

  const fetchImpl = async (url) => {
    const filePath = String(url);
    if (filePath === csvPath) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => csvBytes.buffer.slice(
          csvBytes.byteOffset,
          csvBytes.byteOffset + csvBytes.byteLength
        )
      };
    }
    if (filePath === metadataPath) {
      return { ok: true, status: 200, json: async () => metadata };
    }
    if (filePath === auditPath) {
      return { ok: true, status: 200, json: async () => audit };
    }
    throw new Error("Unexpected source-data test request: " + filePath);
  };

  const result = await loadOds575Evidence({
    evidence,
    fetchImpl,
    cryptoImpl: webcrypto
  });

  assert.equal(result.fileBytes, 6207);
  assert.equal(result.sha256, evidence.sha256);
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
  assert.ok(result.normalizationAudit.maxAbsoluteError < 5e-8);
  assert.ok(result.markers.every((marker) => marker.normalizationMaxAbsoluteError < 5e-8));
  assert.ok(result.participantIds.every((participant) => result.markers[0].participants[participant].length === 7));
  assert.equal(result.markers.find((marker) => marker.id === "fibrinogen").flaggedForInterpretation, true);
  assert.equal(audit.metadata_sample_join, "PASS");
  assert.equal(audit.scientific_decision, "LIMITED_EVIDENCE");
});

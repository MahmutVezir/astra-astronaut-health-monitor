"use strict";

const { fetchStudyMetadata, listStudyFiles, selectStudyFile, downloadStudyFile } = require("./osdr-client.js");
const { parseCsv } = require("./csv.js");
const { verifySha256 } = require("./integrity.js");
const { evaluateEvidence } = require("./evidence-engine.js");
const { createTraceRecord } = require("./trace-contract.js");

const OSD575 = Object.freeze({
  dataset_id: "OSD-575",
  dataset_version: "3",
  source_url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
  license: "CC0-1.0",
  participant_count: 4,
  sample_count: 28,
  measurement_type: "Serum multiplex immunoassay; Eve Technologies HDCVD9 cardiovascular-related cytokine/protein panel; transformed assay values only.",
  timepoints: ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"],
  analysis_question: "Does the OSD-575 HDCVD9 transformed serum panel contain sufficiently traceable repeated measurements for a descriptive, participant-level timepoint summary? This is not a disease-risk, diagnosis or event-prediction question."
});

function buildRecord(fileSha256, decision, decisionReasons) {
  return createTraceRecord({
    ...OSD575,
    file_sha256: fileSha256,
    decision,
    decision_reasons: decisionReasons
  });
}

async function runOsd575Pilot(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const fileName = options.fileName || "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
  const columnMap = options.columnMap || null;
  const expectedSha256 = options.expectedSha256 || null;

  if (typeof fetchImpl !== "function") {
    return buildRecord(null, "INSUFFICIENT_EVIDENCE", [{
      code: "FETCH_UNAVAILABLE",
      message: "This Node.js runtime does not provide fetch; no OSDR request or download was performed."
    }]);
  }

  try {
    const metadata = await fetchStudyMetadata(OSD575.dataset_id, fetchImpl);
    const studyEntry = metadata && metadata.study && metadata.study[OSD575.dataset_id];
    if (!studyEntry || typeof studyEntry !== "object") {
      throw new Error(`The metadata response did not contain study.${OSD575.dataset_id}`);
    }
  } catch (error) {
    return buildRecord(null, "INSUFFICIENT_EVIDENCE", [{
      code: "OSDR_STUDY_METADATA_UNAVAILABLE",
      message: `The OSDR study metadata could not be verified: ${error.message}`
    }]);
  }

  let fileRecords;
  try {
    fileRecords = await listStudyFiles(OSD575.dataset_id, { fetchImpl });
  } catch (error) {
    return buildRecord(null, "INSUFFICIENT_EVIDENCE", [{
      code: "OSDR_FILE_CATALOG_UNAVAILABLE",
      message: `The OSDR file catalog could not be verified: ${error.message}`
    }]);
  }

  const fileRecord = selectStudyFile(fileRecords, fileName);
  if (!fileRecord) {
    return buildRecord(null, "INSUFFICIENT_EVIDENCE", [{
      code: "REQUESTED_FILE_NOT_IN_CATALOG",
      message: `The exact file ${fileName} was not found in the OSDR file catalog response. No substitute file was selected.`
    }]);
  }

  let downloaded;
  try {
    downloaded = await downloadStudyFile(fileRecord, fetchImpl);
  } catch (error) {
    return buildRecord(null, "INSUFFICIENT_EVIDENCE", [{
      code: "OSDR_DOWNLOAD_UNAVAILABLE",
      message: `The selected OSDR file could not be downloaded and verified: ${error.message}`
    }]);
  }

  const integrity = verifySha256(downloaded.bytes, expectedSha256);
  if (integrity.verified && !integrity.matches) {
    return buildRecord(integrity.actualSha256, "INVALID_DATA", [{
      code: "SHA256_MISMATCH",
      message: `Downloaded bytes do not match the frozen reference SHA-256 ${integrity.expectedSha256}.`
    }]);
  }

  let parsed;
  try {
    parsed = parseCsv(downloaded.bytes.toString("utf8"));
  } catch (error) {
    return buildRecord(integrity.actualSha256, "INVALID_DATA", [{
      code: "CSV_PARSE_FAILED",
      message: `The downloaded file cannot be parsed as a rectangular CSV table: ${error.message}`
    }]);
  }

  const evidence = evaluateEvidence({
    rows: parsed.rows,
    headers: parsed.headers,
    columnMap,
    expectedParticipantCount: OSD575.participant_count,
    expectedSampleCount: OSD575.sample_count,
    minIndependentParticipants: options.minIndependentParticipants || 10,
    rawDataAvailable: false
  });

  const decisionReasons = evidence.decision_reasons.slice();
  let decision = evidence.decision;
  if (!integrity.verified) {
    decisionReasons.push({
      code: "SHA256_NOT_PINNED",
      message: "A SHA-256 digest was calculated, but no independently frozen reference digest was supplied for comparison. Save this digest in a reviewed manifest before treating later downloads as reproducible."
    });
    if (decision === "ANALYZABLE") decision = "LIMITED_EVIDENCE";
  }

  return buildRecord(integrity.actualSha256, decision, decisionReasons);
}

module.exports = { OSD575, runOsd575Pilot };

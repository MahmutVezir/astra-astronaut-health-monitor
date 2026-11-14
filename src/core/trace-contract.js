"use strict";

const DECISIONS = Object.freeze([
  "ANALYZABLE",
  "LIMITED_EVIDENCE",
  "INSUFFICIENT_EVIDENCE",
  "INVALID_DATA"
]);

const REQUIRED_FIELDS = Object.freeze([
  "dataset_id",
  "dataset_version",
  "source_url",
  "license",
  "file_sha256",
  "participant_count",
  "sample_count",
  "measurement_type",
  "timepoints",
  "analysis_question",
  "decision",
  "decision_reasons"
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateTraceRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, errors: ["record must be a plain object"] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  for (const field of [
    "dataset_id",
    "dataset_version",
    "source_url",
    "license",
    "measurement_type",
    "analysis_question"
  ]) {
    if (Object.prototype.hasOwnProperty.call(record, field) && !isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (isNonEmptyString(record.dataset_id) && !/^OSD-\d+$/.test(record.dataset_id)) {
    errors.push("dataset_id must use the OSD-<number> format");
  }

  if (isNonEmptyString(record.source_url)) {
    try {
      const source = new URL(record.source_url);
      if (source.protocol !== "https:") errors.push("source_url must use HTTPS");
    } catch (_) {
      errors.push("source_url must be a valid URL");
    }
  }

  if (Object.prototype.hasOwnProperty.call(record, "file_sha256") &&
      record.file_sha256 !== null &&
      (typeof record.file_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.file_sha256))) {
    errors.push("file_sha256 must be null or a lowercase 64-character SHA-256 digest");
  }

  for (const field of ["participant_count", "sample_count"]) {
    if (Object.prototype.hasOwnProperty.call(record, field) &&
        record[field] !== null &&
        (!Number.isInteger(record[field]) || record[field] < 0)) {
      errors.push(`${field} must be a non-negative integer or null`);
    }
  }

  if (Number.isInteger(record.participant_count) &&
      Number.isInteger(record.sample_count) &&
      record.participant_count > record.sample_count) {
    errors.push("participant_count cannot exceed sample_count");
  }

  if (Object.prototype.hasOwnProperty.call(record, "timepoints") &&
      (!Array.isArray(record.timepoints) ||
       record.timepoints.some((value) => !isNonEmptyString(value)))) {
    errors.push("timepoints must be an array of non-empty strings");
  }

  if (Object.prototype.hasOwnProperty.call(record, "decision") &&
      !DECISIONS.includes(record.decision)) {
    errors.push(`decision must be one of: ${DECISIONS.join(" | ")}`);
  }

  if (Object.prototype.hasOwnProperty.call(record, "decision_reasons")) {
    if (!Array.isArray(record.decision_reasons)) {
      errors.push("decision_reasons must be an array");
    } else {
      record.decision_reasons.forEach((reason, index) => {
        if (!reason || typeof reason !== "object" ||
            !isNonEmptyString(reason.code) || !isNonEmptyString(reason.message)) {
          errors.push(`decision_reasons[${index}] must contain non-empty code and message fields`);
        }
      });
      if (record.decision !== "ANALYZABLE" && record.decision_reasons.length === 0) {
        errors.push("non-ANALYZABLE decisions require at least one reason");
      }
      if (record.decision === "ANALYZABLE" && record.decision_reasons.length > 0) {
        errors.push("ANALYZABLE decisions must not contain blocking decision reasons");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function createTraceRecord(input) {
  const record = {};
  for (const field of REQUIRED_FIELDS) record[field] = input[field];

  const validation = validateTraceRecord(record);
  if (!validation.valid) {
    throw new TypeError(`Invalid trace record: ${validation.errors.join("; ")}`);
  }
  return Object.freeze(record);
}

module.exports = {
  DECISIONS,
  REQUIRED_FIELDS,
  validateTraceRecord,
  createTraceRecord
};

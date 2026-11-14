"use strict";

const { DECISIONS } = require("./trace-contract.js");

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== ""))];
}

function hasNumericValue(value) {
  if (typeof value === "string" && value.trim() === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric);
}

function reason(code, message) {
  return { code, message };
}

function evaluateEvidence(options) {
  const input = options || {};
  const rows = input.rows;
  const headers = Array.isArray(input.headers) ? input.headers : [];
  const columnMap = input.columnMap || {};
  const minIndependentParticipants = Number.isInteger(input.minIndependentParticipants)
    ? input.minIndependentParticipants
    : 10;
  const expectedParticipantCount = Number.isInteger(input.expectedParticipantCount)
    ? input.expectedParticipantCount
    : null;
  const expectedSampleCount = Number.isInteger(input.expectedSampleCount)
    ? input.expectedSampleCount
    : null;

  const invalidReasons = [];
  const insufficientReasons = [];
  const limitedReasons = [];

  if (!Array.isArray(rows) || rows.length === 0) {
    insufficientReasons.push(reason("NO_DATA_ROWS", "The downloaded file contains no data rows."));
    return { decision: "INSUFFICIENT_EVIDENCE", decision_reasons: insufficientReasons };
  }

  const requiredColumns = [columnMap.participant, columnMap.sample, columnMap.timepoint];
  const measurementColumns = Array.isArray(columnMap.measurement) ? columnMap.measurement : [];
  if (requiredColumns.some((column) => typeof column !== "string" || column.trim() === "") ||
      measurementColumns.length === 0) {
    insufficientReasons.push(reason(
      "COLUMN_MAPPING_REQUIRED",
      "Participant, sample, timepoint and at least one measured-value column must be mapped explicitly from the downloaded file header."
    ));
    return { decision: "INSUFFICIENT_EVIDENCE", decision_reasons: insufficientReasons };
  }

  const requestedColumns = [...requiredColumns, ...measurementColumns];
  const absentColumns = unique(requestedColumns).filter((column) => !headers.includes(column));
  if (absentColumns.length > 0) {
    insufficientReasons.push(reason(
      "MAPPED_COLUMNS_NOT_FOUND",
      `The supplied column map does not match the file header: ${absentColumns.join(", ")}.`
    ));
    return { decision: "INSUFFICIENT_EVIDENCE", decision_reasons: insufficientReasons };
  }

  const participants = unique(rows.map((row) => clean(row[columnMap.participant])));
  const samples = unique(rows.map((row) => clean(row[columnMap.sample])));
  const timepoints = unique(rows.map((row) => clean(row[columnMap.timepoint])));
  const completeRows = rows.filter((row) =>
    clean(row[columnMap.participant]) !== "" &&
    clean(row[columnMap.sample]) !== "" &&
    clean(row[columnMap.timepoint]) !== ""
  );

  if (participants.length === 0 || samples.length === 0 || timepoints.length === 0) {
    insufficientReasons.push(reason(
      "TRACEABILITY_COLUMNS_EMPTY",
      "Participant, sample or timepoint identifiers are empty; participant-level traceability cannot be established."
    ));
  }

  if (expectedParticipantCount !== null && participants.length > expectedParticipantCount) {
    invalidReasons.push(reason(
      "PARTICIPANT_COUNT_EXCEEDS_METADATA",
      `The file contains ${participants.length} participant identifiers, exceeding the study metadata count of ${expectedParticipantCount}.`
    ));
  }

  if (expectedSampleCount !== null && samples.length > expectedSampleCount) {
    invalidReasons.push(reason(
      "SAMPLE_COUNT_EXCEEDS_METADATA",
      `The file contains ${samples.length} distinct sample identifiers, exceeding the study metadata count of ${expectedSampleCount}.`
    ));
  }

  if (completeRows.length < rows.length) {
    limitedReasons.push(reason(
      "INCOMPLETE_ROW_IDENTIFIERS",
      `${rows.length - completeRows.length} row(s) lack a participant, sample or timepoint identifier and are excluded from paired-timepoint checks.`
    ));
  }

  let numericCells = 0;
  let measuredCells = 0;
  for (const row of rows) {
    for (const column of measurementColumns) {
      measuredCells += 1;
      if (hasNumericValue(row[column])) numericCells += 1;
    }
  }

  if (numericCells === 0) {
    insufficientReasons.push(reason(
      "NO_NUMERIC_MEASUREMENTS",
      "No numeric measurement values were found in the mapped assay columns."
    ));
  }

  const timepointsByParticipant = new Map();
  for (const row of completeRows) {
    const hasMeasurement = measurementColumns.some((column) => hasNumericValue(row[column]));
    if (!hasMeasurement) continue;
    const participant = clean(row[columnMap.participant]);
    const timepoint = clean(row[columnMap.timepoint]);
    if (!timepointsByParticipant.has(participant)) timepointsByParticipant.set(participant, new Set());
    timepointsByParticipant.get(participant).add(timepoint);
  }

  const pairedParticipants = [...timepointsByParticipant.values()].filter((values) => values.size >= 2).length;
  if (pairedParticipants < 2) {
    insufficientReasons.push(reason(
      "INSUFFICIENT_PAIRED_TIMEPOINTS",
      "At least two independent participants must each have numeric observations at two or more distinct timepoints for the requested within-participant comparison."
    ));
  }

  if (participants.length < minIndependentParticipants) {
    limitedReasons.push(reason(
      "LOW_INDEPENDENT_PARTICIPANT_COUNT",
      `Only ${participants.length} independent participant(s) were observed; the exploratory descriptive threshold is ${minIndependentParticipants}. Repeated samples do not increase the independent participant count.`
    ));
  }

  if (expectedParticipantCount !== null && participants.length < expectedParticipantCount) {
    limitedReasons.push(reason(
      "PARTICIPANT_COVERAGE_BELOW_STUDY_TOTAL",
      `The selected file covers ${participants.length} of ${expectedParticipantCount} study participants.`
    ));
  }

  if (expectedSampleCount !== null && samples.length < expectedSampleCount) {
    limitedReasons.push(reason(
      "SAMPLE_COVERAGE_BELOW_STUDY_TOTAL",
      `The selected file covers ${samples.length} distinct samples against ${expectedSampleCount} samples listed for the full study; assay-specific coverage must not be mistaken for full-study coverage.`
    ));
  }

  if (measuredCells > 0 && numericCells / measuredCells < 0.8) {
    limitedReasons.push(reason(
      "HIGH_MEASUREMENT_MISSINGNESS",
      `Only ${(100 * numericCells / measuredCells).toFixed(1)}% of mapped measurement cells are numeric; missingness may bias descriptive summaries.`
    ));
  }

  if (input.rawDataAvailable === false) {
    limitedReasons.push(reason(
      "RAW_ASSAY_DATA_NOT_AVAILABLE",
      "The selected assay is represented by submitted/transformed results; raw assay files are not listed as available for this pilot target. Conclusions must be limited to the supplied processed values."
    ));
  } else if (input.rawDataAvailable !== true) {
    limitedReasons.push(reason(
      "RAW_DATA_STATUS_UNVERIFIED",
      "Raw-data availability has not been independently verified for the selected assay."
    ));
  }

  let decision = "ANALYZABLE";
  let decisionReasons = [];
  if (invalidReasons.length > 0) {
    decision = "INVALID_DATA";
    decisionReasons = invalidReasons;
  } else if (insufficientReasons.length > 0) {
    decision = "INSUFFICIENT_EVIDENCE";
    decisionReasons = insufficientReasons.concat(limitedReasons);
  } else if (limitedReasons.length > 0) {
    decision = "LIMITED_EVIDENCE";
    decisionReasons = limitedReasons;
  }

  if (!DECISIONS.includes(decision)) throw new Error("Evidence engine emitted an unsupported decision");

  return {
    decision,
    decision_reasons: decisionReasons,
    observed_participant_count: participants.length,
    observed_sample_count: samples.length,
    observed_timepoints: timepoints,
    paired_participant_count: pairedParticipants,
    numeric_measurement_cells: numericCells,
    total_measurement_cells: measuredCells
  };
}

module.exports = { evaluateEvidence };

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const { fetchStudyMetadata, listStudyFiles, selectStudyFile, getCsvFileCandidates, downloadStudyFile } = require("../src/core/osdr-client.js");
const { parseCsv } = require("../src/core/csv.js");
const { OSD575, runOsd575Pilot } = require("../src/core/osd575-pilot.js");
const { createTraceRecord } = require("../src/core/trace-contract.js");

const DATASET_ID = "OSD-575";
const DATASET_VERSION = "3"; // Expected value; the recorded version is read from the NASA JSON response.
const STUDY_PAGE_URL = "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575";
const FILE_NAME = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
const OUTPUT_DIR = path.join(process.cwd(), "data", "osdr", DATASET_ID);
const METADATA_URL = "https://osdr.nasa.gov/osdr/data/osd/meta/575";
const CATALOG_URL = "https://osdr.nasa.gov/osdr/data/osd/files/575.3";

async function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    redirect: "follow",
    signal: AbortSignal.timeout(90000)
  });
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function jsonResponse(ok, status, body, url) {
  return {
    ok,
    status,
    url,
    headers: { get: () => null },
    json: async () => body
  };
}


function findApiLicense(metadata) {
  const seen = new Set();

  function visit(value, parentKey = "") {
    if (value === null || value === undefined) return null;
    if (typeof value !== "object") {
      if (/(license|licence|rights)/i.test(parentKey) && String(value).trim()) {
        return String(value).trim();
      }
      return null;
    }
    if (seen.has(value)) return null;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, parentKey);
        if (found) return found;
      }
      return null;
    }

    if (typeof value.name === "string" &&
        /(license|licence|rights)/i.test(value.name) &&
        typeof value.value === "string" &&
        value.value.trim()) {
      return value.value.trim();
    }

    for (const [key, child] of Object.entries(value)) {
      const found = visit(child, key);
      if (found) return found;
    }
    return null;
  }

  return visit(metadata);
}

function extractStudyMetadata(payload) {
  const study = payload && payload.study && payload.study[DATASET_ID];
  if (!study || typeof study !== "object") {
    throw new Error("The metadata API response did not contain study." + DATASET_ID);
  }

  if (study.version === undefined || study.version === null || String(study.version).trim() === "") {
    throw new Error("The metadata API response did not expose study." + DATASET_ID + ".version");
  }
  const version = String(study.version);
  if (version !== DATASET_VERSION) {
    throw new Error("NASA metadata reports OSD-575 version " + version +
      "; expected version " + DATASET_VERSION + ". Refusing to analyze a different study version.");
  }

  const studyRecord = Array.isArray(study.studies)
    ? study.studies.find((item) => item && item.identifier === DATASET_ID)
    : null;
  if (!studyRecord || typeof studyRecord.title !== "string" || !studyRecord.title.trim()) {
    throw new Error("The metadata API response did not contain the OSD-575 study title and identifier.");
  }

  const sampleTables = Object.values((study.additionalInformation && study.additionalInformation.samples) || {});
  const sampleTable = sampleTables.find((table) => table && Array.isArray(table.header) && Array.isArray(table.raw));
  if (!sampleTable) throw new Error("The metadata API response did not contain an ISA sample table.");

  const headerByTitle = new Map(sampleTable.header.map((item) => [item.title, item.field]));
  const participantField = headerByTitle.get("Source Name");
  const sampleField = headerByTitle.get("Sample Name");
  const timepointField = headerByTitle.get("Factor Value: Time");
  if (!participantField || !sampleField || !timepointField) {
    throw new Error("The OSD-575 sample metadata table is missing Source Name, Sample Name or Factor Value: Time.");
  }

  const sampleRows = sampleTable.raw;
  const unique = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== ""))];
  const participants = unique(sampleRows.map((row) => row[participantField]));
  const samples = unique(sampleRows.map((row) => row[sampleField]));
  const timepoints = unique(sampleRows.map((row) => row[timepointField]));

  const assayTables = Object.entries((study.additionalInformation && study.additionalInformation.assays) || {});
  const hdcvd9Entry = assayTables.find(([key]) => key.toLowerCase().includes("hdcvd9"));
  if (!hdcvd9Entry || !Array.isArray(hdcvd9Entry[1].raw) || !Array.isArray(hdcvd9Entry[1].header)) {
    throw new Error("The metadata API response did not contain the HDCVD9 assay metadata table.");
  }

  const assayHeaders = hdcvd9Entry[1].header;
  const transformedField = assayHeaders.find((item) => /transformed files/i.test(item.title))?.field;
  const protocolFields = assayHeaders.filter((item) => item.title.trim() === "Protocol REF").map((item) => item.field);
  const rawDataField = assayHeaders.find((item) => /raw data file/i.test(item.title))?.field;
  if (!transformedField || protocolFields.length === 0 || !rawDataField) {
    throw new Error("The HDCVD9 assay metadata did not expose transformed-file, protocol and raw-data fields.");
  }

  const transformedDataVerified = hdcvd9Entry[1].raw.some((row) =>
    row[transformedField] === FILE_NAME &&
    protocolFields.some((field) => row[field] === "ALSDA Transformed Data")
  );
  if (!transformedDataVerified) {
    throw new Error("The metadata API did not link the exact HDCVD9 CSV to ALSDA Transformed Data.");
  }

  const rawFileValues = unique(hdcvd9Entry[1].raw.map((row) => row[rawDataField]));
  const apiLicense = findApiLicense(payload);
  if (apiLicense && apiLicense !== "CC0-1.0") {
    throw new Error("NASA metadata exposes license " + apiLicense + "; expected CC0-1.0.");
  }

  return {
    dataset_id: DATASET_ID,
    dataset_version: version,
    study_identifier: studyRecord.identifier,
    study_title: studyRecord.title,
    public_release_date: studyRecord.publicReleaseDate || null,
    participant_count: participants.length,
    participant_ids: participants,
    sample_count: samples.length,
    timepoints,
    assay_metadata_file: hdcvd9Entry[0],
    transformed_file_name: FILE_NAME,
    transformed_data_class: "ALSDA Transformed Data",
    transformed_data_verified: transformedDataVerified,
    raw_data_file_status: rawFileValues.length === 1 ? rawFileValues[0] : rawFileValues,
    license: apiLicense || "CC0-1.0",
    license_api_value: apiLicense,
    license_api_status: apiLicense ? "VERIFIED_FROM_METADATA_API" : "NOT_EXPOSED_BY_LEGACY_METADATA_API",
    license_source: apiLicense
      ? "NASA OSDR metadata JSON API"
      : "CC0-1.0 was previously verified from the official NASA OSDR study record; it is not present in this legacy JSON response."
  };
}


function extractMetadataFileReferences(payload, expectedFileName = FILE_NAME) {
  const study = payload && payload.study && payload.study[DATASET_ID];
  const occurrences = [];
  const seen = new Set();

  function explicitDownloadUrls(value) {
    const urls = new Set();
    function visit(item) {
      if (!item || typeof item !== "object") return;
      if (Array.isArray(item)) {
        item.forEach(visit);
        return;
      }
      for (const [key, child] of Object.entries(item)) {
        if (typeof child === "string" &&
            /^(remote_url|download_url|downloadurl)$/i.test(key) &&
            child.trim()) {
          urls.add(child.trim());
        } else if (typeof child === "string" &&
                   /^url$/i.test(key) &&
                   /^https:\/\/[^/]*nasa\.gov\//i.test(child.trim())) {
          urls.add(child.trim());
        } else if (child && typeof child === "object") {
          visit(child);
        }
      }
    }
    visit(value);
    return [...urls];
  }

  function addOccurrence(fileName, sourcePath, sourceKind, sourceObject) {
    if (typeof fileName !== "string" || fileName.trim() !== expectedFileName) return;
    const key = sourcePath + "|" + fileName;
    if (seen.has(key)) return;
    seen.add(key);
    occurrences.push({
      file_name: fileName,
      source_path: sourcePath,
      source_kind: sourceKind,
      download_urls: explicitDownloadUrls(sourceObject)
    });
  }

  if (!study || typeof study !== "object") {
    return { file_name: expectedFileName, occurrences, download_urls: [] };
  }

  const assayTables = Object.entries(
    study.additionalInformation && study.additionalInformation.assays || {}
  );
  for (const [assayKey, table] of assayTables) {
    if (!table || !Array.isArray(table.header) || !Array.isArray(table.raw)) continue;
    if (!/hdcvd9/i.test(assayKey)) continue;
    const transformedField = table.header.find((item) =>
      item && /transformed files/i.test(item.title || "")
    )?.field;
    if (!transformedField) continue;

    table.raw.forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      addOccurrence(
        row[transformedField],
        "study." + DATASET_ID + ".additionalInformation.assays[" +
          JSON.stringify(assayKey) + "].raw[" + index + "]." + transformedField,
        "ISA_ASSAY_TABLE_TRANSFORMED_FILES",
        row
      );
    });
  }

  const studies = Array.isArray(study.studies) ? study.studies : [];
  studies.forEach((studyRecord, studyIndex) => {
    const assays = studyRecord && Array.isArray(studyRecord.assays) ? studyRecord.assays : [];
    assays.forEach((assay, assayIndex) => {
      const processes = assay && Array.isArray(assay.processSequence) ? assay.processSequence : [];
      processes.forEach((process, processIndex) => {
        const parameterValues = process && Array.isArray(process.parameterValues)
          ? process.parameterValues
          : [];
        parameterValues.forEach((parameter, parameterIndex) => {
          addOccurrence(
            parameter && parameter.value,
            "study." + DATASET_ID + ".studies[" + studyIndex + "].assays[" +
              assayIndex + "].processSequence[" + processIndex +
              "].parameterValues[" + parameterIndex + "].value",
            "ISA_PROCESS_PARAMETER_VALUE",
            process
          );
        });
      });

      const dataFiles = assay && Array.isArray(assay.dataFiles) ? assay.dataFiles : [];
      dataFiles.forEach((record, fileIndex) => {
        if (!record || typeof record !== "object") return;
        addOccurrence(
          record.name || record.file_name || record.filename,
          "study." + DATASET_ID + ".studies[" + studyIndex + "].assays[" +
            assayIndex + "].dataFiles[" + fileIndex + "].name",
          "ISA_ASSAY_DATA_FILES",
          record
        );
      });
    });
  });

  const downloadUrls = [...new Set(occurrences.flatMap((item) => item.download_urls))];
  return { file_name: expectedFileName, occurrences, download_urls: downloadUrls };
}

function createAuditTrace(decision, code, message, fileSha256 = null) {
  return createTraceRecord({
    ...OSD575,
    file_sha256: fileSha256,
    decision,
    decision_reasons: [{ code, message }]
  });
}

function normalizeHeader(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findHeader(headers, aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  return headers.find((header) => wanted.has(normalizeHeader(header))) || null;
}

function isNumericMeasurement(value) {
  const text = String(value ?? "").trim();
  if (text === "" || /^(na|n\/a|null|nan|not available)$/i.test(text)) return false;
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
}

function inferColumnMap(headers, rows) {
  const participant = findHeader(headers, [
    "Source Name", "Participant ID", "participant_id", "Subject ID", "subject_id", "Participant", "Subject"
  ]);
  const sample = findHeader(headers, ["Sample Name", "Sample ID", "sample_id", "Sample"]);
  const timepoint = findHeader(headers, [
    "Factor Value: Time", "Timepoint", "Time Point", "Timepoint Label", "Time"
  ]);

  if (!participant || !sample || !timepoint) return null;

  const excluded = new Set([participant, sample, timepoint]);
  const metadataHeader = /(participant|subject|source|sample|time|factor|protocol|characteristic|organism|material|sex|spaceflight|assay|storage|temperature|collection|company|kit|description|identifier|file|treatment|ref)/i;
  const measurement = headers.filter((header) => {
    if (excluded.has(header) || metadataHeader.test(header)) return false;
    const values = rows.map((row) => row[header]).filter((value) => String(value ?? "").trim() !== "");
    return values.some(isNumericMeasurement);
  });

  if (measurement.length === 0) return null;
  return { participant, sample, timepoint, measurement };
}

async function fetchJsonCaptured(url, fetchImpl, snapshots) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("OSDR API returned HTTP " + response.status + " for " + url);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error("OSDR API returned invalid JSON for " + url + ": " + error.message);
  }
  snapshots.push({
    url,
    status: response.status,
    raw_response_text: text,
    body
  });
  return jsonResponse(true, response.status, body, response.url || url);
}

async function writeJson(outputDir, fileName, value) {
  await fs.writeFile(path.join(outputDir, fileName), JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main(options = {}) {
  const outputDir = options.outputDir || OUTPUT_DIR;
  const fetchImpl = options.fetchImpl || fetchWithTimeout;
  const logger = options.logger || console;
  await fs.mkdir(outputDir, { recursive: true });

  const metadataSnapshots = [];
  const catalogSnapshots = [];
  const metadataFetch = (url) => fetchJsonCaptured(url, fetchImpl, metadataSnapshots);
  const catalogFetch = (url) => fetchJsonCaptured(url, fetchImpl, catalogSnapshots);

  logger.log("[OSD-575] Fetching live NASA JSON metadata...");
  let metadata = null;
  let metadataFetchError = null;
  try {
    metadata = await fetchStudyMetadata(DATASET_ID, metadataFetch);
  } catch (error) {
    metadataFetchError = error;
  }
  await writeJson(outputDir, "metadata-response.json", metadataSnapshots);

  let studyMetadata = null;
  let metadataValidationError = null;
  let metadataFileReferences = {
    file_name: FILE_NAME,
    occurrences: [],
    download_urls: []
  };
  if (metadata) {
    try {
      studyMetadata = extractStudyMetadata(metadata);
      metadataFileReferences = extractMetadataFileReferences(metadata);
      await writeJson(outputDir, "study-metadata-summary.json", studyMetadata);
    } catch (error) {
      metadataValidationError = error;
    }
  }

  logger.log("[OSD-575] Fetching the OSDR file catalog...");
  let fileRecords = [];
  let catalogError = null;
  try {
    fileRecords = await listStudyFiles(DATASET_ID, {
      fetchImpl: catalogFetch,
      studyVersion: studyMetadata ? studyMetadata.dataset_version : DATASET_VERSION
    });
  } catch (error) {
    catalogError = error;
  } finally {
    await writeJson(outputDir, "file-catalog-response.json", catalogSnapshots);
  }

  const fileRecord = !catalogError && !metadataValidationError
    ? selectStudyFile(fileRecords, FILE_NAME)
    : null;
  const catalogDownloadUrl = fileRecord ? getRemoteUrl(fileRecord) : null;

  let downloaded = null;
  let digest = null;
  let trace = null;
  let parseError = null;
  let parsed = null;
  let columnMap = null;
  let observed = null;

  if (metadataValidationError) {
    trace = createAuditTrace(
      "INVALID_DATA",
      "OSDR_METADATA_SCHEMA_INVALID",
      "The OSDR metadata response was captured but failed the OSD-575 version/structure/assay validation: " +
        metadataValidationError.message
    );
  } else if (metadataFetchError) {
    const invalidJson = /invalid JSON/i.test(metadataFetchError.message);
    trace = createAuditTrace(
      invalidJson ? "INVALID_DATA" : "INSUFFICIENT_EVIDENCE",
      invalidJson ? "OSDR_METADATA_INVALID_JSON" : "OSDR_METADATA_UNAVAILABLE",
      "The OSDR metadata response could not be used: " + metadataFetchError.message
    );
  } else if (catalogError) {
    const invalidCatalog = /invalid JSON|file_count=|pagination exceeded/i.test(catalogError.message);
    trace = createAuditTrace(
      invalidCatalog ? "INVALID_DATA" : "INSUFFICIENT_EVIDENCE",
      invalidCatalog ? "OSDR_FILE_CATALOG_INVALID_OR_INCOMPLETE" : "OSDR_FILE_CATALOG_UNAVAILABLE",
      "The OSDR file catalog could not be verified: " + catalogError.message
    );
  } else if (!fileRecord) {
    const hasMetadataReference = metadataFileReferences.occurrences.length > 0;
    trace = createAuditTrace(
      "INSUFFICIENT_EVIDENCE",
      hasMetadataReference
        ? "METADATA_FILE_REFERENCE_WITHOUT_CATALOG_DOWNLOAD_RECORD"
        : "REQUESTED_FILE_NOT_IN_CATALOG",
      hasMetadataReference
        ? "NASA meta/575 identifies the exact transformed CSV in " +
          metadataFileReferences.occurrences.map((item) => item.source_path).join("; ") +
          ", but the captured files/575.3 response contains no matching file record or download URL. " +
          "No download URL was guessed and no substitute file was selected."
        : "The exact transformed CSV was not found in the captured NASA metadata or file-catalog records. No substitute file was selected."
    );
  } else if (!catalogDownloadUrl) {
    trace = createAuditTrace(
      "INSUFFICIENT_EVIDENCE",
      "CATALOG_FILE_RECORD_HAS_NO_DOWNLOAD_URL",
      "The catalog contains a matching filename record but exposes no remote_url/download_url field. No URL was constructed or guessed."
    );
  } else {
    try {
      downloaded = await downloadStudyFile(fileRecord, fetchImpl);
      digest = sha256(downloaded.bytes);
      const csvPath = path.join(outputDir, FILE_NAME);
      // Save the exact response bytes before parsing; no text decoding/re-encoding is used for the stored source file.
      await fs.writeFile(csvPath, downloaded.bytes);

      try {
        parsed = parseCsv(downloaded.bytes.toString("utf8"));
      } catch (error) {
        parseError = error.message;
      }
      columnMap = parsed ? inferColumnMap(parsed.headers, parsed.rows) : null;

      const replayFetch = async (url) => {
        const address = String(url);
        if (address.includes("/meta/575")) {
          return jsonResponse(true, 200, metadata, METADATA_URL);
        }
        if (address.includes("/files/")) {
          const parsedUrl = new URL(address);
          const page = Number(parsedUrl.searchParams.get("page") || 0);
          const snapshot = catalogSnapshots.find((item) => {
            const itemPage = item.body && Number.isInteger(item.body.page_number)
              ? item.body.page_number
              : Number(new URL(item.url).searchParams.get("page") || 0);
            return itemPage === page;
          });
          return jsonResponse(
            snapshot ? snapshot.status : 200,
            snapshot ? snapshot.status : 200,
            snapshot ? snapshot.body : { studies: {} },
            snapshot ? snapshot.url : address
          );
        }

        const arrayBuffer = downloaded.bytes.buffer.slice(
          downloaded.bytes.byteOffset,
          downloaded.bytes.byteOffset + downloaded.bytes.byteLength
        );
        return {
          ok: true,
          status: downloaded.httpStatus || 200,
          url: downloaded.downloadUrl,
          headers: {
            get: (name) => name.toLowerCase() === "content-length"
              ? String(downloaded.bytes.length)
              : downloaded.contentType
          },
          arrayBuffer: async () => arrayBuffer
        };
      };

      trace = await runOsd575Pilot({
        fetchImpl: replayFetch,
        columnMap,
        studyVersion: studyMetadata.dataset_version,
        rawDataAvailable: studyMetadata.raw_data_file_status !== "Not Available"
      });

      observed = parsed ? {
        header_count: parsed.headers.length,
        row_count: parsed.rows.length,
        participant_count: columnMap
          ? new Set(parsed.rows.map((row) => row[columnMap.participant]).filter(Boolean)).size
          : null,
        sample_count: columnMap
          ? new Set(parsed.rows.map((row) => row[columnMap.sample]).filter(Boolean)).size
          : null,
        timepoints: columnMap
          ? [...new Set(parsed.rows.map((row) => row[columnMap.timepoint]).filter(Boolean))].sort()
          : [],
        measurement_columns: columnMap ? columnMap.measurement : []
      } : null;
    } catch (error) {
      trace = createAuditTrace(
        "INSUFFICIENT_EVIDENCE",
        "OSDR_FILE_DOWNLOAD_UNAVAILABLE",
        "The exact catalog file was selected, but its bytes could not be downloaded and verified: " + error.message
      );
    }
  }

  const decision = trace.decision;
  const manifest = {
    ...(studyMetadata || {
      dataset_id: DATASET_ID,
      dataset_version: DATASET_VERSION
    }),
    source_metadata_api: METADATA_URL,
    source_file_catalog_api: catalogSnapshots[0] ? catalogSnapshots[0].url : CATALOG_URL,
    source_study_page: STUDY_PAGE_URL,
    file_name: FILE_NAME,
    metadata_file_references: metadataFileReferences,
    file_catalog_record_found: Boolean(fileRecord),
    file_download_url: downloaded ? downloaded.downloadUrl : null,
    file_sha256: digest,
    reference_sha256: null,
    reference_sha256_status: digest
      ? "not_previously_frozen; actual downloaded bytes are hashed, not compared to an invented reference digest"
      : "not_calculated; no verified file bytes were downloaded",
    byte_length: downloaded ? downloaded.bytes.length : null,
    raw_bytes_preserved: Boolean(downloaded),
    csv_relative_path: downloaded ? path.relative(process.cwd(), path.join(outputDir, FILE_NAME)) : null,
    metadata_api_retrieved_at: new Date().toISOString(),
    pilot_decision: decision,
    metadata_fetch_error: metadataFetchError ? metadataFetchError.message : null,
    metadata_validation_error: metadataValidationError ? metadataValidationError.message : null,
    catalog_error: catalogError ? catalogError.message : null
  };

  const pilotReport = {
    dataset_id: DATASET_ID,
    dataset_version: studyMetadata ? studyMetadata.dataset_version : DATASET_VERSION,
    source_file: FILE_NAME,
    data_provenance_class: studyMetadata ? studyMetadata.transformed_data_class : "not_verified",
    file_sha256: digest,
    file_bytes: downloaded ? downloaded.bytes.length : null,
    csv_parse_error: parseError,
    column_map: columnMap,
    observed,
    metadata_file_references: metadataFileReferences,
    catalog_file_candidates: getCsvFileCandidates(fileRecords),
    catalog_page_diagnostics: catalogSnapshots.map((snapshot) => ({
      url: snapshot.url,
      status: snapshot.status,
      page_number: snapshot.body && snapshot.body.page_number,
      page_size: snapshot.body && snapshot.body.page_size,
      page_total: snapshot.body && snapshot.body.page_total,
      hits: snapshot.body && snapshot.body.hits,
      total_hits: snapshot.body && snapshot.body.total_hits,
      returned_studies: snapshot.body && snapshot.body.studies
        ? Object.keys(snapshot.body.studies)
        : [],
      top_level_json_fields: snapshot.body && typeof snapshot.body === "object"
        ? Object.keys(snapshot.body)
        : []
    })),
    trace_contract: trace,
    license_note: studyMetadata &&
      studyMetadata.license_api_status === "NOT_EXPOSED_BY_LEGACY_METADATA_API"
      ? "The legacy OSDR metadata JSON did not expose a license field. The CC0-1.0 value in this report is from a previously verified official NASA study record, not from this JSON response."
      : null
  };

  await writeJson(outputDir, "manifest.json", manifest);
  await writeJson(outputDir, "pilot-report.json", pilotReport);

  logger.log("[OSD-575] Audit decision:", decision);
  logger.log("[OSD-575] Metadata filename references:", JSON.stringify(metadataFileReferences));
  logger.log("[OSD-575] Catalog CSV candidates:", JSON.stringify(pilotReport.catalog_file_candidates));
  if (digest) {
    logger.log("[OSD-575] Actual file SHA-256:", digest);
    logger.log("[OSD-575] Byte length:", downloaded.bytes.length);
    logger.log("[OSD-575] Column mapping:", JSON.stringify(columnMap));
    logger.log("[OSD-575] Observed rows and identifiers:", JSON.stringify(observed));
  } else {
    logger.warn("[OSD-575] No verified CSV download was possible. Raw API responses and the decision record were written to:", outputDir);
  }
  logger.log("[OSD-575] trace-contract result:");
  logger.log(JSON.stringify(trace, null, 2));
  logger.log("[OSD-575] Audit files saved under:", outputDir);

  // An abstention or invalid-data result is a completed scientific audit, not a runner crash.
  // The decision is explicit in pilot-report.json and the raw responses remain in the artifact.
  return { decision, manifest, pilotReport };
}


if (require.main === module) {
  main().catch((error) => {
    console.error("[OSD-575] FETCH_FAILED:", error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  sha256,
  inferColumnMap,
  findApiLicense,
  extractStudyMetadata,
  extractMetadataFileReferences,
  createAuditTrace,
  main
};

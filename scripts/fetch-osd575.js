"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const { fetchStudyMetadata, listStudyFiles, selectStudyFile, downloadStudyFile } = require("../src/core/osdr-client.js");
const { parseCsv } = require("../src/core/csv.js");
const { runOsd575Pilot } = require("../src/core/osd575-pilot.js");

const DATASET_ID = "OSD-575";
const DATASET_VERSION = "3"; // Expected value; the recorded version is read from the NASA JSON response.
const STUDY_PAGE_URL = "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575";
const FILE_NAME = "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv";
const OUTPUT_DIR = path.join(process.cwd(), "data", "osdr", DATASET_ID);
const METADATA_URL = "https://osdr.nasa.gov/osdr/data/osd/meta/575";
const CATALOG_URL = "https://osdr.nasa.gov/osdr/data/osd/files/575";

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

async function writeJson(fileName, value) {
  await fs.writeFile(path.join(OUTPUT_DIR, fileName), JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const metadataSnapshots = [];
  const catalogSnapshots = [];
  const metadataFetch = (url) => fetchJsonCaptured(url, fetchWithTimeout, metadataSnapshots);
  const catalogFetch = (url) => fetchJsonCaptured(url, fetchWithTimeout, catalogSnapshots);

  console.log("[OSD-575] Fetching live NASA JSON metadata...");
  const metadata = await fetchStudyMetadata(DATASET_ID, metadataFetch);
  await writeJson("metadata-response.json", metadataSnapshots);

  const studyMetadata = extractStudyMetadata(metadata);
  await writeJson("study-metadata-summary.json", studyMetadata);

  console.log("[OSD-575] Fetching the OSDR file catalog...");
  const fileRecords = await listStudyFiles(DATASET_ID, { fetchImpl: catalogFetch });
  await writeJson("file-catalog-response.json", catalogSnapshots);

  const fileRecord = selectStudyFile(fileRecords, FILE_NAME);
  if (!fileRecord) {
    throw new Error("The exact transformed CSV was not present in the live OSDR file catalog; no alternative file was selected.");
  }

  const download = await downloadStudyFile(fileRecord, fetchWithTimeout);
  const bytes = download.bytes;
  const digest = sha256(bytes);
  const csvPath = path.join(OUTPUT_DIR, FILE_NAME);

  // Save the exact response bytes before parsing. No text decoding/re-encoding is used for the raw file.
  await fs.writeFile(csvPath, bytes);

  let parsed = null;
  let parseError = null;
  try {
    parsed = parseCsv(bytes.toString("utf8"));
  } catch (error) {
    parseError = error.message;
  }

  const columnMap = parsed ? inferColumnMap(parsed.headers, parsed.rows) : null;
  const replayFetch = async (url) => {
    const address = String(url);
    if (address.includes("/meta/575")) return jsonResponse(true, 200, metadata, METADATA_URL);
    if (address.includes("/files/575/")) {
      return jsonResponse(true, 200, {
        studies: { "OSD-575": { study_files: [fileRecord] } }
      }, CATALOG_URL);
    }
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return {
      ok: true,
      status: 200,
      url: download.downloadUrl,
      headers: { get: (name) => name.toLowerCase() === "content-length" ? String(bytes.length) : download.contentType },
      arrayBuffer: async () => arrayBuffer
    };
  };

  const trace = await runOsd575Pilot({
    fetchImpl: replayFetch,
    columnMap,
    rawDataAvailable: studyMetadata.raw_data_file_status !== "Not Available"
  });

  const observed = parsed ? {
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

  const manifest = {
    ...studyMetadata,
    source_metadata_api: METADATA_URL,
    source_file_catalog_api: CATALOG_URL,
    source_study_page: STUDY_PAGE_URL,
    file_name: FILE_NAME,
    file_download_url: download.downloadUrl,
    file_sha256: digest,
    reference_sha256: null,
    reference_sha256_status: "not_previously_frozen; actual downloaded bytes are hashed, not compared to an invented reference digest",
    byte_length: bytes.length,
    raw_bytes_preserved: true,
    csv_relative_path: path.relative(process.cwd(), csvPath),
    metadata_api_retrieved_at: new Date().toISOString(),
    pilot_decision: trace.decision
  };

  const pilotReport = {
    dataset_id: DATASET_ID,
    dataset_version: studyMetadata.dataset_version,
    source_file: FILE_NAME,
    data_provenance_class: studyMetadata.transformed_data_class,
    file_sha256: digest,
    file_bytes: bytes.length,
    csv_parse_error: parseError,
    column_map: columnMap,
    observed,
    trace_contract: trace,
    license_note: studyMetadata.license_api_status === "NOT_EXPOSED_BY_LEGACY_METADATA_API"
      ? "The legacy OSDR metadata JSON did not expose a license field. The CC0-1.0 value in this report is from a previously verified official NASA study record, not from this JSON response."
      : null
  };

  await writeJson("manifest.json", manifest);
  await writeJson("pilot-report.json", pilotReport);

  console.log("[OSD-575] NASA metadata:", JSON.stringify(studyMetadata, null, 2));
  console.log("[OSD-575] Actual file SHA-256:", digest);
  console.log("[OSD-575] Byte length:", bytes.length);
  console.log("[OSD-575] CSV header count:", observed ? observed.header_count : "parse failed");
  console.log("[OSD-575] Column mapping:", JSON.stringify(columnMap));
  console.log("[OSD-575] Observed rows and identifiers:", JSON.stringify(observed));
  console.log("[OSD-575] trace-contract result:");
  console.log(JSON.stringify(trace, null, 2));
  console.log("[OSD-575] Files saved under:", OUTPUT_DIR);

  if (studyMetadata.license_api_status === "NOT_EXPOSED_BY_LEGACY_METADATA_API") {
    console.warn("[OSD-575] LICENSE NOTE: CC0-1.0 is not present in the legacy metadata API response; see manifest license_api_status.");
  }

  if (parseError) {
    console.error("[OSD-575] CSV parse failed:", parseError);
    process.exitCode = 2;
  }
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
  extractStudyMetadata
};

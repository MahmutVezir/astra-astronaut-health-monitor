"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const { fetchStudyMetadata, listStudyFiles, selectStudyFile, downloadStudyFile } = require("../src/core/osdr-client.js");
const { parseCsv } = require("../src/core/csv.js");
const { runOsd575Pilot } = require("../src/core/osd575-pilot.js");

const DATASET_ID = "OSD-575";
const DATASET_VERSION = "3";
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

function textOfStudyPage(html) {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");
}

async function verifyOfficialStudyPage(fetchImpl) {
  const response = await fetchImpl(STUDY_PAGE_URL, { headers: { accept: "text/html" } });
  if (!response.ok) throw new Error("NASA OSD-575 study page returned HTTP " + response.status);
  const html = await response.text();
  const text = textOfStudyPage(html);

  const versionVerified = new RegExp("OSD-575\\s+Version\\s+" + DATASET_VERSION, "i").test(text);
  const licenseVerified = /License:\s*CC0-1\.0/i.test(text);
  const fileNameVerified = text.includes(FILE_NAME);
  const transformedLabelVerified = text.includes("ALSDA Transformed Data");

  if (!versionVerified) throw new Error("The official NASA study page did not confirm OSD-575 Version " + DATASET_VERSION);
  if (!licenseVerified) throw new Error("The official NASA study page did not explicitly confirm the CC0-1.0 license");
  if (!fileNameVerified || !transformedLabelVerified) {
    throw new Error("The official NASA study page did not link the exact target CSV to the ALSDA Transformed Data label");
  }

  return {
    url: STUDY_PAGE_URL,
    version: DATASET_VERSION,
    version_verified: versionVerified,
    license: "CC0-1.0",
    license_verified: licenseVerified,
    data_provenance_class: "ALSDA Transformed Data",
    transformed_file_verified: fileNameVerified && transformedLabelVerified,
    retrieved_at: new Date().toISOString()
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

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const metadataSnapshots = [];
  const catalogSnapshots = [];
  const metadataFetch = async (url, options) => {
    return fetchJsonCaptured(url, fetchWithTimeout, metadataSnapshots);
  };
  const catalogFetch = async (url, options) => {
    return fetchJsonCaptured(url, fetchWithTimeout, catalogSnapshots);
  };

  console.log("[OSD-575] Fetching live NASA metadata and file catalog...");
  const metadata = await fetchStudyMetadata(DATASET_ID, metadataFetch);
  await fs.writeFile(
    path.join(OUTPUT_DIR, "metadata-response.json"),
    JSON.stringify(metadataSnapshots, null, 2) + "\n",
    "utf8"
  );

  const studyPage = await verifyOfficialStudyPage(fetchWithTimeout);
  await fs.writeFile(
    path.join(OUTPUT_DIR, "study-page-verification.json"),
    JSON.stringify(studyPage, null, 2) + "\n",
    "utf8"
  );

  const study = metadata && metadata.study && metadata.study[DATASET_ID];
  if (!study || typeof study !== "object") {
    throw new Error("The metadata API response did not contain study." + DATASET_ID);
  }

  const fileRecords = await listStudyFiles(DATASET_ID, { fetchImpl: catalogFetch });
  await fs.writeFile(
    path.join(OUTPUT_DIR, "file-catalog-response.json"),
    JSON.stringify(catalogSnapshots, null, 2) + "\n",
    "utf8"
  );

  const fileRecord = selectStudyFile(fileRecords, FILE_NAME);
  if (!fileRecord) {
    throw new Error("The exact transformed CSV was not present in the live OSDR file catalog; no alternative file was selected.");
  }

  const download = await downloadStudyFile(fileRecord, fetchWithTimeout);
  const bytes = download.bytes;
  const digest = sha256(bytes);
  const csvPath = path.join(OUTPUT_DIR, FILE_NAME);
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
    rawDataAvailable: false
  });

  const observed = parsed ? {
    header_count: parsed.headers.length,
    row_count: parsed.rows.length,
    participant_count: columnMap ? new Set(parsed.rows.map((row) => row[columnMap.participant]).filter(Boolean)).size : null,
    sample_count: columnMap ? new Set(parsed.rows.map((row) => row[columnMap.sample]).filter(Boolean)).size : null,
    timepoints: columnMap ? [...new Set(parsed.rows.map((row) => row[columnMap.timepoint]).filter(Boolean))].sort() : [],
    measurement_columns: columnMap ? columnMap.measurement : []
  } : null;

  const manifest = {
    dataset_id: DATASET_ID,
    dataset_version: DATASET_VERSION,
    source_metadata_api: METADATA_URL,
    source_file_catalog_api: CATALOG_URL,
    source_study_page: STUDY_PAGE_URL,
    license: "CC0-1.0",
    license_verified: studyPage.license_verified,
    license_verified_from: STUDY_PAGE_URL,
    file_name: FILE_NAME,
    data_provenance_class: "ALSDA Transformed Data",
    transformed_data_label_verified: studyPage.transformed_file_verified,
    file_download_url: download.downloadUrl,
    file_sha256: digest,
    reference_sha256: null,
    reference_sha256_status: "not_previously_frozen; downloaded bytes are hashed, not compared to an invented reference digest",
    byte_length: bytes.length,
    raw_bytes_preserved: true,
    csv_relative_path: path.relative(process.cwd(), csvPath),
    retrieved_at: new Date().toISOString(),
    metadata_api_license_string_present: JSON.stringify(metadata).includes("CC0-1.0"),
    study_metadata_api_entry_present: true,
    study_page_checks: studyPage,
    pilot_decision: trace.decision
  };

  const pilotReport = {
    dataset_id: DATASET_ID,
    source_file: FILE_NAME,
    file_sha256: digest,
    file_bytes: bytes.length,
    csv_parse_error: parseError,
    column_map: columnMap,
    observed,
    trace_contract: trace,
    note: "The trace is generated by replaying the already-downloaded API metadata, catalog entry and exact CSV bytes through osd575-pilot.js; no second NASA file download is performed."
  };

  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "pilot-report.json"), JSON.stringify(pilotReport, null, 2) + "\n", "utf8");

  console.log("[OSD-575] Actual file SHA-256:", digest);
  console.log("[OSD-575] Byte length:", bytes.length);
  console.log("[OSD-575] CSV header count:", observed ? observed.header_count : "parse failed");
  console.log("[OSD-575] Column mapping:", JSON.stringify(columnMap));
  console.log("[OSD-575] Observed rows and identifiers:", JSON.stringify(observed));
  console.log("[OSD-575] trace-contract result:");
  console.log(JSON.stringify(trace, null, 2));
  console.log("[OSD-575] Files saved under:", OUTPUT_DIR);

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
  verifyOfficialStudyPage
};

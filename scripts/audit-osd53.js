"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  fetchStudyMetadata,
  listStudyFiles,
  getFileName,
  getRemoteUrl,
  downloadStudyFile
} = require("../src/core/osdr-client.js");

const DATASET_ID = "OSD-53";
const OUTPUT_DIR = path.join(process.cwd(), "artifacts", "osd53-audit");
const FILE_OUTPUT_DIR = path.join(OUTPUT_DIR, "files");
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const EXPECTED_FILES = [
  "OSD-53_metadata_OSD-53-ISA.zip",
  "GLDS-53_microarray_E-GEOD-47126.additional.zip",
  "GLDS-53_microarray_E-GEOD-47126.processed.zip"
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function getStudyRecord(payload, datasetId = DATASET_ID) {
  const study = payload && payload.study && payload.study[datasetId];
  if (!study || typeof study !== "object") {
    throw new Error("NASA metadata response does not contain study." + datasetId);
  }
  const record = Array.isArray(study.studies)
    ? study.studies.find((item) => item && item.identifier === datasetId)
    : null;
  if (!record) throw new Error("NASA metadata response does not contain the exact " + datasetId + " study record.");
  return { study, record };
}

function isNumericVersion(value) {
  return /^\d+$/.test(String(value));
}

function findExplicitLicense(value) {
  const visited = new Set();
  function visit(item, parentKey = "") {
    if (item === null || item === undefined) return null;
    if (typeof item !== "object") {
      return /(license|licence|rights)/i.test(parentKey) && String(item).trim()
        ? String(item).trim()
        : null;
    }
    if (visited.has(item)) return null;
    visited.add(item);
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = visit(child, parentKey);
        if (found) return found;
      }
      return null;
    }
    if (typeof item.name === "string" &&
        /(license|licence|rights)/i.test(item.name) &&
        typeof item.value === "string" && item.value.trim()) {
      return item.value.trim();
    }
    for (const [key, child] of Object.entries(item)) {
      const found = visit(child, key);
      if (found) return found;
    }
    return null;
  }
  return visit(value);
}

function summarizeFiles(records) {
  const files = records.map((record) => ({
    file_name: getFileName(record),
    file_size_bytes: record && record.file_size !== null && record.file_size !== undefined && record.file_size !== "" && Number.isFinite(Number(record.file_size))
      ? Number(record.file_size)
      : null,
    restricted: typeof (record && record.restricted) === "boolean"
      ? record.restricted
      : null,
    remote_url: getRemoteUrl(record)
  }));
  return {
    record_count: files.length,
    restricted_count: files.filter((file) => file.restricted === true).length,
    public_count: files.filter((file) => file.restricted === false).length,
    unknown_access_count: files.filter((file) => file.restricted === null).length,
    files
  };
}

function selectExactPublicFile(records, expectedFileName) {
  const matches = records.filter((record) => getFileName(record) === expectedFileName);
  if (matches.length !== 1) {
    throw new Error("Expected exactly one catalog record for " + expectedFileName +
      "; found " + matches.length + ".");
  }
  const record = matches[0];
  if (record.restricted !== false) {
    throw new Error("Refusing to download " + expectedFileName +
      " because the catalog does not explicitly mark it unrestricted.");
  }
  const declaredSize = record.file_size === null || record.file_size === undefined || record.file_size === ""
    ? null
    : Number(record.file_size);
  if (declaredSize !== null && (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > MAX_ARCHIVE_BYTES)) {
    throw new Error("Refusing " + expectedFileName + " because its declared size is invalid or exceeds the 25 MiB audit limit.");
  }
  if (!getRemoteUrl(record)) {
    throw new Error("Refusing " + expectedFileName + " because the exact catalog record has no remote URL.");
  }
  return record;
}

async function downloadAndPinPublicFiles(records) {
  await fs.mkdir(FILE_OUTPUT_DIR, { recursive: true });
  const results = [];
  for (const fileName of EXPECTED_FILES) {
    try {
      const record = selectExactPublicFile(records, fileName);
      const downloaded = await downloadStudyFile(record);
      if (downloaded.bytes.length > MAX_ARCHIVE_BYTES) {
        throw new Error("Downloaded file exceeded the 25 MiB audit limit.");
      }
      if (downloaded.catalogFileSizeBytes !== null &&
          downloaded.catalogFileSizeBytes !== downloaded.bytes.length) {
        throw new Error("Downloaded byte count does not match the NASA catalog.");
      }
      if (downloaded.contentType &&
          !/(zip|octet-stream|application\/x-zip)/i.test(downloaded.contentType)) {
        throw new Error("Unexpected content type for a ZIP archive: " + downloaded.contentType);
      }
      const filePath = path.join(FILE_OUTPUT_DIR, fileName);
      await fs.writeFile(filePath, downloaded.bytes);
      results.push({
        file_name: fileName,
        status: "DOWNLOADED_AND_SIZE_VERIFIED",
        declared_size_bytes: downloaded.catalogFileSizeBytes,
        actual_size_bytes: downloaded.bytes.length,
        sha256: sha256(downloaded.bytes),
        http_status: downloaded.httpStatus,
        content_type: downloaded.contentType,
        source_download_url: downloaded.downloadUrl,
        final_response_host: downloaded.finalResponseHost,
        final_response_path: downloaded.finalResponsePath,
        redirected: downloaded.redirected,
        temporary_path: filePath
      });
    } catch (error) {
      results.push({
        file_name: fileName,
        status: "NOT_DOWNLOADED",
        error: error && error.message ? error.message : String(error)
      });
    }
  }
  return results;
}

async function run() {
  await fs.mkdir(path.join(OUTPUT_DIR, "responses"), { recursive: true });
  const captured = [];
  const captureFetch = async (url, options) => {
    const response = await fetch(url, options);
    const bytes = Buffer.from(await response.clone().arrayBuffer());
    captured.push({
      url: String(url),
      status: response.status,
      content_type: response.headers.get("content-type"),
      bytes
    });
    return response;
  };

  const metadata = await fetchStudyMetadata(DATASET_ID, captureFetch);
  const { study, record } = getStudyRecord(metadata);
  const version = String(study.version || "").trim();
  if (!isNumericVersion(version)) {
    throw new Error("NASA metadata did not expose a numeric " + DATASET_ID + " version.");
  }

  let files = [];
  let catalogError = null;
  try {
    files = await listStudyFiles(DATASET_ID + "." + version, {
      fetchImpl: captureFetch,
      bareFirstPage: true,
      pageSize: 25,
      maxPages: 100,
      allFiles: true
    });
  } catch (error) {
    catalogError = error && error.message ? error.message : String(error);
  }
  const license = findExplicitLicense(metadata);
  const catalog = summarizeFiles(files);
  const fileDownloads = catalogError ? [] : await downloadAndPinPublicFiles(files);
  const allExpectedFilesDownloaded = fileDownloads.length === EXPECTED_FILES.length &&
    fileDownloads.every((item) => item.status === "DOWNLOADED_AND_SIZE_VERIFIED");

  for (let i = 0; i < captured.length; i += 1) {
    const item = captured[i];
    const name = i === 0 ? "metadata-response.json" : "catalog-response-" + String(i).padStart(3, "0") + ".json";
    await fs.writeFile(path.join(OUTPUT_DIR, "responses", name), item.bytes);
  }

  const summary = {
    audit_type: "NASA_OSDR_METADATA_AND_FILE_CATALOG_AUDIT",
    dataset_id: DATASET_ID,
    dataset_version: version,
    study_identifier: record.identifier,
    study_title: record.title,
    doi: record.doi || record.DOI || null,
    public_release_date: record.publicReleaseDate || null,
    license: license || null,
    license_status: license ? "EXPLICITLY_EXPOSED_IN_METADATA_API" : "NOT_EXPOSED_IN_METADATA_API",
    sample_metadata_tables: Object.keys((study.additionalInformation && study.additionalInformation.samples) || {}),
    assay_metadata_tables: Object.keys((study.additionalInformation && study.additionalInformation.assays) || {}),
    catalog,
    catalog_error: catalogError,
    file_level_downloads: fileDownloads,
    expected_file_count: EXPECTED_FILES.length,
    verified_file_download_count: fileDownloads.filter((item) => item.status === "DOWNLOADED_AND_SIZE_VERIFIED").length,
    decision: catalogError
      ? "DEFER_CATALOG_RETRIEVAL_FAILED_RAW_RESPONSES_PRESERVED"
      : !allExpectedFilesDownloaded
      ? "DEFER_FILE_LEVEL_DOWNLOAD_OR_INTEGRITY_QA_INCOMPLETE"
      : !license
      ? "DEFER_INTEGRATION_PENDING_LICENSE_REVIEW_AND_ARCHIVE_CONTENT_QA"
      : "FILE_DOWNLOADS_VERIFIED_PENDING_ARCHIVE_CONTENT_AND_SCIENTIFIC_QA",
    limitations: [
      "This stage downloads only the three explicitly named public archives for integrity and structural inspection; it does not export their measurement values into the report.",
      "A public catalog record does not by itself establish scientific suitability or permission to redistribute.",
      "Do not integrate OSD-53 until archive integrity, exact file contents, schema, sample mapping, license and measurement semantics are independently checked."
    ],
    captured_response_count: captured.length,
    captured_responses: captured.map((item, index) => ({
      index,
      request_url: item.url,
      http_status: item.status,
      content_type: item.content_type,
      byte_length: item.bytes.length,
      sha256: sha256(item.bytes)
    }))
  };
  await fs.writeFile(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  run().catch((error) => {
    console.error("OSD-53 audit failed:", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  getStudyRecord,
  isNumericVersion,
  findExplicitLicense,
  summarizeFiles,
  selectExactPublicFile,
  EXPECTED_FILES,
  MAX_ARCHIVE_BYTES
};

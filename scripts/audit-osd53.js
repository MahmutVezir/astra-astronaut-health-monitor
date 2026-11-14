"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  fetchStudyMetadata,
  listStudyFiles,
  getFileName,
  getRemoteUrl
} = require("../src/core/osdr-client.js");

const DATASET_ID = "OSD-53";
const OUTPUT_DIR = path.join(process.cwd(), "artifacts", "osd53-audit");

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
    file_size_bytes: Number.isFinite(Number(record && record.file_size))
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

  const files = await listStudyFiles(DATASET_ID + "." + version, {
    fetchImpl: captureFetch,
    bareFirstPage: true,
    pageSize: 25,
    maxPages: 100,
    allFiles: true
  });
  const license = findExplicitLicense(metadata);
  const catalog = summarizeFiles(files);

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
    measurement_file_downloads: 0,
    decision: license && catalog.public_count > 0
      ? "METADATA_AND_PUBLIC_FILE_CANDIDATES_FOUND_REQUIRES_FILE_LEVEL_QA"
      : "DEFER_INTEGRATION_PENDING_LICENSE_OR_PUBLIC_FILE_EVIDENCE",
    limitations: [
      "This audit does not download or analyze measurement files.",
      "A public catalog record does not by itself establish scientific suitability or permission to redistribute.",
      "Do not integrate OSD-53 until exact file contents, schema, sample mapping, license and measurement semantics are independently checked."
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

module.exports = { getStudyRecord, isNumericVersion, findExplicitLicense, summarizeFiles };

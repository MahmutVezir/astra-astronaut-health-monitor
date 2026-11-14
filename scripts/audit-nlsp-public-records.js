"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ORIGIN = "https://nlsp.nasa.gov";
const API_BASE = ORIGIN + "/api/v1";
const OUTPUT_DIR = path.join(process.cwd(), "artifacts", "nlsp-public-record-audit");
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_DETAIL_RECORDS = 15;
const SEARCHES = [
  { type: "EXPERIMENTS", term: "DSO-470" },
  { type: "EXPERIMENTS", term: "DSO 470" },
  { type: "EXPERIMENTS", term: "DSO-602" },
  { type: "EXPERIMENTS", term: "DSO-603" },
  { type: "DATASETS", term: "BRSMACT Campaign 1 Actigraphy" },
  { type: "EXPERIMENTS", term: "BRSMCF" }
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function safeName(value) {
  return String(value || "record").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "record";
}
function typePath(type) {
  const map = { EXPERIMENTS: "experiments", DATASETS: "datasets" };
  const result = map[String(type || "").toUpperCase()];
  if (!result) throw new Error("Unsupported NLSP data type.");
  return result;
}
function makeSearchUrl(type, term) {
  const value = String(term || "").trim();
  if (!value) throw new Error("Search term must not be blank.");
  const url = new URL("/api/v1/data/" + typePath(type), ORIGIN);
  url.searchParams.set("search", value);
  url.searchParams.set("limit", "25");
  return url.toString();
}
function makeDetailUrl(type, id) {
  const value = String(id || "").trim();
  if (!value) throw new Error("A returned NLSP record ID is required.");
  return new URL("/api/v1/data/" + typePath(type) + "/" + encodeURIComponent(value) + "/full", ORIGIN).toString();
}
function parseDocumentList(payload) {
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["documents", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}
function getRecordId(record) {
  if (!record || typeof record !== "object") return null;
  const value = record.id ?? record._id ?? record.__dirid;
  return value === null || value === undefined || String(value).trim() === "" ? null : String(value).trim();
}
function getRecordTitle(record) {
  if (!record || typeof record !== "object") return "";
  return String(record.experiment_title ?? record.dataset_title ?? record.title ?? record.name ?? "").trim();
}
function collectMetadataHints(value, currentPath = "$", output = [], depth = 0) {
  if (depth > 12 || output.length >= 200 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    value.slice(0, 500).forEach((item, index) => collectMetadataHints(item, currentPath + "[" + index + "]", output, depth + 1));
    return output;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const nextPath = currentPath + "." + key;
      if (typeof child === "string") {
        const candidate = child.trim();
        const looksLikeFile = /\.(csv|tsv|txt|zip|xlsx?|edf|dat|pdf)(?:[?#].*)?$/i.test(candidate);
        const looksLikeUrl = /^https?:\/\//i.test(candidate);
        const relevantKey = /(file|download|remote.?url|access|preserv|license|rights|public|restrict)/i.test(key);
        if ((looksLikeFile || looksLikeUrl || relevantKey) && candidate.length > 0) {
          output.push({
            path: nextPath,
            key,
            value: candidate.slice(0, 2000),
            value_type: looksLikeUrl ? "URL_STRING" : looksLikeFile ? "FILENAME_LIKE_STRING" : "ACCESS_OR_FILE_METADATA"
          });
        }
      } else {
        collectMetadataHints(child, nextPath, output, depth + 1);
      }
      if (output.length >= 200) break;
    }
  }
  return output;
}
async function requestAndPreserve(url, outputName) {
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== ORIGIN || !parsedUrl.pathname.startsWith("/api/v1/data/")) {
    throw new Error("Refusing an NLSP request outside the observed same-origin data API.");
  }
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "ASTRA-NLSP-Public-Record-Audit/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(45000)
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const result = {
    requested_url: url,
    final_url: response.url,
    final_origin: new URL(response.url).origin,
    http_status: response.status,
    content_type: response.headers.get("content-type"),
    byte_length: bytes.byteLength,
    sha256: sha256(bytes),
    response_ok: response.ok,
    response_file: outputName,
    too_large: bytes.byteLength > MAX_RESPONSE_BYTES,
    json_valid: false
  };
  if (result.final_origin !== ORIGIN) throw new Error("NLSP API request redirected outside nlsp.nasa.gov.");
  if (result.too_large) {
    result.error = "RESPONSE_EXCEEDED_10_MIB_LIMIT";
    return { result, payload: null };
  }
  await fs.writeFile(path.join(OUTPUT_DIR, outputName), bytes);
  try {
    const payload = JSON.parse(bytes.toString("utf8"));
    result.json_valid = true;
    return { result, payload };
  } catch {
    result.error = "RESPONSE_BODY_NOT_VALID_JSON";
    return { result, payload: null };
  }
}
async function run() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const searchResults = [];
  const detailsToFetch = new Map();
  for (const search of SEARCHES) {
    const url = makeSearchUrl(search.type, search.term);
    const filename = "search-" + safeName(search.type) + "-" + safeName(search.term) + ".json";
    try {
      const fetched = await requestAndPreserve(url, filename);
      const docs = parseDocumentList(fetched.payload);
      const entries = docs.map((record) => {
        const id = getRecordId(record);
        const entry = { id, title: getRecordTitle(record), data_type: search.type, returned_for_query: search.term };
        if (id) {
          const key = search.type + ":" + id;
          if (!detailsToFetch.has(key)) detailsToFetch.set(key, { type: search.type, id, title: entry.title });
        }
        return entry;
      });
      searchResults.push({
        query: search,
        request: fetched.result,
        returned_document_count: docs.length,
        total: fetched.payload && (fetched.payload.total ?? fetched.payload.totalItems ?? null),
        records: entries
      });
    } catch (error) {
      searchResults.push({
        query: search,
        request: { requested_url: url, error: error.message },
        returned_document_count: 0,
        records: []
      });
    }
  }

  const detailResults = [];
  const chosen = Array.from(detailsToFetch.values()).slice(0, MAX_DETAIL_RECORDS);
  for (const item of chosen) {
    const url = makeDetailUrl(item.type, item.id);
    const filename = "detail-" + safeName(item.type) + "-" + safeName(item.id) + ".json";
    try {
      const fetched = await requestAndPreserve(url, filename);
      const payload = fetched.payload;
      const record = payload && typeof payload === "object" ? (payload.record || payload.data?.record || payload.data || payload) : null;
      const related = payload && typeof payload === "object" ? payload.related || null : null;
      detailResults.push({
        query_record: item,
        request: fetched.result,
        record_id: getRecordId(record) || item.id,
        record_title: getRecordTitle(record) || item.title,
        top_level_keys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 80) : [],
        record_keys: record && typeof record === "object" ? Object.keys(record).slice(0, 120) : [],
        related_keys: related && typeof related === "object" ? Object.keys(related).slice(0, 80) : [],
        file_access_hints: collectMetadataHints(payload)
      });
    } catch (error) {
      detailResults.push({ query_record: item, request: { requested_url: url, error: error.message }, file_access_hints: [] });
    }
  }

  const successfulSearches = searchResults.filter((item) => item.request.response_ok && item.request.json_valid);
  const returnedRecords = searchResults.flatMap((item) => item.records.map((record) => Object.assign({ query: item.query.term }, record)));
  const detailHints = detailResults.flatMap((item) => item.file_access_hints || []);
  const hasExplicitFileEvidence = detailHints.some((item) =>
    /(file|download|remote.?url|attachment)/i.test(item.key) &&
    (item.value_type === "URL_STRING" || item.value_type === "FILENAME_LIKE_STRING")
  );
  let decision = "NO_VERIFIED_MATCHING_RECORD";
  if (successfulSearches.length === 0) decision = "API_SEARCH_UNAVAILABLE_OR_REQUIRES_AUTH";
  else if (returnedRecords.length > 0 && hasExplicitFileEvidence) decision = "RECORDS_AND_FILE_METADATA_FOUND_REQUIRES_FILE_LEVEL_QA";
  else if (returnedRecords.length > 0) decision = "RECORDS_FOUND_FILE_INVENTORY_REVIEW_REQUIRED";
  else decision = "API_SEARCH_RETURNED_NO_MATCHING_RECORDS";

  const report = {
    audit_type: "NLSP_OBSERVED_PUBLIC_RECORD_SEARCH_AND_DETAIL_AUDIT",
    audited_at: new Date().toISOString(),
    source: ORIGIN + "/explore",
    api_base_observed_in_official_nlsp_application: API_BASE,
    api_route_basis: [
      "The official NLSP app bundle defines axios baseURL /api/v1.",
      "The inspected search hook calls GET /data/experiments?search=<term>&limit=25.",
      "The inspected detail hook calls GET /data/{type}/{returned-id}/full.",
      "Every detail request in this run uses an ID returned by the search response."
    ],
    credentials_used: false,
    searches: searchResults,
    returned_search_records: returnedRecords,
    detail_records: detailResults,
    measurement_files_downloaded: 0,
    file_bytes_downloaded: 0,
    decision,
    limitation: "This audit retrieves public record metadata only. A file is not considered acquired or usable until an exact file record and source-provided download reference are verified, reuse terms are recorded, and original bytes pass file-level integrity and schema QA."
  };
  await fs.writeFile(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({
    audit_type: report.audit_type,
    audited_at: report.audited_at,
    credentials_used: false,
    searches: searchResults.map((item) => ({
      type: item.query.type,
      term: item.query.term,
      http_status: item.request.http_status ?? null,
      json_valid: item.request.json_valid ?? false,
      returned_document_count: item.returned_document_count
    })),
    returned_search_records: returnedRecords,
    detailed_record_count: detailResults.length,
    explicit_file_hint_count: detailHints.filter((item) => /(file|download|remote.?url|attachment)/i.test(item.key)).length,
    measurement_files_downloaded: 0,
    decision: report.decision
  }, null, 2));
}
if (require.main === module) {
  run().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
module.exports = { makeSearchUrl, makeDetailUrl, parseDocumentList, collectMetadataHints, getRecordId, getRecordTitle };

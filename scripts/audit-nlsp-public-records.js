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
function makeFileDownloadUrl(fileKey) {
  const key = String(fileKey || "").trim();
  if (!key) throw new Error("NLSP file key must not be blank.");
  return API_BASE + "/files/" + encodeURIComponent(key) + "/download";
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
async function fetchObservedDatasetFileExplorerBundle() {
  const url = ORIGIN + "/assets/DatasetFileExplorer-DzuP8FKk.js";
  const parsed = new URL(url);
  if (parsed.origin !== ORIGIN || parsed.pathname !== "/assets/DatasetFileExplorer-DzuP8FKk.js") {
    throw new Error("Refusing an unobserved NLSP asset URL.");
  }
  const response = await fetch(url, {
    headers: {
      accept: "application/javascript",
      "user-agent": "ASTRA-NLSP-Public-Record-Audit/1.0"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(45000)
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const finalUrl = new URL(response.url);
  const result = {
    requested_url: url,
    final_url: response.url,
    http_status: response.status,
    content_type: response.headers.get("content-type"),
    byte_length: bytes.byteLength,
    sha256: sha256(bytes),
    response_ok: response.ok,
    file_name: "DatasetFileExplorer-DzuP8FKk.js"
  };
  if (finalUrl.origin !== ORIGIN) {
    throw new Error("The NLSP DatasetFileExplorer bundle redirected outside nlsp.nasa.gov.");
  }
  if (!response.ok) return { result, source: "" };
  if (bytes.byteLength > 5 * 1024 * 1024) {
    result.error = "BUNDLE_EXCEEDED_5_MIB_LIMIT";
    return { result, source: "" };
  }
  await fs.writeFile(path.join(OUTPUT_DIR, result.file_name), bytes);
  const source = bytes.toString("utf8");
  const terms = [
    "getfiles3",
    "__s3_file_guid",
    "dataset_file_info",
    "dataset_fileIndex",
    "file_download",
    "download",
    "file_name",
    "remote_url",
    "data_files"
  ];
  const contexts = [];
  const seen = new Set();
  for (const term of terms) {
    let cursor = 0;
    let count = 0;
    while (cursor < source.length && count < 8 && contexts.length < 50) {
      const index = source.toLowerCase().indexOf(term.toLowerCase(), cursor);
      if (index < 0) break;
      const start = Math.max(0, index - 420);
      const end = Math.min(source.length, index + term.length + 700);
      const snippet = source.slice(start, end);
      const key = term + "|" + snippet.slice(0, 180);
      if (!seen.has(key)) {
        seen.add(key);
        contexts.push({ term, snippet });
      }
      cursor = index + term.length;
      count += 1;
    }
  }
  const downloadCalls = [];
  for (const match of source.matchAll(/_e\(/g)) {
    const index = match.index;
    downloadCalls.push({
      offset: index,
      snippet: source.slice(Math.max(0, index - 1100), Math.min(source.length, index + 1500))
    });
    if (downloadCalls.length >= 30) break;
  }
  const requestCalls = [];
  for (const match of source.matchAll(/Mt\(\{method:/g)) {
    const index = match.index;
    requestCalls.push({
      offset: index,
      snippet: source.slice(Math.max(0, index - 350), Math.min(source.length, index + 1100))
    });
    if (requestCalls.length >= 30) break;
  }
  const imports = Array.from(source.matchAll(/from["']([^"']+\.js)["']/g), (match) => match[1]);
  const apiPathLiterals = Array.from(source.matchAll(/["']((?:\/api\/v1|\/api|\/explore|\/data|\/files)[^"']{1,240})["']/g), (match) => match[1]);
  const keyAssignments = [];
  for (const match of source.matchAll(/\bkey\s*:/g)) {
    const index = match.index;
    keyAssignments.push({ offset: index, snippet: source.slice(Math.max(0, index - 500), Math.min(source.length, index + 800)) });
    if (keyAssignments.length >= 25) break;
  }
  const apiClientImport = imports.find((value) => value.includes("index-BsIoQ7MG.js")) || null;
  let apiClient = { result: null, contexts: [] };
  if (apiClientImport) {
    const apiClientUrl = new URL(apiClientImport, url);
    if (apiClientUrl.origin === ORIGIN && apiClientUrl.pathname.startsWith("/assets/")) {
      try {
        const clientResponse = await fetch(apiClientUrl.toString(), {
          headers: { accept: "application/javascript", "user-agent": "ASTRA-NLSP-Public-Record-Audit/1.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(45000)
        });
        const clientBytes = Buffer.from(await clientResponse.arrayBuffer());
        const clientFinalUrl = new URL(clientResponse.url);
        apiClient.result = {
          requested_url: apiClientUrl.toString(),
          final_url: clientResponse.url,
          http_status: clientResponse.status,
          content_type: clientResponse.headers.get("content-type"),
          byte_length: clientBytes.byteLength,
          sha256: sha256(clientBytes),
          response_ok: clientResponse.ok
        };
        if (clientFinalUrl.origin === ORIGIN && clientResponse.ok && clientBytes.byteLength <= 5 * 1024 * 1024) {
          await fs.writeFile(path.join(OUTPUT_DIR, "nlsp-api-client-index-BsIoQ7MG.js"), clientBytes);
          const clientSource = clientBytes.toString("utf8");
          for (const term of ["baseURL", "/api/v1", "axios.create", "create({"]) {
            let cursor = 0;
            let count = 0;
            while (cursor < clientSource.length && count < 8 && apiClient.contexts.length < 35) {
              const index = clientSource.toLowerCase().indexOf(term.toLowerCase(), cursor);
              if (index < 0) break;
              apiClient.contexts.push({
                term,
                snippet: clientSource.slice(Math.max(0, index - 400), Math.min(clientSource.length, index + term.length + 700))
              });
              cursor = index + term.length;
              count += 1;
            }
          }
        }
      } catch (error) {
        apiClient.result = { requested_url: apiClientUrl.toString(), error: error.message };
      }
    }
  }
  result.matches = contexts.length;
  result.download_call_count = downloadCalls.length;
  result.request_call_count = requestCalls.length;
  result.import_count = imports.length;
  result.api_client_import = apiClientImport;
  return {
    result,
    contexts,
    downloadCalls,
    requestCalls,
    imports: [...new Set(imports)],
    apiPathLiterals: [...new Set(apiPathLiterals)],
    keyAssignments,
    apiClient
  };
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
function parseCsvTable(input) {
  const source = String(input).replace(/^\uFEFF/, "");
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value !== "")) records.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("Downloaded BRSMACT CSV has an unterminated quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== "")) records.push(row);
  }
  if (records.length < 2) throw new Error("Downloaded BRSMACT CSV contains no data rows.");
  const headers = records.shift().map((value) => value.trim());
  if (headers.some((value) => !value) || new Set(headers).size !== headers.length) {
    throw new Error("Downloaded BRSMACT CSV has blank or duplicate headers.");
  }
  const rows = records.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error("Downloaded BRSMACT CSV row " + (rowIndex + 2) + " has an unexpected column count.");
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
  return { headers, rows };
}

function parseClockDurationMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,3}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite) || minutes >= 60 || seconds >= 60) return null;
  return hours * 60 + minutes + seconds / 60;
}

function parseMonthDayYear(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const check = new Date(timestamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { timestamp, iso: check.toISOString().slice(0, 10), source: String(value).trim() };
}

function summarizeActigraphyCsv(input) {
  const parsed = parseCsvTable(input);
  const lowerHeaders = parsed.headers.map((value) => value.toLowerCase());
  const findHeader = (pattern) => parsed.headers[lowerHeaders.findIndex((value) => pattern.test(value))] || null;
  const subjectField = findHeader(/^subject$/);
  const phaseField = findHeader(/test[_ ]phase/i);
  const dateField = findHeader(/^date$/);
  const dayField = findHeader(/br[_ ]day/i);
  const latencyField = findHeader(/sleep latency/i);
  const durationField = findHeader(/sleep duration/i);
  const efficiencyField = findHeader(/sleep efficiency/i);
  const distinct = (field) => field ? [...new Set(parsed.rows.map((row) => String(row[field] || "").trim()).filter(Boolean))].sort() : [];
  const countMissing = (field) => field ? parsed.rows.filter((row) => {
    const value = String(row[field] ?? "").trim();
    return !value || /^na$/i.test(value) || /^n\/a$/i.test(value);
  }).length : null;
  const summarizeClock = (field) => {
    if (!field) return null;
    const values = parsed.rows.map((row) => parseClockDurationMinutes(row[field])).filter((value) => value !== null);
    return values.length ? {
      source_field: field,
      valid_count: values.length,
      missing_or_unparsed_count: parsed.rows.length - values.length,
      minimum_minutes: Math.min(...values),
      maximum_minutes: Math.max(...values)
    } : { source_field: field, valid_count: 0 };
  };
  const efficiencyValues = efficiencyField
    ? parsed.rows.map((row) => {
        const raw = String(row[efficiencyField] ?? "").trim().replace(/%$/, "");
        if (!raw || /^na$/i.test(raw) || /^n\/a$/i.test(raw)) return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      }).filter((value) => value !== null)
    : [];
  const dateValues = distinct(dateField);
  const parsedDates = dateValues.map(parseMonthDayYear).filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
  const unparsedDateValues = dateValues.filter((value) => parseMonthDayYear(value) === null);
  const phaseCounts = {};
  if (phaseField) {
    parsed.rows.forEach((row) => {
      const phase = String(row[phaseField] || "").trim() || "MISSING";
      phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
    });
  }
  const subjectDateKeys = subjectField && dateField
    ? parsed.rows.map((row) => ({
        subject: String(row[subjectField] || "").trim(),
        date: String(row[dateField] || "").trim()
      })).filter((item) => item.subject && item.date)
      .map((item) => item.subject + "|" + item.date)
    : [];
  return {
    row_count: parsed.rows.length,
    column_count: parsed.headers.length,
    headers: parsed.headers,
    participant_count: distinct(subjectField).length,
    participant_ids: distinct(subjectField).slice(0, 100),
    phase_counts: phaseCounts,
    date_field: dateField,
    observed_date_values_count: dateValues.length,
    parseable_date_values_count: parsedDates.length,
    unparsed_date_values: unparsedDateValues,
    earliest_date_string: parsedDates[0]?.source || null,
    latest_date_string: parsedDates.at(-1)?.source || null,
    earliest_date_iso: parsedDates[0]?.iso || null,
    latest_date_iso: parsedDates.at(-1)?.iso || null,
    br_day_field: dayField,
    br_day_values: distinct(dayField).slice(0, 100),
    missing_counts: Object.fromEntries(parsed.headers.map((header) => [header, countMissing(header)])),
    sleep_latency: summarizeClock(latencyField),
    sleep_duration: summarizeClock(durationField),
    sleep_efficiency: efficiencyValues.length ? {
      source_field: efficiencyField,
      valid_count: efficiencyValues.length,
      missing_or_unparsed_count: parsed.rows.length - efficiencyValues.length,
      minimum_percent: Math.min(...efficiencyValues),
      maximum_percent: Math.max(...efficiencyValues)
    } : efficiencyField ? { source_field: efficiencyField, valid_count: 0 } : null,
    duplicate_subject_date_pairs: subjectDateKeys.length - new Set(subjectDateKeys).size
  };
}

async function downloadBRSMACTFileInventory(fileRecords) {
  const output = [];
  const downloadDir = path.join(OUTPUT_DIR, "downloads");
  await fs.mkdir(downloadDir, { recursive: true });
  for (const fileRecord of fileRecords) {
    const values = fileRecord && fileRecord.values ? fileRecord.values : {};
    const originalName = String(values.__original_file_name || values.file_name || "").trim();
    const expectedMd5 = String(values.__file_md5sum || "").trim().toLowerCase();
    const expectedBytes = Number(values.file_size);
    const identifiers = [
      ["id", values.id],
      ["__dirid", values.__dirid],
      ["guid_id", values.guid_id],
      ["__s3_file_guid", values.__s3_file_guid]
    ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
    const uniqueIdentifiers = [];
    const seenIdentifiers = new Set();
    for (const [field, value] of identifiers) {
      const normalized = String(value).trim();
      if (!seenIdentifiers.has(normalized)) {
        seenIdentifiers.add(normalized);
        uniqueIdentifiers.push({ field, value: normalized });
      }
    }
    const result = {
      original_file_name: originalName,
      expected_file_size: Number.isFinite(expectedBytes) ? expectedBytes : null,
      expected_md5: expectedMd5,
      candidate_identifiers: uniqueIdentifiers,
      attempts: [],
      verified: false,
      measurement_file_downloaded: false
    };
    if (!originalName || !/^[a-f0-9]{32}$/.test(expectedMd5) || !Number.isFinite(expectedBytes) || expectedBytes <= 0) {
      result.error = "SOURCE_FILE_RECORD_MISSING_FILENAME_SIZE_OR_VALID_MD5";
      output.push(result);
      continue;
    }
    for (const candidate of uniqueIdentifiers) {
      const url = API_BASE + "/files/" + encodeURIComponent(candidate.value) + "/download";
      const attempt = {
        identifier_field: candidate.field,
        requested_url: url
      };
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/octet-stream,text/csv,text/plain,*/*",
            "user-agent": "ASTRA-NLSP-Public-Record-Audit/1.0"
          },
          redirect: "follow",
          signal: AbortSignal.timeout(60000)
        });
        const bytes = Buffer.from(await response.arrayBuffer());
        const finalUrl = new URL(response.url);
        const finalHostAllowed = finalUrl.protocol === "https:" &&
          (finalUrl.origin === ORIGIN || finalUrl.hostname.endsWith(".amazonaws.com"));
        const actualMd5 = crypto.createHash("md5").update(bytes).digest("hex");
        const actualSha256 = sha256(bytes);
        attempt.final_url = response.url;
        attempt.final_host = finalUrl.hostname;
        attempt.http_status = response.status;
        attempt.content_type = response.headers.get("content-type");
        attempt.content_disposition = response.headers.get("content-disposition");
        attempt.byte_length = bytes.byteLength;
        attempt.md5 = actualMd5;
        attempt.sha256 = actualSha256;
        attempt.final_host_allowed = finalHostAllowed;
        attempt.expected_size_match = bytes.byteLength === expectedBytes;
        attempt.expected_md5_match = actualMd5 === expectedMd5;
        attempt.verified = response.ok && finalHostAllowed &&
          attempt.expected_size_match && attempt.expected_md5_match;
        if (attempt.verified) {
          const safeFilename = path.basename(originalName).replace(/[^A-Za-z0-9._-]/g, "_");
          const destination = path.join(downloadDir, safeFilename);
          await fs.writeFile(destination, bytes);
          attempt.artifact_path = path.relative(process.cwd(), destination);
          result.verified = true;
          result.measurement_file_downloaded = /\.(csv|tsv|edf|dat)$/i.test(originalName);
          result.actual_file_size = bytes.byteLength;
          result.actual_md5 = actualMd5;
          result.actual_sha256 = actualSha256;
          result.content_type = attempt.content_type;
          result.artifact_path = attempt.artifact_path;
          if (/\.csv$/i.test(originalName) || /\.txt$/i.test(originalName)) {
            const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
            const lines = text.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
            result.text_inspection = {
              utf8_decodable: true,
              line_count: lines.length,
              first_lines: lines.slice(0, 12).map((line) => line.slice(0, 2000))
            };
            if (/\.csv$/i.test(originalName)) {
              result.schema_analysis = summarizeActigraphyCsv(text);
            }
          }
          result.attempts.push(attempt);
          break;
        }
      } catch (error) {
        attempt.error = error.message;
      }
      result.attempts.push(attempt);
    }
    if (!result.verified) result.error = "NO_RETURNED_FILE_IDENTIFIER_PASSED_SOURCE_SIZE_AND_MD5_CHECKS";
    output.push(result);
  }
  return output;
}

async function downloadBRSMCFRelatedFiles(relatedDatasets) {
  const candidates = (Array.isArray(relatedDatasets) ? relatedDatasets : []).flatMap((dataset) =>
    (Array.isArray(dataset?.children) ? dataset.children : []).map((child) => ({
      dataset_label: String(dataset?.title || ""),
      label: String(child?.label || ""),
      values: child?.values || {}
    }))
  ).filter((item) => item.values.key && Number(item.values.file_size) > 0)
    .slice(0, 20);

  const directory = path.join(OUTPUT_DIR, "downloads", "BRSMCF");
  await fs.mkdir(directory, { recursive: true });
  const output = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    const key = String(item.values.key);
    const expectedBytes = Number(item.values.file_size);
    const result = {
      dataset_label: item.dataset_label,
      source_file_label: item.label,
      source_file_key: key,
      expected_file_size: expectedBytes,
      source_md5_available: false,
      downloaded: false,
      source_size_match: false,
      source_md5_verified: false
    };
    const url = makeFileDownloadUrl(key);
    result.requested_url = url;
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/octet-stream,text/csv,text/plain,*/*",
          "user-agent": "ASTRA-NLSP-Public-Record-Audit/1.0"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(60000)
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const finalUrl = new URL(response.url);
      const finalHostAllowed = finalUrl.protocol === "https:" &&
        (finalUrl.origin === ORIGIN || finalUrl.hostname.endsWith(".amazonaws.com"));
      const actualSha256 = sha256(bytes);
      const actualMd5 = crypto.createHash("md5").update(bytes).digest("hex");
      result.final_url = response.url;
      result.final_host = finalUrl.hostname;
      result.http_status = response.status;
      result.content_type = response.headers.get("content-type");
      result.content_disposition = response.headers.get("content-disposition");
      result.byte_length = bytes.byteLength;
      result.sha256 = actualSha256;
      result.md5_computed_not_source_verified = actualMd5;
      result.final_host_allowed = finalHostAllowed;
      result.source_size_match = bytes.byteLength === expectedBytes;
      result.downloaded = response.ok && finalHostAllowed && result.source_size_match;
      result.status = result.downloaded
        ? "DOWNLOADED_SOURCE_SIZE_MATCHED_SOURCE_MD5_NOT_SUPPLIED"
        : "DOWNLOAD_OR_SOURCE_SIZE_CHECK_FAILED";
      if (result.downloaded) {
        const safeFilename = String(index + 1).padStart(2, "0") + "-" +
          path.basename(item.label || "brsmcf-file").replace(/[^A-Za-z0-9._-]/g, "_");
        const destination = path.join(directory, safeFilename);
        await fs.writeFile(destination, bytes);
        result.artifact_path = path.relative(process.cwd(), destination);
        const contentType = String(result.content_type || "").toLowerCase();
        const isCsv = /\.csv$/i.test(item.label) || contentType.includes("text/csv");
        const isText = isCsv || /\.txt$/i.test(item.label) || contentType.startsWith("text/");
        if (isCsv) {
          try {
            const parsed = parseCsvTable(bytes.toString("utf8"));
            result.csv_inspection = {
              parse_status: "PASS",
              row_count: parsed.rows.length,
              column_count: parsed.headers.length,
              headers: parsed.headers,
              first_data_row: parsed.rows[0] || null
            };
          } catch (error) {
            result.csv_inspection = { parse_status: "FAIL", error: error.message };
          }
        } else if (isText) {
          result.text_preview = bytes.toString("utf8").split(/\r\n|\n|\r/).slice(0, 8);
        }
      }
    } catch (error) {
      result.error = error.message;
      result.status = "DOWNLOAD_REQUEST_FAILED";
    }
    output.push(result);
  }
  return output;
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
      const datasetItems = Array.isArray(related?.datasets) ? related.datasets : [];
      const dataFileItems = Array.isArray(related?.data_files?.items) ? related.data_files.items : [];
      const datasetSummaries = datasetItems.map((dataset) => ({
        id: getRecordId(dataset),
        title: String(dataset?.title || dataset?.dataset_title || dataset?.name || dataset?.label || "").trim(),
        keys: dataset && typeof dataset === "object" ? Object.keys(dataset).slice(0, 80) : [],
        children_count: Array.isArray(dataset?.children) ? dataset.children.length : 0,
        children: (Array.isArray(dataset?.children) ? dataset.children : []).slice(0, 100).map((child) => ({
          id: getRecordId(child),
          label: String(child?.label || child?.file_name || child?.name || "").trim(),
          keys: child && typeof child === "object" ? Object.keys(child).slice(0, 60) : [],
          values: child && typeof child === "object" ? Object.fromEntries(
            Object.entries(child).filter(([key, value]) =>
              /(file|download|remote|url|md5|guid|access|license|restrict|size|public|lock|catalog|owner|availability|rights|terms)/i.test(key) ||
              ["key", "meta", "date", "type", "ext"].includes(key)
            ).filter(([, value]) =>
              typeof value === "string" || typeof value === "number" || typeof value === "boolean"
            )
          ) : {},
          dataset_file_info: child?.dataset_file_info && typeof child.dataset_file_info === "object"
            ? {
                keys: Object.keys(child.dataset_file_info).slice(0, 80),
                values: Object.fromEntries(Object.entries(child.dataset_file_info).filter(([, value]) =>
                  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                ))
              }
            : null
        }))
      }));
      const dataFileSummaries = dataFileItems.map((item) => ({
        keys: item && typeof item === "object" ? Object.keys(item).slice(0, 80) : [],
        values: item && typeof item === "object" ? Object.fromEntries(
          Object.entries(item).filter(([key, value]) =>
            /(file|download|remote|url|md5|guid|access|license|restrict|size|public)/i.test(key) ||
            ["id", "_id", "__dirid", "experiment_id", "dataset_fileIndex"].includes(key)
          ).filter(([, value]) =>
            typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          )
        ) : {}
      }));
      detailResults.push({
        query_record: item,
        request: fetched.result,
        record_id: getRecordId(record) || item.id,
        record_title: getRecordTitle(record) || item.title,
        record_metadata: record && typeof record === "object" ? Object.fromEntries(
          Object.entries(record).filter(([key, value]) =>
            /(availability|locked|processinglevel|datasource|datasetdescription|license|rights|terms|access|owner|location|mission_id|experiment_id|__title|__description|dataset_catalog)/i.test(key) &&
            (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
          ).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 3000) : value])
        ) : {},
        top_level_keys: payload && typeof payload === "object" ? Object.keys(payload).slice(0, 80) : [],
        record_keys: record && typeof record === "object" ? Object.keys(record).slice(0, 120) : [],
        related_keys: related && typeof related === "object" ? Object.keys(related).slice(0, 80) : [],
        related_dataset_count: datasetItems.length,
        related_data_file_count: dataFileItems.length,
        related_datasets: datasetSummaries,
        related_data_files: dataFileSummaries,
        file_access_hints: collectMetadataHints(payload)
      });
    } catch (error) {
      detailResults.push({ query_record: item, request: { requested_url: url, error: error.message }, file_access_hints: [] });
    }
  }

  const bresmactDetail = detailResults.find((item) => item.query_record.type === "DATASETS" &&
    item.query_record.id === "e26501eb-7d7a-5012-8c8e-c5bdb3eecaf6");
  const bresmactDownloads = await downloadBRSMACTFileInventory(
    bresmactDetail && Array.isArray(bresmactDetail.related_data_files) ? bresmactDetail.related_data_files : []
  );
  const brsmcfDetail = detailResults.find((item) => item.query_record.type === "EXPERIMENTS" &&
    item.query_record.id === "9af6f9ba-3730-54ab-a82a-1a32798667ae");
  const brsmcfDownloads = await downloadBRSMCFRelatedFiles(
    brsmcfDetail && Array.isArray(brsmcfDetail.related_datasets) ? brsmcfDetail.related_datasets : []
  );
  const brsmcfSizeMatchedFiles = brsmcfDownloads.filter((item) => item.downloaded);
  const brsmcfDetailMetadata = brsmcfDetail?.record_metadata || {};
  const brsmcfReuseTermsFields = Object.fromEntries(Object.entries(brsmcfDetailMetadata).filter(([key]) =>
    /(license|rights|reuse|terms|copyright)/i.test(key)
  ));
  const brsmcfReuseTermsStatus = Object.keys(brsmcfReuseTermsFields).length > 0
    ? "REUSE_TERMS_FIELDS_PRESENT_REQUIRES_REVIEW"
    : "NO_EXPLICIT_REUSE_TERMS_FIELD_RETURNED";

  const successfulSearches = searchResults.filter((item) => item.request.response_ok && item.request.json_valid);
  const returnedRecords = searchResults.flatMap((item) => item.records.map((record) => Object.assign({ query: item.query.term }, record)));
  const detailHints = detailResults.flatMap((item) => item.file_access_hints || []);
  const hasExplicitFileEvidence = detailHints.some((item) =>
    /(file|download|remote.?url|attachment)/i.test(item.key) &&
    (item.value_type === "URL_STRING" || item.value_type === "FILENAME_LIKE_STRING")
  );
  const verifiedBRSMACTFiles = bresmactDownloads.filter((item) => item.verified);
  const verifiedMeasurementFiles = verifiedBRSMACTFiles.filter((item) => item.measurement_file_downloaded);
  const schemaPassFiles = verifiedMeasurementFiles.filter((item) => {
    const schema = item.schema_analysis;
    if (!schema || !Array.isArray(schema.headers) || !schema.headers.length) return false;
    const headers = new Set(schema.headers.map((value) => String(value).toLowerCase()));
    return schema.row_count > 0 &&
      schema.participant_count > 0 &&
      schema.parseable_date_values_count > 0 &&
      headers.has("subject") &&
      headers.has("date") &&
      headers.has("test_phase");
  });
  const primaryBRSMACTFile = schemaPassFiles
    .filter((item) => item.schema_analysis.duplicate_subject_date_pairs === 0)
    .sort((a, b) => b.schema_analysis.participant_count - a.schema_analysis.participant_count ||
      b.schema_analysis.row_count - a.schema_analysis.row_count)[0] || null;
  const bresmactDetailMetadata = bresmactDetail?.record_metadata || {};
  const reuseTermsFields = Object.fromEntries(Object.entries(bresmactDetailMetadata).filter(([key]) =>
    /(license|rights|reuse|terms|copyright)/i.test(key)
  ));
  const reuseTermsStatus = Object.keys(reuseTermsFields).length > 0
    ? "REUSE_TERMS_FIELDS_PRESENT_REQUIRES_REVIEW"
    : "NO_EXPLICIT_REUSE_TERMS_FIELD_RETURNED";
  let decision = "NO_VERIFIED_MATCHING_RECORD";
  if (successfulSearches.length === 0) decision = "API_SEARCH_UNAVAILABLE_OR_REQUIRES_AUTH";
  else if (primaryBRSMACTFile && reuseTermsStatus === "NO_EXPLICIT_REUSE_TERMS_FIELD_RETURNED") {
    decision = brsmcfSizeMatchedFiles.length > 0
      ? "BRSMACT_PRIMARY_CSV_SCHEMA_QA_PASSED_AND_BRSMCF_FILES_SIZE_MATCHED_REUSE_TERMS_NOT_EXPLICITLY_RETURNED"
      : "BRSMACT_PRIMARY_CSV_HASH_AND_SCHEMA_QA_PASSED_REUSE_TERMS_NOT_EXPLICITLY_RETURNED";
  } else if (primaryBRSMACTFile) {
    decision = "BRSMACT_PRIMARY_CSV_HASH_AND_SCHEMA_QA_PASSED_REUSE_TERMS_REQUIRE_REVIEW";
  } else if (verifiedMeasurementFiles.length > 0) {
    decision = "BRSMACT_FILES_HASH_VERIFIED_SCHEMA_QA_INCOMPLETE";
  }
  else if (returnedRecords.length > 0 && hasExplicitFileEvidence) decision = "RECORDS_AND_FILE_METADATA_FOUND_REQUIRES_FILE_LEVEL_QA";
  else if (returnedRecords.length > 0) decision = "RECORDS_FOUND_FILE_INVENTORY_REVIEW_REQUIRED";
  else decision = "API_SEARCH_RETURNED_NO_MATCHING_RECORDS";

  let datasetFileExplorer;
  try {
    datasetFileExplorer = await fetchObservedDatasetFileExplorerBundle();
  } catch (error) {
    datasetFileExplorer = {
      result: { requested_url: ORIGIN + "/assets/DatasetFileExplorer-DzuP8FKk.js", error: error.message },
      contexts: []
    };
  }

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
    observed_dataset_file_explorer_bundle: datasetFileExplorer.result,
    dataset_file_explorer_contexts: datasetFileExplorer.contexts || [],
    dataset_file_explorer_download_calls: datasetFileExplorer.downloadCalls || [],
    dataset_file_explorer_request_calls: datasetFileExplorer.requestCalls || [],
    dataset_file_explorer_imports: datasetFileExplorer.imports || [],
    dataset_file_explorer_api_path_literals: datasetFileExplorer.apiPathLiterals || [],
    dataset_file_explorer_key_assignments: datasetFileExplorer.keyAssignments || [],
    dataset_file_explorer_api_client: datasetFileExplorer.apiClient || null,
    measurement_files_downloaded: verifiedMeasurementFiles.length,
    supporting_files_downloaded: verifiedBRSMACTFiles.length - verifiedMeasurementFiles.length,
    file_inventory_downloaded: verifiedBRSMACTFiles.length,
    file_bytes_downloaded: verifiedBRSMACTFiles.reduce((sum, item) => sum + (item.actual_file_size || 0), 0),
    schema_pass_file_count: schemaPassFiles.length,
    brsmcf_file_count: brsmcfDownloads.length,
    brsmcf_size_matched_file_count: brsmcfSizeMatchedFiles.length,
    brsmcf_downloaded_bytes: brsmcfSizeMatchedFiles.reduce((sum, item) => sum + (item.byte_length || 0), 0),
    brsmcf_source_md5_verified_file_count: 0,
    brsmcf_download_audit: brsmcfDownloads,
    brsmcf_reuse_terms_status: brsmcfReuseTermsStatus,
    brsmcf_reuse_terms_fields: brsmcfReuseTermsFields,
    primary_analysis_candidate: primaryBRSMACTFile ? {
      original_file_name: primaryBRSMACTFile.original_file_name,
      participant_count: primaryBRSMACTFile.schema_analysis.participant_count,
      row_count: primaryBRSMACTFile.schema_analysis.row_count,
      duplicate_subject_date_pairs: primaryBRSMACTFile.schema_analysis.duplicate_subject_date_pairs,
      earliest_date_iso: primaryBRSMACTFile.schema_analysis.earliest_date_iso,
      latest_date_iso: primaryBRSMACTFile.schema_analysis.latest_date_iso
    } : null,
    reuse_terms_status: reuseTermsStatus,
    reuse_terms_fields: reuseTermsFields,
    decision,
    limitation: "BRSMACT files are downloaded from the public NLSP file endpoint and verified against source catalog byte length and MD5 values. Schema checks are descriptive; reuse terms were not explicitly returned in the inspected dataset record and require separate review. BRSMACT is a ground-based bed-rest analogue, not in-flight astronaut telemetry."
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
    dataset_file_explorer_bundle: datasetFileExplorer.result,
    dataset_file_explorer_contexts: datasetFileExplorer.contexts || [],
    dataset_file_explorer_download_calls: datasetFileExplorer.downloadCalls || [],
    dataset_file_explorer_request_calls: datasetFileExplorer.requestCalls || [],
    dataset_file_explorer_imports: datasetFileExplorer.imports || [],
    dataset_file_explorer_api_path_literals: datasetFileExplorer.apiPathLiterals || [],
    dataset_file_explorer_key_assignments: datasetFileExplorer.keyAssignments || [],
    dataset_file_explorer_api_client: datasetFileExplorer.apiClient || null,
    bresmact_file_download_audit: bresmactDownloads,
    measurement_files_downloaded: verifiedMeasurementFiles.length,
    supporting_files_downloaded: verifiedBRSMACTFiles.length - verifiedMeasurementFiles.length,
    file_bytes_downloaded: verifiedBRSMACTFiles.reduce((sum, item) => sum + (item.actual_file_size || 0), 0),
    detail_records: detailResults.map((item) => ({
      query_record: item.query_record,
      http_status: item.request.http_status ?? null,
      json_valid: item.request.json_valid ?? false,
      record_id: item.record_id ?? null,
      record_title: item.record_title ?? null,
      record_metadata: item.record_metadata || {},
      top_level_keys: item.top_level_keys || [],
      record_keys: item.record_keys || [],
      related_keys: item.related_keys || [],
      related_dataset_count: item.related_dataset_count || 0,
      related_data_file_count: item.related_data_file_count || 0,
      related_datasets: item.related_datasets || [],
      related_data_files: item.related_data_files || [],
      file_access_hints: item.file_access_hints || []
    })),
    detailed_record_count: detailResults.length,
    explicit_file_hint_count: detailHints.filter((item) => /(file|download|remote.?url|attachment)/i.test(item.key)).length,
    measurement_files_downloaded: verifiedMeasurementFiles.length,
    supporting_files_downloaded: verifiedBRSMACTFiles.length - verifiedMeasurementFiles.length,
    file_inventory_downloaded: verifiedBRSMACTFiles.length,
    file_bytes_downloaded: verifiedBRSMACTFiles.reduce((sum, item) => sum + (item.actual_file_size || 0), 0),
    schema_pass_file_count: schemaPassFiles.length,
    brsmcf_file_count: brsmcfDownloads.length,
    brsmcf_size_matched_file_count: brsmcfSizeMatchedFiles.length,
    brsmcf_downloaded_bytes: brsmcfSizeMatchedFiles.reduce((sum, item) => sum + (item.byte_length || 0), 0),
    brsmcf_source_md5_verified_file_count: 0,
    brsmcf_download_audit: brsmcfDownloads,
    brsmcf_reuse_terms_status: brsmcfReuseTermsStatus,
    brsmcf_reuse_terms_fields: brsmcfReuseTermsFields,
    primary_analysis_candidate: report.primary_analysis_candidate,
    reuse_terms_status: reuseTermsStatus,
    reuse_terms_fields: reuseTermsFields,
    decision: report.decision
  }, null, 2));
}
if (require.main === module) {
  run().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
module.exports = { makeSearchUrl, makeDetailUrl, makeFileDownloadUrl, parseDocumentList, collectMetadataHints, getRecordId, getRecordTitle, parseCsvTable, parseClockDurationMinutes, parseMonthDayYear, summarizeActigraphyCsv };

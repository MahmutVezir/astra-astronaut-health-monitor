"use strict";

const OSDR_ORIGIN = "https://osdr.nasa.gov";
const OSDR_API_ROOT = OSDR_ORIGIN + "/osdr/data/osd";
const OSDR_PUBLIC_BUCKET_HOST = "nasa-osdr.s3.us-west-2.amazonaws.com";
const OSDR_ALSDA_BUCKET_HOST = "genelab-alsda-repo-prod.s3.amazonaws.com";
const OSDR_ALSDA_HDCVD9_PATH = "/alsda-data/LSDS-8/Multiplex/";
const OSDR_APPROVED_OSD53_BUCKET_OBJECTS = Object.freeze({
  "OSD-53_metadata_OSD-53-ISA.zip": {
    host: "genelab-shared-repo-prod.s3.amazonaws.com",
    path: "/osd-data/OSD-53/metadata/OSD-53_metadata_OSD-53-ISA.zip"
  },
  "GLDS-53_microarray_E-GEOD-47126.additional.zip": {
    host: "genelab-repo-prod.s3.amazonaws.com",
    path: "/genelab-data/GLDS-53/microarray/GLDS-53_microarray_E-GEOD-47126.additional.zip"
  },
  "GLDS-53_microarray_E-GEOD-47126.processed.zip": {
    host: "genelab-repo-prod.s3.amazonaws.com",
    path: "/genelab-data/GLDS-53/microarray/GLDS-53_microarray_E-GEOD-47126.processed.zip"
  }
});

function parseStudyIdentifier(studyId, requestedVersion = null) {
  const match = String(studyId).match(/^OSD-(\d+)(?:\.(\d+))?$/);
  if (!match) throw new TypeError("studyId must use the OSD-<number>[.<version>] format");

  const embeddedVersion = match[2] || null;
  const version = requestedVersion === null || requestedVersion === undefined
    ? embeddedVersion
    : String(requestedVersion);

  if (embeddedVersion && version && embeddedVersion !== version) {
    throw new Error("Conflicting OSDR study versions: " + embeddedVersion + " and " + version);
  }
  if (version !== null && !/^\d+$/.test(version)) {
    throw new TypeError("studyVersion must be a non-negative integer string");
  }

  return {
    number: match[1],
    version,
    accession: version ? match[1] + "." + version : match[1],
    studyKeys: version
      ? ["OSD-" + match[1] + "." + version, "OSD-" + match[1]]
      : ["OSD-" + match[1]]
  };
}

function normalizeStudyNumber(studyId) {
  return parseStudyIdentifier(studyId).number;
}

async function readJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" }
  });
  if (!response || !response.ok) {
    const status = response && Number.isInteger(response.status) ? response.status : "unknown";
    throw new Error("OSDR API request failed with HTTP " + status + ": " + url);
  }
  return response.json();
}

function getStudyEntries(payload) {
  if (!payload || typeof payload !== "object" || !payload.studies ||
      typeof payload.studies !== "object" || Array.isArray(payload.studies)) {
    return [];
  }
  return Object.entries(payload.studies).filter(([, value]) =>
    value && typeof value === "object"
  );
}

function extractFileRecords(payload, studyKeys = []) {
  if (!payload || typeof payload !== "object") return [];

  const studies = payload.studies && typeof payload.studies === "object"
    ? payload.studies
    : {};
  const orderedKeys = [...studyKeys, ...Object.keys(studies)];
  const visited = new Set();

  for (const key of orderedKeys) {
    if (visited.has(key)) continue;
    visited.add(key);
    const records = studies[key] && studies[key].study_files;
    if (Array.isArray(records) && records.length > 0) return records;
  }

  const candidates = [payload.study_files, payload.files, payload.results, payload.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function getFileName(record) {
  if (!record || typeof record !== "object") return null;
  return record.file_name || record.filename || record.fileName ||
    record.name || record.original_filename || null;
}

function getRemoteUrl(record) {
  if (!record || typeof record !== "object") return null;
  return record.remote_url || record.download_url || record.downloadUrl || record.url || null;
}

function decodeSafely(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function getRemoteFileTokens(remoteUrl) {
  if (typeof remoteUrl !== "string" || remoteUrl.trim() === "") return [];
  let parsed;
  try {
    parsed = new URL(remoteUrl, OSDR_ORIGIN);
  } catch (_) {
    return [decodeSafely(remoteUrl)];
  }

  const tokens = [];
  for (const parameter of ["file", "filename", "file_name", "name"]) {
    const value = parsed.searchParams.get(parameter);
    if (value) tokens.push(decodeSafely(value));
  }
  if (parsed.pathname && !/\/download\/?$/i.test(parsed.pathname)) {
    tokens.push(decodeSafely(parsed.pathname));
  }
  return tokens;
}

function fileTokenMatches(token, expectedFileName) {
  if (typeof token !== "string") return false;
  const normalized = decodeSafely(token).replace(/\\/g, "/").split(/[?#]/, 1)[0];
  return normalized === expectedFileName || normalized.endsWith("/" + expectedFileName);
}

function matchesStudyFile(record, expectedFileName) {
  if (!record || typeof record !== "object") return false;
  if (fileTokenMatches(getFileName(record), expectedFileName)) return true;
  return getRemoteFileTokens(getRemoteUrl(record))
    .some((token) => fileTokenMatches(token, expectedFileName));
}

function selectStudyFile(records, fileName) {
  if (!Array.isArray(records) || typeof fileName !== "string" || fileName.trim() === "") {
    throw new TypeError("records and an exact fileName are required");
  }
  return records.find((record) => matchesStudyFile(record, fileName)) || null;
}

function getCsvFileCandidates(records) {
  if (!Array.isArray(records)) return [];
  const candidates = new Set();
  for (const record of records) {
    const fileName = getFileName(record);
    if (typeof fileName === "string" && /\.csv$/i.test(fileName.split(/[?#]/, 1)[0])) {
      candidates.add(fileName);
    }

    for (const token of getRemoteFileTokens(getRemoteUrl(record))) {
      const normalized = token.replace(/\\/g, "/").split(/[?#]/, 1)[0];
      const basename = normalized.slice(normalized.lastIndexOf("/") + 1);
      if (/\.csv$/i.test(basename)) candidates.add(basename);
    }
  }
  return [...candidates].sort((a, b) => a.localeCompare(b));
}

function resolveOsdrDownloadUrl(remoteUrl) {
  if (typeof remoteUrl !== "string" || remoteUrl.trim() === "") {
    throw new TypeError("OSDR file record does not contain a remote download URL");
  }
  const url = new URL(remoteUrl, OSDR_ORIGIN);
  if (url.protocol !== "https:" ||
      !(url.hostname === "osdr.nasa.gov" || url.hostname.endsWith(".nasa.gov"))) {
    throw new Error("Refusing a catalog download URL outside NASA HTTPS domains");
  }
  return url.href;
}

function validateOsdrDownloadResponseUrl(responseUrl, expectedFileName = null) {
  if (typeof responseUrl !== "string" || responseUrl.trim() === "") {
    throw new TypeError("OSDR download response URL is required");
  }
  const url = new URL(responseUrl);
  const isNasaHost = url.hostname === "osdr.nasa.gov" || url.hostname.endsWith(".nasa.gov");
  const isOfficialPublicBucket = url.hostname === OSDR_PUBLIC_BUCKET_HOST;
  const isObservedAlsdaBucket = url.hostname === OSDR_ALSDA_BUCKET_HOST;
  const isObservedOsd53Bucket = Object.values(OSDR_APPROVED_OSD53_BUCKET_OBJECTS)
    .some((item) => item.host === url.hostname);
  if (url.protocol !== "https:" || !(isNasaHost || isOfficialPublicBucket || isObservedAlsdaBucket || isObservedOsd53Bucket)) {
    const error = new Error(
      "Refusing a download redirect outside verified NASA HTTPS endpoints (protocol=" +
      url.protocol + ", host=" + url.hostname + ", path=" + url.pathname + ")"
    );
    error.redirect = {
      protocol: url.protocol,
      host: url.hostname,
      path: url.pathname,
      filename: decodeSafely(url.pathname.split("/").pop() || "")
    };
    throw error;
  }
  if (isObservedAlsdaBucket && !expectedFileName) {
    throw new Error("The observed ALSDA bucket redirect requires an exact catalog filename");
  }
  if (isObservedOsd53Bucket) {
    const approvedObject = expectedFileName
      ? OSDR_APPROVED_OSD53_BUCKET_OBJECTS[expectedFileName]
      : null;
    if (!approvedObject || url.hostname !== approvedObject.host || url.pathname !== approvedObject.path) {
      const error = new Error(
        "The OSDR OSD-53 bucket redirect did not match an explicitly approved filename, host and object path (host=" +
        url.hostname + ", path=" + url.pathname + ")"
      );
      error.redirect = {
        protocol: url.protocol,
        host: url.hostname,
        path: url.pathname,
        filename: decodeSafely(url.pathname.split("/").pop() || "")
      };
      throw error;
    }
  }
  if ((isOfficialPublicBucket || isObservedAlsdaBucket) && expectedFileName) {
    const finalName = decodeSafely(url.pathname.split("/").pop() || "");
    const expectedPath = isObservedAlsdaBucket
      ? OSDR_ALSDA_HDCVD9_PATH + expectedFileName
      : null;
    if (finalName !== expectedFileName ||
        (isObservedAlsdaBucket && url.pathname !== expectedPath)) {
      const error = new Error(
        "The OSDR bucket redirect did not resolve to the exact catalog filename and approved object path (host=" +
        url.hostname + ", path=" + url.pathname + ")"
      );
      error.redirect = {
        protocol: url.protocol,
        host: url.hostname,
        path: url.pathname,
        filename: finalName
      };
      throw error;
    }
  }
  return url.href;
}

async function fetchStudyMetadata(studyId, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const parsed = parseStudyIdentifier(studyId);
  return readJson(OSDR_API_ROOT + "/meta/" + parsed.number, fetchImpl);
}

function numericCount(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function expectedFileCounts(payload) {
  return getStudyEntries(payload)
    .map(([key, study]) => ({ key, count: numericCount(study.file_count) }))
    .filter((item) => item.count !== null);
}

async function listStudyFiles(studyId, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const pageSize = options.pageSize || 25;
  const maxPages = options.maxPages || 100;
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25) {
    throw new RangeError("OSDR file catalog pageSize must be between 1 and 25");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new RangeError("maxPages must be a positive integer");
  }

  const study = parseStudyIdentifier(studyId, options.studyVersion ?? options.version ?? null);
  const trailingSlash = options.trailingSlash !== false;
  const bareFirstPage = options.bareFirstPage === true;
  const allFiles = options.allFiles !== false;
  const collected = [];
  const seen = new Set();
  const countsByStudy = new Map();
  let knownPageTotal = null;
  let knownTotalHits = null;
  let page = 0;
  let stoppedByApi = false;

  while (page < maxPages) {
    const path = OSDR_API_ROOT + "/files/" + study.accession +
      (trailingSlash ? "/" : "");
    const useBareRequest = bareFirstPage && page === 0;
    const url = useBareRequest
      ? path
      : path + "?page=" + page + "&size=" + pageSize + "&all_files=" + String(allFiles);
    const payload = await readJson(url, fetchImpl);
    const records = extractFileRecords(payload, study.studyKeys);

    const pageTotal = numericCount(payload && payload.page_total);
    const totalHits = numericCount(payload && payload.total_hits);
    if (pageTotal !== null && pageTotal > 0) knownPageTotal = Math.max(knownPageTotal || 0, pageTotal);
    if (totalHits !== null) knownTotalHits = Math.max(knownTotalHits || 0, totalHits);

    for (const item of expectedFileCounts(payload)) countsByStudy.set(item.key, item.count);

    for (const record of records) {
      const key = (getFileName(record) || "") + "|" + (getRemoteUrl(record) || "");
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(record);
      }
    }

    const expectedCount = countsByStudy.size > 0 ? Math.max(...countsByStudy.values()) : null;
    const pageTotalRequiresMore = knownPageTotal !== null && page + 1 < knownPageTotal;
    const totalHitsRequiresMore = knownTotalHits !== null &&
      (page + 1) * pageSize < knownTotalHits;
    const fileCountRequiresMore = expectedCount !== null && collected.length < expectedCount;
    const pageFilled = records.length >= pageSize;

    const hasMore = pageTotalRequiresMore || totalHitsRequiresMore ||
      fileCountRequiresMore || (knownPageTotal === null && knownTotalHits === null && pageFilled);

    if (!hasMore) {
      stoppedByApi = true;
      break;
    }
    page += 1;
  }

  const expectedCount = countsByStudy.size > 0 ? Math.max(...countsByStudy.values()) : null;
  if (expectedCount !== null && collected.length < expectedCount) {
    throw new Error(
      "OSDR file catalog for " + study.accession + " returned " + collected.length +
      " unique files, but study metadata declares file_count=" + expectedCount +
      ". Pages requested=" + (page + 1) +
      "; page_total=" + (knownPageTotal ?? "not reported") +
      "; total_hits=" + (knownTotalHits ?? "not reported") +
      "; CSV filenames=" + (getCsvFileCandidates(collected).join(", ") || "none") + "."
    );
  }
  if (!stoppedByApi && page >= maxPages) {
    throw new Error(
      "OSDR file catalog pagination exceeded maxPages=" + maxPages + " for " + study.accession +
      "; page_total=" + (knownPageTotal ?? "not reported") +
      "; total_hits=" + (knownTotalHits ?? "not reported") + "."
    );
  }

  return collected;
}

async function downloadStudyFile(fileRecord, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const downloadUrl = resolveOsdrDownloadUrl(getRemoteUrl(fileRecord));
  const response = await fetchImpl(downloadUrl);
  if (!response || !response.ok) {
    const status = response && Number.isInteger(response.status) ? response.status : "unknown";
    throw new Error("OSDR file download failed with HTTP " + status);
  }
  const finalResponseUrl = response.url
    ? validateOsdrDownloadResponseUrl(response.url, getFileName(fileRecord))
    : downloadUrl;
  const finalResponse = new URL(finalResponseUrl);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("OSDR returned an empty file");

  const contentLength = response.headers && response.headers.get
    ? response.headers.get("content-length")
    : null;
  if (contentLength !== null && contentLength !== undefined &&
      /^\d+$/.test(contentLength) && Number(contentLength) !== bytes.length) {
    throw new Error("Downloaded byte count mismatch: header=" + contentLength + ", actual=" + bytes.length);
  }
  const rawCatalogFileSize = fileRecord && fileRecord.file_size;
  const catalogFileSize = rawCatalogFileSize === null || rawCatalogFileSize === undefined
    ? null
    : Number(rawCatalogFileSize);
  if (Number.isInteger(catalogFileSize) && catalogFileSize >= 0 &&
      catalogFileSize !== bytes.length) {
    throw new Error(
      "Downloaded byte count mismatch with OSDR catalog: declared=" +
      catalogFileSize + ", actual=" + bytes.length
    );
  }

  return {
    bytes,
    catalogFileSizeBytes: Number.isInteger(catalogFileSize) && catalogFileSize >= 0
      ? catalogFileSize
      : null,
    downloadUrl,
    finalResponseUrl: finalResponse.origin + finalResponse.pathname,
    finalResponseHost: finalResponse.hostname,
    finalResponsePath: finalResponse.pathname,
    redirected: finalResponseUrl !== downloadUrl,
    httpStatus: response.status,
    contentType: response.headers && response.headers.get ? response.headers.get("content-type") : null
  };
}

module.exports = {
  OSDR_ORIGIN,
  normalizeStudyNumber,
  parseStudyIdentifier,
  fetchStudyMetadata,
  listStudyFiles,
  selectStudyFile,
  getCsvFileCandidates,
  getFileName,
  getRemoteUrl,
  resolveOsdrDownloadUrl,
  validateOsdrDownloadResponseUrl,
  downloadStudyFile
};

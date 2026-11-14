"use strict";

const OSDR_ORIGIN = "https://osdr.nasa.gov";
const OSDR_API_ROOT = `${OSDR_ORIGIN}/osdr/data/osd`;

function normalizeStudyNumber(studyId) {
  const match = String(studyId).match(/^OSD-(\d+)$/);
  if (!match) throw new TypeError("studyId must use the OSD-<number> format");
  return match[1];
}

async function readJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" }
  });
  if (!response || !response.ok) {
    const status = response && Number.isInteger(response.status) ? response.status : "unknown";
    throw new Error(`OSDR API request failed with HTTP ${status}: ${url}`);
  }
  return response.json();
}

function extractFileRecords(payload, studyId) {
  if (!payload || typeof payload !== "object") return [];

  const study = payload.studies && studyId ? payload.studies[studyId] : null;
  const candidates = [
    study && study.study_files,
    payload.study_files,
    payload.files,
    payload.results,
    payload.data
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function getFileName(record) {
  return record && (
    record.file_name || record.filename || record.fileName || record.name || record.original_filename
  );
}

function getRemoteUrl(record) {
  return record && (record.remote_url || record.download_url || record.downloadUrl || record.url);
}

function resolveOsdrDownloadUrl(remoteUrl) {
  if (typeof remoteUrl !== "string" || remoteUrl.trim() === "") {
    throw new TypeError("OSDR file record does not contain a remote download URL");
  }
  const url = new URL(remoteUrl, OSDR_ORIGIN);
  if (url.protocol !== "https:" ||
      !(url.hostname === "osdr.nasa.gov" || url.hostname.endsWith(".nasa.gov"))) {
    throw new Error("Refusing a download URL outside NASA HTTPS domains");
  }
  return url.href;
}

async function fetchStudyMetadata(studyId, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const number = normalizeStudyNumber(studyId);
  return readJson(`${OSDR_API_ROOT}/meta/${number}`, fetchImpl);
}

async function listStudyFiles(studyId, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const pageSize = options.pageSize || 25;
  const maxPages = options.maxPages || 20;
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25) {
    throw new RangeError("OSDR file catalog pageSize must be between 1 and 25");
  }

  const number = normalizeStudyNumber(studyId);
  const collected = [];
  const seen = new Set();

  for (let page = 0; page < maxPages; page += 1) {
    const url = `${OSDR_API_ROOT}/files/${number}/?page=${page}&size=${pageSize}&all_files=true`;
    const payload = await readJson(url, fetchImpl);
    const records = extractFileRecords(payload, `OSD-${number}`);
    let added = 0;

    for (const record of records) {
      const key = `${getFileName(record) || ""}|${getRemoteUrl(record) || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(record);
        added += 1;
      }
    }

    if (records.length < pageSize || added === 0) break;
  }

  return collected;
}

function selectStudyFile(records, fileName) {
  if (!Array.isArray(records) || typeof fileName !== "string" || fileName.trim() === "") {
    throw new TypeError("records and an exact fileName are required");
  }
  return records.find((record) => getFileName(record) === fileName) || null;
}

async function downloadStudyFile(fileRecord, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  const downloadUrl = resolveOsdrDownloadUrl(getRemoteUrl(fileRecord));
  const response = await fetchImpl(downloadUrl);
  if (!response || !response.ok) {
    const status = response && Number.isInteger(response.status) ? response.status : "unknown";
    throw new Error(`OSDR file download failed with HTTP ${status}`);
  }
  if (response.url) {
    resolveOsdrDownloadUrl(response.url);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("OSDR returned an empty file");

  const contentLength = response.headers && response.headers.get
    ? response.headers.get("content-length")
    : null;
  if (contentLength !== null && contentLength !== undefined &&
      /^\d+$/.test(contentLength) && Number(contentLength) !== bytes.length) {
    throw new Error(`Downloaded byte count mismatch: header=${contentLength}, actual=${bytes.length}`);
  }

  return {
    bytes,
    downloadUrl,
    httpStatus: response.status,
    contentType: response.headers && response.headers.get ? response.headers.get("content-type") : null
  };
}

module.exports = {
  OSDR_ORIGIN,
  fetchStudyMetadata,
  listStudyFiles,
  selectStudyFile,
  downloadStudyFile,
  resolveOsdrDownloadUrl
};

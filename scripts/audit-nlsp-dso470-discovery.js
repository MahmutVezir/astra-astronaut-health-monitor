"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const INDEX_URL = "https://nlsp.nasa.gov/explore";
const OUTPUT_DIR = path.join(process.cwd(), "artifacts", "nlsp-dso470-discovery");
const MAX_INDEX_BYTES = 10 * 1024 * 1024;
const MAX_SCRIPT_BYTES = 5 * 1024 * 1024;
const MAX_SAME_ORIGIN_SCRIPTS = 20;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stripTags(value) {
  return String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(tag, attributeName) {
  const escaped = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag).match(new RegExp("\\b" + escaped + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? "").trim() : "";
}

function extractScriptUrls(html) {
  const urls = [];
  const pattern = /<script\b[^>]*>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const src = getAttribute(match[0], "src");
    if (src) urls.push(src);
  }
  return [...new Set(urls)];
}

function extractAnchorLinks(html) {
  const links = [];
  const pattern = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const openingTag = match[0].match(/^<a\b[^>]*>/i)?.[0] || "";
    const href = getAttribute(openingTag, "href");
    const text = stripTags(match[0].replace(openingTag, "").replace(/<\/a>\s*$/i, ""));
    if (href) links.push({ href, text });
  }
  return links;
}

function extractEvidenceSnippets(source, limit = 30) {
  const text = stripTags(source);
  const pattern = /DSO[\s-]?470|Space Adaptation Syndrome|cerebral.{0,90}(?:blood|flow)|heart rate|diastolic.{0,80}blood pressure/gi;
  const results = [];
  const seen = new Set();
  for (const match of text.matchAll(pattern)) {
    const start = Math.max(0, match.index - 180);
    const end = Math.min(text.length, match.index + match[0].length + 220);
    const snippet = text.slice(start, end);
    const key = match[0].toLowerCase() + "|" + snippet.slice(0, 120);
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ term: match[0], snippet });
    }
    if (results.length >= limit) break;
  }
  return results;
}

function extractApiHints(source, limit = 60) {
  const value = String(source);
  const patterns = [
    /https?:\/\/[^"'\x60\\\s<>;,]+/gi,
    /\/(?:api\/[^"'\x60\\\s<>;,]+|graphql(?:\/[^"'\x60\\\s<>;,]*)?|search\/data\/details\/[^"'\x60\\\s<>;,]+|_next\/data\/[^"'\x60\\\s<>;,]+)/gi
  ];
  const matches = patterns.flatMap((pattern) =>
    Array.from(value.matchAll(pattern), (match) => match[0])
  );
  return [...new Set(matches)].slice(0, limit);
}

function resolveSameOriginUrl(candidate, baseUrl) {
  try {
    const resolved = new URL(candidate, baseUrl);
    const base = new URL(baseUrl);
    return resolved.origin === base.origin ? resolved.toString() : null;
  } catch {
    return null;
  }
}

async function fetchBytes(url, maxBytes) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/javascript,application/json;q=0.9,*/*;q=0.8",
      "user-agent": "ASTRA-NASA-Research-Audit/1.0"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60000)
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    response,
    bytes,
    tooLarge: bytes.byteLength > maxBytes
  };
}

async function run() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const index = await fetchBytes(INDEX_URL, MAX_INDEX_BYTES);
  const indexMetadata = {
    requested_url: INDEX_URL,
    final_url: index.response.url,
    http_status: index.response.status,
    content_type: index.response.headers.get("content-type"),
    byte_length: index.bytes.byteLength,
    sha256: sha256(index.bytes)
  };

  if (!index.response.ok) {
    await fs.writeFile(path.join(OUTPUT_DIR, "index-response.json"), JSON.stringify(indexMetadata, null, 2) + "\n");
    throw new Error("The official NASA NLSP index request failed with HTTP " + index.response.status + ".");
  }
  if (index.tooLarge) throw new Error("The official NLSP index exceeded the 10 MiB audit limit.");

  await fs.writeFile(path.join(OUTPUT_DIR, "index.html"), index.bytes);
  const indexHtml = index.bytes.toString("utf8");
  const scriptUrls = extractScriptUrls(indexHtml);
  const sameOriginScripts = scriptUrls
    .map((src) => resolveSameOriginUrl(src, index.response.url))
    .filter(Boolean)
    .slice(0, MAX_SAME_ORIGIN_SCRIPTS);

  const assetResults = await Promise.all(sameOriginScripts.map(async (url, indexNumber) => {
    try {
      const result = await fetchBytes(url, MAX_SCRIPT_BYTES);
      const contentType = result.response.headers.get("content-type");
      if (!result.response.ok || result.tooLarge) {
        return {
          url,
          http_status: result.response.status,
          content_type: contentType,
          byte_length: result.bytes.byteLength,
          error: result.tooLarge ? "ASSET_EXCEEDED_5_MIB_LIMIT" : "ASSET_HTTP_ERROR"
        };
      }
      const fileName = "same-origin-asset-" + String(indexNumber + 1).padStart(2, "0") + ".js";
      await fs.writeFile(path.join(OUTPUT_DIR, fileName), result.bytes);
      const source = result.bytes.toString("utf8");
      return {
        url,
        file_name: fileName,
        http_status: result.response.status,
        content_type: contentType,
        byte_length: result.bytes.byteLength,
        sha256: sha256(result.bytes),
        evidence_snippets: extractEvidenceSnippets(source, 20),
        api_hints: extractApiHints(source)
      };
    } catch (error) {
      return { url, error: error && error.message ? error.message : String(error) };
    }
  }));

  const anchors = extractAnchorLinks(indexHtml);
  const candidateLinks = anchors.filter((link) =>
    /DSO[\s-]?470|Space Adaptation Syndrome|cerebral.{0,80}blood|heart rate|diastolic/i.test(link.text + " " + link.href)
  );
  const indexSnippets = extractEvidenceSnippets(indexHtml);
  const scriptSnippets = assetResults.flatMap((asset) =>
    (asset.evidence_snippets || []).map((item) => ({ asset: asset.file_name, ...item }))
  );
  const apiHints = [...new Set([
    ...extractApiHints(indexHtml),
    ...assetResults.flatMap((asset) => asset.api_hints || [])
  ])].slice(0, 100);

  const summary = {
    audit_type: "PUBLIC_NLSP_INDEX_AND_SAME_ORIGIN_ASSET_DISCOVERY",
    dataset_candidate: "DSO-470",
    candidate_scope: "Discover exact NLSP experiment detail links and documented API references only; do not download or ingest physiological measurement files in this step.",
    index: indexMetadata,
    scripts_found_in_index: scriptUrls.length,
    same_origin_scripts_inspected: assetResults.length,
    candidate_links: candidateLinks,
    index_evidence_snippets: indexSnippets,
    script_evidence_snippets: scriptSnippets,
    api_hints: apiHints,
    asset_results: assetResults.map(({ evidence_snippets, api_hints: hints, ...rest }) => rest),
    measurement_files_downloaded: 0,
    decision: candidateLinks.length || indexSnippets.length || scriptSnippets.length || apiHints.length
      ? "DISCOVERY_REFERENCES_FOUND_REQUIRES_EXACT_RECORD_REVIEW"
      : "STATIC_INDEX_DID_NOT_EXPOSE_DSO470_REFERENCES",
    limitation: "No endpoint was guessed and no data file was accepted. Any candidate URL or API hint must be traced to an official NLSP page and exact record before a separate file-level audit."
  };

  await fs.writeFile(path.join(OUTPUT_DIR, "discovery-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  run().catch((error) => {
    console.error("NLSP DSO-470 discovery failed:", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  stripTags,
  extractScriptUrls,
  extractAnchorLinks,
  extractEvidenceSnippets,
  extractApiHints,
  resolveSameOriginUrl
};

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

function extractAssetReferences(source, limit = 250) {
  const patterns = [
    /["'\x60](assets\/[A-Za-z0-9_.-]+\.js(?:\?[^"'\x60\s]*)?)["'\x60]/g,
    /["'\x60](\.\.?\/[A-Za-z0-9_./-]+\.js(?:\?[^"'\x60\s]*)?)["'\x60]/g
  ];
  const references = patterns.flatMap((pattern) =>
    Array.from(String(source).matchAll(pattern), (match) => match[1])
  );
  return [...new Set(references)].slice(0, limit);
}

function resolveAssetReference(reference, parentUrl, indexUrl) {
  const value = String(reference || "");
  const base = value.startsWith("assets/") ? indexUrl : parentUrl;
  return resolveSameOriginUrl(value, base);
}

function extractApiEndpointReferences(source, limit = 160) {
  const text = String(source);
  const patterns = [
    /["'\x60](\/api\/v1\/[A-Za-z0-9_./?&=:$-]{1,180})["'\x60]/g,
    /["'\x60](\/search\/data\/[A-Za-z0-9_./?&=:$-]{1,180})["'\x60]/g,
    /\/api\/v1\/[A-Za-z0-9_./?&=:$-]{1,180}/g,
    /\.(?:get|post|put|delete|patch)\s*\(\s*["'\x60]([^"'\x60]{1,180})["'\x60]/gi
  ];
  const values = patterns.flatMap((pattern) =>
    Array.from(text.matchAll(pattern), (match) => match[1] || match[0])
  );
  return [...new Set(values)].slice(0, limit);
}

function extractApiRequestReferences(source, limit = 160) {
  const text = String(source);
  const constants = new Map();
  const constantPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*["'\x60](\/[^"'\x60]{1,180})["'\x60]/g;
  for (const match of text.matchAll(constantPattern)) {
    constants.set(match[1], match[2]);
  }

  const requests = [];
  const literalPattern = /\.(get|post|put|delete|patch)\s*\(\s*["'\x60](\/[^"'\x60]{1,180})["'\x60]/gi;
  for (const match of text.matchAll(literalPattern)) {
    requests.push({
      method: match[1].toUpperCase(),
      path: match[2],
      source: "literal HTTP-client argument"
    });
  }

  const variablePattern = /\.(get|post|put|delete|patch)\s*\(\s*([A-Za-z_$][\w$]*)\s*(?:[,)]|$)/gi;
  for (const match of text.matchAll(variablePattern)) {
    const path = constants.get(match[2]);
    if (path) {
      requests.push({
        method: match[1].toUpperCase(),
        path,
        source: "local path constant"
      });
    }
  }

  const unique = new Map();
  for (const request of requests) {
    unique.set(request.method + " " + request.path, request);
  }
  return [...unique.values()].slice(0, limit);
}

function extractApiContexts(source, limit = 40) {
  const patterns = [
    /\/api\/v1/gi,
    /workspace-dev\.insight\.nasa\.gov/gi,
    /nlsp-comm\.dev\.ndc\.nasa\.gov/gi,
    /baseURL/gi,
    /axios\.create/gi,
    /\.(?:get|post|put|delete|patch)\s*\(/gi,
    /\.request\s*\(/gi,
    /fetch\s*\(/gi
  ];
  const text = String(source);
  const contexts = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = Math.max(0, match.index - 260);
      const end = Math.min(text.length, match.index + match[0].length + 360);
      const snippet = text.slice(start, end);
      const key = snippet.slice(0, 200);
      if (!seen.has(key)) {
        seen.add(key);
        contexts.push({ term: match[0], snippet });
      }
      if (contexts.length >= limit) return contexts;
    }
  }
  return contexts;
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

function extractCodeReferences(source, limit = 120) {
  const pattern = /["'\x60]([^"'\x60\r\n]{1,240})["'\x60]/g;
  const references = [];
  for (const match of String(source).matchAll(pattern)) {
    const value = match[1].trim();
    if (/^(?:https?:\/\/|\/)/i.test(value) ||
        /api|search|experiment|dataset|download|file|study|nlsp|graphql/i.test(value)) {
      references.push(value);
    }
  }
  return [...new Set(references)].slice(0, limit);
}

function extractNetworkContexts(source, limit = 30) {
  const patterns = [
    /workspace-dev\.insight\.nasa\.gov/gi,
    /nlsp-comm\.dev\.ndc\.nasa\.gov/gi,
    /\bfetch\s*\(/gi,
    /\baxios\b/gi,
    /graphql/gi,
    /sourceMappingURL/gi
  ];
  const contexts = [];
  const seen = new Set();
  for (const pattern of patterns) {
    for (const match of String(source).matchAll(pattern)) {
      const start = Math.max(0, match.index - 240);
      const end = Math.min(String(source).length, match.index + match[0].length + 320);
      const snippet = String(source).slice(start, end);
      const key = snippet.slice(0, 180);
      if (!seen.has(key)) {
        seen.add(key);
        contexts.push({ term: match[0], snippet });
      }
      if (contexts.length >= limit) return contexts;
    }
  }
  return contexts;
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
        api_hints: extractApiHints(source),
        code_references: extractCodeReferences(source),
        network_contexts: extractNetworkContexts(source),
        api_contexts: extractApiContexts(source),
        api_endpoint_references: extractApiEndpointReferences(source),
        api_request_references: extractApiRequestReferences(source),
        asset_references: extractAssetReferences(source)
      };
    } catch (error) {
      return { url, error: error && error.message ? error.message : String(error) };
    }
  }));

  const nestedAssetUrls = [...new Set(assetResults.flatMap((asset) => asset.asset_references || [])
    .map((reference) => resolveSameOriginUrl(reference, index.response.url))
    .filter(Boolean))]
    .sort((left, right) => {
      const priority = [
        "SearchDataPage-",
        "searchStore-",
        "ResearchDetailsPage-",
        "DatasetFileExplorer-",
        "RecordDetailContext-",
        "RelatedDataTable-"
      ];
      const leftRank = priority.findIndex((token) => left.includes(token));
      const rightRank = priority.findIndex((token) => right.includes(token));
      const a = leftRank < 0 ? priority.length : leftRank;
      const b = rightRank < 0 ? priority.length : rightRank;
      return a - b || left.localeCompare(right);
    })
    .slice(0, 40);
  const nestedAssetResults = await Promise.all(nestedAssetUrls.map(async (url, indexNumber) => {
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
      const fileName = "nested-app-asset-" + String(indexNumber + 1).padStart(2, "0") + ".js";
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
        api_hints: extractApiHints(source),
        code_references: extractCodeReferences(source),
        network_contexts: extractNetworkContexts(source),
        api_contexts: extractApiContexts(source),
        asset_references: extractAssetReferences(source)
      };
    } catch (error) {
      return { url, error: error && error.message ? error.message : String(error) };
    }
  }));
  const allAssetResults = [...assetResults, ...nestedAssetResults];
  const recursiveParents = nestedAssetResults.filter((asset) =>
    /SearchDataPage|ResearchDetailsPage|DatasetFileExplorer|ExplorePage|ExploreContainer|FilterSection|DataRequest/i.test(asset.url || "")
  );
  const tertiaryAssetUrls = [...new Set(recursiveParents.flatMap((parent) =>
    (parent.asset_references || [])
      .map((reference) => resolveAssetReference(reference, parent.url, index.response.url))
      .filter(Boolean)
  ))]
    .filter((url) => !nestedAssetUrls.includes(url))
    .sort((left, right) => {
      const priority = ["api", "search", "experiment", "dataset", "file", "detail", "hook", "store", "explore"];
      const score = (value) => {
        const name = value.split("/").pop().toLowerCase();
        const index = priority.findIndex((token) => name.includes(token));
        return index < 0 ? priority.length : index;
      };
      return score(left) - score(right) || left.localeCompare(right);
    })
    .slice(0, 35);
  const tertiaryAssetResults = await Promise.all(tertiaryAssetUrls.map(async (url, indexNumber) => {
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
      const fileName = "tertiary-app-asset-" + String(indexNumber + 1).padStart(2, "0") + ".js";
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
        api_hints: extractApiHints(source),
        code_references: extractCodeReferences(source),
        network_contexts: extractNetworkContexts(source),
        api_contexts: extractApiContexts(source),
        api_endpoint_references: extractApiEndpointReferences(source),
        api_request_references: extractApiRequestReferences(source),
        asset_references: extractAssetReferences(source)
      };
    } catch (error) {
      return { url, error: error && error.message ? error.message : String(error) };
    }
  }));
  const allDiscoveryAssets = [...allAssetResults, ...tertiaryAssetResults];

  const anchors = extractAnchorLinks(indexHtml);
  const candidateLinks = anchors.filter((link) =>
    /DSO[\s-]?470|Space Adaptation Syndrome|cerebral.{0,80}blood|heart rate|diastolic/i.test(link.text + " " + link.href)
  );
  const indexSnippets = extractEvidenceSnippets(indexHtml);
  const scriptSnippets = allDiscoveryAssets.flatMap((asset) =>
    (asset.evidence_snippets || []).map((item) => ({ asset: asset.file_name, ...item }))
  );
  const apiHints = [...new Set([
    ...extractApiHints(indexHtml),
    ...allDiscoveryAssets.flatMap((asset) => asset.api_hints || [])
  ])].slice(0, 140);

  const summary = {
    audit_type: "PUBLIC_NLSP_INDEX_AND_SAME_ORIGIN_ASSET_DISCOVERY",
    dataset_candidate: "DSO-470",
    candidate_scope: "Discover exact NLSP experiment detail links and documented API references only; do not download or ingest physiological measurement files in this step.",
    index: indexMetadata,
    scripts_found_in_index: scriptUrls.length,
    same_origin_scripts_inspected: assetResults.length,
    nested_app_bundles_found: nestedAssetUrls.length,
    nested_app_bundles_inspected: nestedAssetResults.filter((asset) => asset.http_status === 200 && !asset.error).length,
    second_level_app_bundles_found: tertiaryAssetUrls.length,
    second_level_app_bundles_inspected: tertiaryAssetResults.filter((asset) => asset.http_status === 200 && !asset.error).length,
    candidate_links: candidateLinks,
    index_evidence_snippets: indexSnippets,
    script_evidence_snippets: scriptSnippets,
    api_hints: apiHints,
    asset_code_references: assetResults.flatMap((asset) =>
      (asset.code_references || []).map((reference) => ({ asset: asset.file_name, reference }))
    ).slice(0, 160),
    asset_network_contexts: allAssetResults.flatMap((asset) =>
      (asset.network_contexts || []).map((context) => ({ asset: asset.file_name, ...context }))
    ).slice(0, 60),
    api_route_contexts: allDiscoveryAssets.flatMap((asset) =>
      (asset.api_contexts || []).map((context) => ({ asset: asset.file_name, ...context }))
    ).slice(0, 160),
    api_endpoint_references: allDiscoveryAssets.flatMap((asset) =>
      (asset.api_endpoint_references || []).map((reference) => ({ asset: asset.file_name, reference }))
    ).slice(0, 300),
    api_request_references: allDiscoveryAssets.flatMap((asset) =>
      (asset.api_request_references || []).map((request) => ({ asset: asset.file_name, ...request }))
    ).slice(0, 300),
    discovered_nested_asset_references: nestedAssetUrls,
    discovered_second_level_asset_references: tertiaryAssetUrls,
    asset_results: allDiscoveryAssets.map(({ evidence_snippets, api_hints: hints, code_references, network_contexts, api_contexts, api_endpoint_references, api_request_references, asset_references, ...rest }) => rest),
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
  extractCodeReferences,
  extractNetworkContexts,
  extractApiContexts,
  extractApiEndpointReferences,
  extractAssetReferences,
  resolveSameOriginUrl,
  resolveAssetReference
};

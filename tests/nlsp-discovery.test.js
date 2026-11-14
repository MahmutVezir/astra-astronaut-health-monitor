"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
} = require("../scripts/audit-nlsp-dso470-discovery.js");

test("extracts application scripts from the observed NLSP HTML", () => {
  const html = '<html><script src="/static/app.js"></script><script src="/runtime.js?v=2"></script></html>';
  assert.deepEqual(extractScriptUrls(html), ["/static/app.js", "/runtime.js?v=2"]);
});

test("extracts exact candidate links without inventing an NLSP detail URL", () => {
  const html = '<a href="/search/data/details/record-123?dataType=EXPERIMENTS">DSO 470 — Space Adaptation Syndrome</a>';
  assert.deepEqual(extractAnchorLinks(html), [{
    href: "/search/data/details/record-123?dataType=EXPERIMENTS",
    text: "DSO 470 — Space Adaptation Syndrome"
  }]);
  assert.equal(resolveSameOriginUrl(
    extractAnchorLinks(html)[0].href,
    "https://nlsp.nasa.gov/explore"
  ), "https://nlsp.nasa.gov/search/data/details/record-123?dataType=EXPERIMENTS");
});

test("finds DSO-470 physiological-variable evidence in text and scripts", () => {
  const html = '<p>DSO-470 records heart rate, diastolic blood pressure, and cerebral artery blood-flow velocity.</p>';
  const snippets = extractEvidenceSnippets(html);
  assert.ok(snippets.some((item) => /DSO-470/i.test(item.term)));
  assert.ok(snippets.some((item) => /cerebral/i.test(item.snippet)));
});

test("extracts API hints as references but does not treat them as verified data endpoints", () => {
  const source = 'const a="/api/search"; const b="/graphql"; const c="https://nlsp.nasa.gov/search/data/details/record-123";';
  const hints = extractApiHints(source);
  assert.ok(hints.some((item) => item === "/api/search"));
  assert.ok(hints.some((item) => item === "/graphql"));
  assert.ok(hints.some((item) => item.includes("/search/data/details/record-123")));
});

test("extracts application data-service strings and request contexts for review", () => {
  const source = 'const base="https://workspace-dev.insight.nasa.gov"; const path="/api/search/experiments"; fetch(path);';
  const references = extractCodeReferences(source);
  assert.ok(references.includes("https://workspace-dev.insight.nasa.gov"));
  assert.ok(references.includes("/api/search/experiments"));
  const contexts = extractNetworkContexts(source);
  assert.ok(contexts.some((item) => /workspace-dev\.insight\.nasa\.gov/.test(item.snippet)));
  assert.ok(contexts.some((item) => /fetch\(/.test(item.snippet)));
});

test("resolves first-party relative modules against their parent JavaScript bundle", () => {
  assert.equal(
    resolveAssetReference("./SearchApi.js", "https://nlsp.nasa.gov/assets/SearchDataPage.js", "https://nlsp.nasa.gov/explore"),
    "https://nlsp.nasa.gov/assets/SearchApi.js"
  );
  assert.equal(
    resolveAssetReference("assets/searchStore.js", "https://nlsp.nasa.gov/assets/SearchDataPage.js", "https://nlsp.nasa.gov/explore"),
    "https://nlsp.nasa.gov/assets/searchStore.js"
  );
  assert.equal(
    resolveAssetReference("https://tracker.invalid/evil.js", "https://nlsp.nasa.gov/assets/SearchDataPage.js", "https://nlsp.nasa.gov/explore"),
    null
  );
});

test("extracts lazy-loaded NLSP feature bundles referenced by the main application", () => {
  const source = 'const details="assets/ResearchDetailsPage-D4Z_MSMq.js"; const search="assets/SearchDataPage-BYc8sLuE.js";';
  assert.deepEqual(extractAssetReferences(source), [
    "assets/ResearchDetailsPage-D4Z_MSMq.js",
    "assets/SearchDataPage-BYc8sLuE.js"
  ]);
});

test("extracts concrete API endpoint references from observed bundle strings", () => {
  const source = 'const search="/api/v1/search/data"; const detail="/api/v1/research/details/"; const path="/search/data/details/";';
  const endpoints = extractApiEndpointReferences(source);
  assert.ok(endpoints.includes("/api/v1/search/data"));
  assert.ok(endpoints.includes("/api/v1/research/details/"));
  assert.ok(endpoints.includes("/search/data/details/"));
});

test("extracts observed HTTP request paths without mistaking URLSearchParams.get for an API call", () => {
  const source = 'const route="/experiments/search"; client.get(route,{params:{q:"DSO-470"}}); client.post("/experiments/query",{q:"DSO-470"}); params.get("q");';
  const requests = extractApiRequestReferences(source);
  assert.ok(requests.some((item) => item.method === "GET" && item.path === "/experiments/search"));
  assert.ok(requests.some((item) => item.method === "POST" && item.path === "/experiments/query"));
  assert.equal(requests.some((item) => item.path === "q"), false);
});

test("extracts versioned API route context without calling a guessed endpoint", () => {
  const source = 'const base="/api/v1"; client.get(base + "/search/experiments");';
  const contexts = extractApiContexts(source);
  assert.ok(contexts.some((item) => item.term === "/api/v1"));
  assert.ok(contexts.some((item) => /search\/experiments/.test(item.snippet)));
});

test("does not drop lazily loaded search modules after many vendor asset references", () => {
  const vendorAssets = Array.from({ length: 75 }, (_, index) =>
    "assets/vendor-" + String(index).padStart(2, "0") + ".js"
  );
  const targetAssets = [
    "assets/SearchDataPage-BYc8sLuE.js",
    "assets/ResearchDetailsPage-D4Z_MSMq.js"
  ];
  const source = [...vendorAssets, ...targetAssets].map((item) => '"' + item + '"').join(";");
  const references = extractAssetReferences(source);
  assert.ok(references.includes("assets/SearchDataPage-BYc8sLuE.js"));
  assert.ok(references.includes("assets/ResearchDetailsPage-D4Z_MSMq.js"));
});

test("rejects third-party scripts from same-origin discovery", () => {
  assert.equal(resolveSameOriginUrl("https://tracker.invalid/app.js", "https://nlsp.nasa.gov/explore"), null);
  assert.equal(resolveSameOriginUrl("javascript:alert(1)", "https://nlsp.nasa.gov/explore"), null);
});

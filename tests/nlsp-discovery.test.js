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
  resolveSameOriginUrl
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

test("rejects third-party scripts from same-origin discovery", () => {
  assert.equal(resolveSameOriginUrl("https://tracker.invalid/app.js", "https://nlsp.nasa.gov/explore"), null);
  assert.equal(resolveSameOriginUrl("javascript:alert(1)", "https://nlsp.nasa.gov/explore"), null);
});

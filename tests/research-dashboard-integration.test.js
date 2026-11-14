"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const health = require("../health-engine.js");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "data", "osdr", "OSD-575");
const read = (file) => fs.readFile(path.join(root, file), "utf8");

function createDom() {
  const elements = new Map();
  const makeElement = (id) => ({
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    className: "",
    dataset: {},
    attributes: {},
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    click() { if (this.handlers.click) this.handlers.click({}); },
    remove() {},
    classList: { toggle() {}, add() {}, remove() {} }
  });
  return {
    get(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeElement(id));
        return elements.get(id);
      },
      querySelectorAll() { return []; },
      createElement() { return makeElement("dynamic"); },
      body: { appendChild() {} }
    }
  };
}

test("Research Mode renders NASA OSD-575 participant charts only after the committed source passes browser-side verification", async () => {
  const csvPath = path.join(dataRoot, "LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv");
  const metadataPath = path.join(dataRoot, "isa-sample-map.json");
  const auditPath = path.join(dataRoot, "source-audit.json");
  const csvBytes = await fs.readFile(csvPath);
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
  const requests = [];

  const fetchImpl = async (url) => {
    const requestPath = String(url);
    requests.push(requestPath);
    if (requestPath.endsWith("LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv")) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => csvBytes.buffer.slice(
          csvBytes.byteOffset,
          csvBytes.byteOffset + csvBytes.byteLength
        )
      };
    }
    if (requestPath.endsWith("isa-sample-map.json")) {
      return { ok: true, status: 200, json: async () => metadata };
    }
    if (requestPath.endsWith("source-audit.json")) {
      return { ok: true, status: 200, json: async () => audit };
    }
    throw new Error("Unexpected research source request: " + requestPath);
  };

  const dom = createDom();
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); }
  };
  const window = {
    AstraHealth: health,
    fetch: fetchImpl,
    crypto: webcrypto,
    addEventListener() {}
  };
  const context = {
    document: dom.document,
    window,
    globalThis: window,
    localStorage,
    navigator: {},
    location: { protocol: "https:" },
    TextDecoder,
    Uint8Array
  };

  vm.runInNewContext(await read("research-data.js"), context);
  vm.runInNewContext(await read("research-data-loader.js"), context);
  vm.runInNewContext(await read("app.js"), context);

  const status = dom.get("research-evidence-status");
  for (let attempt = 0; attempt < 20 && status.textContent !== "SHA-256 · MAP · NORMALIZATION PASS"; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(requests.length, 3);
  assert.ok(requests.some((url) => url.endsWith("LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv")));
  assert.ok(requests.some((url) => url.endsWith("isa-sample-map.json")));
  assert.ok(requests.some((url) => url.endsWith("source-audit.json")));
  assert.equal(status.textContent, "SHA-256 · MAP · NORMALIZATION PASS");
  assert.equal(dom.get("research-data-state").textContent, "DATA + ANALYSIS VERIFIED");
  assert.equal(dom.get("research-evidence-rows").textContent, "28 / 28");
  assert.equal(dom.get("research-evidence-matches").textContent, "28 / 28");
  assert.equal(dom.get("research-evidence-people").textContent, "4 (n=4)");
  assert.equal(dom.get("research-evidence-normalization").textContent, "9 / 9 PASS");
  assert.equal(dom.get("research-marker-select").disabled, false);
  assert.match(dom.get("research-marker-select").innerHTML, /C-reactive protein/);
  assert.match(dom.get("research-marker-chart").innerHTML, /C001/);
  assert.match(dom.get("research-marker-chart").innerHTML, /C004/);
  assert.match(dom.get("research-marker-chart").innerHTML, /R\+194/);
  assert.match(dom.get("research-evidence-table").innerHTML, /Crew mean \(n=4\)/);
  assert.match(dom.get("research-chart-legend").innerHTML, /C001.*C002.*C003.*C004/);

  const selector = dom.get("research-marker-select");
  selector.value = "fibrinogen";
  selector.handlers.change.call(selector);
  assert.equal(dom.get("research-flagged-marker-note").hidden, false);
  assert.match(dom.get("research-flagged-marker-note").textContent, /must not be interpreted biologically/i);

  selector.value = "crp";
  selector.handlers.change.call(selector);
  assert.equal(dom.get("research-flagged-marker-note").hidden, true);
  assert.match(dom.get("research-marker-unit").textContent, /pg\/mL/);
});

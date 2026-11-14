const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const health = require("../health-engine.js");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function createDom() {
  const elements = new Map();
  const makeElement = (id) => ({
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    hidden: false,
    className: "",
    dataset: {},
    attributes: {},
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    setAttribute(name, value) { this.attributes[name] = value; },
    click() { if (this.handlers.click) this.handlers.click({}); },
    remove() {},
    classList: { toggle() {} }
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

test("dashboard scenarios, manual entry, custom bands, wellbeing, and persistence work", function () {
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); }
  };
  const researchWindow = {};
  vm.runInNewContext(read("research-data.js"), { window: researchWindow, globalThis: researchWindow });

  function launchApp() {
    const dom = createDom();
    const window = {
      AstraHealth: health,
      AstraResearch: researchWindow.AstraResearch,
      addEventListener() {}
    };
    vm.runInNewContext(read("app.js"), {
      document: dom.document,
      window,
      localStorage,
      navigator: {},
      location: { protocol: "file:" }
    });
    return dom;
  }

  const dom = launchApp();
  const get = dom.get;
  const study = researchWindow.AstraResearch.inspiration4;
  assert.equal(study.datasetVersion, "3");
  assert.equal(study.participantCount, 4);
  assert.equal(study.sampleCountListed, 28);
  assert.equal(study.timepoints.length, 7);
  assert.ok(study.timepoints.some((point) => point.label === "R+194"));
  assert.equal(study.acquisitionAudit.decision, "INSUFFICIENT_EVIDENCE");
  assert.equal(study.acquisitionAudit.csvDownloaded, false);
  assert.equal(study.acquisitionAudit.fileSha256, null);
  assert.equal(get("research-decision").textContent, "INSUFFICIENT_EVIDENCE");
  assert.equal(get("research-participants").textContent, "4");
  assert.equal(get("research-samples").textContent, "28");
  assert.equal(get("research-timepoint-count").textContent, "7");
  assert.match(get("research-timeline").innerHTML, /R\+194/);
  const sources = researchWindow.AstraResearch.sources;
  const sourceIds = sources.map((source) => source.id);
  assert.equal(new Set(sourceIds).size, sourceIds.length);
  assert.ok(sources.some((source) => source.id === "OSD-575"));
  assert.ok(sources.some((source) => source.id === "BRSMACT_Campaign_1_Actigraphy"));
  assert.ok(sources.some((source) => source.id === "BRSMCF"));
  assert.ok(sources.some((source) => source.id === "DSO-470"));
  const actigraphy = sources.find((source) => source.id === "BRSMACT_Campaign_1_Actigraphy");
  assert.equal(actigraphy.evidenceStatus, "PUBLIC_LISTING_FILE_QA_PENDING");
  assert.match(actigraphy.accessNote, /not live astronaut telemetry/);
  const dso470 = sources.find((source) => source.id === "DSO-470");
  assert.equal(dso470.evidenceStatus, "PUBLIC_INDEX_CANDIDATE_DETAIL_QA_PENDING");
  assert.match(get("research-source-grid").innerHTML, /BRSMACT_Campaign_1_Actigraphy/);
  assert.match(get("research-source-grid").innerHTML, /DSO-470/);
  assert.match(get("mode-indicator").textContent, /NASA RESEARCH MODE/);
  assert.equal(get("overall-status").textContent, "WITHIN CONFIGURED BAND");

  get("demo-scenario").value = "shift";
  get("load-scenario").click();
  assert.equal(get("overall-status").textContent, "REVIEW READINGS");

  get("demo-scenario").value = "incomplete";
  get("load-scenario").click();
  assert.equal(get("overall-status").textContent, "DATA INCOMPLETE");
  assert.match(get("assessment-list").innerHTML, /No data/);

  get("heart-rate").value = "72";
  get("spo2").value = "98.1";
  get("temperature").value = "36.7";
  get("sleep").value = "7.6";
  get("signals-form").handlers.submit({ preventDefault() {} });
  assert.equal(get("overall-status").textContent, "WITHIN CONFIGURED BAND");

  get("band-heart-rate-lower").value = "75";
  get("band-heart-rate-upper").value = "100";
  get("baseline-form").handlers.submit({ preventDefault() {} });
  assert.equal(get("overall-status").textContent, "REVIEW READINGS");

  get("band-heart-rate-lower").value = "110";
  get("band-heart-rate-upper").value = "100";
  get("baseline-form").handlers.submit({ preventDefault() {} });
  assert.match(get("baseline-message").textContent, /Check lower\/upper/);
  assert.equal(get("overall-status").textContent, "REVIEW READINGS");

  get("sleep-quality").value = "3";
  get("stress").value = "4";
  get("fatigue").value = "3";
  get("mood").value = "2";
  get("wellbeing-form").handlers.submit({ preventDefault() {} });
  assert.match(get("wellbeing-message").textContent, /saved/i);

  const reloaded = launchApp();
  assert.equal(String(reloaded.get("heart-rate").value), "72");
  assert.equal(Number(reloaded.get("band-heart-rate-lower").value), 75);
  assert.match(reloaded.get("log-list").innerHTML, /WELLBEING CHECK-IN/);
});

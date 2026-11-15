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
  const createdElements = [];
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
  const viewNames = ["research", "overview", "signals", "wellbeing", "log", "sources", "telemetry"];
  const tabs = viewNames.map(function (name) {
    const tab = makeElement("tab-" + name);
    tab.dataset.view = name;
    return tab;
  });
  const views = viewNames.map(function (name) {
    const view = makeElement("view-" + name);
    view.id = "view-" + name;
    return view;
  });
  return {
    get(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    tabs,
    views,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeElement(id));
        return elements.get(id);
      },
      querySelectorAll(selector) {
        if (selector === ".tab") return tabs;
        if (selector === ".view") return views;
        return [];
      },
      createElement() {
        const element = makeElement("dynamic");
        createdElements.push(element);
        return element;
      },
      body: { appendChild() {}, classList: { toggle() {} } }
    },
    createdElements
  };
}

test("dashboard scenarios, manual entry, custom bands, wellbeing, export, and persistence work", function () {
  const storage = new Map();
  const exportedBlobs = [];
  const revokedObjectUrls = [];
  const scheduledTimeouts = [];
  class TestBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options && options.type;
    }
  }
  const testUrl = {
    createObjectURL(blob) {
      exportedBlobs.push(blob);
      return "blob:astra-export-" + exportedBlobs.length;
    },
    revokeObjectURL(url) {
      revokedObjectUrls.push(url);
    }
  };
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
      addEventListener() {},
      setTimeout(callback, delay) {
        scheduledTimeouts.push({ callback, delay });
        return scheduledTimeouts.length;
      }
    };
    vm.runInNewContext(read("app.js"), {
      document: dom.document,
      window,
      localStorage,
      Blob: TestBlob,
      URL: testUrl,
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
  assert.equal(study.acquisitionAudit.decision, "LIMITED_EVIDENCE");
  assert.equal(study.acquisitionAudit.runNumber, 10);
  assert.equal(study.acquisitionAudit.runId, 43616651617);
  assert.equal(study.acquisitionAudit.analysisCompleted, true);
  assert.equal(study.acquisitionAudit.csvDownloaded, true);
  assert.equal(study.acquisitionAudit.fileSha256, "fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c");
  assert.equal(get("research-decision").textContent, "LIMITED EVIDENCE");
  assert.equal(get("research-file-status").textContent, "Downloaded · 6,207 bytes");
  assert.equal(get("research-evidence-status").textContent, "SOURCE AUDIT PASSED · BROWSER CHECK REQUIRED");
  assert.equal(get("research-participants").textContent, "4");
  assert.equal(get("research-samples").textContent, "28");
  assert.equal(get("research-timepoint-count").textContent, "7");
  assert.equal(get("research-run-status").textContent, "Run #10 · post-download audit passed");
  assert.match(get("mode-indicator").textContent, /SOURCE AUDIT PASSED · BROWSER CHECK REQUIRED/);
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
  assert.equal(dso470.evidenceStatus, "INDEX_AND_APP_AUDITED_NO_DATA_FILE_ENDPOINT_VERIFIED");
  assert.match(get("research-source-grid").innerHTML, /BRSMACT_Campaign_1_Actigraphy/);
  assert.match(get("research-source-grid").innerHTML, /DSO-470/);
  assert.match(get("mode-indicator").textContent, /NASA RESEARCH MODE/);
  assert.equal(get("overall-status").textContent, "WITHIN CONFIGURED BAND");
  assert.equal(get("baseline-assessment-status").textContent, "No baseline");
  get("capture-baseline").click();
  assert.match(get("baseline-capture-message").textContent, /load a demo scenario/i);

  get("demo-scenario").value = "shift";
  get("load-scenario").click();
  assert.equal(get("overall-status").textContent, "REVIEW READINGS");
  assert.equal(get("baseline-assessment-status").textContent, "Baseline shift");
  assert.match(get("baseline-assessment-summary").textContent, /4 of 4 signals exceed/);
  assert.match(get("trend-caption").textContent, /One saved reading/);
  assert.equal(get("trend-points").innerHTML.match(/<circle/g).length, 1);
  assert.equal(get("trend-line").attributes.points, "");

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
  get("capture-baseline").click();
  assert.equal(get("baseline-assessment-status").textContent, "Within baseline tolerance");
  assert.equal(get("baseline-source-label").textContent, "Personal baseline saved on this device");
  assert.match(get("baseline-capture-message").textContent, /captured/i);

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
  assert.match(get("wellbeing-assessment-summary").textContent, /High self-reported stress/);
  assert.match(get("wellbeing-assessment-summary").textContent, /Low self-reported mood/);
  assert.equal(get("context-assessment-status").textContent, "Wellbeing review");

  const reloaded = launchApp();
  assert.equal(String(reloaded.get("heart-rate").value), "72");
  assert.equal(Number(reloaded.get("band-heart-rate-lower").value), 75);
  assert.match(reloaded.get("log-list").innerHTML, /WELLBEING CHECK-IN/);
  assert.equal(reloaded.get("baseline-source-label").textContent, "Personal baseline saved on this device");
  assert.equal(reloaded.get("wellbeing-assessment-status").textContent, "Review");

  reloaded.get("export-csv").click();
  assert.equal(exportedBlobs.length, 1);
  assert.equal(exportedBlobs[0].type, "text/csv;charset=utf-8");
  const exportLink = reloaded.createdElements[0];
  assert.equal(exportLink.download, "astra-local-demo-log.csv");
  assert.equal(exportLink.href, "blob:astra-export-1");
  const csv = exportedBlobs[0].parts.join("");
  assert.match(csv, /^"recorded_at","record_type","heart_rate_bpm","spo2_percent","temperature_c","sleep_hours","note"/);
  assert.match(csv, /"WELLBEING CHECK-IN"/);
  assert.match(csv, /"Self-report saved:/);
  assert.deepEqual(revokedObjectUrls, []);
  assert.equal(scheduledTimeouts[0].delay, 1000);
  scheduledTimeouts.shift().callback();
  assert.deepEqual(revokedObjectUrls, ["blob:astra-export-1"]);

  reloaded.get("clear-log").click();
  reloaded.get("export-csv").click();
  assert.equal(exportedBlobs.length, 2);
  assert.deepEqual(revokedObjectUrls, ["blob:astra-export-1"]);
  scheduledTimeouts.shift().callback();
  assert.deepEqual(revokedObjectUrls, ["blob:astra-export-1", "blob:astra-export-2"]);
  const emptyLogCsv = exportedBlobs[1].parts.join("");
  assert.match(emptyLogCsv, /"CURRENT DEMO STATE"/);
  assert.match(emptyLogCsv, /"Simulated or manually entered; not a medical record"/);
});


test("Research Mode derives NASA metadata verification from the imported snake_case audit and exact 28/28 browser join", async function () {
  const researchWindow = {};
  vm.runInNewContext(read("research-data.js"), { window: researchWindow, globalThis: researchWindow });
  const participantIds = ["C001", "C002", "C003", "C004"];
  const timepoints = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"];
  const participants = {};
  participantIds.forEach(function (participant, participantIndex) {
    participants[participant] = timepoints.map(function (timepoint, index) {
      return { timepoint, concentration: 100 + index, percentOfPreflightMean: 95 + participantIndex + index };
    });
  });
  const byTimepoint = timepoints.map(function (timepoint, index) {
    const values = participantIds.map(function (participant, participantIndex) { return 95 + participantIndex + index; });
    return {
      timepoint,
      n: 4,
      mean: values.reduce(function (sum, value) { return sum + value; }, 0) / 4,
      min: Math.min.apply(null, values),
      max: Math.max.apply(null, values)
    };
  });
  const evidence = {
    datasetId: "OSD-575",
    datasetVersion: "3",
    fileBytes: 6207,
    sha256: "fdba6c3ce45401c12ca9b699fa375303793959aa0391e2f3c722f354d9cfc75c",
    rowCount: 28,
    columnCount: 19,
    participantIds,
    timepoints,
    matchedSampleCount: 28,
    metadataSampleCount: 28,
    normalizationAudit: { status: "PASS", baselineSampleCount: 12, analyteCount: 9, maxAbsoluteError: 4.9e-8 },
    audit: {
      workflow_run_id: 43616651617,
      dataset_id: "OSD-575",
      dataset_version: "3",
      metadata_sample_join: "PASS",
      mapped_samples: 28,
      mapped_participants: 4,
      mapped_timepoints: 7,
      normalization_audit: { status: "PASS", analyte_count: 9 },
      scientific_decision: "LIMITED_EVIDENCE"
    },
    markers: [{
      id: "crp",
      label: "CRP",
      unit: "pg/mL",
      flaggedForInterpretation: false,
      participants,
      byTimepoint
    }]
  };
  const dom = createDom();
  const localStorage = { getItem() { return null; }, setItem() {} };
  const appWindow = {
    AstraHealth: health,
    AstraResearch: researchWindow.AstraResearch,
    AstraResearchLoader: { loadOds575Evidence() { return Promise.resolve(evidence); } },
    addEventListener() {}
  };
  vm.runInNewContext(read("app.js"), {
    document: dom.document,
    window: appWindow,
    localStorage,
    Blob,
    URL,
    navigator: {},
    location: { protocol: "file:" }
  });
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(dom.get("research-metadata-status").textContent, "Verified · 28/28 ISA matches");
  assert.equal(dom.get("research-run-status").textContent, "Run ID 43616651617");
  assert.equal(dom.get("research-data-state").textContent, "DATA + ANALYSIS VERIFIED");
  assert.equal(dom.get("research-evidence-rows").textContent, "28 / 28");
  assert.equal(dom.get("research-evidence-matches").textContent, "28 / 28");
  assert.doesNotMatch(dom.get("research-metadata-status").textContent, /Not verified/);
});

test("partial saved demo records keep absent readings missing instead of restoring nominal example values", function () {
  const dom = createDom();
  const stored = {
    readings: { heartRate: 74 },
    wellbeing: { sleepQuality: 4, stress: 2, fatigue: 2, mood: 4 },
    log: []
  };
  const localStorage = {
    getItem(key) { return key === "astra.demo.v1" ? JSON.stringify(stored) : null; },
    setItem() {}
  };
  const researchWindow = {};
  vm.runInNewContext(read("research-data.js"), { window: researchWindow, globalThis: researchWindow });
  vm.runInNewContext(read("app.js"), {
    document: dom.document,
    window: { AstraHealth: health, AstraResearch: researchWindow.AstraResearch, addEventListener() {} },
    localStorage,
    Blob,
    URL,
    navigator: {},
    location: { protocol: "file:" }
  });

  assert.equal(String(dom.get("heart-rate").value), "74");
  assert.equal(dom.get("spo2").value, "");
  assert.equal(dom.get("temperature").value, "");
  assert.equal(dom.get("sleep").value, "");
  assert.equal(dom.get("overall-status").textContent, "DATA INCOMPLETE");
  assert.match(dom.get("assessment-list").innerHTML, /No reading was entered/);
});


test("the header mode indicator stays in Demo & Manual Mode while other views re-render", function () {
  const dom = createDom();
  const researchWindow = {};
  vm.runInNewContext(read("research-data.js"), { window: researchWindow, globalThis: researchWindow });
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); }
  };
  vm.runInNewContext(read("app.js"), {
    document: dom.document,
    window: { AstraHealth: health, AstraResearch: researchWindow.AstraResearch, addEventListener() {} },
    localStorage,
    Blob,
    URL,
    navigator: {},
    location: { protocol: "file:" }
  });

  const mode = dom.get("mode-indicator");
  assert.match(mode.textContent, /NASA RESEARCH MODE/);
  dom.tabs.find(function (tab) { return tab.dataset.view === "overview"; }).click();
  assert.equal(mode.textContent, "DEMO / MANUAL INPUT · NO LIVE SENSORS");

  dom.get("demo-scenario").value = "shift";
  dom.get("load-scenario").click();
  assert.equal(mode.textContent, "DEMO / MANUAL INPUT · NO LIVE SENSORS");
  assert.equal(dom.get("overall-status").textContent, "REVIEW READINGS");

  dom.tabs.find(function (tab) { return tab.dataset.view === "wellbeing"; }).click();
  dom.get("stress").value = "5";
  dom.get("wellbeing-form").handlers.submit({ preventDefault() {} });
  assert.equal(mode.textContent, "DEMO / MANUAL INPUT · NO LIVE SENSORS");

  dom.tabs.find(function (tab) { return tab.dataset.view === "research"; }).click();
  assert.match(mode.textContent, /NASA RESEARCH MODE/);
});


test("Research Mode never reports verified data when browser-side source verification fails", async function () {
  const dom = createDom();
  const researchWindow = {};
  vm.runInNewContext(read("research-data.js"), { window: researchWindow, globalThis: researchWindow });
  const localStorage = { getItem() { return null; }, setItem() {} };
  const appWindow = {
    AstraHealth: health,
    AstraResearch: researchWindow.AstraResearch,
    AstraResearchLoader: {
      loadOds575Evidence() { return Promise.reject(new Error("SHA-256 verification failed")); }
    },
    addEventListener() {}
  };
  vm.runInNewContext(read("app.js"), {
    document: dom.document,
    window: appWindow,
    localStorage,
    Blob,
    URL,
    navigator: {},
    location: { protocol: "file:" }
  });
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(dom.get("research-data-state").textContent, "BROWSER VERIFICATION FAILED");
  assert.equal(dom.get("research-metadata-status").textContent, "Browser verification failed");
  assert.equal(dom.get("research-evidence-status").textContent, "SOURCE VERIFICATION FAILED");
  assert.equal(dom.get("research-marker-select").disabled, true);
  assert.match(dom.get("research-evidence-error").textContent, /SHA-256 verification failed/);
  assert.match(dom.get("mode-indicator").textContent, /BROWSER VERIFICATION FAILED/);
});

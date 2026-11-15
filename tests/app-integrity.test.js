const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("every static DOM id requested by app.js exists in index.html", function () {
  const html = read("index.html");
  const app = read("app.js");
  const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
  const required = Array.from(app.matchAll(/\$\("([^"]+)"\)/g), (match) => match[1]);
  const missing = required.filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
});

test("all local scripts, stylesheet and manifest referenced by index.html exist", function () {
  const html = read("index.html");
  const assets = [
    ...Array.from(html.matchAll(/<script src="([^"]+)"/g), (match) => match[1]),
    ...Array.from(html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g), (match) => match[1]),
    ...Array.from(html.matchAll(/<link rel="manifest" href="([^"]+)"/g), (match) => match[1])
  ];
  assets.forEach((asset) => assert.equal(fs.existsSync(path.join(root, asset)), true, asset + " should exist"));
});

test("PWA manifest declares scalable 192px and 512px ASTRA icons that exist locally", function () {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "ASTRA — Crew Health Monitor");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/svg+xml"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/svg+xml"));
  manifest.icons.forEach((icon) => {
    assert.equal(fs.existsSync(path.join(root, icon.src)), true, icon.src + " should exist");
  });
});

test("every local app-shell asset in the service worker exists", function () {
  const worker = read("sw.js");
  const block = worker.match(/const APP_SHELL = \[([^\]]+)\]/);
  assert.ok(block, "APP_SHELL list should be present");
  const assets = Array.from(block[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
  assets.filter((asset) => asset !== "./").forEach((asset) => {
    assert.equal(fs.existsSync(path.join(root, asset.replace(/^\.\//, ""))), true, asset + " should exist");
  });
});

test("NASA Research Mode is the default entry view and demo controls are separated", function () {
  const html = read("index.html");
  const app = read("app.js");
  const css = read("styles.css");
  assert.match(html, /class="tab active" data-view="research"/);
  assert.match(html, /data-view="overview" type="button">Demo &amp; Manual Mode</);
  assert.ok(html.indexOf('id="view-research"') < html.indexOf('id="view-overview"'));
  assert.match(app, /activateView\("research"\)/);
  assert.match(app, /NASA RESEARCH MODE/);
  assert.match(app, /DEMO \/ MANUAL INPUT/);
  assert.match(css, /\.research-mode \.demo-only/);
});

test("NASA research source registry keeps DSO 602 separate from NLSP experiment 3.1.2", function () {
  const modulePath = require.resolve("../research-data.js");
  delete require.cache[modulePath];
  require(modulePath);
  const sources = globalThis.AstraResearch.sources;
  const ids = sources.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length, "research source IDs must be unique");

  const dso602 = sources.find((source) => source.id === "DSO-602");
  const experiment312 = sources.find((source) => source.id === "NLSP-3.1.2");
  assert.ok(dso602, "DSO 602 must remain a separately identified source");
  assert.ok(experiment312, "NLSP experiment 3.1.2 must remain a separately identified source");
  assert.notEqual(dso602.url, experiment312.url);
  assert.match(dso602.url, /IDP-LSDA_HARDWARE/);
  assert.match(dso602.accessNote, /separate NLSP experiment 3\.1\.2/i);
  assert.match(experiment312.url, /f8e3f755-5caa-522c-b628-7153cfe446f5/);
  assert.match(experiment312.accessNote, /not DSO 602/i);

  sources.forEach((source) => {
    assert.ok(source.name && source.provider && source.environment && source.statusLabel, source.id);
    assert.match(source.url, /^https:\/\//, source.id + " must link to HTTPS");
    assert.ok(Array.isArray(source.measures) && source.measures.length > 0, source.id);
  });
});


test("every navigation tab targets exactly one existing view section", function () {
  const html = read("index.html");
  const tabViews = Array.from(html.matchAll(/data-view="([^"]+)"/g), (match) => match[1]);
  const sectionViews = Array.from(
    html.matchAll(/<section class="view(?: active)?" id="view-([^"]+)"/g),
    (match) => match[1]
  );
  assert.equal(new Set(tabViews).size, tabViews.length, "navigation targets must be unique");
  assert.equal(new Set(sectionViews).size, sectionViews.length, "view sections must be unique");
  assert.deepEqual([...tabViews].sort(), [...sectionViews].sort());
  assert.equal(tabViews.length, 7);
});


test("Mission Replay UI selectors exist and replay scripts are loaded after the model and engine", function () {
  const html = read("index.html");
  const replayUi = read("mission-replay-ui.js");
  const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
  const required = Array.from(replayUi.matchAll(/\$\("([^"]+)"\)/g), (match) => match[1]);
  assert.deepEqual(required.filter((id) => !ids.has(id)), []);
  const modelIndex = html.indexOf('src="data/models/mission-anomaly-mlp-v1.js"');
  const engineIndex = html.indexOf('src="mission-engine.js"');
  const uiIndex = html.indexOf('src="mission-replay-ui.js"');
  assert.ok(modelIndex >= 0 && engineIndex > modelIndex && uiIndex > engineIndex);
  assert.match(html, /data-view="replay" type="button">Mission replay/);
  assert.match(html, /id="view-replay"/);
});

test("model artefact, offline bundle and reproducible training documentation are present", function () {
  const model = JSON.parse(read("data/models/mission-anomaly-mlp-v1.json"));
  assert.equal(model.modelId, "ASTRA-SYNTH-MLP-1");
  assert.equal(model.training.syntheticOnly, true);
  assert.equal(model.training.noNASAOrClinicalTrainingData, true);
  assert.equal(fs.existsSync(path.join(root, "data/models/mission-anomaly-mlp-v1.js")), true);
  assert.equal(fs.existsSync(path.join(root, "scripts/train_mission_model.py")), true);
  assert.equal(fs.existsSync(path.join(root, "docs/mission-ml-model-card.md")), true);
  assert.equal(fs.existsSync(path.join(root, "THIRD_PARTY_NOTICES.md")), true);
});

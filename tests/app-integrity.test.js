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

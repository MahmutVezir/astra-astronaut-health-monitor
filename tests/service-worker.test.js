"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const workerSource = fs.readFileSync(path.join(root, "sw.js"), "utf8");

function createWorker(options = {}) {
  const handlers = {};
  const calls = {
    opened: [],
    precached: [],
    deleted: [],
    claimed: 0,
    skippedWaiting: 0
  };
  const cache = {
    async addAll(paths) {
      calls.precached.push(...paths);
    },
    async match(request) {
      return options.cacheMatch ? options.cacheMatch(request) : null;
    },
    async put() {}
  };
  const caches = {
    async open(name) {
      calls.opened.push(name);
      return cache;
    },
    async keys() {
      return options.cacheKeys || [];
    },
    async delete(name) {
      calls.deleted.push(name);
      return true;
    }
  };
  const self = {
    location: { origin: "https://example.test" },
    clients: {
      async claim() {
        calls.claimed += 1;
      }
    },
    addEventListener(name, handler) {
      handlers[name] = handler;
    },
    skipWaiting() {
      calls.skippedWaiting += 1;
    }
  };
  class FakeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || "OK";
      this.ok = this.status >= 200 && this.status < 300;
    }
    clone() {
      return new FakeResponse(this.body, { status: this.status, statusText: this.statusText });
    }
  }
  vm.runInNewContext(workerSource, {
    self,
    caches,
    URL,
    Response: FakeResponse,
    fetch: options.fetch || (async () => {
      throw new Error("Network unavailable");
    })
  });
  return { handlers, calls, FakeResponse };
}

test("install pre-caches all assets required to reopen NASA Research Mode offline", async () => {
  const worker = createWorker();
  let installPromise;
  worker.handlers.install({
    waitUntil(promise) {
      installPromise = promise;
    }
  });
  await installPromise;

  assert.equal(worker.calls.opened.includes("astra-shell-v3"), true);
  assert.equal(worker.calls.skippedWaiting, 1);
  for (const asset of [
    "./index.html",
    "./research-data-loader.js",
    "./data/osdr/OSD-575/LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv",
    "./data/osdr/OSD-575/isa-sample-map.json",
    "./data/osdr/OSD-575/source-audit.json"
  ]) {
    assert.equal(worker.calls.precached.includes(asset), true, asset + " must be cached at install");
  }
});

test("activation deletes only previous ASTRA caches and preserves other applications' caches", async () => {
  const worker = createWorker({
    cacheKeys: ["astra-shell-v1", "other-app-cache", "astra-shell-v2", "unrelated"]
  });
  let activationPromise;
  worker.handlers.activate({
    waitUntil(promise) {
      activationPromise = promise;
    }
  });
  await activationPromise;

  assert.deepEqual(worker.calls.deleted, ["astra-shell-v1", "astra-shell-v2"]);
  assert.equal(worker.calls.claimed, 1);
});

test("offline navigation falls back to the cached app shell; uncached assets return 503", async () => {
  const offlineDocument = { body: "cached index" };
  const worker = createWorker({
    cacheMatch(request) {
      return request === "./index.html" ? offlineDocument : null;
    }
  });

  let navigationResponse;
  worker.handlers.fetch({
    request: {
      method: "GET",
      url: "https://example.test/astra/",
      mode: "navigate"
    },
    respondWith(promise) {
      navigationResponse = promise;
    }
  });
  assert.equal(await navigationResponse, offlineDocument);

  let assetResponse;
  worker.handlers.fetch({
    request: {
      method: "GET",
      url: "https://example.test/astra/missing.js",
      mode: "no-cors"
    },
    respondWith(promise) {
      assetResponse = promise;
    }
  });
  const result = await assetResponse;
  assert.equal(result.status, 503);
  assert.equal(result.statusText, "Offline");
});

test("cross-origin and non-GET requests are left to the browser", () => {
  const worker = createWorker();
  let intercepted = false;
  worker.handlers.fetch({
    request: {
      method: "POST",
      url: "https://example.test/api",
      mode: "cors"
    },
    respondWith() {
      intercepted = true;
    }
  });
  worker.handlers.fetch({
    request: {
      method: "GET",
      url: "https://cdn.example.org/library.js",
      mode: "cors"
    },
    respondWith() {
      intercepted = true;
    }
  });
  assert.equal(intercepted, false);
});

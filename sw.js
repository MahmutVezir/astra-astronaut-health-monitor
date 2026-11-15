"use strict";

const CACHE_PREFIX = "astra-astronaut-health-monitor-";
const CACHE_NAME = "astra-astronaut-health-monitor-shell-v6";
const LEGACY_CACHE_NAMES = ["astra-shell-v1", "astra-shell-v2"];
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./health-engine.js",
  "./app.js",
  "./research-data.js",
  "./research-data-loader.js",
  "./mission-engine.js",
  "./mission-replay-ui.js",
  "./data/models/mission-anomaly-mlp-v2.js",
  "./data/osdr/OSD-575/LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv",
  "./data/osdr/OSD-575/isa-sample-map.json",
  "./data/osdr/OSD-575/source-audit.json",
  "./manifest.webmanifest",
  "./icons/astra.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      const previousAppCaches = keys.filter(function (key) {
        return LEGACY_CACHE_NAMES.includes(key) ||
          (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME);
      });
      return Promise.all(previousAppCaches.map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request).then(function (response) {
          if (!response || !response.ok) return response;
          return cache.put(event.request, response.clone()).catch(function () {}).then(function () {
            return response;
          });
        }).catch(function () {
          if (event.request.mode === "navigate") {
            return cache.match("./index.html");
          }
          return new Response("Offline resource unavailable.", {
            status: 503,
            statusText: "Offline"
          });
        });
      });
    })
  );
});

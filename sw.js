"use strict";

const CACHE_PREFIX = "astra-shell-";
const CACHE_NAME = "astra-shell-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./health-engine.js",
  "./app.js",
  "./research-data.js",
  "./research-data-loader.js",
  "./data/osdr/OSD-575/LSDS-8_Multiplex_serum_cardiovascular_EvePanel_TRANSFORMED.csv",
  "./data/osdr/OSD-575/isa-sample-map.json",
  "./data/osdr/OSD-575/source-audit.json",
  "./manifest.webmanifest"
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
        return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
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
          if (response && response.ok) {
            const copy = response.clone();
            const cacheWrite = cache.put(event.request, copy);
            if (typeof event.waitUntil === "function") {
              event.waitUntil(cacheWrite.catch(function () {}));
            }
          }
          return response;
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

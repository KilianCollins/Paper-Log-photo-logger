// Well Photo Log — service worker. Caches the app shell only, so the UI
// loads instantly and works offline. Drive API calls and the Google Identity
// Services script are always network — uploads need connectivity and this
// never pretends otherwise.

var CACHE_NAME = 'well-photo-log-shell-v1';
var SHELL = [
  './',
  './index.html',
  './config.js',
  './auth.js',
  './drive.js',
  './resize.js',
  './storage.js',
  './camera.js',
  './app.js',
  './wells.json',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // Drive API, GIS script — always network

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});

/* Hearthside service worker — lets the web / home-screen version run offline
 * once it has been opened online. It is only registered for https/localhost
 * (see index.html), never in the desktop host or the native Android app.
 *
 * Code (html/js/css) is network-first, so a new release reaches players as
 * soon as they are online; heavy, unchanging assets (images, audio, fonts)
 * are cache-first for speed and offline play. Bump CACHE on each release so a
 * returning player drops the previous version's cached files.
 */
'use strict';
var CACHE = 'hearthside-v1.6.4';
var ASSET = /\.(?:png|jpe?g|webp|gif|svg|ico|mp3|ogg|wav|woff2?)$/i;

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.add('./index.html').catch(function () {});
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return; // leave cross-origin requests alone

  if (ASSET.test(url.pathname)) {
    // cache-first
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
  } else {
    // network-first, fall back to cache (and to index.html for navigations)
    e.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
      });
    }));
  }
});

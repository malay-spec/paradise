// BankNifty AlgoEdge Pro — Service Worker (PWA & Offline Cache)
const CACHE_NAME = 'banknifty-algoedge-v3.2.6';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './terminal.css',
  './app.js',
  './state.js',
  './websocketClient.js',
  './css/main.css',
  './css/terminal.css',
  './css/strategies.css',
  './css/optionchain.css',
  './js/audioEffects.js',
  './js/state.js',
  './js/candleStructure.js',
  './js/chartEngine.js',
  './js/strikeAdvisor.js',
  './js/flashScalpSniper.js',
  './js/websocketClient.js',
  './js/optionChain.js',
  './js/paperBroker.js',
  './js/strategyEngine.js',
  './js/backtestEngine.js',
  './js/brokerBridge.js',
  './js/app.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('SW pre-cache warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Never cache backend API calls, live market feeds, or market snapshot JSON
  if (event.request.method !== 'GET' || event.request.url.includes('/api/') || event.request.url.includes('market_snapshot.json')) {
    return;
  }

  // Network-First Strategy: always fetch freshest active code from server, fallback to cache if offline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

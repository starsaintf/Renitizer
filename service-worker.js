const CACHE = 'renitizer-v2';
const SHELL = ['./', './index.html', './styles.css', './manifest.webmanifest', './icons/icon-192.svg', './icons/icon-512.svg', './src/main.js', './src/core/findings.js', './src/core/report.js', './src/core/risk-score.js', './src/scanners/file-facts.js', './src/scanners/metadata.js', './src/scanners/barcode.js', './src/scanners/ocr.js', './src/scanners/cloud.js', './src/scanners/orchestrator.js', './src/sanitize/image.js'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request))); });

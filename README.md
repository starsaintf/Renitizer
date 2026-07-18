# Renitizer

Renitizer is a static, local-first privacy lab for inspecting media before sharing. It scans browser-local file facts and metadata markers, can use native barcode/QR detection where available, offers lazy on-device OCR, and creates a metadata-free canvas re-encoded copy for supported raster images.

It reduces exposure, not anonymity. Visible pixels (including faces, text, and QR codes) are never silently removed.

## Run or publish

Serve the repository root with any static server, then open `index.html`. For example: `npx serve .` or GitHub Pages. The page must be served from HTTP(S) for service-worker installation and reliable module loading.

`node --test` runs the pure scanner and risk-model tests. `node --check src/main.js` checks the browser entry module syntax.

## Local capability boundaries

- Images: file facts, byte-level EXIF/XMP/IPTC/GPS/device marker checks, native QR/barcode scan, optional Tesseract OCR, and canvas re-encode.
- OCR: Tesseract is imported from its CDN only when **Deep OCR scan** is clicked. It is not sent to Renitizer.
- QR/barcodes: uses the browser's native `BarcodeDetector`; unsupported browsers return an explicit unavailable finding.
- Audio/video: accepted for a report-only local workflow. Browser-only speech transcription and reliable video analysis are not claimed; use the explicit cloud path if your provider supports those types.
- Canvas clean copies: supported raster images only. They remove embedded metadata by re-encoding pixels but do not redact visible content.

## Optional cloud worker

The static app never has a secret and never automatically uploads a file. To enable the consent-gated endpoint:

1. Create a Cloudflare Worker from `worker/`, then set the server secret: `wrangler secret put OPENAI_API_KEY`.
2. Deploy it with `wrangler deploy` and paste `https://your-worker.example/api/analyze` in the dashboard's Provider endpoint field.
3. Check the clear consent box. Only then does the browser POST the selected file and requested analysis types.

`worker/src/index.js` is an intentionally small sample that sends **images only** to OpenAI's vision Responses API and normalizes its structured findings. It returns an honest unavailable finding for audio/video. Put authentication, origin restrictions, size limits, and a provider-specific audio/video path in front of a production deployment.

Never put `OPENAI_API_KEY` in `config.js`, `config.example.js`, the browser, or source control.

## Native wrappers

- Capacitor: install Capacitor in a wrapper project, point it at this checkout's static web directory (`webDir: "."`), then add Android/iOS platforms. `capacitor.config.json` provides the app identity.
- Tauri: create a standard Tauri shell and use `tauri.conf.json` as the starting configuration. Its `frontendDist` points one directory above the Tauri wrapper, so keep the wrapper in a sibling `src-tauri/` directory or adjust the path.

No native binaries or credentials are included.

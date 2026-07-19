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
- Audio: accepted for a report-only local workflow and, only after explicit consent, sent to the Worker transcription path. The Worker detects transcript email, phone, street-address, and name cues.
- Video: the browser locally samples up to three image frames and sends those frames to the existing cloud vision path only after explicit consent. If the browser cannot decode or encode frames, it reports that a dedicated cloud video endpoint is required.
- Canvas clean copies: supported raster images only. They remove embedded metadata by re-encoding pixels and apply the redactions that the user reviews and approves.
- PDF and Office documents: the browser can prepare a metadata-only document-cleaning request and safe status report. It does not inspect document internals, upload the document, or claim a clean document exists unless a separately configured processor returns one.
- Secure sharing: after a clean copy is ready, the optional **Share safely** section creates a browser-local AES-256-GCM encrypted package and a separate recovery-key file. The package envelope never contains the key, original filename, or raw findings unless the user explicitly includes detailed findings. The expiry is package metadata, not remotely enforceable deletion.

### Encrypted-package delivery boundary

Renitizer does not provide share storage, uploads, or public links by default. The current delivery state is explicitly **unconfigured**: users download an encrypted package and choose how to send it themselves. A configured sharing backend would need to store only the secret-free envelope and define authenticated retrieval, expiry enforcement, revocation, and key exchange; it must not be implied by the local package flow.

## Optional cloud worker

The static app never has a secret and never automatically uploads a file. To enable the consent-gated endpoint:

1. Create a Cloudflare Worker from `worker/`, then set the server secret: `wrangler secret put OPENAI_API_KEY`.
2. Deploy it with `wrangler deploy` and paste `https://your-worker.example/api/analyze` in the dashboard's Provider endpoint field.
3. Check the clear consent box. Only then does the browser POST the selected file and requested analysis types.

`worker/src/index.js` is an intentionally small sample that sends image files (including client-sampled video frames) to OpenAI's vision Responses API, and sends audio to `/v1/audio/transcriptions` before inspecting transcript PII cues. A video sent directly to the Worker gets a specific sampled-frame/dedicated-endpoint requirement. Put authentication, origin restrictions, size limits, and a provider-specific video path in front of a production deployment.

Never put `OPENAI_API_KEY` in `config.js`, `config.example.js`, the browser, or source control.

## Shared Renvoy identity

Native Renvoy/Renitizer hosts may expose `window.RenvoyRenitizer.getSession({ scope: 'renitizer:use' })`. Renitizer accepts only an HTTPS Worker origin and an opaque short-lived capability from that trusted host bridge; it never accepts credentials through a URL, form field, or saved browser setting.

### Processing-job API prerequisites

`POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/document-cleaning`, and the reserved `/api/share` prefix are account-protected remote routes. They use the same Renvoy device identity as the messaging product: the client sends `Authorization: Renvoy <capability>` and the Worker forwards it to Renvoy’s `POST /v1/identity/renitizer/verify` endpoint. Renvoy returns only an active account ID, device ID, and the `renitizer:use` grant; it never shares the capability-signing key or messaging scopes. Configure the Worker secret `RENVOY_IDENTITY_VERIFICATION_URL` with that Renvoy endpoint before enabling these routes. A missing configuration returns `503 identity-unconfigured`; invalid or revoked capabilities return `401 unauthorized`; a Renvoy outage returns `503 identity-unavailable`.

Jobs are account-bound and a job ID cannot be read by another Renvoy account. `POST /api/jobs/upload` accepts multipart `file` plus matching JSON `metadata` after Renvoy verification. When `MEDIA_BUCKET` and `JOBS_QUEUE` are configured, it stores the original in private R2, writes a durable job record, and sends only a compact job ID/account message to the queue. The object key is generated from the verified account and job ID; the source filename never becomes a path. `GET /api/jobs/:id` reads that durable record. The Queue handler records a clear processor-unavailable failure until a media renderer or document transformer is configured; it never fabricates a clean output.

## Hosted encrypted sharing

The browser encrypts a clean copy before it leaves the device. `POST /api/shares` accepts only that opaque encrypted package plus a named Renvoy recipient account and an expiry (up to 30 days). The private R2 bucket stores the encrypted bytes, an owner manifest, and a recipient index—never the recovery key, password, or clear file. The sender must transfer the recovery key separately using a channel they trust.

Both the sender and the named recipient use their Renvoy identity to download `GET /api/shares/:shareId`; anyone else receives the same not-found response. `DELETE /api/shares/:shareId` lets only the sender revoke it, removing the encrypted package and access records. Expired packages are deleted on access and return a clear expired response. Downloaded packages are decrypted locally in the **Decrypt shared package** screen, so Renitizer hosting never performs decryption.

Document-cleaning jobs use `kind: "document-cleaning"`, `documentType` (`pdf` or `office`), and a list of requested removal actions; raw JSON content is rejected. With a private R2 bucket, Queue, `DOCUMENT_PROCESSOR_URL`, and `PROCESSOR_AUTH_TOKEN` configured, the Worker streams the private input to the document processor and stores a clean output only after it receives the expected document type. `GET /api/jobs/:id/output` then permits only the owning Renvoy account to download it. Until the private storage and Queue bindings exist, uploads return `503 processing-unconfigured`; no file is accepted or retained.

### Video renderer

`processor/video` is a deployable FFmpeg service for actual video cover redaction. A `video-redaction` job accepts normalized, time-bounded `cover` tracks; the Worker streams the private R2 input to the service, stores its MP4 response in R2, then enables the owner-only `GET /api/jobs/:id/output` download. Set `PROCESSOR_URL` only in the Worker environment and `PROCESSOR_AUTH_TOKEN` only as a Worker/container secret. The first renderer intentionally supports solid cover boxes—the safest redaction mode—rather than silently substituting a weaker effect for a requested blur.

## Native wrappers

- Capacitor: install Capacitor in a wrapper project, point it at this checkout's static web directory (`webDir: "."`), then add Android/iOS platforms. `capacitor.config.json` provides the app identity.
- Tauri: create a standard Tauri shell and use `tauri.conf.json` as the starting configuration. Its `frontendDist` points one directory above the Tauri wrapper, so keep the wrapper in a sibling `src-tauri/` directory or adjust the path.

No native binaries or credentials are included.

# Renitizer

Renitizer is a static, local-first privacy lab for inspecting media before sharing. It scans browser-local file facts and metadata markers, can use native barcode/QR detection where available, offers lazy on-device OCR, and creates a metadata-free canvas re-encoded copy for supported raster images.

It reduces exposure, not anonymity. Visible pixels (including faces, text, and QR codes) are never silently removed.

## Run or publish

Serve the repository root with any static server, then open `index.html`. For example: `npx serve .` or GitHub Pages. The page must be served from HTTP(S) for service-worker installation and reliable module loading.

`node --test` runs the pure scanner and risk-model tests. `node --check src/main.js` checks the browser entry module syntax.

## Local capability boundaries

- Images: file facts, byte-level EXIF/XMP/IPTC/GPS/device marker checks, native face and QR/barcode checks where supported, optional Tesseract OCR, and canvas re-encode.
- Faces: uses the browser's native `FaceDetector` when available. Unsupported browsers show an explicit unavailable result rather than claiming no faces were found.
- OCR: Tesseract is imported from its CDN only when **Deep OCR scan** is clicked. It is not sent to Renitizer.
- QR/barcodes: uses the browser's native `BarcodeDetector`; unsupported browsers return an explicit unavailable finding.
- Audio: users can choose exact times to mute or bleep in-browser, then save a clean WAV copy. With explicit consent, the Worker requests word timestamps from the transcription provider and uses them to make detected email, phone, street-address, and name cues reviewable by time when the transcript can be aligned. A chosen range is not reported as removed until the clean file is actually created.
- Video: the browser locally samples three to 24 evenly distributed image frames (roughly every ten seconds, bounded for privacy, cost, and device limits) and sends those frames to the existing cloud vision path only after explicit consent. Returned visual boxes carry a short, visible review window. The person using Renitizer chooses **cover** or **keep** for each marked moment; a clean MP4 is not reported until the private renderer returns it. This is sampled-moment review, not a claim of full frame-by-frame tracking. If the browser cannot decode or encode frames, it reports that a dedicated cloud video endpoint is required.
- Canvas clean copies: supported raster images only. They remove embedded metadata by re-encoding pixels and apply the redactions that the user reviews and approves. A blur or cover remains a planned change until the clean image is successfully created, then the receipt records it as addressed.
- PDF and Office documents: the browser can prepare a metadata-only document-cleaning request and safe status report. It does not inspect document internals, upload the document, or claim a clean document exists unless a separately configured processor returns one.
- Secure sharing: after a clean copy is ready, the optional **Share safely** section creates a browser-local AES-256-GCM encrypted package and a separate recovery-key file. A completed owner-only video or document job is fetched into the browser only when the person chooses to package it, then encrypted locally using a generic clean filename. The package envelope never contains the key, original filename, or raw findings unless the user explicitly includes detailed findings. The expiry is package metadata, not remotely enforceable deletion.

### Encrypted-package delivery boundary

Renitizer does not provide share storage, uploads, or public links by default. The current delivery state is explicitly **unconfigured**: users download an encrypted package and choose how to send it themselves. A configured sharing backend would need to store only the secret-free envelope and define authenticated retrieval, expiry enforcement, revocation, and key exchange; it must not be implied by the local package flow.

## Optional cloud worker

The static app never has a secret and never automatically uploads a file. When Renitizer is opened from Renvoy, the same short-lived `renitizer:use` capability that protects private jobs also protects `POST /api/analyze`; the app uses the Renvoy Worker origin automatically after the person explicitly agrees to the extra check. A custom service address remains available, but Renitizer never sends a Renvoy capability to a different origin.

To enable the account-bound Cloudflare endpoint:

1. Create a Cloudflare Worker from `worker/`, then set the server secret: `wrangler secret put OPENAI_API_KEY`.
2. Set `RENVOY_IDENTITY_VERIFICATION_URL` to the Renvoy verification endpoint, then deploy it with `wrangler deploy`.
3. Check the clear consent box. Only then does the browser POST the selected file and requested analysis types through the Renvoy session. A custom service address is only needed outside Renvoy.

`worker/src/index.js` sends image files (including client-sampled video frames) to OpenAI's vision Responses API. It can flag visible privacy clues such as faces, plates, screens, documents, signs, maps, landmarks, and route displays, but these are clues to review—not proof of a person's identity, an exact place, or a reverse-image/OSINT match. For actionable audio editing it sends audio to `/v1/audio/transcriptions` using `whisper-1`, `verbose_json`, and word timestamps before inspecting transcript PII cues. A video sent directly to the Worker gets a specific sampled-frame/dedicated-endpoint requirement.

Never put `OPENAI_API_KEY` in `config.js`, `config.example.js`, the browser, or source control.

## Shared Renvoy identity

Native Renvoy/Renitizer hosts may expose `window.RenvoyRenitizer.getSession({ scope: 'renitizer:use' })`. Renitizer accepts only an HTTPS Worker origin and an opaque short-lived capability from that trusted host bridge; it never accepts credentials through a URL, form field, or saved browser setting.

### Processing-job API prerequisites

`POST /api/jobs`, `GET /api/jobs/:id`, `POST /api/document-cleaning`, and the reserved `/api/share` prefix are account-protected remote routes. They use the same Renvoy device identity as the messaging product: the client sends `Authorization: Renvoy <capability>` and the Worker forwards it to Renvoy’s `POST /v1/identity/renitizer/verify` endpoint. Renvoy returns only an active account ID, device ID, and the `renitizer:use` grant; it never shares the capability-signing key or messaging scopes. Configure the Worker secret `RENVOY_IDENTITY_VERIFICATION_URL` with that Renvoy endpoint before enabling these routes. A missing configuration returns `503 identity-unconfigured`; invalid or revoked capabilities return `401 unauthorized`; a Renvoy outage returns `503 identity-unavailable`.

Jobs are account-bound and a job ID cannot be read by another Renvoy account. `POST /api/jobs/upload` accepts multipart `file` plus matching JSON `metadata` after Renvoy verification. When `MEDIA_BUCKET` and `JOBS_QUEUE` are configured, it stores the original in private R2, writes a durable job record, and sends only a compact job ID/account message to the queue. The object key is generated from the verified account and job ID; the source filename never becomes a path. `GET /api/jobs/:id` reads that durable record. The Queue handler records a clear processor-unavailable failure until a media renderer or document transformer is configured; it never fabricates a clean output.

## Hosted encrypted sharing

The browser encrypts a clean copy before it leaves the device. `POST /api/shares` accepts only that opaque encrypted package plus a named Renvoy recipient account and an expiry (up to 30 days). The private R2 bucket stores the encrypted bytes, an owner manifest, and a recipient index—never the recovery key, password, or clear file. The sender must transfer the recovery key separately using a channel they trust.

After a browser-local package is created and its recovery key is saved separately, the optional **Send privately with Renvoy** panel can upload only that opaque package to one named Renvoy account. The sender can revoke it. The recipient enters the shared ID in the optional **Get a package from Renvoy** section of the Decrypt screen; both sender and recipient use Renvoy identity to access `GET /api/shares/:shareId`, while anyone else receives the same not-found response. Expired packages are deleted on access and return a clear expired response. Downloaded packages are decrypted locally in the **Decrypt shared package** screen, so Renitizer hosting never performs decryption.

Document-cleaning jobs use `kind: "document-cleaning"`, `documentType` (`pdf` or `office`), and a list of requested removal actions; raw JSON content is rejected. With a private R2 bucket, Queue, `DOCUMENT_PROCESSOR_URL`, and `PROCESSOR_AUTH_TOKEN` configured, the Worker streams the private input to the document processor and stores a clean output only after it receives the expected document type. Modern Office files remain a cleaned Office copy. Legacy Office, OpenDocument, and RTF files are safely converted to a sanitized PDF, and the app labels that output correctly before download or sharing. `GET /api/jobs/:id/output` then permits only the owning Renvoy account to download it. Until the private storage and Queue bindings exist, uploads return `503 processing-unconfigured`; no file is accepted or retained.

### Video renderer

`processor/video` is a deployable FFmpeg service for actual video cover redaction. A `video-redaction` job accepts normalized, non-empty, time-bounded `cover` tracks; the Worker streams the private R2 input to the service, stores its MP4 response in R2, then enables the owner-only `GET /api/jobs/:id/output` download. Set `PROCESSOR_URL` only in the Worker environment and `PROCESSOR_AUTH_TOKEN` only as a Worker/container secret. The first renderer intentionally supports solid cover boxes—the safest redaction mode—rather than silently substituting a weaker effect for a requested blur.

The production workflow builds both processor images to GHCR as `renitizer-video` and `renitizer-document`, tagged with `latest` and the commit SHA, after its production gate. Set each resulting GitHub Container Registry package to **private** in GitHub Packages and deploy it to a private container host before adding the processor URLs and shared token to the Worker.

For the Galee-Labs production workflow, add these GitHub Environment `production` secrets before running it: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `OPENAI_API_KEY`, `PROCESSOR_AUTH_TOKEN`, `VIDEO_PROCESSOR_URL`, `DOCUMENT_PROCESSOR_URL`, and `RENVOY_IDENTITY_VERIFICATION_URL`. The workflow refuses to deploy the full Worker when any are absent. Starsaintf deliberately uses its separate local-only Worker workflow and does not receive Renvoy or processor secrets.

## Native wrappers

- Capacitor: install Capacitor in a wrapper project, point it at this checkout's static web directory (`webDir: "."`), then add Android/iOS platforms. `capacitor.config.json` provides the app identity.
- Tauri: create a standard Tauri shell and use `tauri.conf.json` as the starting configuration. Its `frontendDist` points one directory above the Tauri wrapper, so keep the wrapper in a sibling `src-tauri/` directory or adjust the path.

No native binaries or credentials are included.

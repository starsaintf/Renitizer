# Renitizer v1 Design

## Goal

Deliver a web-first, local-first privacy sanitizer for images and videos that detects and reduces identifiable information before a user shares a file. It must be publishable as a static web application, installable as a PWA, and structured for later Android, iOS, and desktop wrapping.

## Product boundary

Renitizer reduces exposure; it never promises anonymity. Every completed scan reports what was detected, what was removed, what was not changed, and residual risk.

## Experience

The application is a dark editorial "privacy lab". A user adds a media file and moves through a clear pipeline:

1. **Scan** — local browser scanners inspect file metadata and image pixels. Cloud-enhanced scans are opt-in.
2. **Review** — every finding has a category, confidence, risk level, and a selected remedy.
3. **Sanitize** — the browser creates a re-encoded copy to remove image metadata and applies user-selected redactions where a region is available.
4. **Verify** — scanners run against the clean copy and calculate a residual exposure score.
5. **Share** — the user downloads the copy and privacy report. Originals remain in the browser unless they explicitly choose a cloud analysis request.

## Scanner architecture

All scanners implement a common asynchronous interface accepting a `File` and returning normalized `Finding` objects. A finding has an id, category, title, detail, severity, confidence, optional bounding box, recommendation, and resolution state. The UI, score engine, report generator, and sanitizer depend only on this format.

### Browser-local scanners

- File facts: MIME type, size, dimensions, and metadata markers.
- Metadata: image EXIF/XMP/IPTC marker detection. The sanitized copy is produced with canvas re-encoding, which removes embedded metadata for supported raster images.
- OCR: Tesseract.js is loaded only when the user requests a local deep scan. OCR matches configurable patterns for email, phone number, street-address cues, boarding passes, and names.
- Barcode and QR codes: the native `BarcodeDetector` API is used where supported; unavailable capability is reported rather than silently simulated.
- Face and object extension point: a browser model adapter is reserved for MediaPipe/ONNX assets. It reports its actual availability and never invents detections.

### Cloud scanners

The static client can call a user-configured `POST /api/analyze` endpoint only after an explicit consent checkbox is checked. The request contains the selected file and a requested analysis set. The endpoint is not hosted by RawGitHack; a deployable worker implementation proxies to an AI vision provider and returns the shared `Finding` shape. Provider credentials remain server-side.

### Audio and video

Audio/video are accepted as analysis sources. The browser extracts a bounded sample or a configurable number of frames where APIs permit. Cloud analysis is the default for speech-to-text PII and video context because a static browser client cannot reliably deliver it across devices. The interface labels unavailable local capabilities clearly.

## Risk model

Each unresolved finding contributes a weighted severity multiplied by confidence. The total maps to a 0–100 safety score, with metadata removal reducing its associated risk. The report also exposes location, identity, device fingerprint, visual address, and reverse-image exposure as explainable sub-signals; unknown signals are marked as not assessed.

## Technical design

- Static HTML/CSS/ES modules so `index.html` works directly through RawGitHack.
- No secrets in the repository. `config.example.js` documents the API endpoint setting.
- Unit tests run under Node's test runner against pure finding, scoring, metadata, and report modules.
- PWA manifest and service worker provide installation and offline shell caching.
- Capacitor configuration points Android and iOS wrappers to the static build. Tauri configuration documents a desktop wrapper path without shipping a native binary.

## Failure handling

Unsupported formats, browser APIs, and failed model loads become visible capability messages. A failed cloud request preserves the local result and does not change the file. The app prevents download until a supported raster image has been re-encoded, but still allows a report-only workflow for other media.

## Privacy and consent

The default is local-only. Opting into cloud analysis names the selected provider endpoint and explains that the file is transmitted to it. The app has no database, analytics, account system, or automatic upload.

## Scope exclusions for v1

- No claim of complete metadata removal for arbitrary PDFs, Office documents, video containers, or RAW camera formats.
- No server credential storage in the static application.
- No facial identification, geolocation inference, or reverse-image-search submission by default. These may be offered as explicit future provider capabilities.

# Document Processor Implementation Plan

**Goal:** Produce a real, private cleaned PDF or Office file only after an isolated processor removes the requested document privacy structures.

**Likely files:** `processor/document/`, `worker/src/jobs.js`, `worker/src/index.js`, `worker/test/jobs.test.js`, `worker/wrangler.toml`, `README.md`.

**Risk areas:** preserving visible Office content while removing revisions/comments; malformed or zip-bomb Office packages; private Worker-to-processor authentication; never reporting an output as clean when the processor failed.

**Steps:**

1. Build and test an Office Open XML sanitizer that removes document properties, comments, revisions, signatures, thumbnails, embedded fonts/objects, and their relationships while retaining visible content.
2. Add a private PDF/Office HTTP processor container. PDF processing will use QPDF’s metadata, info, form/annotation, structure, and page-label removal capabilities; Office uses the sanitizer from step 1.
3. Extend durable document jobs so the Worker streams a private R2 input to the processor and exposes a completed owner-only download only after a valid response.
4. Document deployment settings and run focused processor/worker tests, syntax checks, and the relevant app checks.

**Validation:** `python3 -m unittest processor/document/test_office.py`; `node --test worker/test/jobs.test.js`; `npm run check`; `git diff --check`.

**Rollback:** remove the `processor/document` service and Worker document job branch; existing document requests remain explicitly unavailable rather than falsely sanitized.

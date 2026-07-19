# Durable Media Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept an authenticated media file once, store it privately in R2, enqueue a compact work message, and expose account-bound durable job status without ever claiming a sanitized output before a processor produces one.

**Architecture:** `POST /api/jobs/upload` receives multipart file plus JSON metadata after Renvoy verification. It writes the original object and an immutable job record to `MEDIA_BUCKET`, then sends a small `{ version, jobId, ownerAccountId }` message to `JOBS_QUEUE`. The queue consumer transitions jobs to processing and delegates to a configured processor only when one exists; otherwise it records a truthful failed/unavailable result. Job records and output references live in R2, while the browser-local workflow remains unchanged.

**Tech Stack:** Cloudflare Workers, R2 Worker bindings, Cloudflare Queues, Renvoy capability verification, Node built-in test runner.

---

### Task 1: Define durable job records and object keys

**Files:**
- Modify: `worker/src/jobs.js`
- Test: `worker/test/jobs.test.js`

- [x] **Step 1: Write failing tests** for deterministic account-scoped object keys, valid upload metadata, and a serialized job status that omits internal R2 keys and account IDs.
- [x] **Step 2: Run** `node --test worker/test/jobs.test.js` and confirm the new assertions fail.
- [x] **Step 3: Implement** `createStoredJob`, `jobRecordKey`, and `inputObjectKey` with a generated job ID, safe file extension, and no user-controlled path segments.
- [x] **Step 4: Run** focused `node --test worker/test/jobs.test.js` cases and confirm they pass.

### Task 2: Store authenticated uploads and enqueue work

**Files:**
- Modify: `worker/src/index.js`
- Test: `worker/test/jobs.test.js`

- [x] **Step 1: Write failing Worker tests** for `POST /api/jobs/upload`: return `503` before R2/Queue bindings exist, reject a missing file or metadata mismatch, and with fake bindings store the object/record then enqueue only a compact job message.
- [x] **Step 2: Run** `node --test worker/test/jobs.test.js` and confirm the upload assertions fail.
- [x] **Step 3: Implement** authenticated multipart upload, bounded size/type validation, R2 writes, queue send, and compensating deletion if queue publication fails.
- [x] **Step 4: Run** focused `node --test worker/test/jobs.test.js` cases and confirm they pass.

### Task 3: Make status durable and queue processing truthful

**Files:**
- Modify: `worker/src/index.js`
- Modify: `worker/wrangler.toml`
- Test: `worker/test/jobs.test.js`

- [x] **Step 1: Write failing tests** showing `GET /api/jobs/:id` loads only the owner’s R2 record and the queue consumer records an explicit processor-unavailable failure rather than a fictional clean output.
- [x] **Step 2: Run** `node --test worker/test/jobs.test.js` and confirm the assertions fail.
- [x] **Step 3: Implement** record loading/updating, a `queue()` handler, and R2/Queue bindings documented as production resources.
- [x] **Step 4: Run** focused `node --test worker/test/jobs.test.js` cases and confirm they pass.

### Task 4: Verify, document, publish

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-19-durable-media-jobs.md`

- [x] **Step 1: Document** the upload endpoint, retention boundary, and the fact that rendering/document transformation still requires a configured processor.
- [x] **Step 2: Run** all Renitizer test groups, syntax checks, and `git diff --check`.
- [x] **Step 3: Commit** only this durable-job scope and push `feat/renitizer-v1` to the Starsaintf fork’s `main` branch.

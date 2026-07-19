# Video Redaction Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an actual re-encoded video with time-bounded visual cover redactions and give only its Renvoy account owner a downloadable result.

**Architecture:** The Queue Worker reads the private R2 input stream and posts it to a separately deployed FFmpeg service authenticated with a server secret. The service validates normalized tracks, compiles fixed `drawbox` filters, re-encodes MP4 while copying audio, and returns the output stream. The Worker stores that output privately, marks the job complete only after storage succeeds, and exposes an owner-only download endpoint.

**Tech Stack:** Cloudflare Worker/R2/Queues, Node 22 HTTP server, FFmpeg in Docker, Node built-in test runner.

---

### Task 1: Define redaction-job metadata and safe FFmpeg filters

**Files:**
- Create: `processor/video/filter.mjs`
- Create: `processor/video/test/filter.test.mjs`
- Modify: `worker/src/jobs.js`
- Modify: `worker/test/jobs.test.js`

- [x] Write and run failing tests for bounded normalized video tracks and a fixed fill-cover `drawbox` filter chain.
- [x] Implement track validation, accepted `video-redaction` metadata, output object keys, and filter construction without interpolating user strings.
- [x] Re-run the focused unit tests.

### Task 2: Build the authenticated FFmpeg renderer

**Files:**
- Create: `processor/video/server.mjs`
- Create: `processor/video/Dockerfile`
- Create: `processor/video/README.md`

- [x] Implement `POST /v1/render/video` with a bearer secret, request-size limit, temporary-file cleanup, FFmpeg execution, and MP4 streaming response.
- [x] Implement `/health/live` and document required container configuration.

### Task 3: Connect queue completion and private download

**Files:**
- Modify: `worker/src/index.js`
- Modify: `worker/src/jobs.js`
- Modify: `worker/test/jobs.test.js`

- [x] Write and run failing Worker tests for processor invocation, stored output completion, failure handling, and owner-only output download.
- [x] Implement streaming R2-to-processor transfer, private output storage, completed job status, and `GET /api/jobs/:id/output`.
- [x] Re-run worker tests and syntax checks.

### Task 4: Verify and publish

**Files:**
- Modify: `README.md`
- Modify: `worker/wrangler.toml`

- [x] Document the worker secret and external renderer URL without committing a credential.
- [ ] Run all test groups, build the Docker image if Docker is available, check diffs, commit, and push.

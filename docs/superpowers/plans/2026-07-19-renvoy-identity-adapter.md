# Renvoy Identity Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate remote job and future share API routes on a verified Renvoy device capability without changing the browser-local flow.

**Architecture:** Renvoy provides `POST /v1/identity/renitizer/verify`, which authenticates an existing Renvoy capability with the narrow `renitizer:use` scope and returns only an account and device identifier. The Worker forwards the authorization header to the configured endpoint, normalizes the positive response, and uses the account identifier for job ownership. Static/local cleaning and local encrypted packages remain untouched.

**Tech Stack:** Cloudflare Worker-style JavaScript, Node built-in test runner.

---

### Task 1: Specify the adapter contract with tests

**Files:**
- Create: `worker/test/identity.test.js`
- Create: `worker/src/identity.js`

- [x] **Step 1: Write failing tests** for a strict `Renvoy` authorization header, missing-endpoint state, and successful normalization of Renvoy’s scoped verification response.
- [x] **Step 2: Run** `node --test worker/test/identity.test.js` and confirm it fails because the adapter does not exist.
- [x] **Step 3: Implement** `parseRenvoyAuthorization` and `introspectRenvoyIdentity`; only call the configured endpoint, pass the original authorization header, and reject malformed or unscoped responses.
- [x] **Step 4: Run** `node --test worker/test/identity.test.js` and confirm it passes.

### Task 2: Guard remote job and share API route prefixes

**Files:**
- Modify: `worker/src/index.js`
- Modify: `worker/test/jobs.test.js`

- [x] **Step 1: Write failing Worker tests** showing protected jobs return `503 identity-unconfigured` without an endpoint, `401 unauthorized` for a missing or invalid credential when configured, and only expose a job to the verified account that created it.
- [x] **Step 2: Run** `node --test worker/test/jobs.test.js` and confirm the new assertions fail.
- [x] **Step 3: Implement** route middleware that applies the identity adapter to `/api/jobs`, `/api/document-cleaning`, and reserved `/api/share` prefixes; leave `/api/analyze` and browser-local sharing unchanged.
- [x] **Step 4: Run** `node --test worker/test/jobs.test.js` and confirm it passes.

### Task 3: Document deployment configuration and validate

**Files:**
- Modify: `config.example.js`
- Modify: `README.md`
- Modify: `worker/wrangler.toml`

- [x] **Step 1: Document** `RENVOY_IDENTITY_VERIFICATION_URL` as a Worker secret and the endpoint request/response contract.
- [x] **Step 2: Run** the complete test suite in deterministic groups and `npm run check`.
- [ ] **Step 3: Review** `git diff --check`, commit the scoped changes, and retain the commit hash for handoff.

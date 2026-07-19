# Production Deployment and Renvoy Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy Renitizer's secure processing control plane and connect Renvoy's Guardian architecture through runtime and native product surfaces without exposing security controls as ordinary user settings.

**Architecture:** Renitizer's Cloudflare Worker owns authenticated job intake, encrypted R2 objects and Queue dispatch. The video and document containers remain private processor backends reachable only through Worker-held credentials. Renvoy Guardian is a deterministic coordinator; it invokes vault, workspace, shield, trust and recovery services while native Android/iOS clients enforce OS capabilities and report only supported controls.

**Tech Stack:** Cloudflare Workers/R2/Queues, Docker/FFmpeg, Docker/LibreOffice/PDF tools, Node.js, Rust product backend, Kotlin Android, Swift iOS.

---

### Task 1: Verify the deployable Renitizer control plane

**Files:**
- Modify: `worker/wrangler.toml`
- Test: `worker/test/jobs.test.js`
- Test: `worker/test/shares-routes.test.js`

- [ ] **Step 1: Write a failing deployment-config test**

```js
assert.match(await fs.readFile("wrangler.toml", "utf8"), /MEDIA_BUCKET/);
assert.match(await fs.readFile("wrangler.toml", "utf8"), /JOBS_QUEUE/);
```

- [ ] **Step 2: Run the focused test and confirm it fails because bindings are placeholders**

Run: `node --test test/deployment-config.test.js`

- [ ] **Step 3: Configure production binding names and document secret names without values**

```toml
[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "renitizer-private-media"
```

- [ ] **Step 4: Run Worker tests and a Wrangler dry-run**

Run: `node --test test/jobs.test.js test/shares-routes.test.js && npx wrangler deploy --dry-run`

- [ ] **Step 5: Provision R2 and Queue resources, then deploy only after dry-run succeeds**

Run: `npx wrangler r2 bucket create renitizer-private-media` and `npx wrangler queues create renitizer-processing-jobs`

### Task 2: Deploy private video and document processors

**Files:**
- Verify: `processor/video/Dockerfile`
- Verify: `processor/video/server.mjs`
- Verify: `processor/document/Dockerfile`
- Verify: `processor/document/server.mjs`

- [ ] **Step 1: Run existing processor tests**

Run: `node --test processor/video/test/filter.test.mjs processor/document/test_contract.mjs`

- [ ] **Step 2: Build each image and validate its health route locally**

Run: `docker build -t renitizer-video ./processor/video` and `docker build -t renitizer-document ./processor/document`

- [ ] **Step 3: Deploy both containers to the configured private container service**

The processor URLs must be HTTPS, private, and authenticated by `PROCESSOR_AUTH_TOKEN`; no browser receives a processor credential.

- [ ] **Step 4: Store only endpoint URLs as Worker variables and add `PROCESSOR_AUTH_TOKEN` as a Worker secret**

Run: `npx wrangler secret put PROCESSOR_AUTH_TOKEN`

### Task 3: Configure Renvoy identity, secure sharing, observability and release controls

**Files:**
- Verify: `worker/src/identity.js`
- Verify: `worker/src/shares.js`
- Verify: `C:/dev/gitclones/Renvoy/services/identity-http-api.mjs`

- [ ] **Step 1: Verify the shared Renvoy identity endpoint accepts only the Renitizer scope**

Run: `node --test C:/dev/gitclones/Renvoy/tests/identity-http-api.test.mjs`

- [ ] **Step 2: Set the deployed Renvoy identity URL as a Worker secret and test an authenticated remote job**

Run: `npx wrangler secret put RENVOY_IDENTITY_VERIFICATION_URL`

- [ ] **Step 3: Enable Worker observability and private-bucket lifecycle policy**

Validate that original uploads and completed outputs follow the defined retention/deletion policy before production sharing is enabled.

- [ ] **Step 4: Configure monitoring, billing and alert destinations outside source control**

Use provider dashboards or protected CI secrets; do not encode provider tokens in repository files.

### Task 4: Wire Guardian through Renvoy's product runtime

**Files:**
- Modify: `C:/dev/gitclones/Renvoy/src/messenger/product-runtime.mjs`
- Modify: `C:/dev/gitclones/Renvoy/src/security/guardian.mjs`
- Test: `C:/dev/gitclones/Renvoy/tests/product-runtime.test.mjs`
- Test: `C:/dev/gitclones/Renvoy/tests/guardian.test.mjs`

- [ ] **Step 1: Add failing tests for message receipt, attachment preview, search, call lifecycle and application background events**

```js
await runtime.invoke("openWorkspace", payload);
assert.deepEqual(events, [{ type: "workspace.opened", workspaceId: "w1", kind: "message" }]);
```

- [ ] **Step 2: Implement minimal runtime-to-Guardian event forwarding**

Each forwarding operation must be fail-closed for malformed payloads and must not provide an AI decision path.

- [ ] **Step 3: Run focused runtime and Guardian tests**

Run: `node --test tests/product-runtime.test.mjs tests/guardian.test.mjs`

### Task 5: Connect native endpoint controls and trusted devices

**Files:**
- Modify: `C:/dev/gitclones/Renvoy/native/android/RenvoyEndpointSecurity.kt`
- Modify: `C:/dev/gitclones/Renvoy/native/android/RenvoyAppState.kt`
- Modify: `C:/dev/gitclones/Renvoy/native/ios/RenvoySecurityCoordinator.swift`
- Modify: `C:/dev/gitclones/Renvoy/native/ios/RenvoyViewModel.swift`
- Test: `C:/dev/gitclones/Renvoy/native/android/app/src/test/java/labs/galee/renvoy/RenvoyNativeTests.kt`
- Test: `C:/dev/gitclones/Renvoy/native/ios/Tests/RenvoyNativeTests.swift`

- [ ] **Step 1: Add failing native tests for mandatory secure-window/clipboard/background policy and trusted-device display**
- [ ] **Step 2: Apply platform-supported screen capture, clipboard clearing, preview redaction, protected storage and background cleanup**
- [ ] **Step 3: Keep only Trusted Devices visible to users; do not add security-engine settings**
- [ ] **Step 4: Build and run native unit tests on Android and iOS toolchains**

### Task 6: Release verification and signing

**Files:**
- Verify: `C:/dev/gitclones/Renvoy/native/device-validation/campaign.json`
- Verify: `C:/dev/gitclones/Renvoy/tools/native-device-evidence-gate.mjs`

- [ ] **Step 1: Run source and integration test suites**

Run: `npm run verify:core` in Renvoy and the Renitizer Worker/processor suites.

- [ ] **Step 2: Generate Android, iOS and desktop release candidates with protected signing credentials**

Android needs Play keystore and Play Console credentials; iOS needs Apple distribution, provisioning and App Store Connect credentials; desktop needs Windows Authenticode plus macOS Developer ID/notarization credentials.

- [ ] **Step 3: Execute the real-device validation campaign and attach evidence to the release**

Run: `node tools/native-device-evidence-gate.mjs --production` after device evidence is uploaded.


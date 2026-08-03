# Video Blur Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a person choose either a time-bounded blur or an opaque cover for a detected video region, and render that choice in the private FFmpeg processor.

**Architecture:** The browser policy carries only a normalized action, time range, and fractional bounding box to the existing private job route. The FFmpeg processor turns covers into `drawbox` filters and blurs into a crop → `boxblur` → overlay graph; neither path contains source filenames or user identity data.

**Tech Stack:** ES modules, Node test runner, FFmpeg filter graphs, Cloudflare Worker job metadata.

---

### Task 1: Accept a blur decision in the browser video policy

**Files:**
- Modify: `test/video-policy.test.js`
- Modify: `src/video/policy.js`
- Modify: `src/main.js`

- [x] **Step 1: Write the failing policy assertions**

```js
assert.deepEqual(normalizeTrackedVideoBoxes({
  duration: 12,
  tracks: [{ id: 'plate', redactionAction: 'blur', boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, timeRange: { start: 1, end: 3 } }],
}), [{ id: 'plate', action: 'blur', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }]);
```

- [x] **Step 2: Run the focused test and confirm it fails because blur is rejected**

Run: `node --test test/video-policy.test.js`

Expected: the normalized plan is empty because `ACTIONS` contains only `cover`.

- [x] **Step 3: Accept `blur` alongside `cover` and expose both choices in the video finding controls**

```js
const ACTIONS = new Set(['blur', 'cover']);
// Render: for (const action of ['blur', 'cover', 'keep']) { ... }
```

- [x] **Step 4: Run the focused test and confirm it passes**

Run: `node --test test/video-policy.test.js`

Expected: PASS.

### Task 2: Render blur tracks with FFmpeg

**Files:**
- Modify: `processor/video/test/filter.test.mjs`
- Modify: `processor/video/filter.mjs`
- Modify: `processor/video/server.mjs`

- [x] **Step 1: Write the failing filter assertion**

```js
assert.equal(normalizeRendererTracks([{ id: 'plate', action: 'blur', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }])[0].action, 'blur');
```

- [x] **Step 2: Run the focused processor test and confirm it fails because blur is rejected**

Run: `node --test processor/video/test/filter.test.mjs`

Expected: the normalized tracks array is empty.

- [x] **Step 3: Build a filter-complex graph that chains cover and blur tracks**

```js
// A blur path splits the current video stream, crops the selected region,
// applies boxblur, and overlays it only during the selected time range.
// A cover path uses drawbox with the same time gate.
```

- [x] **Step 4: Map the filter graph output in the FFmpeg invocation**

```js
'-filter_complex', graph.filterComplex,
'-map', graph.outputLabel,
'-map', '0:a?',
```

- [x] **Step 5: Re-run the processor test and confirm it passes**

Run: `node --test processor/video/test/filter.test.mjs`

Expected: PASS.

### Task 3: Validate the real container path and publish

**Files:**
- Modify: `processor/video/README.md`
- Test: `test/video-policy.test.js`
- Test: `processor/video/test/filter.test.mjs`

- [ ] **Step 1: Build the processor image and create a short synthetic video**

Run: `docker build -t renitizer-video-test processor/video`

Expected: successful image build with FFmpeg available.

- [ ] **Step 2: Run an authenticated render containing one blur and one cover track**

Run: `docker run --rm renitizer-video-test ffmpeg -version`

Expected: FFmpeg version output and a renderer image that can execute the graph.

- [x] **Step 3: Document the supported actions and safe fallback**

```md
Choose cover for the strongest visual block. Blur retains more of the scene but should be reviewed before sharing.
```

- [ ] **Step 4: Commit and mirror the verified change**

Run: `git add processor/video src/video test docs && git commit -m "feat: add video blur redactions"`

Expected: only video blur implementation, test, and documentation files are staged.

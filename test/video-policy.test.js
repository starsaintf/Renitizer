import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVideoRedactionJobRequest,
  createVideoProcessingReport,
  getVideoReviewItems,
  normalizeTrackedVideoBoxes,
  selectVideoFindingAction,
} from '../src/video/policy.js';

test('normalizes selected blur and cover video boxes into bounded time ranges', () => {
  const plan = normalizeTrackedVideoBoxes({
    duration: 12,
    tracks: [
      { id: 'plate', redactionAction: 'blur', boundingBox: { x: -0.1, y: 0.8, width: 0.4, height: 0.4 }, timeRange: { start: -2, end: 14 } },
      { id: 'face', redactionAction: 'cover', boundingBox: { x: 0.2, y: 0.1, width: 0.2, height: 0.3 }, timeRange: { start: 8, end: 4 } },
      { id: 'kept', redactionAction: 'keep', boundingBox: { x: 0, y: 0, width: 1, height: 1 }, timeRange: { start: 1, end: 2 } },
    ],
  });

  assert.deepEqual(plan, [
    { id: 'plate', action: 'blur', startTime: 0, endTime: 12, box: { x: 0, y: 0.8, width: 0.3, height: 0.2 } },
    { id: 'face', action: 'cover', startTime: 4, endTime: 8, box: { x: 0.2, y: 0.1, width: 0.2, height: 0.3 } },
  ]);
});

test('drops a selected video box when its time window falls wholly outside the video', () => {
  assert.deepEqual(normalizeTrackedVideoBoxes({
    duration: 12,
    tracks: [{ id: 'expired', redactionAction: 'cover', boundingBox: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, timeRange: { start: -4, end: -1 } }],
  }), []);
});

test('getVideoReviewItems exposes only boxed time-bounded moments', () => {
  assert.deepEqual(getVideoReviewItems([
    { id: 'plate', title: 'Vehicle plate', boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, timeRange: { start: 2, end: 4 }, redactionAction: 'cover' },
    { id: 'landmark', title: 'Landmark', timeRange: { start: 5, end: 6 } },
  ]), [
    { id: 'plate', title: 'Vehicle plate', start: 2, end: 4, action: 'cover' },
  ]);
});

test('selectVideoFindingAction keeps a blur choice pending until a rendered output exists', () => {
  assert.deepEqual(selectVideoFindingAction([
    { id: 'plate', redactionAction: 'keep', resolved: false },
  ], 'plate', 'blur'), [
    { id: 'plate', redactionAction: 'blur', resolved: false },
  ]);
});

test('selectVideoFindingAction refuses a still-image-only crop choice', () => {
  const findings = [{ id: 'plate', redactionAction: 'keep', resolved: false }];
  assert.strictEqual(selectVideoFindingAction(findings, 'plate', 'crop'), findings);
});

test('builds a metadata-only video redaction request without raw pixels', () => {
  const request = buildVideoRedactionJobRequest({ name: 'street.mp4', type: 'video/mp4', size: 2048 }, [
    { id: 'plate', action: 'cover', startTime: 1.25, endTime: 3.5, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } },
  ]);

  assert.deepEqual(request, {
    kind: 'video-redaction',
    mediaKind: 'video',
    fileName: 'street.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 2048,
    redactions: [{ id: 'plate', action: 'cover', startTime: 1.25, endTime: 3.5, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
  });
  assert.equal(JSON.stringify(request).includes('pixels'), false);
  assert.equal(JSON.stringify(request).includes('base64'), false);
});

test('video processing report does not claim a clean video until an output is complete', () => {
  const waiting = createVideoProcessingReport({ processor: { state: 'queued', available: true, output: null } });
  const output = createVideoProcessingReport({ processor: { state: 'complete', available: true, output: { downloadUrl: 'https://processor.example/output' } } });

  assert.deepEqual(waiting, {
    state: 'awaiting-processor',
    cleanVideoProduced: false,
    message: 'A video processor has not returned a clean video yet.',
  });
  assert.equal(output.cleanVideoProduced, true);
  assert.equal(output.state, 'complete');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { linkSampledVideoFindings } from '../src/video/tracking.js';

const finding = (overrides = {}) => ({
  id: 'plate-1',
  category: 'vehicle-plate',
  title: 'Vehicle plate',
  detail: 'A vehicle plate is visible.',
  severity: 'high',
  confidence: 0.9,
  recommendation: 'Blur this before sharing.',
  assessment: 'assessed',
  resolved: false,
  source: 'cloud',
  redactionAction: 'keep',
  boundingBox: { x: 0.2, y: 0.3, width: 0.2, height: 0.1 },
  timeRange: { start: 0, end: 1 },
  ...overrides,
});

test('links the same nearby visual finding across sampled video moments into one conservative track', () => {
  const [track] = linkSampledVideoFindings([
    finding(),
    finding({ id: 'plate-2', boundingBox: { x: 0.32, y: 0.31, width: 0.2, height: 0.1 }, timeRange: { start: 4, end: 6 } }),
  ], { sampleTimes: [0, 5, 10], duration: 12 });

  assert.equal(track.id, 'plate-1');
  assert.deepEqual(track.timeRange, { start: 0, end: 6 });
  assert.deepEqual(track.boundingBox, { x: 0.18, y: 0.28, width: 0.36, height: 0.15 });
  assert.equal(track.trackedSamples, 2);
  assert.match(track.detail, /2 sampled moments/);
});

test('keeps different or distant visual findings separate so a broad redaction is never invented', () => {
  const tracks = linkSampledVideoFindings([
    finding(),
    finding({ id: 'screen-1', category: 'screen', title: 'Computer screen', boundingBox: { x: 0.72, y: 0.1, width: 0.2, height: 0.2 }, timeRange: { start: 4, end: 6 } }),
    finding({ id: 'plate-3', boundingBox: { x: 0.8, y: 0.7, width: 0.1, height: 0.1 }, timeRange: { start: 9, end: 11 } }),
  ], { sampleTimes: [0, 5, 10], duration: 12 });

  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks.map((item) => item.id), ['plate-1', 'screen-1', 'plate-3']);
});

test('leaves non-video and unboxed findings unchanged', () => {
  const plain = { id: 'audio', category: 'phone', title: 'Phone number', detail: 'Audio clue.', resolved: false };
  assert.deepEqual(linkSampledVideoFindings([plain], { sampleTimes: [0, 5], duration: 10 }), [plain]);
});

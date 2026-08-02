import test from 'node:test';
import assert from 'node:assert/strict';
import { attachFrameTiming, parseFrameContexts } from '../src/index.js';

test('normalizes bounded timing context for sampled frames only', () => {
  assert.deepEqual(parseFrameContexts('[{"time":4,"duration":12},{"time":-1,"duration":12}]', 2), [
    { time: 4, duration: 12 },
    null,
  ]);
});

test('attaches a short review window only to located visual findings', () => {
  assert.deepEqual(attachFrameTiming([
    { id: 'plate', boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 } },
    { id: 'landmark' },
  ], { time: 0.5, duration: 12 }), [
    { id: 'plate', boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, timeRange: { start: 0, end: 1.5 }, redactionAction: 'keep' },
    { id: 'landmark' },
  ]);
});

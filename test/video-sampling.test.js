import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVideoSampleTimes } from '../src/video/sampling.js';

test('spreads short-video samples across the complete playable duration', () => {
  assert.deepEqual(buildVideoSampleTimes(10), [0, 4.995, 9.99]);
});

test('increases coverage for longer video while bounding client and provider work', () => {
  const twoMinuteSamples = buildVideoSampleTimes(120);
  const longSamples = buildVideoSampleTimes(1000);

  assert.equal(twoMinuteSamples.length, 13);
  assert.equal(twoMinuteSamples[0], 0);
  assert.equal(twoMinuteSamples.at(-1), 119.99);
  assert.equal(longSamples.length, 24);
  assert.equal(longSamples[0], 0);
  assert.equal(longSamples.at(-1), 999.99);
});

test('returns no sampled moments for a non-playable duration', () => {
  assert.deepEqual(buildVideoSampleTimes(0), []);
  assert.deepEqual(buildVideoSampleTimes(Number.NaN), []);
});

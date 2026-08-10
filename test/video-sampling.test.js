import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVideoSampleTimes, videoFrameDimensions, videoSamplingOptions } from '../src/video/sampling.js';

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

test('lets an explicit thorough check sample roughly every second for a short video', () => {
  const samples = buildVideoSampleTimes(60, videoSamplingOptions('thorough'));

  assert.equal(samples.length, 61);
  assert.ok(Math.max(...samples.slice(1).map((time, index) => time - samples[index])) <= 1.001);
  assert.deepEqual(videoSamplingOptions('unknown'), videoSamplingOptions('standard'));
});

test('keeps thorough video frames small enough for a practical private upload', () => {
  assert.deepEqual(videoFrameDimensions(3840, 2160), { width: 1280, height: 720 });
  assert.deepEqual(videoFrameDimensions(1080, 1920), { width: 720, height: 1280 });
  assert.deepEqual(videoFrameDimensions(640, 480), { width: 640, height: 480 });
});

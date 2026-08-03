import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampNormalizedBox,
  scaleNormalizedBox,
  resolveRedactionPlan,
  resolveCropBounds,
  reframeNormalizedBox,
  setFindingAction,
  markRedactionsResolved,
} from '../src/sanitize/redaction.js';

test('clampNormalizedBox keeps a partially out-of-frame box inside the image', () => {
  assert.deepEqual(clampNormalizedBox({ x: -0.2, y: 0.8, width: 0.5, height: 0.5 }), {
    x: 0,
    y: 0.8,
    width: 0.3,
    height: 0.2,
  });
});

test('scaleNormalizedBox maps a normalized box to image pixels', () => {
  assert.deepEqual(scaleNormalizedBox({ x: 0.125, y: 0.2, width: 0.5, height: 0.25 }, 1600, 900), {
    x: 200,
    y: 180,
    width: 800,
    height: 225,
  });
});

test('resolveRedactionPlan includes only selected visual fixes', () => {
  const findings = [
    { id: 'text', boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }, redactionAction: 'blur' },
    { id: 'code', boundingBox: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 }, redactionAction: 'cover' },
    { id: 'edge', boundingBox: { x: 0, y: 0.1, width: 0.2, height: 0.4 }, redactionAction: 'crop' },
    { id: 'kept', boundingBox: { x: 0, y: 0, width: 0.2, height: 0.2 }, redactionAction: 'keep' },
    { id: 'metadata', redactionAction: 'blur' },
  ];

  assert.deepEqual(resolveRedactionPlan(findings), [
    { id: 'text', action: 'blur', box: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 } },
    { id: 'code', action: 'cover', box: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } },
    { id: 'edge', action: 'crop', box: { x: 0, y: 0.1, width: 0.2, height: 0.4 } },
  ]);
});

test('resolveCropBounds keeps the largest remaining rectangular photo area outside selected crop boxes', () => {
  assert.deepEqual(resolveCropBounds([
    { id: 'edge', action: 'crop', box: { x: 0, y: 0.1, width: 0.2, height: 0.4 } },
  ]), { x: 0.2, y: 0, width: 0.8, height: 1 });
  assert.equal(resolveCropBounds([
    { id: 'all', action: 'crop', box: { x: 0, y: 0, width: 1, height: 1 } },
  ]), null);
});

test('reframeNormalizedBox maps a retained redaction into cropped output coordinates', () => {
  assert.deepEqual(reframeNormalizedBox(
    { x: 0.6, y: 0.1, width: 0.2, height: 0.4 },
    { x: 0.2, y: 0, width: 0.8, height: 1 },
  ), { x: 0.5, y: 0.1, width: 0.25, height: 0.4 });
  assert.equal(reframeNormalizedBox(
    { x: 0, y: 0.1, width: 0.1, height: 0.4 },
    { x: 0.2, y: 0, width: 0.8, height: 1 },
  ), null);
});

test('setFindingAction records a visual choice without claiming the image has already changed', () => {
  const findings = [
    { id: 'one', resolved: false },
    { id: 'two', resolved: false },
  ];

  assert.deepEqual(setFindingAction(findings, 'one', 'cover'), [
    { id: 'one', resolved: false, redactionAction: 'cover' },
    { id: 'two', resolved: false },
  ]);
  assert.deepEqual(setFindingAction(findings, 'two', 'keep'), [
    { id: 'one', resolved: false },
    { id: 'two', resolved: false, redactionAction: 'keep' },
  ]);
});

test('markRedactionsResolved only resolves the visual fixes written into a clean image', () => {
  const findings = [
    { id: 'one', resolved: false, redactionAction: 'blur' },
    { id: 'two', resolved: false, redactionAction: 'keep' },
    { id: 'three', resolved: false, redactionAction: 'crop' },
  ];

  assert.deepEqual(markRedactionsResolved(findings, [{ id: 'one', action: 'blur' }, { id: 'three', action: 'crop' }]), [
    { id: 'one', resolved: true, redactionAction: 'blur' },
    { id: 'two', resolved: false, redactionAction: 'keep' },
    { id: 'three', resolved: true, redactionAction: 'crop' },
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisk } from '../src/core/risk-score.js';
import { groupSignals } from '../src/core/findings.js';
import { makeReport } from '../src/core/report.js';

test('calculateRisk weights unresolved findings by severity and confidence', () => {
  const result = calculateRisk([
    { severity: 'critical', confidence: 0.9, resolved: false },
    { severity: 'low', confidence: 0.5, resolved: false },
  ]);

  assert.equal(result.safetyScore, 59);
});

test('calculateRisk excludes resolved findings from exposure', () => {
  const result = calculateRisk([
    { severity: 'critical', confidence: 1, resolved: true },
    { severity: 'low', confidence: 1, resolved: false },
  ]);

  assert.equal(result.safetyScore, 94);
});

test('calculateRisk normalizes negative and NaN confidence values', () => {
  const result = calculateRisk([
    { severity: 'critical', confidence: -1, resolved: false },
    { severity: 'critical', confidence: Number.NaN, resolved: false },
  ]);

  assert.equal(result.safetyScore, 100);
});

test('calculateRisk keeps safety scores within zero and one hundred', () => {
  const result = calculateRisk(Array.from({ length: 3 }, () => ({
    severity: 'critical', confidence: 2, resolved: false,
  })));

  assert.equal(result.safetyScore, 0);
});

test('groupSignals groups the five supported evidence types', () => {
  const location = { category: 'gps' };
  const identity = { category: 'email' };
  const device = { category: 'device' };
  const visualAddress = { category: 'visual-address' };
  const reverseImage = { category: 'reverse-image' };

  assert.deepEqual(groupSignals([location, identity, device, visualAddress, reverseImage]), {
    location: [location],
    identity: [identity],
    device: [device],
    visualAddress: [visualAddress],
    reverseImage: [reverseImage],
  });
});

test('makeReport exposes unresolved residual risks and finding counts', () => {
  const openRisk = { id: 'address', category: 'address', severity: 'high', confidence: 1, resolved: false };
  const fixedRisk = { id: 'camera', category: 'device', severity: 'medium', confidence: 1, resolved: true };

  const report = makeReport([openRisk, fixedRisk]);

  assert.deepEqual(report.residualRisks, [openRisk]);
  assert.deepEqual(report.counts, { total: 2, unresolved: 1, resolved: 1 });
  assert.equal(report.safetyScore, 73);
});

test('makeReport assesses visual-address and reverse-image signals', () => {
  const visualAddress = { category: 'visual-address', assessment: 'assessed' };
  const reverseImage = { category: 'reverse-image', assessment: 'unknown' };

  const report = makeReport([visualAddress, reverseImage]);

  assert.deepEqual(report.signals.visualAddress, { assessment: 'assessed', findings: [visualAddress] });
  assert.deepEqual(report.signals.reverseImage, { assessment: 'unknown', findings: [reverseImage] });
  assert.deepEqual(report.signals.device, { assessment: 'not-assessed', findings: [] });
});

test('makeReport preserves an unavailable signal assessment', () => {
  const unavailable = { category: 'reverse-image', assessment: 'unavailable' };

  const report = makeReport([unavailable]);

  assert.deepEqual(report.signals.reverseImage, { assessment: 'unavailable', findings: [unavailable] });
});

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

test('groupSignals groups location, identity, and device evidence', () => {
  const location = { category: 'gps' };
  const identity = { category: 'email' };
  const device = { category: 'device' };

  assert.deepEqual(groupSignals([location, identity, device]), {
    location: [location],
    identity: [identity],
    device: [device],
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

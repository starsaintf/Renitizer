import test from 'node:test';
import assert from 'node:assert/strict';
import { makeReport } from '../src/core/report.js';
import { createSafeShareReport } from '../src/share/policy.js';

test('reports resolved audio ranges without exposing transcript contents', () => {
  const report = makeReport([
    {
      id: 'transcript-1',
      category: 'phone',
      detail: 'Transcript: call me at 555 123 4567',
      transcript: 'call me at 555 123 4567',
      timeRange: { start: 2, end: 4 },
      redactionAction: 'mute',
      resolved: true,
      severity: 'high',
      confidence: 0.9,
    },
  ]);
  const safeReport = createSafeShareReport({ report });

  assert.deepEqual(safeReport.summary.audioRedactions, [
    { id: 'transcript-1', action: 'mute', start: 2, end: 4 },
  ]);
  assert.equal(JSON.stringify(safeReport).includes('555 123 4567'), false);
});

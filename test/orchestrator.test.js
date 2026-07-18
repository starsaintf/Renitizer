import test from 'node:test';
import assert from 'node:assert/strict';
import { runScanners } from '../src/scanners/orchestrator.js';

test('runScanners preserves findings from enabled scanners in order', async () => {
  const first = async () => [{ id: 'metadata' }];
  const second = async () => [{ id: 'barcode' }];

  assert.deepEqual(await runScanners({ name: 'image.jpg' }, [first, second]), [
    { id: 'metadata' },
    { id: 'barcode' },
  ]);
});

test('runScanners turns an unavailable scanner failure into an honest finding', async () => {
  const unavailable = async () => {
    throw new Error('BarcodeDetector is not available');
  };

  const findings = await runScanners({}, [unavailable]);

  assert.deepEqual(findings, [{
    id: 'scanner-1-unavailable',
    category: 'capability',
    title: 'Scanner unavailable',
    detail: 'BarcodeDetector is not available',
    severity: 'low',
    confidence: 1,
    recommendation: 'Use a browser that supports this local scanner or continue with the available checks.',
    assessment: 'unavailable',
    resolved: false,
  }]);
});

test('runScanners supports scanners that return no findings', async () => {
  assert.deepEqual(await runScanners({}, [async () => undefined]), []);
});

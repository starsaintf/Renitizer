import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { buildCloudAnalysisForm, normalizeCloudFindings, requestCloudAnalysis } from '../src/scanners/cloud.js';

const plateFinding = {
  id: 'plate-1', category: 'vehicle-plate', title: 'Vehicle plate detected', detail: 'A vehicle plate is visible.',
  severity: 'high', confidence: 0.92, recommendation: 'Cover the plate before sharing.',
};

test('keeps a valid normalized cloud box for the redaction editor', () => {
  const [finding] = normalizeCloudFindings([{ ...plateFinding, boundingBox: { x: 0.2, y: 0.35, width: 0.4, height: 0.12 } }]);

  assert.deepEqual(finding.boundingBox, { x: 0.2, y: 0.35, width: 0.4, height: 0.12 });
  assert.equal(finding.source, 'cloud');
});

test('rejects an unusable cloud box instead of sending it to the redaction editor', () => {
  const [finding] = normalizeCloudFindings([{ ...plateFinding, boundingBox: { x: 0.2, y: 0.35, width: -0.4, height: 0.12 } }]);

  assert.equal('boundingBox' in finding, false);
});

test('buildCloudAnalysisForm carries only timing context for sampled video frames', () => {
  const form = buildCloudAnalysisForm({
    files: [new File(['frame'], 'walk-frame-1.jpg', { type: 'image/jpeg' })],
    analyses: ['visual-pii', 'video-frame-context'],
    frameContext: [{ time: 4, duration: 12 }],
  });

  assert.equal(form.getAll('file').length, 1);
  assert.deepEqual(JSON.parse(form.get('analyses')), ['visual-pii', 'video-frame-context']);
  assert.deepEqual(JSON.parse(form.get('frameContext')), [{ time: 4, duration: 12 }]);
});

test('keeps explicit clean-copy provider checks with the cloud findings', async () => {
  const result = await requestCloudAnalysis({
    endpoint: 'https://privacy.example/check',
    file: new File(['clean'], 'clean.jpg', { type: 'image/jpeg' }),
    consent: true,
    returnDetails: true,
    fetcher: async () => Response.json({
      findings: [plateFinding],
      providerChecks: { faceLandmarks: true, reverseImage: true },
    }),
  });

  assert.deepEqual(result, {
    findings: [{ ...plateFinding, assessment: 'assessed', resolved: false, source: 'cloud' }],
    providerChecks: { faceLandmarks: true, reverseImage: true },
  });
});

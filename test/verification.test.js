import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundedSafetyScore,
  createVerification,
  deriveResidualRisks,
} from '../src/core/verification.js';

const finding = (overrides = {}) => ({
  id: 'finding', category: 'metadata', severity: 'medium', confidence: 1, resolved: false, ...overrides,
});

test('deriveResidualRisks uses unresolved post-clean findings when their local check ran', () => {
  const afterBarcode = finding({ id: 'barcode-1', category: 'barcode', severity: 'medium' });

  assert.deepEqual(deriveResidualRisks({
    beforeFindings: [finding({ id: 'barcode-before', category: 'barcode' })],
    afterFindings: [afterBarcode],
    assessedChecks: ['barcodes'],
  }), [afterBarcode]);
});

test('deriveResidualRisks preserves an unresolved pre-clean risk when that check was not rerun', () => {
  const visibleText = finding({ id: 'ocr-email', category: 'email' });

  assert.deepEqual(deriveResidualRisks({
    beforeFindings: [visibleText],
    afterFindings: [],
    assessedChecks: ['metadata'],
  }), [visibleText]);
});

test('createVerification reports ready only after available clean-copy checks pass', () => {
  const verification = createVerification({
    beforeFindings: [finding({ id: 'metadata-gps', category: 'gps', severity: 'high' })],
    afterFindings: [],
    assessedChecks: ['metadata', 'visibleText', 'barcodes'],
    redactionPlan: [],
  });

  assert.equal(verification.readiness.state, 'ready');
  assert.equal(verification.readiness.label, 'Ready to save');
  assert.deepEqual(verification.residualRisks, []);
  assert.equal(verification.checks.metadata.status, 'passed');
  assert.equal(verification.checks.visibleText.status, 'passed');
  assert.equal(verification.checks.barcodes.status, 'passed');
});

test('createVerification requests review for post-clean risks and skipped visual redactions', () => {
  const afterText = finding({ id: 'ocr-email', category: 'email', severity: 'medium' });
  const plannedBox = finding({ id: 'barcode-1', category: 'barcode', boundingBox: { x: 0, y: 0, width: .2, height: .2 } });
  const verification = createVerification({
    beforeFindings: [plannedBox],
    afterFindings: [afterText],
    assessedChecks: ['metadata', 'visibleText', 'barcodes'],
    redactionPlan: [],
  });

  assert.equal(verification.readiness.state, 'review-needed');
  assert.equal(verification.readiness.label, 'Review these items');
  assert.equal(verification.checks.visibleText.status, 'review-needed');
  assert.equal(verification.checks.visualRedactions.status, 'review-needed');
  assert.deepEqual(verification.residualRisks, [afterText, plannedBox]);
});

test('createVerification marks provider-dependent face, landmark, and reverse-image checks not assessed without provider evidence', () => {
  const verification = createVerification({ assessedChecks: ['metadata', 'visibleText', 'barcodes'] });

  assert.deepEqual(verification.checks.faceLandmarks, {
    status: 'not-assessed',
    reason: 'No face or landmark provider result was supplied for the clean copy.',
  });
  assert.deepEqual(verification.checks.reverseImage, {
    status: 'not-assessed',
    reason: 'No reverse-image or OSINT provider result was supplied for the clean copy.',
  });
  assert.deepEqual(verification.checks.cloud, {
    status: 'not-assessed',
    reason: 'No cloud assessment result was supplied for the clean copy.',
  });
});

test('createVerification does not treat an unavailable local scanner as a passed check', () => {
  const verification = createVerification({
    afterFindings: [finding({ id: 'verify-barcodes-scanner-1-unavailable', category: 'capability', assessment: 'unavailable', verificationCheck: 'barcodes' })],
    assessedChecks: ['barcodes'],
  });

  assert.deepEqual(verification.checks.barcodes, {
    status: 'not-assessed',
    reason: 'Barcodes could not be checked again on the clean copy.',
  });
});

test('createVerification represents supplied provider assessments without claiming checks that have no result', () => {
  const verification = createVerification({
    afterFindings: [finding({ id: 'face-1', category: 'face', source: 'cloud', severity: 'high' })],
    providerResults: { cloud: true, faceLandmarks: true },
  });

  assert.equal(verification.checks.cloud.status, 'review-needed');
  assert.equal(verification.checks.faceLandmarks.status, 'review-needed');
  assert.equal(verification.checks.reverseImage.status, 'not-assessed');
});

test('boundedSafetyScore is bounded even for malformed or severe residual risks', () => {
  assert.equal(boundedSafetyScore([]), 100);
  assert.equal(boundedSafetyScore([finding({ severity: 'critical', confidence: 99 })]), 58);
  assert.equal(boundedSafetyScore(Array.from({ length: 4 }, () => finding({ severity: 'critical', confidence: 1 }))), 0);
});

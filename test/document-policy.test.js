import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocumentCleaningJobRequest,
  createDocumentCleaningReport,
  createDocumentSanitizationPlan,
  normalizeDocumentFindings,
} from '../src/documents/policy.js';

test('normalizes PDF privacy findings into stable document categories', () => {
  const findings = normalizeDocumentFindings('pdf', [
    { category: 'authors' },
    { category: 'comments' },
    { category: 'tracked changes' },
    { category: 'hidden objects' },
    { category: 'digital signature' },
    { category: 'printer identifier' },
    { category: 'document metadata' },
    { category: 'embedded thumbnail' },
    { category: 'embedded fonts' },
  ]);

  assert.deepEqual(findings.map(({ id, category, action }) => ({ id, category, action })), [
    { id: 'document-author-1', category: 'author', action: 'remove' },
    { id: 'document-comment-1', category: 'comment', action: 'remove' },
    { id: 'document-revision-1', category: 'revision', action: 'remove' },
    { id: 'document-hidden-object-1', category: 'hidden-object', action: 'remove' },
    { id: 'document-signature-1', category: 'signature', action: 'remove' },
    { id: 'document-device-identifier-1', category: 'device-identifier', action: 'remove' },
    { id: 'document-metadata-1', category: 'metadata', action: 'remove' },
    { id: 'document-thumbnail-1', category: 'thumbnail', action: 'remove' },
    { id: 'document-font-1', category: 'font', action: 'remove' },
  ]);
  assert.equal(findings.every((finding) => finding.documentType === 'pdf' && finding.assessment === 'assessed'), true);
});

test('normalizes Office labels without exposing extracted private values', () => {
  const [finding] = normalizeDocumentFindings('office', [{ category: 'scanner name', value: 'Reception MFP 2' }]);

  assert.deepEqual(finding, {
    id: 'document-device-identifier-1',
    category: 'device-identifier',
    action: 'remove',
    documentType: 'office',
    title: 'Printer or scanner details',
    detail: 'This document may identify a printer, scanner, or other device.',
    severity: 'low',
    confidence: 1,
    assessment: 'assessed',
    resolved: false,
  });
  assert.equal(JSON.stringify(finding).includes('Reception MFP 2'), false);
});

test('creates a document plan that makes unsafe transformations unavailable', () => {
  const findings = normalizeDocumentFindings('office', [
    { category: 'author' },
    { category: 'signature' },
    { category: 'embedded font' },
  ]);
  const plan = createDocumentSanitizationPlan('office', findings);

  assert.equal(plan.state, 'requires-processor');
  assert.deepEqual(plan.actions.map(({ category, action, state }) => ({ category, action, state })), [
    { category: 'author', action: 'remove', state: 'supported' },
    { category: 'signature', action: 'remove', state: 'unavailable' },
    { category: 'font', action: 'remove', state: 'unavailable' },
  ]);
  assert.match(plan.output.reason, /configured document-cleaning processor/i);
});

test('creates a metadata-only document-cleaning job request', () => {
  const request = createDocumentCleaningJobRequest({
    name: 'board-notes.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 1024,
  }, createDocumentSanitizationPlan('office', normalizeDocumentFindings('office', [{ category: 'comment' }])));

  assert.deepEqual(request, {
    kind: 'document-cleaning',
    mediaKind: 'document',
    documentType: 'office',
    fileName: 'board-notes.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: 1024,
    requestedActions: ['remove-comment'],
  });
  assert.equal('file' in request, false);
  assert.equal('content' in request, false);
});

test('makes a safe document report without claiming an output exists', () => {
  const report = createDocumentCleaningReport({
    plan: createDocumentSanitizationPlan('pdf', normalizeDocumentFindings('pdf', [{ category: 'author' }])),
    processor: { state: 'unconfigured', available: false },
  });

  assert.deepEqual(report, {
    documentType: 'pdf',
    state: 'processor-unconfigured',
    cleanDocumentProduced: false,
    message: 'A clean document has not been produced. Configure a document-cleaning processor to continue.',
    actions: [{ category: 'author', action: 'remove', state: 'supported' }],
  });
  assert.equal(JSON.stringify(report).includes('fileName'), false);
});

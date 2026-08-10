import test from 'node:test';
import assert from 'node:assert/strict';
import * as documentPolicy from '../src/documents/policy.js';
import {
  createDocumentCleaningJobRequest,
  createDocumentCleaningReport,
  createDocumentSanitizationPlan,
  documentTypeForFile,
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

test('recognizes macro-enabled and OpenDocument Office files for the private processor', () => {
  assert.equal(documentTypeForFile({ name: 'draft.docm', type: '' }), 'office');
  assert.equal(documentTypeForFile({ name: 'budget.xlsm', type: 'application/vnd.ms-excel.sheet.macroEnabled.12' }), 'office');
  assert.equal(documentTypeForFile({ name: 'slides.pptm', type: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12' }), 'office');
  assert.equal(documentTypeForFile({ name: 'notes.odt', type: 'application/vnd.oasis.opendocument.text' }), 'office');
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

test('offers signature removal while marking only font removal as unavailable', () => {
  const findings = normalizeDocumentFindings('office', [
    { category: 'author' },
    { category: 'signature' },
    { category: 'embedded font' },
  ]);
  const plan = createDocumentSanitizationPlan('office', findings);

  assert.equal(plan.state, 'requires-processor');
  assert.deepEqual(plan.actions.map(({ category, action, state }) => ({ category, action, state })), [
    { category: 'author', action: 'remove', state: 'supported' },
    { category: 'signature', action: 'remove', state: 'supported' },
    { category: 'font', action: 'remove', state: 'unavailable' },
  ]);
  assert.match(plan.output.reason, /configured document-cleaning processor/i);
});

test('shows an editable privacy-cleaning plan for a modern Office package', () => {
  const plan = createDocumentSanitizationPlan('office', [], { sourceExtension: 'docx' });

  assert.equal(plan.mode, 'selectable');
  assert.deepEqual(plan.actions.map(({ category, action, state }) => ({ category, action, state })), [
    { category: 'metadata', action: 'remove', state: 'supported' },
    { category: 'comment', action: 'remove', state: 'supported' },
    { category: 'revision', action: 'remove', state: 'supported' },
    { category: 'hidden-object', action: 'remove', state: 'supported' },
    { category: 'signature', action: 'remove', state: 'supported' },
    { category: 'thumbnail', action: 'remove', state: 'supported' },
    { category: 'font', action: 'remove', state: 'supported' },
  ]);
});

test('lets a person keep one selectable Office category without changing the rest', () => {
  assert.equal(typeof documentPolicy.setDocumentPlanAction, 'function');
  const initial = createDocumentSanitizationPlan('office', [], { sourceExtension: 'pptx' });
  const plan = documentPolicy.setDocumentPlanAction(initial, 'font', 'keep');

  assert.equal(plan.actions.find(({ category }) => category === 'font')?.action, 'keep');
  assert.equal(plan.actions.find(({ category }) => category === 'signature')?.action, 'remove');
});

test('marks an all-keep modern Office request as an explicit choice', () => {
  let plan = createDocumentSanitizationPlan('office', [], { sourceExtension: 'xlsx' });
  for (const { category } of plan.actions) plan = documentPolicy.setDocumentPlanAction(plan, category, 'keep');
  const request = createDocumentCleaningJobRequest({ name: 'budget.xlsx', type: '', size: 64 }, plan);

  assert.equal(request.documentSelection, 'explicit');
  assert.deepEqual(request.requestedActions, []);
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
    documentSelection: 'fixed',
    requestedActions: ['remove-comment'],
  });
  assert.equal('file' in request, false);
  assert.equal('content' in request, false);
});

test('declares a safe MIME type for legacy document uploads when a browser omits one', () => {
  const request = createDocumentCleaningJobRequest({
    name: 'old-letter.rtf', type: '', size: 256,
  }, createDocumentSanitizationPlan('office', []));

  assert.equal(request.mimeType, 'application/rtf');
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

test('records only processor-confirmed document removals after a clean copy is complete', () => {
  const plan = createDocumentSanitizationPlan('office', [], { sourceExtension: 'docx' });
  const report = createDocumentCleaningReport({
    plan,
    processor: { state: 'configured', available: true },
    output: { state: 'complete', removedCategories: ['comment', 'signature'] },
  });

  assert.equal(report.state, 'complete');
  assert.equal(report.cleanDocumentProduced, true);
  assert.deepEqual(report.removedCategories, ['comment', 'signature']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { createWorker } from '../src/index.js';
import {
  JOB_STATES,
  JOB_KINDS,
  MEDIA_KINDS,
  createJob,
  getConfiguration,
  isJobState,
  serializeJobStatus,
  transitionJob,
  validateJobRequest,
} from '../src/jobs.js';

const identityUrl = 'https://identity.renvoy.example/v1/identity/renitizer/verify';

function identityEnvironment() {
  return { RENVOY_IDENTITY_VERIFICATION_URL: identityUrl };
}

function renvoyHeaders() {
  return { Authorization: 'Renvoy opaque-token_123', 'Content-Type': 'application/json' };
}

async function withRenvoyVerification(identity, action) {
  const testWorker = createWorker({ identityFetcher: async () => Response.json(identity) });
  return action(testWorker);
}

test('job contract exposes the supported states and media kinds', () => {
  assert.deepEqual(JOB_STATES, ['queued', 'processing', 'complete', 'failed']);
  assert.deepEqual(JOB_KINDS, ['media-analysis', 'document-cleaning']);
  assert.deepEqual(MEDIA_KINDS, ['image', 'video', 'audio', 'document']);
});

test('validates metadata-only document-cleaning job requests', () => {
  assert.deepEqual(validateJobRequest({
    kind: 'document-cleaning',
    mediaKind: 'document',
    documentType: 'pdf',
    fileName: 'contract.pdf',
    requestedActions: ['remove-author', 'remove-comment'],
  }), { valid: true, value: {
    kind: 'document-cleaning',
    mediaKind: 'document',
    documentType: 'pdf',
    fileName: 'contract.pdf',
    mimeType: null,
    sizeBytes: null,
    requestedActions: ['remove-author', 'remove-comment'],
  } });
});

test('state helpers allow only forward processing lifecycle transitions', () => {
  const queued = createJob({ mediaKind: 'video' }, () => 'job-1', () => '2026-07-18T00:00:00.000Z');
  const processing = transitionJob(queued, 'processing', () => '2026-07-18T00:01:00.000Z');

  assert.equal(isJobState('complete'), true);
  assert.equal(isJobState('waiting'), false);
  assert.equal(processing.state, 'processing');
  assert.equal(processing.updatedAt, '2026-07-18T00:01:00.000Z');
  assert.throws(() => transitionJob(processing, 'queued'), /Invalid job state transition/);
  assert.throws(() => transitionJob(processing, 'waiting'), /Unknown job state/);
});

test('validates metadata-only job creation requests', () => {
  assert.deepEqual(validateJobRequest({
    mediaKind: 'video',
    fileName: 'interview.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 2048,
  }), { valid: true, value: {
    mediaKind: 'video',
    fileName: 'interview.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 2048,
  } });
});

test('rejects raw file content and unsupported media kinds', () => {
  const result = validateJobRequest({
    mediaKind: 'spreadsheet',
    fileName: 'private.csv',
    content: 'not permitted',
  });

  assert.equal(result.valid, false);
  assert.match(result.error, /mediaKind/);
  assert.match(result.error, /raw file content/i);
});

test('status response explicitly reports unconfigured processing infrastructure', () => {
  const job = createJob({ mediaKind: 'audio', fileName: 'memo.wav' }, () => 'job-123');

  assert.deepEqual(serializeJobStatus(job, getConfiguration({})), {
    job: {
      id: 'job-123',
      state: 'queued',
      mediaKind: 'audio',
      fileName: 'memo.wav',
      mimeType: null,
      sizeBytes: null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
    processing: {
      state: 'unconfigured',
      available: false,
      missingBindings: ['MEDIA_BUCKET', 'JOBS_QUEUE'],
    },
  });
});

test('remote job routes fail closed until Renvoy identity verification is configured', async () => {
  const response = await worker.fetch(new Request('https://worker.example/api/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaKind: 'document' }),
  }), {});

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'identity-unconfigured');
});

test('remote job routes require a Renvoy credential once verification is configured', async () => {
  const response = await worker.fetch(new Request('https://worker.example/api/jobs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaKind: 'document' }),
  }), identityEnvironment());

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthorized');
});

test('POST /api/jobs creates an account-bound job only with Renvoy Renitizer access', async () => {
  const response = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }, (testWorker) => testWorker.fetch(new Request('https://worker.example/api/jobs', {
    method: 'POST', headers: renvoyHeaders(), body: JSON.stringify({ mediaKind: 'document', fileName: 'contract.pdf' }),
  }), identityEnvironment()));

  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.job.state, 'queued');
  assert.equal(body.job.mediaKind, 'document');
  assert.deepEqual(body.processing, {
    state: 'unconfigured',
    available: false,
    missingBindings: ['MEDIA_BUCKET', 'JOBS_QUEUE'],
  });
  assert.equal('content' in body.job, false);

  const insufficient = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: [] } }, (testWorker) => testWorker.fetch(new Request('https://worker.example/api/jobs', {
    method: 'POST', headers: renvoyHeaders(), body: JSON.stringify({ mediaKind: 'image' }),
  }), identityEnvironment()));
  assert.equal(insufficient.status, 401);
  assert.equal((await insufficient.json()).error.code, 'unauthorized');
});

test('GET /api/jobs/:id requires Renvoy Renitizer access and does not expose another account job', async () => {
  const create = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }, (testWorker) => testWorker.fetch(new Request('https://worker.example/api/jobs', {
    method: 'POST', headers: renvoyHeaders(), body: JSON.stringify({ mediaKind: 'image', fileName: 'portrait.jpg' }),
  }), identityEnvironment()));
  const { job } = await create.json();

  const owner = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }, (testWorker) => testWorker.fetch(new Request(`https://worker.example/api/jobs/${job.id}`, {
    headers: { Authorization: 'Renvoy opaque-token_123' },
  }), identityEnvironment()));
  assert.equal(owner.status, 200);
  assert.equal((await owner.json()).job.id, job.id);

  const otherAccount = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_bob', deviceId: 'dev_laptop', scopes: ['renitizer:use'] } }, (testWorker) => testWorker.fetch(new Request(`https://worker.example/api/jobs/${job.id}`, {
    headers: { Authorization: 'Renvoy opaque-token_123' },
  }), identityEnvironment()));
  assert.equal(otherAccount.status, 404);
});

test('document-cleaning processor route reports unconfigured instead of fabricating a clean document', async () => {
  const response = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }, (testWorker) => testWorker.fetch(new Request('https://worker.example/api/document-cleaning', {
    method: 'POST',
    headers: renvoyHeaders(),
    body: JSON.stringify({
      kind: 'document-cleaning', mediaKind: 'document', documentType: 'office', fileName: 'board-notes.docx', requestedActions: ['remove-comment'],
    }),
  }), identityEnvironment()));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    processor: {
      state: 'unconfigured',
      available: false,
      output: null,
      message: 'No document-cleaning processor is configured.',
    },
  });
});

test('job routes reject invalid JSON and unknown job IDs', async () => {
  const invalid = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }, (testWorker) => testWorker.fetch(new Request('https://worker.example/api/jobs', {
    method: 'POST',
    headers: renvoyHeaders(),
    body: '{',
  }), identityEnvironment()));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, 'Request body must be valid JSON.');

  const missing = await withRenvoyVerification({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }, (testWorker) => testWorker.fetch(new Request('https://worker.example/api/jobs/unknown', {
    headers: { Authorization: 'Renvoy opaque-token_123' },
  }), identityEnvironment()));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'Job not found.');
});

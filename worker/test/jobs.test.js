import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { createWorker } from '../src/index.js';
import {
  JOB_STATES,
  JOB_KINDS,
  MEDIA_KINDS,
  createJob,
  createStoredJob,
  getConfiguration,
  inputObjectKey,
  jobRecordKey,
  outputObjectKey,
  isJobState,
  serializeJobStatus,
  transitionJob,
  validateJobRequest,
  validateUploadMetadata,
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
  assert.deepEqual(JOB_KINDS, ['media-analysis', 'document-cleaning', 'video-redaction']);
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

test('accepts only bounded cover tracks for a video redaction job', () => {
  const result = validateJobRequest({
    kind: 'video-redaction', mediaKind: 'video', fileName: 'street.mp4', mimeType: 'video/mp4', sizeBytes: 2048,
    redactions: [{ id: 'plate', action: 'cover', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
  });
  assert.deepEqual(result, { valid: true, value: {
    kind: 'video-redaction', mediaKind: 'video', fileName: 'street.mp4', mimeType: 'video/mp4', sizeBytes: 2048,
    redactions: [{ id: 'plate', action: 'cover', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
  } });
  assert.equal(outputObjectKey({ ownerAccountId: 'acct_renvoy_alice', jobId: 'job-123' }), 'jobs/acct_renvoy_alice/job-123/output.mp4');
});

test('creates account-scoped R2 input keys without using an unsafe source filename', () => {
  const key = inputObjectKey({
    ownerAccountId: 'acct_renvoy_alice',
    jobId: 'job-123',
    fileName: '../../tax return.PDF',
  });
  assert.equal(key, 'jobs/acct_renvoy_alice/job-123/input.pdf');

  const job = createStoredJob({
    mediaKind: 'document', fileName: '../../tax return.PDF', mimeType: 'application/pdf', sizeBytes: 99,
  }, 'acct_renvoy_alice', () => 'job-123', () => '2026-07-19T00:00:00.000Z');
  assert.equal(job.ownerAccountId, 'acct_renvoy_alice');
  assert.equal(job.input.key, key);
  assert.equal(job.output, null);
  assert.equal(job.failure, null);
  assert.equal(job.state, 'queued');
});

test('validates an upload against its declared media type and bounded file size', () => {
  assert.deepEqual(validateUploadMetadata({
    mediaKind: 'image', fileName: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 42,
  }, { name: 'portrait.jpg', type: 'image/jpeg', size: 42 }), {
    valid: true,
    value: { mediaKind: 'image', fileName: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 42 },
  });

  const mismatch = validateUploadMetadata({
    mediaKind: 'audio', fileName: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 42,
  }, { name: 'portrait.jpg', type: 'image/jpeg', size: 42 });
  assert.equal(mismatch.valid, false);
  assert.match(mismatch.error, /does not match/i);
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

test('POST /api/jobs/upload stores the authenticated media and enqueues a compact durable job', async () => {
  const stored = [];
  const messages = [];
  const bucket = {
    async put(key, value, options) { stored.push({ key, value, options }); return { key }; },
    async delete(key) { stored.push({ deleted: key }); },
  };
  const queue = { async send(message) { messages.push(message); } };
  const form = new FormData();
  form.set('metadata', JSON.stringify({
    mediaKind: 'image', fileName: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 3,
  }));
  form.set('file', new File(['abc'], 'portrait.jpg', { type: 'image/jpeg' }));

  const response = await withRenvoyVerification(
    { principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } },
    (testWorker) => testWorker.fetch(new Request('https://worker.example/api/jobs/upload', {
      method: 'POST', headers: { Authorization: 'Renvoy opaque-token_123' }, body: form,
    }), { ...identityEnvironment(), MEDIA_BUCKET: bucket, JOBS_QUEUE: queue }),
  );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.job.state, 'queued');
  assert.equal(stored.length, 2);
  assert.match(stored[0].key, /^jobs\/acct_renvoy_alice\/[^/]+\/input\.jpg$/);
  assert.match(stored[1].key, /^jobs\/acct_renvoy_alice\/[^/]+\/record\.json$/);
  assert.deepEqual(messages, [{ version: 1, jobId: payload.job.id, ownerAccountId: 'acct_renvoy_alice' }]);
  assert.equal(JSON.stringify(messages).includes('portrait.jpg'), false);
});

test('POST /api/jobs/upload reports unavailable infrastructure before accepting a file', async () => {
  const form = new FormData();
  form.set('metadata', JSON.stringify({
    mediaKind: 'image', fileName: 'portrait.jpg', mimeType: 'image/jpeg', sizeBytes: 3,
  }));
  form.set('file', new File(['abc'], 'portrait.jpg', { type: 'image/jpeg' }));

  const response = await withRenvoyVerification(
    { principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } },
    (testWorker) => testWorker.fetch(new Request('https://worker.example/api/jobs/upload', {
      method: 'POST', headers: { Authorization: 'Renvoy opaque-token_123' }, body: form,
    }), identityEnvironment()),
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'processing-unconfigured');
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

test('GET /api/jobs/:id reads a durable job record only from its owning account prefix', async () => {
  const record = createStoredJob({
    mediaKind: 'video', fileName: 'walkthrough.mp4', mimeType: 'video/mp4', sizeBytes: 22,
  }, 'acct_renvoy_alice', () => 'job_durable', () => '2026-07-19T00:00:00.000Z');
  const key = jobRecordKey({ ownerAccountId: record.ownerAccountId, jobId: record.id });
  const bucket = {
    async get(requestedKey) { return requestedKey === key ? { json: async () => record } : null; },
  };

  const owner = await withRenvoyVerification(
    { principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } },
    (testWorker) => testWorker.fetch(new Request(`https://worker.example/api/jobs/${record.id}`, {
      headers: { Authorization: 'Renvoy opaque-token_123' },
    }), { ...identityEnvironment(), MEDIA_BUCKET: bucket }),
  );
  assert.equal(owner.status, 200);
  assert.equal((await owner.json()).job.id, record.id);

  const other = await withRenvoyVerification(
    { principal: { accountId: 'acct_renvoy_bob', deviceId: 'dev_laptop', scopes: ['renitizer:use'] } },
    (testWorker) => testWorker.fetch(new Request(`https://worker.example/api/jobs/${record.id}`, {
      headers: { Authorization: 'Renvoy opaque-token_123' },
    }), { ...identityEnvironment(), MEDIA_BUCKET: bucket }),
  );
  assert.equal(other.status, 404);
});

test('queue consumer records a processor-unavailable failure instead of a fictional output', async () => {
  const record = createStoredJob({
    mediaKind: 'document', fileName: 'minutes.pdf', mimeType: 'application/pdf', sizeBytes: 9,
  }, 'acct_renvoy_alice', () => 'job_queue', () => '2026-07-19T00:00:00.000Z');
  const key = jobRecordKey({ ownerAccountId: record.ownerAccountId, jobId: record.id });
  const saved = [];
  const bucket = {
    async get(requestedKey) { return requestedKey === key ? { json: async () => record } : null; },
    async put(requestedKey, body) { saved.push({ key: requestedKey, job: JSON.parse(body) }); },
  };
  let acknowledged = false;
  const testWorker = createWorker();
  await testWorker.queue({
    messages: [{ body: { version: 1, jobId: record.id, ownerAccountId: record.ownerAccountId }, ack() { acknowledged = true; } }],
  }, { MEDIA_BUCKET: bucket });

  assert.equal(acknowledged, true);
  assert.equal(saved.length, 2);
  assert.equal(saved.at(-1).job.state, 'failed');
  assert.deepEqual(saved.at(-1).job.output, null);
  assert.deepEqual(saved.at(-1).job.failure, {
    code: 'processor-unavailable',
    message: 'No media processor is configured for this job.',
  });
});

test('queue consumer streams a video to the renderer and stores a completed private output', async () => {
  const record = createStoredJob({
    kind: 'video-redaction', mediaKind: 'video', fileName: 'walkthrough.mp4', mimeType: 'video/mp4', sizeBytes: 3,
    redactions: [{ id: 'plate', action: 'cover', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
  }, 'acct_renvoy_alice', () => 'job_render', () => '2026-07-19T00:00:00.000Z');
  const recordKey = jobRecordKey({ ownerAccountId: record.ownerAccountId, jobId: record.id });
  let current = record;
  const writes = [];
  const bucket = {
    async get(key) {
      if (key === recordKey) return { json: async () => current };
      if (key === record.input.key) return { body: new Blob(['raw']).stream() };
      return null;
    },
    async put(key, body, options) {
      if (key === recordKey) current = JSON.parse(body);
      writes.push({ key, body, options });
    },
  };
  let request;
  const testWorker = createWorker({ processorFetcher: async (url, options) => {
    request = { url, options };
    return new Response(new Blob(['clean']).stream(), { status: 200, headers: { 'Content-Type': 'video/mp4' } });
  } });
  let acknowledged = false;
  await testWorker.queue({
    messages: [{ body: { version: 1, jobId: record.id, ownerAccountId: record.ownerAccountId }, ack() { acknowledged = true; } }],
  }, { MEDIA_BUCKET: bucket, PROCESSOR_URL: 'https://renderer.example/v1/render/video', PROCESSOR_AUTH_TOKEN: 'processor-secret' });

  assert.equal(acknowledged, true);
  assert.equal(current.state, 'complete');
  assert.deepEqual(current.output, { key: outputObjectKey({ ownerAccountId: record.ownerAccountId, jobId: record.id }), contentType: 'video/mp4' });
  assert.equal(current.failure, null);
  assert.equal(request.url, 'https://renderer.example/v1/render/video');
  assert.equal(request.options.headers.Authorization, 'Bearer processor-secret');
  assert.deepEqual(JSON.parse(Buffer.from(request.options.headers['X-Renitizer-Video-Tracks'], 'base64url').toString('utf8')), record.redactions);
  assert.equal(writes.some(({ key }) => key === current.output.key), true);
});

test('GET /api/jobs/:id/output streams only the owner’s completed private video', async () => {
  const record = {
    ...createStoredJob({
      kind: 'video-redaction', mediaKind: 'video', fileName: 'walkthrough.mp4', mimeType: 'video/mp4', sizeBytes: 3,
      redactions: [{ id: 'plate', action: 'cover', startTime: 1, endTime: 3, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
    }, 'acct_renvoy_alice', () => 'job_download', () => '2026-07-19T00:00:00.000Z'),
    state: 'complete',
    output: { key: outputObjectKey({ ownerAccountId: 'acct_renvoy_alice', jobId: 'job_download' }), contentType: 'video/mp4' },
  };
  const recordKey = jobRecordKey({ ownerAccountId: record.ownerAccountId, jobId: record.id });
  const bucket = {
    async get(key) {
      if (key === recordKey) return { json: async () => record };
      if (key === record.output.key) return { body: new Blob(['clean']).stream(), httpMetadata: { contentType: 'video/mp4' } };
      return null;
    },
  };
  const owner = await withRenvoyVerification(
    { principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } },
    (testWorker) => testWorker.fetch(new Request(`https://worker.example/api/jobs/${record.id}/output`, {
      headers: { Authorization: 'Renvoy opaque-token_123' },
    }), { ...identityEnvironment(), MEDIA_BUCKET: bucket }),
  );
  assert.equal(owner.status, 200);
  assert.equal(owner.headers.get('Content-Type'), 'video/mp4');
  assert.equal(await owner.text(), 'clean');

  const other = await withRenvoyVerification(
    { principal: { accountId: 'acct_renvoy_bob', deviceId: 'dev_laptop', scopes: ['renitizer:use'] } },
    (testWorker) => testWorker.fetch(new Request(`https://worker.example/api/jobs/${record.id}/output`, {
      headers: { Authorization: 'Renvoy opaque-token_123' },
    }), { ...identityEnvironment(), MEDIA_BUCKET: bucket }),
  );
  assert.equal(other.status, 404);
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

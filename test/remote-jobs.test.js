import assert from 'node:assert/strict';
import test from 'node:test';
import { submitRemoteJob } from '../src/remote/jobs.js';
import { getRemoteJob } from '../src/remote/jobs.js';
import { downloadRemoteJob } from '../src/remote/jobs.js';

test('submits an authenticated private upload without placing the capability in the form', async () => {
  let request;
  const file = new File(['clean me'], 'contract.pdf', { type: 'application/pdf' });
  const result = await submitRemoteJob({
    session: { endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' }, file,
    metadata: { kind: 'document-cleaning', mediaKind: 'document', documentType: 'pdf', fileName: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: file.size, requestedActions: ['remove-author'] },
    fetcher: async (url, options) => { request = { url, options }; return Response.json({ job: { id: 'job-1', state: 'queued' } }, { status: 202 }); },
  });
  assert.equal(result.job.id, 'job-1');
  assert.equal(request.url, 'https://renitizer.example/api/jobs/upload');
  assert.equal(request.options.headers.Authorization, 'Renvoy opaque-capability_123456');
  assert.equal(await request.options.body.get('metadata'), JSON.stringify({ kind: 'document-cleaning', mediaKind: 'document', documentType: 'pdf', fileName: 'contract.pdf', mimeType: 'application/pdf', sizeBytes: file.size, requestedActions: ['remove-author'] }));
  assert.equal(await request.options.body.get('file').text(), 'clean me');
});

test('downloads a completed private job only with the ephemeral Renvoy capability', async () => {
  let request;
  const file = await downloadRemoteJob({
    session: { endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' }, jobId: 'job_123',
    fetcher: async (url, options) => { request = { url, options }; return new Response('clean', { headers: { 'Content-Type': 'application/pdf' } }); },
  });
  assert.equal(await file.text(), 'clean');
  assert.equal(request.url, 'https://renitizer.example/api/jobs/job_123/output');
  assert.equal(request.options.headers.Authorization, 'Renvoy opaque-capability_123456');
});

test('reads the account-bound status of a private job', async () => {
  let request;
  const job = await getRemoteJob({
    session: { endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' }, jobId: 'job_123',
    fetcher: async (url, options) => { request = { url, options }; return Response.json({ job: { id: 'job_123', state: 'complete' } }); },
  });
  assert.equal(job.job.state, 'complete');
  assert.equal(request.url, 'https://renitizer.example/api/jobs/job_123');
  assert.equal(request.options.headers.Authorization, 'Renvoy opaque-capability_123456');
});

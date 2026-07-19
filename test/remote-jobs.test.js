import assert from 'node:assert/strict';
import test from 'node:test';
import { submitRemoteJob } from '../src/remote/jobs.js';

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

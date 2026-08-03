import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { requestCloudAnalysis } from '../src/scanners/cloud.js';

test('uses the Renvoy session to call the account-bound Renitizer analysis route', async () => {
  let request;
  const findings = await requestCloudAnalysis({
    consent: true,
    files: [new File(['image'], 'private.jpg', { type: 'image/jpeg' })],
    analyses: ['visual-pii'],
    session: { endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' },
    fetcher: async (url, options) => {
      request = { url, options };
      return Response.json({ findings: [] });
    },
  });

  assert.deepEqual(findings, []);
  assert.equal(request.url, 'https://renitizer.example/api/analyze');
  assert.equal(request.options.headers.Authorization, 'Renvoy opaque-capability_123456');
  assert.equal(request.options.headers.Accept, 'application/json');
});

test('never sends a Renvoy capability to a different custom analysis service', async () => {
  let request;
  await requestCloudAnalysis({
    endpoint: 'https://chosen-service.example/check',
    consent: true,
    files: [new File(['image'], 'private.jpg', { type: 'image/jpeg' })],
    session: { endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' },
    fetcher: async (url, options) => {
      request = { url, options };
      return Response.json({ findings: [] });
    },
  });

  assert.equal(request.url, 'https://chosen-service.example/check');
  assert.equal('Authorization' in request.options.headers, false);
});

test('requires an explicit service address or a trusted Renvoy session', async () => {
  await assert.rejects(() => requestCloudAnalysis({
    consent: true,
    files: [new File(['image'], 'private.jpg', { type: 'image/jpeg' })],
  }), /Open Renitizer from Renvoy or enter the address of a service you trust/);
});

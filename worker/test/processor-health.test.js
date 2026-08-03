import test from 'node:test';
import assert from 'node:assert/strict';
import { processorHealthUrl, verifyProcessors } from '../scripts/verify-processors.mjs';

test('derives an origin-bound health URL from an authenticated processor endpoint', () => {
  assert.equal(processorHealthUrl('https://video.example/v1/render/video'), 'https://video.example/health/live');
  assert.equal(processorHealthUrl('https://documents.example/v1/clean/document?revision=1'), 'https://documents.example/health/live');
  assert.throws(() => processorHealthUrl('http://processor.example/v1/render/video'), /HTTPS/);
});

test('verifies that both configured private processors respond before deployment', async () => {
  const calls = [];
  const result = await verifyProcessors({
    videoProcessorUrl: 'https://video.example/v1/render/video',
    documentProcessorUrl: 'https://documents.example/v1/clean/document',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response('ok', { status: 200 });
    },
  });

  assert.deepEqual(result, [
    { name: 'Video processor', healthUrl: 'https://video.example/health/live' },
    { name: 'Document processor', healthUrl: 'https://documents.example/health/live' },
  ]);
  assert.deepEqual(calls.map(({ url, options }) => [url, options]), [
    ['https://video.example/health/live', { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error' }],
    ['https://documents.example/health/live', { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error' }],
  ]);
});

test('fails closed when a configured processor is unhealthy', async () => {
  await assert.rejects(() => verifyProcessors({
    videoProcessorUrl: 'https://video.example/v1/render/video',
    documentProcessorUrl: 'https://documents.example/v1/clean/document',
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  }), /Video processor health check failed/);
});

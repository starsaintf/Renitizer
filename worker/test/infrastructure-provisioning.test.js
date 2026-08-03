import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUIRED_INFRASTRUCTURE,
  ensureInfrastructure,
} from '../scripts/provision-infrastructure.mjs';

const accountId = 'account_123';
const token = 'token_456';
const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('provisions only the missing private R2 bucket and queues through the Cloudflare API', async () => {
  const calls = [];
  const result = await ensureInfrastructure({
    accountId,
    token,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (url === `${apiRoot}/r2/buckets?name_contains=renitizer-private-media`) {
        return json({ success: true, result: { buckets: [] } });
      }
      if (url === `${apiRoot}/queues`) {
        return json({ success: true, result: [{ queue_name: REQUIRED_INFRASTRUCTURE.queues[0] }] });
      }
      if (url === `${apiRoot}/r2/buckets` && options.method === 'POST') {
        return json({ success: true, result: { name: REQUIRED_INFRASTRUCTURE.bucket } });
      }
      if (url === `${apiRoot}/queues` && options.method === 'POST') {
        return json({ success: true, result: { queue_name: JSON.parse(options.body).queue_name } });
      }
      throw new Error(`Unexpected request: ${options.method ?? 'GET'} ${url}`);
    },
  });

  assert.deepEqual(result, {
    bucket: { name: REQUIRED_INFRASTRUCTURE.bucket, status: 'created' },
    queues: [
      { name: REQUIRED_INFRASTRUCTURE.queues[0], status: 'existing' },
      { name: REQUIRED_INFRASTRUCTURE.queues[1], status: 'created' },
    ],
  });
  assert.deepEqual(calls.map(({ url, options }) => [options.method ?? 'GET', url]), [
    ['GET', `${apiRoot}/r2/buckets?name_contains=renitizer-private-media`],
    ['POST', `${apiRoot}/r2/buckets`],
    ['GET', `${apiRoot}/queues`],
    ['POST', `${apiRoot}/queues`],
  ]);
  const createBucket = calls.find(({ url, options }) => url === `${apiRoot}/r2/buckets` && options.method === 'POST');
  assert.equal(createBucket.options.headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(createBucket.options.body), { name: REQUIRED_INFRASTRUCTURE.bucket });
  const createQueue = calls.find(({ url, options }) => url === `${apiRoot}/queues` && options.method === 'POST');
  assert.deepEqual(JSON.parse(createQueue.options.body), { queue_name: REQUIRED_INFRASTRUCTURE.queues[1] });
});

test('does not create resources that are already provisioned', async () => {
  const calls = [];
  const result = await ensureInfrastructure({
    accountId,
    token,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (url.startsWith(`${apiRoot}/r2/buckets?`)) {
        return json({ success: true, result: { buckets: [{ name: REQUIRED_INFRASTRUCTURE.bucket }] } });
      }
      if (url === `${apiRoot}/queues`) {
        return json({ success: true, result: REQUIRED_INFRASTRUCTURE.queues.map((queue_name) => ({ queue_name })) });
      }
      throw new Error(`Unexpected request: ${options.method ?? 'GET'} ${url}`);
    },
  });

  assert.deepEqual(result, {
    bucket: { name: REQUIRED_INFRASTRUCTURE.bucket, status: 'existing' },
    queues: REQUIRED_INFRASTRUCTURE.queues.map((name) => ({ name, status: 'existing' })),
  });
  assert.equal(calls.some(({ options }) => options.method === 'POST'), false);
});

test('fails closed when Cloudflare rejects an infrastructure request', async () => {
  await assert.rejects(() => ensureInfrastructure({
    accountId,
    token,
    fetchImpl: async () => json({ success: false, errors: [{ message: 'permission denied' }] }, 403),
  }), /Cloudflare API GET .* permission denied/);
});

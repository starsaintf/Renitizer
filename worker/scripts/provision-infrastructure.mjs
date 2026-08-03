import { pathToFileURL } from 'node:url';

export const REQUIRED_INFRASTRUCTURE = Object.freeze({
  bucket: 'renitizer-private-media',
  queues: Object.freeze([
    'renitizer-processing-jobs',
    'renitizer-processing-jobs-dlq',
  ]),
});

function requireValue(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be provided.`);
  }
  return value.trim();
}

function accountUrl(accountId, path) {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}${path}`;
}

async function cloudflareRequest({ fetchImpl, token, url, method = 'GET', body }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new Error(`Cloudflare API ${method} ${url} could not be reached: ${error.message}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Cloudflare API ${method} ${url} returned an invalid response (${response.status}).`);
  }
  if (!response.ok || payload?.success !== true) {
    const message = Array.isArray(payload?.errors) && payload.errors.length
      ? payload.errors.map(({ message }) => message).filter(Boolean).join('; ')
      : 'request failed';
    throw new Error(`Cloudflare API ${method} ${url} failed (${response.status}): ${message}`);
  }
  return payload.result;
}

export async function ensureInfrastructure({
  accountId,
  token,
  fetchImpl = fetch,
  resources = REQUIRED_INFRASTRUCTURE,
}) {
  const safeAccountId = requireValue(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  const safeToken = requireValue(token, 'CLOUDFLARE_API_TOKEN');
  const bucketName = requireValue(resources?.bucket, 'R2 bucket name');
  const queueNames = Array.isArray(resources?.queues) && resources.queues.length
    ? resources.queues.map((name) => requireValue(name, 'Queue name'))
    : (() => { throw new Error('At least one Queue name must be provided.'); })();

  const bucketSearch = `/r2/buckets?name_contains=${encodeURIComponent(bucketName)}`;
  const listedBuckets = await cloudflareRequest({
    fetchImpl,
    token: safeToken,
    url: accountUrl(safeAccountId, bucketSearch),
  });
  const bucketExists = Array.isArray(listedBuckets?.buckets)
    && listedBuckets.buckets.some(({ name }) => name === bucketName);
  if (!bucketExists) {
    await cloudflareRequest({
      fetchImpl,
      token: safeToken,
      method: 'POST',
      url: accountUrl(safeAccountId, '/r2/buckets'),
      body: { name: bucketName },
    });
  }

  const listedQueues = await cloudflareRequest({
    fetchImpl,
    token: safeToken,
    url: accountUrl(safeAccountId, '/queues'),
  });
  const existingQueues = new Set(
    Array.isArray(listedQueues)
      ? listedQueues.map(({ queue_name }) => queue_name).filter(Boolean)
      : [],
  );
  const queues = [];
  for (const name of queueNames) {
    if (existingQueues.has(name)) {
      queues.push({ name, status: 'existing' });
      continue;
    }
    await cloudflareRequest({
      fetchImpl,
      token: safeToken,
      method: 'POST',
      url: accountUrl(safeAccountId, '/queues'),
      body: { queue_name: name },
    });
    queues.push({ name, status: 'created' });
  }

  return {
    bucket: { name: bucketName, status: bucketExists ? 'existing' : 'created' },
    queues,
  };
}

async function main() {
  const result = await ensureInfrastructure({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
  });
  console.log(`R2 bucket ${result.bucket.name}: ${result.bucket.status}`);
  for (const queue of result.queues) {
    console.log(`Queue ${queue.name}: ${queue.status}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

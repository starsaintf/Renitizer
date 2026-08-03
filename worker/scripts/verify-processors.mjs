import { pathToFileURL } from 'node:url';

function requireUrl(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} must be provided.`);
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error(`${name} must be a valid HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${name} must be a valid HTTPS URL.`);
  return url;
}

export function processorHealthUrl(value) {
  const url = requireUrl(value, 'Processor URL');
  return new URL('/health/live', url.origin).href;
}

async function checkProcessor({ name, endpoint, fetchImpl }) {
  const healthUrl = processorHealthUrl(endpoint);
  let response;
  try {
    response = await fetchImpl(healthUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'error',
    });
  } catch {
    throw new Error(`${name} health check failed.`);
  }
  if (!response?.ok) throw new Error(`${name} health check failed.`);
  return { name, healthUrl };
}

export async function verifyProcessors({ videoProcessorUrl, documentProcessorUrl, fetchImpl = fetch } = {}) {
  return [
    await checkProcessor({ name: 'Video processor', endpoint: videoProcessorUrl, fetchImpl }),
    await checkProcessor({ name: 'Document processor', endpoint: documentProcessorUrl, fetchImpl }),
  ];
}

async function main() {
  const results = await verifyProcessors({
    videoProcessorUrl: process.env.VIDEO_PROCESSOR_URL,
    documentProcessorUrl: process.env.DOCUMENT_PROCESSOR_URL,
  });
  for (const { name } of results) console.log(`${name}: healthy`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

import { transcriptFindings } from './pii.js';
import {
  createJob,
  createStoredJob,
  getConfiguration,
  jobRecordKey,
  serializeJobStatus,
  transitionJob,
  validateJobRequest,
  validateUploadMetadata,
} from './jobs.js';
import { introspectRenvoyIdentity } from './identity.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

const localJobs = new Map();

const findingSchema = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'category', 'title', 'detail', 'severity', 'confidence', 'recommendation'],
        properties: {
          id: { type: 'string' }, category: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, confidence: { type: 'number' }, recommendation: { type: 'string' },
        },
      },
    },
  },
};

export function createWorker({ identityFetcher = fetch } = {}) {
  return {
    async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (isRemoteRoute(url.pathname)) {
      const identity = await requireRenvoyIdentity(request, env, identityFetcher);
      if (identity instanceof Response) return identity;
      if (url.pathname === '/api/jobs/upload' && request.method === 'POST') return uploadDurableJob(request, env, identity);
      if (url.pathname === '/api/jobs' && request.method === 'POST') return createLocalJob(request, env, identity);
      if (request.method === 'GET' && url.pathname.startsWith('/api/jobs/')) return getJob(url, env, identity);
      if (url.pathname === '/api/document-cleaning' && request.method === 'POST') return documentCleaningProcessor(request, env, identity);
    }
    if (request.method !== 'POST' || url.pathname !== '/api/analyze') return json({ error: 'POST /api/analyze only' }, 404);
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY server secret is not configured.' }, 500);
    const form = await request.formData();
    const files = form.getAll('file').filter((file) => file instanceof File);
    if (!files.length) return json({ error: 'At least one media file is required.' }, 400);
    const findings = (await Promise.all(files.map((file) => analyzeMedia(file, env)))).flat();
    return json({ findings });
    },
    async queue(batch, env) {
      for (const message of batch.messages) await consumeQueuedJob(message, env);
    },
  };
}

export default createWorker();

async function createLocalJob(request, env, identity) {
  let input;
  try { input = await request.json(); }
  catch { return json({ error: 'Request body must be valid JSON.' }, 400); }

  const validation = validateJobRequest(input);
  if (!validation.valid) return json({ error: validation.error }, 400);

  const job = { ...createJob(validation.value), ownerAccountId: identity.accountId };
  localJobs.set(job.id, job);
  return json(serializeJobStatus(job, getConfiguration(env)), 202);
}

async function uploadDurableJob(request, env, identity) {
  const configuration = getConfiguration(env);
  if (!configuration.available) {
    return json({ error: { code: 'processing-unconfigured', message: 'Private storage and the processing queue must be configured before files can be uploaded.' } }, 503);
  }

  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'Upload body must be multipart form data.' }, 400); }

  const rawMetadata = form.get('metadata');
  const file = form.get('file');
  let metadata;
  try { metadata = JSON.parse(String(rawMetadata ?? '')); }
  catch { return json({ error: 'Upload metadata must be valid JSON.' }, 400); }

  const validation = validateUploadMetadata(metadata, file);
  if (!validation.valid) return json({ error: validation.error }, 400);

  const job = createStoredJob(validation.value, identity.accountId);
  const recordKey = jobRecordKey({ ownerAccountId: job.ownerAccountId, jobId: job.id });
  try {
    await env.MEDIA_BUCKET.put(job.input.key, file, { httpMetadata: { contentType: job.input.contentType } });
  } catch {
    return json({ error: { code: 'storage-unavailable', message: 'The private upload store is unavailable.' } }, 503);
  }

  try {
    await env.MEDIA_BUCKET.put(recordKey, JSON.stringify(job), { httpMetadata: { contentType: 'application/json' } });
  } catch {
    await safeDelete(env.MEDIA_BUCKET, job.input.key);
    return json({ error: { code: 'storage-unavailable', message: 'The private job store is unavailable.' } }, 503);
  }

  try {
    await env.JOBS_QUEUE.send({ version: 1, jobId: job.id, ownerAccountId: identity.accountId });
  } catch {
    await Promise.all([safeDelete(env.MEDIA_BUCKET, job.input.key), safeDelete(env.MEDIA_BUCKET, recordKey)]);
    return json({ error: { code: 'queue-unavailable', message: 'The processing queue is unavailable; the upload was not retained.' } }, 503);
  }

  return json(serializeJobStatus(job, configuration), 202);
}

async function documentCleaningProcessor(request, env) {
  let input;
  try { input = await request.json(); }
  catch { return json({ error: 'Request body must be valid JSON.' }, 400); }
  const validation = validateJobRequest(input);
  if (!validation.valid) return json({ error: validation.error }, 400);
  if (validation.value.kind !== 'document-cleaning') return json({ error: 'This route only accepts document-cleaning jobs.' }, 400);

  const configuration = getConfiguration(env);
  if (!configuration.available) {
    return json({ processor: { state: 'unconfigured', available: false, output: null, message: 'No document-cleaning processor is configured.' } }, 503);
  }
  return json({ processor: { state: 'queued', available: true, output: null, message: 'The configured processor has not returned a clean document yet.' } }, 202);
}

async function getJob(url, env, identity) {
  const id = url.pathname.slice('/api/jobs/'.length);
  if (!id || id.includes('/')) return json({ error: 'Job not found.' }, 404);
  if (env.MEDIA_BUCKET) {
    try {
      const stored = await readStoredJob(env.MEDIA_BUCKET, identity.accountId, id);
      if (stored) return json(serializeJobStatus(stored, getConfiguration(env)));
      return json({ error: 'Job not found.' }, 404);
    } catch {
      return json({ error: { code: 'storage-unavailable', message: 'The private job store is unavailable.' } }, 503);
    }
  }
  const job = localJobs.get(id);
  if (!job) return json({ error: 'Job not found.' }, 404);
  if (job.ownerAccountId !== identity.accountId) return json({ error: 'Job not found.' }, 404);
  return json(serializeJobStatus(job, getConfiguration(env)));
}

function isRemoteRoute(pathname) {
  return pathname === '/api/jobs'
    || pathname.startsWith('/api/jobs/')
    || pathname === '/api/document-cleaning'
    || pathname === '/api/share'
    || pathname.startsWith('/api/share/');
}

async function safeDelete(bucket, key) {
  try { await bucket.delete(key); } catch { /* Preserve the primary request error without leaking object details. */ }
}

async function consumeQueuedJob(message, env) {
  const body = message?.body;
  if (!body || body.version !== 1 || typeof body.jobId !== 'string' || typeof body.ownerAccountId !== 'string') {
    message.ack();
    return;
  }
  try {
    const job = await readStoredJob(env.MEDIA_BUCKET, body.ownerAccountId, body.jobId);
    if (!job || job.state !== 'queued') {
      message.ack();
      return;
    }
    const processing = transitionJob(job, 'processing');
    await writeStoredJob(env.MEDIA_BUCKET, processing);
    const failed = {
      ...transitionJob(processing, 'failed'),
      output: null,
      failure: {
        code: 'processor-unavailable',
        message: 'No media processor is configured for this job.',
      },
    };
    await writeStoredJob(env.MEDIA_BUCKET, failed);
    message.ack();
  } catch {
    if (typeof message.retry === 'function') message.retry();
    else throw new Error('Queued job could not be processed.');
  }
}

async function readStoredJob(bucket, ownerAccountId, jobId) {
  const object = await bucket.get(jobRecordKey({ ownerAccountId, jobId }));
  if (!object) return null;
  const job = await object.json();
  if (!job || job.ownerAccountId !== ownerAccountId || job.id !== jobId) return null;
  return job;
}

function writeStoredJob(bucket, job) {
  return bucket.put(jobRecordKey({ ownerAccountId: job.ownerAccountId, jobId: job.id }), JSON.stringify(job), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function requireRenvoyIdentity(request, env, fetcher) {
  const result = await introspectRenvoyIdentity(request.headers, env, fetcher);
  if (result.state === 'authenticated') return result.principal;
  if (result.state === 'unconfigured') return json({ error: { code: 'identity-unconfigured', message: 'Renvoy identity verification is not configured.' } }, 503);
  if (result.state === 'unavailable') return json({ error: { code: 'identity-unavailable', message: 'Renvoy identity verification is temporarily unavailable.' } }, 503);
  return json({ error: { code: 'unauthorized', message: 'A valid Renvoy identity is required.' } }, 401);
}

async function analyzeMedia(file, env) {
  if (file.type.startsWith('audio/')) return transcribeAudio(file, env);
  if (file.type.startsWith('video/')) return [unavailable('cloud-video-frame-required', 'Send sampled image frames from the video to this vision endpoint, or configure a dedicated cloud video endpoint.')];
  if (!file.type.startsWith('image/')) return [unavailable('cloud-media-boundary', 'This endpoint accepts image files, audio transcription, or sampled video image frames.')];
  return analyzeImage(file, env);
}

async function analyzeImage(file, env) {
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Analyze this user-provided image only for shareable privacy risks: visible addresses, email addresses, phone numbers, QR/barcodes, identity documents, and sensitive personal data. Do not identify people or infer location.' }, { type: 'input_image', image_url: `data:${file.type};base64,${base64}` }] }],
      text: { format: { type: 'json_schema', name: 'privacy_findings', strict: true, schema: findingSchema } },
    }),
  });
  if (!upstream.ok) return [unavailable('cloud-vision-failed', 'Vision provider request failed; local findings were retained.')];
  const response = await upstream.json();
  try { return JSON.parse(response.output_text).findings || []; }
  catch { return [unavailable('cloud-vision-unreadable', 'Vision provider returned an unreadable structured response.')]; }
}

async function transcribeAudio(file, env) {
  const body = new FormData();
  body.append('file', file, file.name || 'audio');
  body.append('model', 'gpt-4o-mini-transcribe');
  const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body });
  if (!upstream.ok) return [unavailable('cloud-transcription-failed', 'Audio transcription provider request failed; local findings were retained.')];
  const payload = await upstream.json();
  return transcriptFindings(payload.text || '');
}

function unavailable(id, detail) { return { id, category: 'capability', title: 'Cloud media boundary', detail, severity: 'low', confidence: 1, recommendation: 'Use a provider path configured for this media type.', assessment: 'unavailable', resolved: false }; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
function bytesToBase64(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }

import { transcriptFindings } from './pii.js';
import {
  createJob,
  createStoredJob,
  documentOutputObjectKey,
  getConfiguration,
  jobRecordKey,
  outputObjectKey,
  serializeJobStatus,
  transitionJob,
  validateJobRequest,
  validateUploadMetadata,
} from './jobs.js';
import { introspectRenvoyIdentity } from './identity.js';
import {
  isAccountId,
  isExpired,
  ownerManifestKey,
  parseShareRequest,
  publicShare,
  recipientIndex,
  recipientIndexKey,
} from './shares.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, GET, POST, OPTIONS',
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

export function createWorker({ identityFetcher = fetch, processorFetcher = fetch } = {}) {
  return {
    async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (isRemoteRoute(url.pathname)) {
      const identity = await requireRenvoyIdentity(request, env, identityFetcher);
      if (identity instanceof Response) return identity;
      if (url.pathname === '/api/jobs/upload' && request.method === 'POST') return uploadDurableJob(request, env, identity);
      if (url.pathname === '/api/jobs' && request.method === 'POST') return createLocalJob(request, env, identity);
      if (url.pathname === '/api/shares' && request.method === 'POST') return createHostedShare(request, env, identity);
      const shareMatch = /^\/api\/shares\/(share_[A-Za-z0-9_-]{8,128})$/.exec(url.pathname);
      if (shareMatch && request.method === 'GET') return downloadHostedShare(shareMatch[1], env, identity);
      if (shareMatch && request.method === 'DELETE') return revokeHostedShare(shareMatch[1], env, identity);
      const outputMatch = /^\/api\/jobs\/([A-Za-z0-9_-]{1,128})\/output$/.exec(url.pathname);
      if (outputMatch && request.method === 'GET') return downloadJobOutput(outputMatch[1], env, identity);
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
      for (const message of batch.messages) await consumeQueuedJob(message, env, processorFetcher);
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

async function downloadJobOutput(jobId, env, identity) {
  if (!env.MEDIA_BUCKET) return json({ error: 'Job output not found.' }, 404);
  try {
    const job = await readStoredJob(env.MEDIA_BUCKET, identity.accountId, jobId);
    if (!job?.output || job.state !== 'complete') return json({ error: 'Job output not found.' }, 404);
    const expectedKey = job.kind === 'document-cleaning'
      ? documentOutputObjectKey({ ownerAccountId: identity.accountId, jobId, documentType: job.documentType })
      : outputObjectKey({ ownerAccountId: identity.accountId, jobId });
    if (job.output.key !== expectedKey) return json({ error: 'Job output not found.' }, 404);
    const output = await env.MEDIA_BUCKET.get(expectedKey);
    if (!output?.body) return json({ error: 'Job output not found.' }, 404);
    const contentType = job.kind === 'document-cleaning'
      ? safeDocumentContentType(job.output.contentType, job.documentType)
      : output.httpMetadata?.contentType === 'video/mp4' ? 'video/mp4' : 'application/octet-stream';
    return new Response(output.body, {
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${job.kind === 'document-cleaning' ? job.documentType === 'pdf' ? 'renitized-document.pdf' : 'renitized-document.office' : 'renitized-video.mp4'}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return json({ error: { code: 'storage-unavailable', message: 'The private output store is unavailable.' } }, 503);
  }
}

function isRemoteRoute(pathname) {
  return pathname === '/api/jobs'
    || pathname.startsWith('/api/jobs/')
    || pathname === '/api/document-cleaning'
    || pathname === '/api/share'
    || pathname.startsWith('/api/share/')
    || pathname === '/api/shares'
    || pathname.startsWith('/api/shares/');
}

async function createHostedShare(request, env, identity) {
  if (!env.MEDIA_BUCKET) return json({ error: { code: 'share-unconfigured', message: 'Private encrypted sharing storage is not configured.' } }, 503);
  let form;
  try { form = await request.formData(); }
  catch { return json({ error: 'Share uploads must use multipart form data.' }, 400); }
  const parsed = parseShareRequest(form, identity.accountId);
  if (!parsed.valid) return json({ error: parsed.error }, 400);
  const { encryptedPackage, ...share } = parsed.value;
  const manifestKey = ownerManifestKey({ ownerAccountId: share.ownerAccountId, shareId: share.id });
  const indexKey = recipientIndexKey({ recipientAccountId: share.recipientAccountId, shareId: share.id });
  try {
    await env.MEDIA_BUCKET.put(share.packageKey, encryptedPackage, { httpMetadata: { contentType: 'application/octet-stream' } });
    await env.MEDIA_BUCKET.put(manifestKey, JSON.stringify(share), { httpMetadata: { contentType: 'application/json' } });
    await env.MEDIA_BUCKET.put(indexKey, JSON.stringify(recipientIndex(share)), { httpMetadata: { contentType: 'application/json' } });
  } catch {
    await Promise.all([safeDelete(env.MEDIA_BUCKET, share.packageKey), safeDelete(env.MEDIA_BUCKET, manifestKey), safeDelete(env.MEDIA_BUCKET, indexKey)]);
    return json({ error: { code: 'storage-unavailable', message: 'The encrypted share could not be saved.' } }, 503);
  }
  return json({ share: publicShare(share) }, 201);
}

async function downloadHostedShare(shareId, env, identity) {
  if (!env.MEDIA_BUCKET) return json({ error: 'Encrypted share not found.' }, 404);
  try {
    const share = await findShareForAccount(env.MEDIA_BUCKET, identity.accountId, shareId);
    if (!share) return json({ error: 'Encrypted share not found.' }, 404);
    if (isExpired(share)) {
      await removeShare(env.MEDIA_BUCKET, share);
      return json({ error: { code: 'share-expired', message: 'This encrypted share has expired.' } }, 410);
    }
    const encryptedPackage = await env.MEDIA_BUCKET.get(share.packageKey);
    if (!encryptedPackage?.body) return json({ error: 'Encrypted share not found.' }, 404);
    return new Response(encryptedPackage.body, {
      headers: {
        ...cors,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="renitizer-encrypted-package.renitizer"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return json({ error: { code: 'storage-unavailable', message: 'The encrypted share store is unavailable.' } }, 503);
  }
}

async function revokeHostedShare(shareId, env, identity) {
  if (!env.MEDIA_BUCKET) return json({ error: 'Encrypted share not found.' }, 404);
  try {
    const object = await env.MEDIA_BUCKET.get(ownerManifestKey({ ownerAccountId: identity.accountId, shareId }));
    if (!object) return json({ error: 'Encrypted share not found.' }, 404);
    const share = await object.json();
    if (!isValidShare(share, shareId) || share.ownerAccountId !== identity.accountId) return json({ error: 'Encrypted share not found.' }, 404);
    await removeShare(env.MEDIA_BUCKET, share);
    return new Response(null, { status: 204, headers: cors });
  } catch {
    return json({ error: { code: 'storage-unavailable', message: 'The encrypted share store is unavailable.' } }, 503);
  }
}

async function findShareForAccount(bucket, accountId, shareId) {
  const owned = await bucket.get(ownerManifestKey({ ownerAccountId: accountId, shareId }));
  if (owned) {
    const share = await owned.json();
    return isValidShare(share, shareId) && share.ownerAccountId === accountId ? share : null;
  }
  const index = await bucket.get(recipientIndexKey({ recipientAccountId: accountId, shareId }));
  if (!index) return null;
  const recipient = await index.json();
  if (!isAccountId(recipient?.ownerAccountId)) return null;
  const manifest = await bucket.get(ownerManifestKey({ ownerAccountId: recipient.ownerAccountId, shareId }));
  if (!manifest) return null;
  const share = await manifest.json();
  return isValidShare(share, shareId) && share.recipientAccountId === accountId ? share : null;
}

function isValidShare(share, shareId) {
  return share && share.id === shareId && isAccountId(share.ownerAccountId) && isAccountId(share.recipientAccountId)
    && typeof share.packageKey === 'string' && typeof share.expiresAt === 'string' && Number.isFinite(Date.parse(share.expiresAt));
}

async function removeShare(bucket, share) {
  await Promise.all([
    safeDelete(bucket, share.packageKey),
    safeDelete(bucket, ownerManifestKey({ ownerAccountId: share.ownerAccountId, shareId: share.id })),
    safeDelete(bucket, recipientIndexKey({ recipientAccountId: share.recipientAccountId, shareId: share.id })),
  ]);
}

async function safeDelete(bucket, key) {
  try { await bucket.delete(key); } catch { /* Preserve the primary request error without leaking object details. */ }
}

async function consumeQueuedJob(message, env, processorFetcher) {
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
    if (processing.kind === 'video-redaction' && env.PROCESSOR_URL && env.PROCESSOR_AUTH_TOKEN) {
      try {
        const complete = await renderVideoJob(processing, env, processorFetcher);
        await writeStoredJob(env.MEDIA_BUCKET, complete);
        message.ack();
        return;
      } catch {
        const failed = processorFailure(processing, 'processor-failed', 'The video processor could not produce a clean video.');
        await writeStoredJob(env.MEDIA_BUCKET, failed);
        message.ack();
        return;
      }
    }
    if (processing.kind === 'document-cleaning' && env.DOCUMENT_PROCESSOR_URL && env.PROCESSOR_AUTH_TOKEN) {
      try {
        const complete = await renderDocumentJob(processing, env, processorFetcher);
        await writeStoredJob(env.MEDIA_BUCKET, complete);
        message.ack();
        return;
      } catch {
        const failed = processorFailure(processing, 'processor-failed', 'The document processor could not produce a clean document.');
        await writeStoredJob(env.MEDIA_BUCKET, failed);
        message.ack();
        return;
      }
    }
    const failed = processorFailure(processing, 'processor-unavailable', 'No media processor is configured for this job.');
    await writeStoredJob(env.MEDIA_BUCKET, failed);
    message.ack();
  } catch {
    if (typeof message.retry === 'function') message.retry();
    else throw new Error('Queued job could not be processed.');
  }
}

async function renderVideoJob(job, env, processorFetcher) {
  const input = await env.MEDIA_BUCKET.get(job.input.key);
  if (!input?.body) throw new Error('Video input is unavailable.');
  const response = await processorFetcher(env.PROCESSOR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PROCESSOR_AUTH_TOKEN}`,
      'Content-Type': job.input.contentType,
      'X-Renitizer-Video-Tracks': encodeTracks(job.redactions),
    },
    body: input.body,
  });
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0].toLowerCase();
  if (!response.ok || !response.body || contentType !== 'video/mp4') throw new Error('Video renderer response is invalid.');
  const key = outputObjectKey({ ownerAccountId: job.ownerAccountId, jobId: job.id });
  await env.MEDIA_BUCKET.put(key, response.body, { httpMetadata: { contentType } });
  return {
    ...transitionJob(job, 'complete'),
    output: { key, contentType },
    failure: null,
  };
}

async function renderDocumentJob(job, env, processorFetcher) {
  const input = await env.MEDIA_BUCKET.get(job.input.key);
  if (!input?.body) throw new Error('Document input is unavailable.');
  const response = await processorFetcher(env.DOCUMENT_PROCESSOR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.PROCESSOR_AUTH_TOKEN}`,
      'Content-Type': job.input.contentType,
      'X-Renitizer-Document-Type': job.documentType,
    },
    body: input.body,
  });
  const responseType = response.headers.get('Content-Type')?.split(';', 1)[0].toLowerCase();
  const reportedType = response.headers.get('X-Renitizer-Document-Type');
  const validResponse = job.documentType === 'pdf' ? responseType === 'application/pdf' : responseType === 'application/octet-stream';
  if (!response.ok || !response.body || reportedType !== job.documentType || !validResponse) throw new Error('Document processor response is invalid.');
  const key = documentOutputObjectKey({ ownerAccountId: job.ownerAccountId, jobId: job.id, documentType: job.documentType });
  const contentType = safeDocumentContentType(job.input.contentType, job.documentType);
  await env.MEDIA_BUCKET.put(key, response.body, { httpMetadata: { contentType } });
  return {
    ...transitionJob(job, 'complete'),
    output: { key, contentType },
    failure: null,
  };
}

function processorFailure(job, code, message) {
  return {
    ...transitionJob(job, 'failed'),
    output: null,
    failure: { code, message },
  };
}

function safeDocumentContentType(value, documentType) {
  if (documentType === 'pdf') return 'application/pdf';
  return /^application\/(?:msword|vnd\.(?:openxmlformats-officedocument|ms-excel|ms-powerpoint)\.)/.test(value ?? '') ? value : 'application/octet-stream';
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

function encodeTracks(tracks) {
  const bytes = new TextEncoder().encode(JSON.stringify(tracks));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
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
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'Analyze this user-provided image only for shareable privacy risks: visible addresses, email addresses, phone numbers, QR/barcodes, identity documents, screens, vehicle plates, and location clues such as readable signs, maps, recognizable landmarks, route displays, or dashboard GPS. Report the visible clue and its privacy risk; do not identify people or state a precise location as fact.' }, { type: 'input_image', image_url: `data:${file.type};base64,${base64}` }] }],
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

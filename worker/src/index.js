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

const visualFindingCategories = [
  'face', 'address', 'email', 'phone', 'qr', 'barcode', 'id-card', 'screen',
  'vehicle-plate', 'street-sign', 'map', 'landmark', 'route-display', 'dashboard-gps', 'location-clue',
  'reflection', 'tattoo', 'birthmark', 'school-uniform', 'company-logo', 'passport', 'bank-card',
  'mail-label', 'shipping-label', 'key', 'wifi-ssid', 'calendar-event', 'watch-display', 'boarding-pass',
];

const audioContextCategories = ['location-announcement', 'place-mention', 'company-mention', 'school-mention', 'name-mention'];
const MAX_CONCURRENT_ANALYSES = 4;
const audioContextDefinitions = {
  'location-announcement': {
    title: 'Location announcement in audio', detail: 'An announcement may reveal a station, airport, road, or other location.', severity: 'high',
  },
  'place-mention': {
    title: 'Place name in audio', detail: 'A spoken place name may reveal where this was recorded or connected to.', severity: 'high',
  },
  'company-mention': {
    title: 'Organisation name in audio', detail: 'A spoken organisation name may reveal a workplace, school, or other connection.', severity: 'medium',
  },
  'school-mention': {
    title: 'School detail in audio', detail: 'A spoken school detail may identify a child or a location.', severity: 'high',
  },
  'name-mention': {
    title: 'Name mentioned in audio', detail: 'A spoken name may identify someone connected to this recording.', severity: 'medium',
  },
};

const findingSchema = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'category', 'title', 'detail', 'severity', 'confidence', 'recommendation', 'boundingBox'],
        properties: {
          id: { type: 'string' }, category: { type: 'string', enum: visualFindingCategories }, title: { type: 'string' }, detail: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, confidence: { type: 'number' }, recommendation: { type: 'string' },
          boundingBox: {
            type: ['object', 'null'], additionalProperties: false, required: ['x', 'y', 'width', 'height'],
            properties: {
              x: { type: 'number', minimum: 0, maximum: 1 }, y: { type: 'number', minimum: 0, maximum: 1 },
              width: { type: 'number', minimum: 0, maximum: 1 }, height: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
        },
      },
    },
  },
};

const audioContextSchema = {
  type: 'object', additionalProperties: false, required: ['risks'],
  properties: {
    risks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['category', 'startWord', 'endWord', 'confidence'],
        properties: {
          category: { type: 'string', enum: audioContextCategories },
          startWord: { type: 'integer', minimum: 0 }, endWord: { type: 'integer', minimum: 0 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

export function createWorker({ identityFetcher = fetch, processorFetcher = fetch, analysisFetcher = fetch } = {}) {
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
    const frameContexts = parseFrameContexts(form.get('frameContext'), files.length);
    const findings = (await mapWithConcurrency(files, MAX_CONCURRENT_ANALYSES, (file, index) => analyzeMedia(file, env, frameContexts[index], analysisFetcher))).flat();
    const analyses = parseAnalyses(form.get('analyses'));
    const osint = analyses.includes('clean-copy-osint')
      ? await runGoogleVisionChecks(files.filter((file) => file.type.startsWith('image/')), env, analysisFetcher)
      : null;
    return json({ findings: [...findings, ...(osint?.findings || [])], ...(osint ? { providerChecks: osint.providerChecks } : {}) });
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
    const outputDocumentType = job.kind === 'document-cleaning'
      ? documentOutputType(job.output.documentType, job.documentType)
      : null;
    const contentType = job.kind === 'document-cleaning'
      ? safeDocumentContentType(job.output.contentType, outputDocumentType)
      : output.httpMetadata?.contentType === 'video/mp4' ? 'video/mp4' : 'application/octet-stream';
    return new Response(output.body, {
      headers: {
        ...cors,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${job.kind === 'document-cleaning' ? outputDocumentType === 'pdf' ? 'renitized-document.pdf' : 'renitized-document.office' : 'renitized-video.mp4'}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return json({ error: { code: 'storage-unavailable', message: 'The private output store is unavailable.' } }, 503);
  }
}

function isRemoteRoute(pathname) {
  return pathname === '/api/analyze'
    || pathname === '/api/jobs'
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
      'X-Renitizer-Document-Extension': documentInputExtension(job.input.key),
      ...(job.documentSelection === 'explicit' ? { 'X-Renitizer-Requested-Actions': JSON.stringify(job.requestedActions || []) } : {}),
    },
    body: input.body,
  });
  const responseType = response.headers.get('Content-Type')?.split(';', 1)[0].toLowerCase();
  const outputDocumentType = documentOutputType(response.headers.get('X-Renitizer-Document-Type'), null);
  const removedCategories = processorRemovedCategories(response.headers.get('X-Renitizer-Removed-Categories'));
  const validResponse = outputDocumentType === 'pdf' ? responseType === 'application/pdf' : outputDocumentType === 'office' && responseType === 'application/octet-stream';
  if (!response.ok || !response.body || !outputDocumentType || !validResponse) throw new Error('Document processor response is invalid.');
  const key = documentOutputObjectKey({ ownerAccountId: job.ownerAccountId, jobId: job.id, documentType: job.documentType });
  const contentType = safeDocumentContentType(responseType, outputDocumentType);
  await env.MEDIA_BUCKET.put(key, response.body, { httpMetadata: { contentType } });
  return {
    ...transitionJob(job, 'complete'),
    output: { key, contentType, documentType: outputDocumentType, ...(removedCategories.length ? { removedCategories } : {}) },
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
  return /^application\/(?:msword|vnd\.(?:openxmlformats-officedocument|ms-word|ms-excel|ms-powerpoint)\.)/.test(value ?? '') ? value : 'application/octet-stream';
}

function documentOutputType(value, fallback) {
  return value === 'pdf' || value === 'office' ? value : fallback === 'pdf' || fallback === 'office' ? fallback : null;
}

function documentInputExtension(key) {
  const match = /\.([a-z0-9]{1,12})$/i.exec(String(key || ''));
  return match ? match[1].toLowerCase() : 'bin';
}

function processorRemovedCategories(value) {
  const allowed = new Set(['metadata', 'comment', 'revision', 'hidden-object', 'signature', 'thumbnail', 'font']);
  return [...new Set(String(value || '').split(',').map((category) => category.trim()).filter((category) => allowed.has(category)))];
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

async function analyzeMedia(file, env, frameContext = null, analysisFetcher = fetch) {
  if (file.type.startsWith('audio/')) return transcribeAudio(file, env, analysisFetcher);
  if (file.type.startsWith('video/')) return [unavailable('cloud-video-frame-required', 'Send sampled image frames from the video to this vision endpoint, or configure a dedicated cloud video endpoint.')];
  if (!file.type.startsWith('image/')) return [unavailable('cloud-media-boundary', 'This endpoint accepts image files, audio transcription, or sampled video image frames.')];
  return analyzeImage(file, env, frameContext, analysisFetcher);
}

async function analyzeImage(file, env, frameContext = null, analysisFetcher = fetch) {
  const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const upstream = await analysisFetcher('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildImageVisionRequest(`data:${file.type};base64,${base64}`)),
  });
  if (!upstream.ok) return [unavailable('cloud-vision-failed', 'Vision provider request failed; local findings were retained.')];
  const response = await upstream.json();
  try { return attachFrameTiming(JSON.parse(response.output_text).findings || [], frameContext); }
  catch { return [unavailable('cloud-vision-unreadable', 'Vision provider returned an unreadable structured response.')]; }
}

export function parseFrameContexts(value, fileCount) {
  const empty = Array.from({ length: Number.isSafeInteger(fileCount) && fileCount > 0 ? fileCount : 0 }, () => null);
  if (typeof value !== 'string' || value.length > 4096) return empty;
  let parsed;
  try { parsed = JSON.parse(value); }
  catch { return empty; }
  if (!Array.isArray(parsed) || parsed.length !== empty.length) return empty;
  return parsed.map((context) => {
    const time = Number(context?.time);
    const duration = Number(context?.duration);
    return Number.isFinite(time) && Number.isFinite(duration) && duration > 0 && time >= 0 && time <= duration
      ? { time, duration }
      : null;
  });
}

export function attachFrameTiming(findings, context) {
  if (!Array.isArray(findings) || !context) return findings;
  const time = Number(context.time);
  const duration = Number(context.duration);
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0 || time < 0 || time > duration) return findings;
  const timeRange = { start: Math.max(0, time - 1), end: Math.min(duration, time + 1) };
  return findings.map((finding) => finding?.boundingBox
    ? { ...finding, timeRange, redactionAction: finding.redactionAction || 'keep' }
    : finding);
}

export function buildImageVisionRequest(imageUrl) {
  return {
    model: 'gpt-4.1-mini',
    input: [{ role: 'user', content: [{ type: 'input_text', text: `Analyze this user-provided image only for shareable privacy risks. Use only these categories: ${visualFindingCategories.join(', ')}. Treat faces as privacy risks without identifying anyone. Report a visible clue and its privacy risk; do not identify people or state a precise location as fact. This is a visual privacy check, not a reverse-image, identity, or location match. For each visual risk with a clearly identifiable region, include one normalized bounding box using fractional x, y, width, and height values between 0 and 1. Set boundingBox to null when you cannot locate the region confidently.` }, { type: 'input_image', image_url: imageUrl }] }],
    text: { format: { type: 'json_schema', name: 'privacy_findings', strict: true, schema: findingSchema } },
  };
}

export function buildGoogleVisionRequest(base64Image) {
  return {
    requests: [{
      image: { content: String(base64Image || '') },
      features: [
        { type: 'LANDMARK_DETECTION', maxResults: 5 },
        { type: 'WEB_DETECTION', maxResults: 5 },
      ],
    }],
  };
}

export function googleVisionPrivacyFindings(payload = {}) {
  const response = Array.isArray(payload.responses) ? payload.responses[0] : null;
  if (!response || response.error) return [];
  const landmark = Array.isArray(response.landmarkAnnotations) ? response.landmarkAnnotations[0] : null;
  const web = response.webDetection && typeof response.webDetection === 'object' ? response.webDetection : null;
  const hasWebMatch = Boolean(web && [web.fullMatchingImages, web.partialMatchingImages, web.pagesWithMatchingImages].some((items) => Array.isArray(items) && items.length));
  const findings = [];
  if (landmark) findings.push({
    id: 'osint-landmark', category: 'landmark', title: 'A recognizable landmark may still be visible',
    detail: 'A configured clean-copy check found a landmark clue.', severity: 'high', confidence: boundedConfidence(landmark.score),
    recommendation: 'Review the landmark before sharing.', assessment: 'assessed', source: 'osint',
  });
  if (hasWebMatch) findings.push({
    id: 'osint-web-match', category: 'reverse-image', title: 'A web match may still be possible',
    detail: 'A configured clean-copy check found matching-image signals.', severity: 'high', confidence: 0.9,
    recommendation: 'Review the clean copy before sharing.', assessment: 'assessed', source: 'osint',
  });
  return findings;
}

async function runGoogleVisionChecks(files, env, analysisFetcher) {
  if (!env.GOOGLE_CLOUD_VISION_API_KEY || !files.length) return { findings: [], providerChecks: { faceLandmarks: false, reverseImage: false } };
  const results = await mapWithConcurrency(files, MAX_CONCURRENT_ANALYSES, async (file) => {
    const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    const upstream = await analysisFetcher(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(env.GOOGLE_CLOUD_VISION_API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildGoogleVisionRequest(base64)),
    });
    if (!upstream.ok) return { ok: false, findings: [unavailable('cloud-osint-failed', 'The optional web-match and landmark check could not finish.')] };
    const payload = await upstream.json();
    const response = Array.isArray(payload?.responses) ? payload.responses[0] : null;
    if (!response || response.error) return { ok: false, findings: [unavailable('cloud-osint-unreadable', 'The optional web-match and landmark check did not return a usable result.')] };
    return { ok: true, findings: googleVisionPrivacyFindings(payload) };
  });
  return {
    findings: results.flatMap((result) => result.findings),
    providerChecks: { faceLandmarks: results.every((result) => result.ok), reverseImage: results.every((result) => result.ok) },
  };
}

async function mapWithConcurrency(items, maximum, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, maximum), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function transcribeAudio(file, env, analysisFetcher = fetch) {
  const body = buildTimestampedTranscriptionBody(file);
  const upstream = await analysisFetcher('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body });
  if (!upstream.ok) return [unavailable('cloud-transcription-failed', 'Audio transcription provider request failed; local findings were retained.')];
  const payload = await upstream.json();
  const localFindings = transcriptFindings(payload.text || '', payload.words);
  const contextFindings = await analyzeAudioContext(payload.words, env, analysisFetcher);
  return [...localFindings, ...contextFindings];
}

export function buildTimestampedTranscriptionBody(file) {
  const body = new FormData();
  body.append('file', file, file.name || 'audio');
  body.append('model', 'whisper-1');
  body.append('response_format', 'verbose_json');
  body.append('timestamp_granularities[]', 'word');
  return body;
}

async function analyzeAudioContext(words, env, analysisFetcher) {
  const timestampedWords = normalizedTimestampedWords(words);
  if (!timestampedWords.length) return [unavailable('cloud-audio-context-timestamps-unavailable', 'The extra audio context check needs word timestamps before it can suggest a safe mute or bleep range.')];
  const findings = [];
  for (const { words: wordWindow, offset } of audioContextWindows(timestampedWords)) {
    const upstream = await analysisFetcher('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAudioContextRequest(wordWindow)),
    });
    if (!upstream.ok) return [...findings, unavailable('cloud-audio-context-failed', 'The extra audio context check could not finish. Review the audio before sharing.')];
    const response = await upstream.json();
    try { findings.push(...audioContextFindings(JSON.parse(response.output_text).risks, wordWindow, offset)); }
    catch { return [...findings, unavailable('cloud-audio-context-unreadable', 'The extra audio context check did not return a usable result. Review the audio before sharing.')]; }
  }
  return findings;
}

export function buildAudioContextRequest(words = []) {
  const indexedWords = words.map((word, index) => `${index}: ${word.text}`).join('\n');
  return {
    model: 'gpt-4.1-mini',
    input: [{ role: 'user', content: [{ type: 'input_text', text: `Review these numbered words from one user-provided audio transcript for shareable privacy risks that simple email, phone, and address patterns can miss. Only use these categories: ${audioContextCategories.join(', ')}. Identify a risk only when the words give meaningful context, such as a station or airport announcement, a place name, a company, a school, or a person's name. Do not identify people, infer a precise location, quote any words, or report private values. Return the inclusive startWord and endWord indices for each risk so the person can mute or bleep that exact time range. Return no risk when uncertain.\n\nWords:\n${indexedWords}` }] }],
    text: { format: { type: 'json_schema', name: 'audio_context_risks', strict: true, schema: audioContextSchema } },
  };
}

export function audioContextFindings(risks, words, wordOffset = 0) {
  if (!Array.isArray(risks) || !Array.isArray(words)) return [];
  return risks.flatMap((risk) => {
    const category = String(risk?.category || '');
    const definition = audioContextDefinitions[category];
    const startWord = Number(risk?.startWord);
    const endWord = Number(risk?.endWord);
    if (!definition || !Number.isInteger(startWord) || !Number.isInteger(endWord) || startWord < 0 || endWord < startWord || endWord >= words.length) return [];
    const start = Number(words[startWord]?.start);
    const end = Number(words[endWord]?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return [{
      id: `audio-context-${category}-${wordOffset + startWord}-${wordOffset + endWord}`, category, ...definition,
      confidence: boundedConfidence(risk.confidence), recommendation: 'Trim, mute, or replace this spoken detail before sharing.',
      assessment: 'assessed', resolved: false, timeRange: { start, end }, redactionAction: 'keep',
    }];
  });
}

function normalizedTimestampedWords(words) {
  if (!Array.isArray(words)) return [];
  return words.flatMap((word) => {
    const text = String(word?.word ?? word?.text ?? '').trim();
    const start = Number(word?.start);
    const end = Number(word?.end);
    return text && Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ text, start, end }] : [];
  });
}

function audioContextWindows(words) {
  const windows = [];
  for (let offset = 0; offset < words.length; offset += 600) windows.push({ words: words.slice(offset, offset + 600), offset });
  return windows;
}

function unavailable(id, detail) { return { id, category: 'capability', title: 'Cloud media boundary', detail, severity: 'low', confidence: 1, recommendation: 'Use a provider path configured for this media type.', assessment: 'unavailable', resolved: false }; }
function json(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
function bytesToBase64(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function boundedConfidence(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function parseAnalyses(value) { try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.length <= 64) : []; } catch { return []; } }

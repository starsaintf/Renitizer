export const JOB_STATES = ['queued', 'processing', 'complete', 'failed'];
export const MEDIA_KINDS = ['image', 'video', 'audio', 'document'];

const METADATA_FIELDS = new Set(['mediaKind', 'fileName', 'mimeType', 'sizeBytes']);
const RAW_CONTENT_FIELDS = new Set(['content', 'file', 'data', 'base64', 'bytes', 'raw', 'body']);
const ALLOWED_TRANSITIONS = {
  queued: ['processing', 'failed'],
  processing: ['complete', 'failed'],
  complete: [],
  failed: [],
};

export function isJobState(value) { return JOB_STATES.includes(value); }

export function transitionJob(job, nextState, now = () => new Date().toISOString()) {
  if (!isJobState(nextState)) throw new Error(`Unknown job state: ${nextState}`);
  if (!ALLOWED_TRANSITIONS[job.state]?.includes(nextState)) {
    throw new Error(`Invalid job state transition: ${job.state} -> ${nextState}`);
  }
  return { ...job, state: nextState, updatedAt: now() };
}

export function validateJobRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('Request body must be a JSON object.');

  const errors = [];
  const keys = Object.keys(input);
  const rawFields = keys.filter((key) => RAW_CONTENT_FIELDS.has(key.toLowerCase()));
  if (rawFields.length) errors.push(`Raw file content is not allowed (${rawFields.join(', ')}).`);

  const unsupportedFields = keys.filter((key) => !METADATA_FIELDS.has(key));
  if (unsupportedFields.length) errors.push(`Unsupported metadata fields: ${unsupportedFields.join(', ')}.`);

  if (!MEDIA_KINDS.includes(input.mediaKind)) errors.push(`mediaKind must be one of: ${MEDIA_KINDS.join(', ')}.`);
  if (input.fileName !== undefined && (!isString(input.fileName) || !input.fileName.trim() || input.fileName.length > 255)) {
    errors.push('fileName must be a non-empty string of 255 characters or fewer.');
  }
  if (input.mimeType !== undefined && (!isString(input.mimeType) || !input.mimeType.trim() || input.mimeType.length > 255)) {
    errors.push('mimeType must be a non-empty string of 255 characters or fewer.');
  }
  if (input.sizeBytes !== undefined && (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0)) {
    errors.push('sizeBytes must be a non-negative safe integer.');
  }

  if (errors.length) return invalid(errors.join(' '));
  return {
    valid: true,
    value: {
      mediaKind: input.mediaKind,
      fileName: input.fileName?.trim() || null,
      mimeType: input.mimeType?.trim() || null,
      sizeBytes: input.sizeBytes ?? null,
    },
  };
}

export function createJob(metadata, createId = defaultId, now = () => new Date().toISOString()) {
  const timestamp = now();
  return {
    id: createId(),
    state: 'queued',
    mediaKind: metadata.mediaKind,
    fileName: metadata.fileName ?? null,
    mimeType: metadata.mimeType ?? null,
    sizeBytes: metadata.sizeBytes ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getConfiguration(env) {
  const missingBindings = [];
  if (!env.MEDIA_BUCKET) missingBindings.push('MEDIA_BUCKET');
  if (!env.JOBS_QUEUE) missingBindings.push('JOBS_QUEUE');
  return {
    state: missingBindings.length ? 'unconfigured' : 'configured',
    available: missingBindings.length === 0,
    missingBindings,
  };
}

export function serializeJobStatus(job, configuration) {
  return {
    job: {
      id: job.id,
      state: job.state,
      mediaKind: job.mediaKind,
      fileName: job.fileName,
      mimeType: job.mimeType,
      sizeBytes: job.sizeBytes,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    },
    processing: configuration,
  };
}

function invalid(error) { return { valid: false, error }; }
function isString(value) { return typeof value === 'string'; }
function defaultId() { return crypto.randomUUID(); }

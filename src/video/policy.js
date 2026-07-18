import { clampNormalizedBox } from '../sanitize/redaction.js';

const ACTIONS = new Set(['blur', 'cover']);

export function normalizeTrackedVideoBoxes({ duration, tracks = [] } = {}) {
  const boundedDuration = positiveNumber(duration);
  if (!boundedDuration) return [];
  return tracks.flatMap((track) => {
    if (!track?.id || !ACTIONS.has(track.redactionAction || track.action) || !track.boundingBox && !track.box) return [];
    const range = normalizeTimeRange(track.timeRange || track, boundedDuration);
    if (!range) return [];
    return [{
      id: String(track.id),
      action: track.redactionAction || track.action,
      startTime: range.startTime,
      endTime: range.endTime,
      box: clampNormalizedBox(track.boundingBox || track.box),
    }];
  });
}

export function buildVideoRedactionJobRequest(file, redactions = []) {
  return {
    kind: 'video-redaction',
    mediaKind: 'video',
    fileName: stringOrNull(file?.name),
    mimeType: stringOrNull(file?.type),
    sizeBytes: Number.isSafeInteger(file?.size) && file.size >= 0 ? file.size : null,
    redactions: redactions.map(({ id, action, startTime, endTime, box }) => ({
      id: String(id), action, startTime, endTime, box: clampNormalizedBox(box),
    })),
  };
}

export function createVideoProcessingReport({ processor } = {}) {
  const complete = processor?.state === 'complete' && processor?.output?.downloadUrl;
  if (complete) return { state: 'complete', cleanVideoProduced: true, message: 'A clean video is ready to save.' };
  if (processor?.state === 'unconfigured' || processor?.available === false) {
    return { state: 'processor-unconfigured', cleanVideoProduced: false, message: 'A clean video has not been produced. Configure a video processor to continue.' };
  }
  return { state: 'awaiting-processor', cleanVideoProduced: false, message: 'A video processor has not returned a clean video yet.' };
}

function normalizeTimeRange(range, duration) {
  const start = Number(range?.start ?? range?.startTime);
  const end = Number(range?.end ?? range?.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { startTime: precise(Math.max(0, Math.min(duration, Math.min(start, end)))), endTime: precise(Math.max(0, Math.min(duration, Math.max(start, end)))) };
}

function positiveNumber(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function stringOrNull(value) { const result = String(value || '').trim(); return result || null; }
function precise(value) { return Number(value.toFixed(12)); }

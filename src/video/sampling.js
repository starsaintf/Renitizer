const DEFAULT_TARGET_SECONDS = 10;
const DEFAULT_MAX_FRAMES = 24;
const MAX_UPLOAD_FRAME_EDGE = 1280;
const END_PADDING_SECONDS = 0.01;
const SAMPLING_OPTIONS = Object.freeze({
  standard: Object.freeze({ targetSeconds: DEFAULT_TARGET_SECONDS, maxFrames: DEFAULT_MAX_FRAMES }),
  thorough: Object.freeze({ targetSeconds: 1, maxFrames: 180 }),
});

export function videoSamplingOptions(level = 'standard') {
  return SAMPLING_OPTIONS[level] || SAMPLING_OPTIONS.standard;
}

export function videoFrameDimensions(width, height, maximumEdge = MAX_UPLOAD_FRAME_EDGE) {
  const sourceWidth = positiveInteger(width);
  const sourceHeight = positiveInteger(height);
  const edge = positiveInteger(maximumEdge);
  if (!sourceWidth || !sourceHeight || !edge) return null;

  const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function buildVideoSampleTimes(duration, { targetSeconds = DEFAULT_TARGET_SECONDS, maxFrames = DEFAULT_MAX_FRAMES } = {}) {
  const playableDuration = positiveNumber(duration);
  const target = positiveNumber(targetSeconds) || DEFAULT_TARGET_SECONDS;
  const maximum = positiveInteger(maxFrames) || DEFAULT_MAX_FRAMES;
  if (!playableDuration) return [];
  const end = precise(Math.max(0, playableDuration - Math.min(END_PADDING_SECONDS, playableDuration / 2)));
  const frameCount = Math.min(maximum, Math.max(3, Math.ceil(playableDuration / target) + 1));
  const times = Array.from({ length: frameCount }, (_, index) => precise(end * index / (frameCount - 1)));
  return [...new Set(times)];
}

function positiveNumber(value) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function positiveInteger(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null; }
function precise(value) { return Number(value.toFixed(12)); }

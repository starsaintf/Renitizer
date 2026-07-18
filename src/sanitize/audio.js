const AUDIO_ACTIONS = new Set(['mute', 'bleep']);
export const MAX_AUDIO_BYTES = 75 * 1024 * 1024;

export function normalizeAudioRange(range = {}, duration) {
  const safeDuration = Number(duration);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) return null;
  const start = Math.min(safeDuration, Math.max(0, Number(range.start)));
  const end = Math.min(safeDuration, Math.max(0, Number(range.end)));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start: precise(start), end: precise(end) };
}

export function withTranscriptTimeRange(finding = {}) {
  const timestamps = finding.timestamps || finding.timeRange || {};
  const start = timestamps.start ?? timestamps.startTime ?? finding.startTime;
  const end = timestamps.end ?? timestamps.endTime ?? finding.endTime;
  if (!Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) return finding;
  return { ...finding, timeRange: { start: Number(start), end: Number(end) }, redactionAction: finding.redactionAction || 'keep' };
}

export function resolveAudioRedactionPlan({ findings = [], manualRanges = [], duration } = {}) {
  const fromFindings = findings.flatMap((finding) => {
    const range = normalizeAudioRange(finding.timeRange, duration);
    return AUDIO_ACTIONS.has(finding.redactionAction) && range
      ? [{ id: finding.id, action: finding.redactionAction, ...range }]
      : [];
  });
  const manual = manualRanges.flatMap((range, index) => {
    const normalized = normalizeAudioRange(range, duration);
    return AUDIO_ACTIONS.has(range.action) && normalized
      ? [{ id: range.id || `manual-audio-${index + 1}`, action: range.action, ...normalized }]
      : [];
  });
  return [...fromFindings, ...manual];
}

export function resolvedAudioRanges(findings = []) {
  return findings.flatMap((finding) => {
    const range = finding.timeRange;
    return finding.resolved && AUDIO_ACTIONS.has(finding.redactionAction) && range
      ? [{ id: finding.id, action: finding.redactionAction, start: Number(range.start), end: Number(range.end) }]
      : [];
  }).filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
}

export function getAudioProcessingState(file, environment = globalThis) {
  if (!file?.type?.startsWith('audio/')) return { state: 'not-audio', available: false, message: 'Choose an audio file to make an audio clean copy.' };
  if (file.size > MAX_AUDIO_BYTES) return { state: 'too-large', available: false, message: 'This audio file is too large to process safely in this browser. You can still save its check summary.' };
  if (typeof environment.OfflineAudioContext !== 'function' && typeof environment.webkitOfflineAudioContext !== 'function') return { state: 'unsupported', available: false, message: 'This browser cannot make an audio clean copy. You can still save its check summary.' };
  if (typeof environment.AudioContext !== 'function' && typeof environment.webkitAudioContext !== 'function') return { state: 'unsupported', available: false, message: 'This browser cannot decode audio for a clean copy. You can still save its check summary.' };
  return { state: 'available', available: true, message: 'Choose the parts to mute or bleep, then make a clean WAV copy.' };
}

export async function inspectAudioFile(file, environment = globalThis) {
  const capability = getAudioProcessingState(file, environment);
  if (!capability.available) return capability;
  const Context = environment.AudioContext || environment.webkitAudioContext;
  const context = new Context();
  try {
    const buffer = await decodeAudioFile(file, context);
    return { ...capability, duration: buffer.duration };
  } finally {
    await context.close?.();
  }
}

export async function sanitizeAudioFile(file, plan, environment = globalThis) {
  const capability = getAudioProcessingState(file, environment);
  if (!capability.available) throw new Error(capability.message);
  const Context = environment.AudioContext || environment.webkitAudioContext;
  const OfflineContext = environment.OfflineAudioContext || environment.webkitOfflineAudioContext;
  const decodingContext = new Context();
  try {
    const sourceBuffer = await decodeAudioFile(file, decodingContext);
    const normalizedPlan = resolveAudioRedactionPlan({ manualRanges: plan, duration: sourceBuffer.duration });
    const rendered = await renderAudioRedactions(sourceBuffer, normalizedPlan, OfflineContext);
    return new Blob([encodeWav(rendered)], { type: 'audio/wav' });
  } finally {
    await decodingContext.close?.();
  }
}

async function decodeAudioFile(file, context) {
  const data = await file.arrayBuffer();
  return context.decodeAudioData(data.slice(0));
}

async function renderAudioRedactions(buffer, plan, OfflineContext) {
  const context = new OfflineContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const originalGain = context.createGain();
  source.connect(originalGain).connect(context.destination);
  const segments = audioSegments(plan, buffer.duration);
  originalGain.gain.setValueAtTime(1, 0);
  for (const segment of segments) {
    originalGain.gain.setValueAtTime(0, segment.start);
    originalGain.gain.setValueAtTime(1, segment.end);
    if (segment.action === 'bleep') {
      const oscillator = context.createOscillator();
      const bleepGain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, segment.start);
      bleepGain.gain.setValueAtTime(0.22, segment.start);
      oscillator.connect(bleepGain).connect(context.destination);
      oscillator.start(segment.start); oscillator.stop(segment.end);
    }
  }
  source.start(0);
  return context.startRendering();
}

function audioSegments(plan, duration) {
  const boundaries = [...new Set(plan.flatMap((item) => [item.start, item.end]).filter((point) => point >= 0 && point <= duration))].sort((a, b) => a - b);
  const segments = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]; const end = boundaries[index + 1];
    const active = plan.filter((item) => item.start <= start && item.end >= end);
    if (!active.length) continue;
    const action = active.some((item) => item.action === 'bleep') ? 'bleep' : 'mute';
    const previous = segments.at(-1);
    if (previous?.action === action && previous.end === start) previous.end = end;
    else segments.push({ action, start, end });
  }
  return segments;
}

function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const output = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(output);
  writeText(view, 0, 'RIFF'); view.setUint32(4, 36 + frames * channels * 2, true); writeText(view, 8, 'WAVE');
  writeText(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  writeText(view, 36, 'data'); view.setUint32(40, frames * channels * 2, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) for (let channel = 0; channel < channels; channel += 1) {
    const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2;
  }
  return output;
}

function writeText(view, offset, text) { for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index)); }
function precise(value) { return Number(value.toFixed(12)); }

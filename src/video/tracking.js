import { clampNormalizedBox } from '../sanitize/redaction.js';

const BOX_PADDING = 0.02;
const MINIMUM_IOU = 0.15;

/**
 * Collapses compatible visual clues found in nearby sampled frames into one
 * deliberately roomy review track. It never creates a track for a clue that
 * was not actually seen in a sampled frame.
 */
export function linkSampledVideoFindings(findings = [], { sampleTimes = [], duration } = {}) {
  const maximumGap = sampleGap(sampleTimes) || 2;
  const result = [];
  const tracks = [];

  for (const finding of findings) {
    if (!isTrackable(finding)) {
      result.push(finding);
      continue;
    }

    const match = [...tracks].reverse().find((track) => compatible(track, finding, maximumGap));
    if (!match) {
      const copy = { ...finding, boundingBox: clampNormalizedBox(finding.boundingBox), timeRange: boundedRange(finding.timeRange, duration), trackedSamples: 1 };
      tracks.push({ output: copy, lastBox: copy.boundingBox, lastEnd: copy.timeRange.end });
      result.push(copy);
      continue;
    }

    match.output.timeRange = {
      start: Math.min(match.output.timeRange.start, finding.timeRange.start),
      end: Math.max(match.output.timeRange.end, boundedRange(finding.timeRange, duration).end),
    };
    match.output.boundingBox = paddedUnion(match.output.boundingBox, finding.boundingBox);
    match.output.trackedSamples += 1;
    match.output.detail = trackedDetail(finding.detail || match.output.detail, match.output.trackedSamples);
    match.lastBox = clampNormalizedBox(finding.boundingBox);
    match.lastEnd = boundedRange(finding.timeRange, duration).end;
  }

  return result;
}

function isTrackable(finding) {
  const range = finding?.timeRange;
  const box = finding?.boundingBox;
  return Boolean(finding?.id && finding?.category && box && positiveBox(box)
    && Number.isFinite(Number(range?.start)) && Number.isFinite(Number(range?.end)) && Number(range.end) > Number(range.start));
}

function compatible(track, finding, maximumGap) {
  const range = finding.timeRange;
  const sameClue = clueKey(track.output) === clueKey(finding);
  const closeInTime = Number(range.start) - track.lastEnd <= maximumGap;
  return sameClue && closeInTime && iou(track.lastBox, clampNormalizedBox(finding.boundingBox)) >= MINIMUM_IOU;
}

function clueKey(finding) {
  return `${String(finding.category || '').trim().toLowerCase()}|${String(finding.title || '').trim().toLowerCase()}`;
}

function boundedRange(range, duration) {
  const start = Number(range.start);
  const end = Number(range.end);
  const limit = Number(duration);
  if (!Number.isFinite(limit) || limit <= 0) return { start, end };
  return { start: Math.max(0, start), end: Math.min(limit, end) };
}

function paddedUnion(first, second) {
  const left = Math.max(0, Math.min(first.x, second.x) - BOX_PADDING);
  const top = Math.max(0, Math.min(first.y, second.y) - BOX_PADDING);
  const right = Math.min(1, Math.max(first.x + first.width, second.x + second.width) + BOX_PADDING);
  const bottom = Math.min(1, Math.max(first.y + first.height, second.y + second.height) + BOX_PADDING);
  return clampNormalizedBox({ x: left, y: top, width: right - left, height: bottom - top });
}

function iou(first, second) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = first.width * first.height + second.width * second.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function sampleGap(times) {
  const ordered = [...new Set(times.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const gaps = ordered.slice(1).map((time, index) => time - ordered[index]).filter((gap) => gap > 0);
  if (!gaps.length) return null;
  return gaps[Math.floor(gaps.length / 2)];
}

function trackedDetail(detail, count) {
  return `${String(detail || 'A private detail is visible.')} Seen in ${count} sampled moments; the protected area includes the movement visible in those checks.`;
}

function positiveBox(box) {
  return Number(box.width) > 0 && Number(box.height) > 0;
}

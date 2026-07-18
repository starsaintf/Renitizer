import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAudioRange,
  resolveAudioRedactionPlan,
  withTranscriptTimeRange,
} from '../src/sanitize/audio.js';

test('normalizeAudioRange clamps a selected range to the audio duration', () => {
  assert.deepEqual(normalizeAudioRange({ start: -1.25, end: 8.75 }, 6), { start: 0, end: 6 });
  assert.equal(normalizeAudioRange({ start: 4, end: 4 }, 6), null);
});

test('resolveAudioRedactionPlan keeps selected provider and manual ranges without transcript text', () => {
  const findings = [
    { id: 'transcript-1', transcript: 'call me at 555 123 4567', timeRange: { start: 2.001, end: 3.999 }, redactionAction: 'bleep' },
    { id: 'transcript-2', transcript: 'leave unchanged', timeRange: { start: 4, end: 5 }, redactionAction: 'keep' },
  ];

  assert.deepEqual(resolveAudioRedactionPlan({
    findings,
    manualRanges: [{ id: 'manual-audio-1', start: 10, end: 15, action: 'mute' }],
    duration: 12,
  }), [
    { id: 'transcript-1', action: 'bleep', start: 2.001, end: 3.999 },
    { id: 'manual-audio-1', action: 'mute', start: 10, end: 12 },
  ]);
});

test('withTranscriptTimeRange exposes provider timestamps as an audio-selectable time range', () => {
  assert.deepEqual(withTranscriptTimeRange({
    id: 'provider-1',
    timestamps: { start: 1.5, end: 2.25 },
  }), {
    id: 'provider-1',
    timestamps: { start: 1.5, end: 2.25 },
    timeRange: { start: 1.5, end: 2.25 },
    redactionAction: 'keep',
  });
});

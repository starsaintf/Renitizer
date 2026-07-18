import test from 'node:test';
import assert from 'node:assert/strict';
import { transcriptFindings } from '../worker/src/pii.js';

test('transcriptFindings normalizes email and phone PII from audio transcription', () => {
  const findings = transcriptFindings('Email jane@example.com or call +1 (415) 555-0123.');

  assert.deepEqual(findings, [
    {
      id: 'audio-email', category: 'email', title: 'Email address in audio',
      detail: 'Transcription contains: jane@example.com', severity: 'medium', confidence: 0.92,
      recommendation: 'Trim, mute, or replace this spoken detail before sharing.', assessment: 'assessed', resolved: false,
    },
    {
      id: 'audio-phone', category: 'phone', title: 'Phone number in audio',
      detail: 'Transcription contains: +1 (415) 555-0123', severity: 'medium', confidence: 0.88,
      recommendation: 'Trim, mute, or replace this spoken detail before sharing.', assessment: 'assessed', resolved: false,
    },
  ]);
});

test('transcriptFindings reports street-address cues without claiming a precise address', () => {
  const findings = transcriptFindings('Meet me at 17 Oak Street tomorrow.');

  assert.deepEqual(findings, [{
    id: 'audio-address', category: 'address', title: 'Possible address in audio',
    detail: 'Transcription contains a street-address cue: Street', severity: 'high', confidence: 0.7,
    recommendation: 'Trim, mute, or replace this spoken detail before sharing.', assessment: 'assessed', resolved: false,
  }]);
});

test('transcriptFindings records an explicit name cue without identifying anyone', () => {
  const findings = transcriptFindings('My name is Jane Doe and I am calling.');

  assert.deepEqual(findings, [{
    id: 'audio-name', category: 'name', title: 'Name cue in audio',
    detail: 'Transcription introduces a name: Jane Doe', severity: 'low', confidence: 0.6,
    recommendation: 'Trim, mute, or replace this spoken detail before sharing.', assessment: 'assessed', resolved: false,
  }]);
});

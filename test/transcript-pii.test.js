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

test('transcriptFindings maps a detected phone number to supplied word timestamps', () => {
  const findings = transcriptFindings('Call me at +1 415 555 0123.', [
    { word: 'Call', start: 0, end: 0.2 },
    { word: 'me', start: 0.25, end: 0.4 },
    { word: 'at', start: 0.45, end: 0.58 },
    { word: '+1', start: 0.6, end: 0.76 },
    { word: '415', start: 0.8, end: 1.1 },
    { word: '555', start: 1.15, end: 1.45 },
    { word: '0123.', start: 1.5, end: 1.82 },
  ]);

  const phone = findings.find((finding) => finding.id === 'audio-phone');
  assert.deepEqual(phone.timeRange, { start: 0.6, end: 1.82 });
  assert.equal(phone.redactionAction, 'keep');
});

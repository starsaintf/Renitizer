import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { buildTimestampedTranscriptionBody } from '../src/index.js';

test('requests word timestamps for actionable audio redactions', () => {
  const body = buildTimestampedTranscriptionBody(new File(['audio'], 'memo.wav', { type: 'audio/wav' }));

  assert.equal(body.get('model'), 'whisper-1');
  assert.equal(body.get('response_format'), 'verbose_json');
  assert.deepEqual(body.getAll('timestamp_granularities[]'), ['word']);
});

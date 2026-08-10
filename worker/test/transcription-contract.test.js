import test from 'node:test';
import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { buildTimestampedTranscriptionBody, createWorker } from '../src/index.js';

test('requests word timestamps for actionable audio redactions', () => {
  const body = buildTimestampedTranscriptionBody(new File(['audio'], 'memo.wav', { type: 'audio/wav' }));

  assert.equal(body.get('model'), 'whisper-1');
  assert.equal(body.get('response_format'), 'verbose_json');
  assert.deepEqual(body.getAll('timestamp_granularities[]'), ['word']);
});

test('adds a generic timestamped audio context finding without returning transcript words', async () => {
  const calls = [];
  const app = createWorker({
    identityFetcher: async () => Response.json({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }),
    analysisFetcher: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/audio/transcriptions')) {
        return Response.json({
          text: 'The next train stops at Kogi station.',
          words: [
            { word: 'The', start: 0, end: 0.2 }, { word: 'next', start: 0.2, end: 0.4 },
            { word: 'train', start: 0.4, end: 0.7 }, { word: 'stops', start: 0.7, end: 0.9 },
            { word: 'at', start: 0.9, end: 1 }, { word: 'Kogi', start: 1, end: 1.2 },
            { word: 'station.', start: 1.2, end: 1.5 },
          ],
        });
      }
      return Response.json({ output_text: JSON.stringify({
        risks: [{ category: 'location-announcement', startWord: 0, endWord: 6, confidence: 0.89 }],
      }) });
    },
  });
  const form = new FormData();
  form.set('file', new File(['audio'], 'announcement.wav', { type: 'audio/wav' }));

  const response = await app.fetch(new Request('https://worker.example/api/analyze', {
    method: 'POST', headers: { Authorization: 'Renvoy opaque-token_123' }, body: form,
  }), {
    OPENAI_API_KEY: 'openai-test-key',
    RENVOY_IDENTITY_VERIFICATION_URL: 'https://identity.renvoy.example/v1/identity/renitizer/verify',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
  const contextRequest = JSON.parse(calls[1].options.body);
  assert.equal(contextRequest.model, 'gpt-4.1-mini');
  assert.equal(contextRequest.text.format.name, 'audio_context_risks');
  assert.match(contextRequest.input[0].content[0].text, /0: The/);
  assert.deepEqual(payload.findings, [{
    id: 'audio-context-location-announcement-0-6', category: 'location-announcement', title: 'Location announcement in audio',
    detail: 'An announcement may reveal a station, airport, road, or other location.', severity: 'high', confidence: 0.89,
    recommendation: 'Trim, mute, or replace this spoken detail before sharing.', assessment: 'assessed', resolved: false,
    timeRange: { start: 0, end: 1.5 }, redactionAction: 'keep',
  }]);
  assert.doesNotMatch(JSON.stringify(payload), /Kogi|train/i);
});

test('keeps audio context finding identifiers unique across long transcript windows', async () => {
  const app = createWorker({
    identityFetcher: async () => Response.json({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }),
    analysisFetcher: async (url) => {
      if (url.endsWith('/audio/transcriptions')) {
        const words = Array.from({ length: 601 }, (_, index) => ({ word: `token${index}`, start: index / 10, end: (index + 1) / 10 }));
        return Response.json({ text: words.map(({ word }) => word).join(' '), words });
      }
      return Response.json({ output_text: JSON.stringify({
        risks: [{ category: 'company-mention', startWord: 0, endWord: 0, confidence: 0.8 }],
      }) });
    },
  });
  const form = new FormData();
  form.set('file', new File(['audio'], 'long.wav', { type: 'audio/wav' }));

  const response = await app.fetch(new Request('https://worker.example/api/analyze', {
    method: 'POST', headers: { Authorization: 'Renvoy opaque-token_123' }, body: form,
  }), {
    OPENAI_API_KEY: 'openai-test-key',
    RENVOY_IDENTITY_VERIFICATION_URL: 'https://identity.renvoy.example/v1/identity/renitizer/verify',
  });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).findings.map((finding) => finding.id), [
    'audio-context-company-mention-0-0',
    'audio-context-company-mention-600-600',
  ]);
});

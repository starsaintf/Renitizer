import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleVisionRequest, createWorker, googleVisionPrivacyFindings } from '../src/index.js';

test('builds an opt-in Google Vision clean-copy request for landmarks and web matches only', () => {
  const request = buildGoogleVisionRequest('base64-clean-copy');

  assert.deepEqual(request, {
    requests: [{
      image: { content: 'base64-clean-copy' },
      features: [
        { type: 'LANDMARK_DETECTION', maxResults: 5 },
        { type: 'WEB_DETECTION', maxResults: 5 },
      ],
    }],
  });
});

test('turns Google Vision results into minimal privacy risks without exposing provider details', () => {
  const findings = googleVisionPrivacyFindings({
    responses: [{
      landmarkAnnotations: [{ description: "St Basil's Cathedral", score: 0.86 }],
      webDetection: {
        fullMatchingImages: [{ url: 'https://example.test/full-match.jpg' }],
        pagesWithMatchingImages: [{ url: 'https://example.test/page', pageTitle: 'Identifying page title' }],
      },
    }],
  });

  assert.deepEqual(findings, [
    {
      id: 'osint-landmark', category: 'landmark', title: 'A recognizable landmark may still be visible',
      detail: 'A configured clean-copy check found a landmark clue.', severity: 'high', confidence: 0.86,
      recommendation: 'Review the landmark before sharing.', assessment: 'assessed', source: 'osint',
    },
    {
      id: 'osint-web-match', category: 'reverse-image', title: 'A web match may still be possible',
      detail: 'A configured clean-copy check found matching-image signals.', severity: 'high', confidence: 0.9,
      recommendation: 'Review the clean copy before sharing.', assessment: 'assessed', source: 'osint',
    },
  ]);
  assert.doesNotMatch(JSON.stringify(findings), /St Basil|example\.test|Identifying page title/);
});

test('runs the configured web-match and landmark check only when a clean-copy request asks for it', async () => {
  const calls = [];
  const app = createWorker({
    identityFetcher: async () => Response.json({ principal: { accountId: 'acct_renvoy_alice', deviceId: 'dev_phone', scopes: ['renitizer:use'] } }),
    analysisFetcher: async (url, options) => {
      calls.push({ url, options });
      if (url.startsWith('https://vision.googleapis.com/')) {
        return Response.json({ responses: [{ webDetection: { fullMatchingImages: [{}] } }] });
      }
      return Response.json({ output_text: JSON.stringify({ findings: [] }) });
    },
  });
  const form = new FormData();
  form.set('file', new File(['clean image'], 'clean.jpg', { type: 'image/jpeg' }));
  form.set('analyses', JSON.stringify(['visual-pii', 'clean-copy-osint']));

  const response = await app.fetch(new Request('https://worker.example/api/analyze', {
    method: 'POST', headers: { Authorization: 'Renvoy opaque-token_123' }, body: form,
  }), {
    OPENAI_API_KEY: 'openai-test-key',
    GOOGLE_CLOUD_VISION_API_KEY: 'google-test-key',
    RENVOY_IDENTITY_VERIFICATION_URL: 'https://identity.renvoy.example/v1/identity/renitizer/verify',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    findings: [{
      id: 'osint-web-match', category: 'reverse-image', title: 'A web match may still be possible',
      detail: 'A configured clean-copy check found matching-image signals.', severity: 'high', confidence: 0.9,
      recommendation: 'Review the clean copy before sharing.', assessment: 'assessed', source: 'osint',
    }],
    providerChecks: { faceLandmarks: true, reverseImage: true },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://vision.googleapis.com/v1/images:annotate?key=google-test-key');
  assert.deepEqual(JSON.parse(calls[1].options.body), buildGoogleVisionRequest('Y2xlYW4gaW1hZ2U='));
});

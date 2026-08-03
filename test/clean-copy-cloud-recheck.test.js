import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { recheckCleanImage } from '../src/core/clean-copy-cloud-recheck.js';

const file = { type: 'image/jpeg', name: 'clean.jpg' };
const finding = { id: 'cloud-plate', category: 'vehicle-plate', detail: 'A plate is visible.', assessment: 'assessed', source: 'cloud' };

test('does not send a clean image unless the user opted into a named cloud service', async () => {
  let calls = 0;
  const result = await recheckCleanImage({ file, endpoint: '', consent: false, requestCloudAnalysis: async () => { calls += 1; return []; } });

  assert.equal(calls, 0);
  assert.deepEqual(result, { attempted: false, failed: false, findings: [], providerResults: {}, requiredProviderChecks: [] });
});

test('rechecks only the clean image and marks the cloud check as completed when the service responds', async () => {
  let request;
  const result = await recheckCleanImage({
    file,
    endpoint: 'https://privacy.example/check',
    consent: true,
    requestCloudAnalysis: async (value) => { request = value; return [finding]; },
  });

  assert.deepEqual(request, {
    endpoint: 'https://privacy.example/check',
    file,
    analyses: ['visual-pii', 'clean-copy-verification'],
    consent: true,
  });
  assert.equal(result.attempted, true);
  assert.equal(result.failed, false);
  assert.deepEqual(result.providerResults, { cloud: true });
  assert.deepEqual(result.requiredProviderChecks, ['cloud']);
  assert.deepEqual(result.findings, [{ ...finding, id: 'verify-cloud-cloud-plate', verificationCheck: 'cloud', detail: 'In the clean copy: A plate is visible.' }]);
});

test('uses the trusted Renvoy session for a clean-copy recheck when no custom service is supplied', async () => {
  let request;
  const session = { available: true, endpoint: 'https://renitizer.example', capability: 'opaque-capability_123456' };
  const result = await recheckCleanImage({
    file,
    consent: true,
    session,
    requestCloudAnalysis: async (value) => { request = value; return []; },
  });

  assert.deepEqual(request, {
    file,
    analyses: ['visual-pii', 'clean-copy-verification'],
    consent: true,
    session,
  });
  assert.equal(result.attempted, true);
  assert.deepEqual(result.providerResults, { cloud: true });
});

test('does not call an unavailable provider result a completed recheck', async () => {
  const result = await recheckCleanImage({
    file,
    endpoint: 'https://privacy.example/check',
    consent: true,
    requestCloudAnalysis: async () => [{ ...finding, id: 'cloud-unavailable', assessment: 'unavailable' }],
  });

  assert.deepEqual(result.providerResults, {});
  assert.deepEqual(result.requiredProviderChecks, ['cloud']);
  assert.equal(result.findings[0].id, 'verify-cloud-cloud-unavailable');
});

test('records a failed opted-in recheck without fabricating provider results', async () => {
  const result = await recheckCleanImage({
    file,
    endpoint: 'https://privacy.example/check',
    consent: true,
    requestCloudAnalysis: async () => { throw new Error('offline'); },
  });

  assert.deepEqual(result, { attempted: true, failed: true, findings: [], providerResults: {}, requiredProviderChecks: ['cloud'] });
});

test('the workspace sends the clean image, not the original, into the opted-in recheck', async () => {
  const app = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(app, /import \{ recheckCleanImage \} from '\.\/core\/clean-copy-cloud-recheck\.js';/);
  assert.match(app, /recheckCleanImage\(\s*\{\s*file: state\.cleanFile,/);
  assert.match(app, /requiredProviderChecks: cloudRecheck\.requiredProviderChecks/);
});

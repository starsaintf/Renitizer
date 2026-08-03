import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('production workflow publishes both private processor images to GHCR behind the production gate', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/galee-production.yml', import.meta.url), 'utf8');

  assert.match(workflow, /^\s*packages:\s*write\s*$/m);
  assert.match(workflow, /if:\s*github\.repository_owner == 'Galee-Labs'/);
  assert.match(workflow, /^\s*build-processors:\s*$/m);
  assert.match(workflow, /processor:\s*\[video, document\]/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /docker\/login-action@v3/);
  assert.match(workflow, /docker\/build-push-action@v6/);
  assert.match(workflow, /docker build --tag renitizer-video-smoke \.\/processor\/video/);
  assert.match(workflow, /\/tests\/test\/ffmpeg-smoke\.mjs/);
  assert.match(workflow, /ghcr\.io\/galee-labs\/renitizer-\$\{\{ matrix\.processor \}\}/);
  assert.match(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /PROCESSOR_AUTH_TOKEN: \$\{\{ secrets\.PROCESSOR_AUTH_TOKEN \}\}/);
  assert.match(workflow, /VIDEO_PROCESSOR_URL: \$\{\{ secrets\.VIDEO_PROCESSOR_URL \}\}/);
  assert.match(workflow, /DOCUMENT_PROCESSOR_URL: \$\{\{ secrets\.DOCUMENT_PROCESSOR_URL \}\}/);
  assert.match(workflow, /RENVOY_IDENTITY_VERIFICATION_URL: \$\{\{ secrets\.RENVOY_IDENTITY_VERIFICATION_URL \}\}/);
  assert.match(workflow, /wrangler secret bulk \.worker-secrets\.json --config wrangler\.toml/);
});

test('public Starsaintf workflow does not run in the Galee-Labs repository', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/production.yml', import.meta.url), 'utf8');

  assert.match(workflow, /if:\s*github\.repository_owner == 'starsaintf'/);
});

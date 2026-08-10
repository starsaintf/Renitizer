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
  assert.match(workflow, /GOOGLE_CLOUD_VISION_API_KEY: \$\{\{ secrets\.GOOGLE_CLOUD_VISION_API_KEY \}\}/);
  assert.match(workflow, /\.\.\.\(process\.env\.GOOGLE_CLOUD_VISION_API_KEY \? \{ GOOGLE_CLOUD_VISION_API_KEY: process\.env\.GOOGLE_CLOUD_VISION_API_KEY \} : \{\}\)/);
  assert.match(workflow, /PROCESSOR_AUTH_TOKEN: \$\{\{ secrets\.PROCESSOR_AUTH_TOKEN \}\}/);
  assert.match(workflow, /VIDEO_PROCESSOR_URL: \$\{\{ secrets\.VIDEO_PROCESSOR_URL \}\}/);
  assert.match(workflow, /DOCUMENT_PROCESSOR_URL: \$\{\{ secrets\.DOCUMENT_PROCESSOR_URL \}\}/);
  assert.match(workflow, /RENVOY_IDENTITY_VERIFICATION_URL: \$\{\{ secrets\.RENVOY_IDENTITY_VERIFICATION_URL \}\}/);
  assert.match(workflow, /node scripts\/provision-infrastructure\.mjs/);
  assert.match(workflow, /node scripts\/verify-processors\.mjs/);
  assert.match(workflow, /wrangler secret bulk \.worker-secrets\.json --config wrangler\.toml/);
});

test('public Starsaintf workflow does not run in the Galee-Labs repository', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/production.yml', import.meta.url), 'utf8');

  assert.match(workflow, /if:\s*github\.repository_owner == 'starsaintf'/);
});

test('public Pages deploy publishes only the built static web bundle', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/production.yml', import.meta.url), 'utf8');

  assert.match(workflow, /pages:[\s\S]*?actions\/setup-node@v4[\s\S]*?node scripts\/build-native-web\.mjs[\s\S]*?actions\/upload-pages-artifact@v3[\s\S]*?path: native-web/);
  assert.doesNotMatch(workflow, /actions\/upload-pages-artifact@v3[\s\S]*?path: \./);
});

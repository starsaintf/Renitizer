import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const configUrl = new URL('../wrangler.toml', import.meta.url);
const starsaintfConfigUrl = new URL('../wrangler.starsaintf.toml', import.meta.url);
const workflowUrl = new URL('../../.github/workflows/production.yml', import.meta.url);

test('production Worker configuration binds private media storage and a durable job queue', async () => {
  const config = await fs.readFile(configUrl, 'utf8');
  assert.match(config, /^\[\[r2_buckets\]\]$/m);
  assert.match(config, /^binding = "MEDIA_BUCKET"$/m);
  assert.match(config, /^bucket_name = "renitizer-private-media"$/m);
  assert.match(config, /^\[\[queues\.producers\]\]$/m);
  assert.match(config, /^binding = "JOBS_QUEUE"$/m);
  assert.match(config, /^queue = "renitizer-processing-jobs"$/m);
  assert.match(config, /^dead_letter_queue = "renitizer-processing-jobs-dlq"$/m);
});

test('Starsaintf production workflow requires only its Cloudflare deploy token', async () => {
  const workflow = await fs.readFile(workflowUrl, 'utf8');
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
  assert.match(workflow, /name: Check Cloudflare deployment credentials/);
  assert.match(workflow, /Missing CLOUDFLARE_API_TOKEN in the production environment/);
  assert.match(workflow, /wrangler whoami/);
  assert.doesNotMatch(workflow, /RENVOY_IDENTITY_VERIFICATION_URL: \$\{\{ secrets\./);
  assert.doesNotMatch(workflow, /PROCESSOR_AUTH_TOKEN: \$\{\{ secrets\./);
  assert.doesNotMatch(workflow, /VIDEO_PROCESSOR_URL: \$\{\{ secrets\./);
  assert.doesNotMatch(workflow, /DOCUMENT_PROCESSOR_URL: \$\{\{ secrets\./);
  assert.doesNotMatch(workflow, /docker\/build-push-action/);
});

test('Starsaintf deploys a local-only Worker without Renvoy or hosted-media bindings', async () => {
  const [config, workflow] = await Promise.all([
    fs.readFile(starsaintfConfigUrl, 'utf8'),
    fs.readFile(workflowUrl, 'utf8'),
  ]);

  assert.match(config, /^name = "renitizer-analysis"$/m);
  assert.doesNotMatch(config, /^\[\[r2_buckets\]\]$/m);
  assert.doesNotMatch(config, /^\[\[queues\./m);
  assert.match(workflow, /wrangler deploy --config wrangler\.starsaintf\.toml/);
  assert.match(workflow, /wrangler secret delete RENVOY_IDENTITY_VERIFICATION_URL/);
  assert.doesNotMatch(workflow, /RENVOY_IDENTITY_VERIFICATION_URL: \$\{\{ secrets\./);
});

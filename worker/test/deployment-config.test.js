import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const configUrl = new URL('../wrangler.toml', import.meta.url);
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

test('production workflow maps the video processor endpoint to the Worker variable it reads', async () => {
  const workflow = await fs.readFile(workflowUrl, 'utf8');
  assert.match(workflow, /VIDEO_PROCESSOR_URL: \$\{\{ secrets\.VIDEO_PROCESSOR_URL \}\}/);
  assert.match(workflow, /printf '%s' "\$VIDEO_PROCESSOR_URL" \| wrangler secret put PROCESSOR_URL/);
  assert.doesNotMatch(workflow, /wrangler secret put "\$secret"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const configUrl = new URL('../wrangler.toml', import.meta.url);

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

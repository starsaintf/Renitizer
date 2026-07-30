import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImageVisionRequest } from '../src/index.js';

test('asks the vision provider for normalized editable boxes on visual risks', () => {
  const request = buildImageVisionRequest('data:image/jpeg;base64,abc');
  const item = request.text.format.schema.properties.findings.items;
  const box = item.properties.boundingBox;
  const prompt = request.input[0].content[0].text;

  assert.deepEqual(box.type, ['object', 'null']);
  assert.deepEqual(box.required, ['x', 'y', 'width', 'height']);
  assert.equal(item.required.includes('boundingBox'), true);
  assert.equal(box.properties.x.minimum, 0);
  assert.equal(box.properties.x.maximum, 1);
  assert.match(prompt, /normalized bounding box/i);
  assert.match(prompt, /boundingBox to null/i);
  assert.match(prompt, /faces.*without identifying/i);
});

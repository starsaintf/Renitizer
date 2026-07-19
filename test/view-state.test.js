import test from 'node:test';
import assert from 'node:assert/strict';
import { getViewFromHash } from '../src/core/view-state.js';

test('getViewFromHash opens the cleaning app by default', () => {
  assert.equal(getViewFromHash('#app'), 'app');
  assert.equal(getViewFromHash('#decrypt'), 'decrypt');
  assert.equal(getViewFromHash(''), 'app');
  assert.equal(getViewFromHash('#anything-else'), 'app');
});

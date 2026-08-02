import test from 'node:test';
import assert from 'node:assert/strict';
import { friendlyFinding } from '../src/core/friendly-findings.js';

test('explains a cloud location clue in plain language', () => {
  assert.deepEqual(friendlyFinding({ id: 'cloud-landmark', category: 'landmark' }), {
    title: 'A location clue was found',
    detail: 'This image may reveal where it was taken.',
  });
});

test('explains a cloud vehicle plate in plain language', () => {
  assert.deepEqual(friendlyFinding({ id: 'cloud-plate', category: 'vehicle-plate' }), {
    title: 'A vehicle plate was found',
    detail: 'A plate can help link this image to a vehicle.',
  });
});

test('explains a cloud screen without exposing technical categories', () => {
  assert.deepEqual(friendlyFinding({ id: 'cloud-screen', category: 'screen' }), {
    title: 'A screen may show private information',
    detail: 'Review it before you share this image.',
  });
});

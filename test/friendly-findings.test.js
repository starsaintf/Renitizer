import test from 'node:test';
import assert from 'node:assert/strict';
import { findingStatus, friendlyFinding } from '../src/core/friendly-findings.js';

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

test('explains personal visual clues in plain language', () => {
  assert.deepEqual(friendlyFinding({ id: 'cloud-tattoo', category: 'tattoo' }), {
    title: 'A distinctive personal detail may be visible',
    detail: 'A tattoo or similar detail can make someone easier to recognise.',
  });
  assert.deepEqual(friendlyFinding({ id: 'cloud-wifi', category: 'wifi-ssid' }), {
    title: 'A network name may be visible',
    detail: 'A Wi-Fi name can reveal a home, workplace, or nearby location.',
  });
});

test('explains a spoken location clue without showing the spoken words', () => {
  assert.deepEqual(friendlyFinding({ id: 'audio-context-location-announcement-0-6', category: 'location-announcement' }), {
    title: 'A location clue was heard',
    detail: 'An announcement or conversation may reveal where this was recorded.',
  });
});

test('shows whether an image redaction is planned or has been applied', () => {
  assert.equal(findingStatus({ redactionAction: 'blur', resolved: false }), 'will be blurred in your clean copy');
  assert.equal(findingStatus({ redactionAction: 'cover', resolved: false }), 'will be covered in your clean copy');
  assert.equal(findingStatus({ redactionAction: 'blur', resolved: true }), 'addressed in clean copy');
  assert.equal(findingStatus({ redactionAction: 'keep', resolved: false }), 'may need your attention');
});

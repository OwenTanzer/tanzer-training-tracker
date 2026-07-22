import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTrainerSince,
  isTrainerSince,
  trainerSinceFromIso,
} from '../shared/trainerSince.ts';

test('trainer-since values use valid month precision', () => {
  assert.equal(isTrainerSince('2026-01'), true);
  assert.equal(isTrainerSince('1999-12'), true);
  assert.equal(isTrainerSince('2026-00'), false);
  assert.equal(isTrainerSince('2026-13'), false);
  assert.equal(isTrainerSince('2026-1'), false);
  assert.equal(isTrainerSince('not-a-date'), false);
});

test('account creation timestamps backfill to their calendar month', () => {
  assert.equal(trainerSinceFromIso('2026-07-22T17:00:00.000Z'), '2026-07');
});

test('trainer-since months format without UTC boundary shifts', () => {
  assert.equal(formatTrainerSince('2026-07'), 'July 2026');
  assert.equal(formatTrainerSince('2026-13'), null);
});

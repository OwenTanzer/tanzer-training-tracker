import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatTrainerSince,
  isTrainerSince,
  localCalendarMonth,
  trainerSinceFromIso,
} from '../shared/trainerSince.ts';

test('trainer-since values use valid month precision', () => {
  const currentMonth = '2026-07';
  assert.equal(isTrainerSince('2026-07', currentMonth), true);
  assert.equal(isTrainerSince('1999-12', currentMonth), true);
  assert.equal(isTrainerSince('2026-08', currentMonth), false);
  assert.equal(isTrainerSince('2026-00', currentMonth), false);
  assert.equal(isTrainerSince('2026-13', currentMonth), false);
  assert.equal(isTrainerSince('2026-1', currentMonth), false);
  assert.equal(isTrainerSince('not-a-date', currentMonth), false);
});

test('the current local month is derived without a UTC boundary shift', () => {
  assert.equal(localCalendarMonth(new Date(2026, 6, 31, 23, 59)), '2026-07');
});

test('account creation timestamps backfill to their calendar month', () => {
  assert.equal(trainerSinceFromIso('2026-07-22T17:00:00.000Z'), '2026-07');
});

test('trainer-since months format without UTC boundary shifts', () => {
  assert.equal(formatTrainerSince('2026-07'), 'July 2026');
  assert.equal(formatTrainerSince('2026-13'), null);
});

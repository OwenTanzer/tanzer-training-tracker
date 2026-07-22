import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFutureSessionDate,
  legacySessionDate,
  localSessionDate,
} from '../shared/sessionDate.ts';

test('localSessionDate preserves the local calendar date near midnight', () => {
  const lateLocalTime = new Date(2026, 6, 10, 23, 59, 59);
  assert.equal(localSessionDate(lateLocalTime), '2026-07-10');
});

test('legacy migration is deterministic at a UTC date boundary', () => {
  const createdDate = '2026-07-11T01:00:00.000Z';
  assert.equal(legacySessionDate(createdDate), '2026-07-11');
});

test('owner and shared legacy projections use the same canonical date', () => {
  const createdDate = '2026-07-11T01:00:00.000Z';
  const ownerDate = legacySessionDate(createdDate);
  const recipientDate = legacySessionDate(createdDate);
  assert.equal(ownerDate, recipientDate);
});

test('future session dates are rejected while today and historical dates are accepted', () => {
  const today = '2026-07-22';
  assert.equal(isFutureSessionDate('2026-07-23', today), true);
  assert.equal(isFutureSessionDate('2026-07-22', today), false);
  assert.equal(isFutureSessionDate('2026-07-01', today), false);
});

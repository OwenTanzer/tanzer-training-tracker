import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dailyWorkLevel,
  isCurrentlyAssigned,
  isDogNeedingAttention,
  sessionCountsByDogOnDate,
  previousLocalDate,
} from '../src/lib/dailyWork.ts';

test('session counts use the canonical local session date', () => {
  const reports = [
    { dogId: 'dog-1', sessionDate: '2026-07-22' },
    { dogId: 'dog-1', sessionDate: '2026-07-22' },
    { dogId: 'dog-1', sessionDate: '2026-07-21' },
    { dogId: 'dog-2', sessionDate: '2026-07-22' },
  ];

  assert.deepEqual(sessionCountsByDogOnDate(reports, '2026-07-22'), {
    'dog-1': 2,
    'dog-2': 1,
  });
});

test('session counts refresh after reports are mutated in place', () => {
  const reports = [{ dogId: 'dog-1', sessionDate: '2026-07-21' }];

  assert.deepEqual(sessionCountsByDogOnDate(reports, '2026-07-22'), {});

  reports[0].sessionDate = '2026-07-22';
  assert.deepEqual(sessionCountsByDogOnDate(reports, '2026-07-22'), { 'dog-1': 1 });

  reports.push({ dogId: 'dog-1', sessionDate: '2026-07-22' });
  assert.deepEqual(sessionCountsByDogOnDate(reports, '2026-07-22'), { 'dog-1': 2 });

  reports[0].sessionDate = '2026-07-21';
  assert.deepEqual(sessionCountsByDogOnDate(reports, '2026-07-22'), { 'dog-1': 1 });
});

test('daily work levels distinguish zero, one, and multiple sessions', () => {
  assert.equal(dailyWorkLevel(0), 'none');
  assert.equal(dailyWorkLevel(1), 'once');
  assert.equal(dailyWorkLevel(2), 'multiple');
  assert.equal(dailyWorkLevel(5), 'multiple');
});

test('previous local date crosses month and year boundaries', () => {
  assert.equal(previousLocalDate('2026-03-01'), '2026-02-28');
  assert.equal(previousLocalDate('2026-01-01'), '2025-12-31');
});

test('current assignment excludes inactive and transferred source dogs', () => {
  const active = { released: false, graduated: false, passBackCopies: [] };
  assert.equal(isCurrentlyAssigned(active), true);
  assert.equal(isCurrentlyAssigned({ ...active, released: true }), false);
  assert.equal(isCurrentlyAssigned({ ...active, graduated: true }), false);
  assert.equal(isCurrentlyAssigned({ ...active, passBackCopies: [{}] }), false);
});

test('needs attention is limited to assigned pinned dogs not worked yesterday', () => {
  const dog = {
    id: 'dog-1',
    folderId: 'pinned',
    released: false,
    graduated: false,
    passBackCopies: [],
  };

  assert.equal(isDogNeedingAttention(dog, 'pinned', {}), true);
  assert.equal(isDogNeedingAttention(dog, 'pinned', { 'dog-1': 1 }), false);
  assert.equal(isDogNeedingAttention(dog, 'other', {}), false);
  assert.equal(isDogNeedingAttention({ ...dog, released: true }, 'pinned', {}), false);
  assert.equal(isDogNeedingAttention({ ...dog, passBackCopies: [{}] }, 'pinned', {}), false);
});

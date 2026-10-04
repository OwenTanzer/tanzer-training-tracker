import assert from 'node:assert/strict';
import test from 'node:test';
import {
  distractionTimeline,
  reportsForDistraction,
  distractionLabel,
  summarizeDistractions,
} from '../src/lib/distractionAnalytics.ts';
import type {
  DistractionObservation,
  TrainingReport,
} from '../src/types.ts';

function report(
  id: string,
  sessionDate: string,
  distractions: DistractionObservation[],
): TrainingReport {
  return {
    id,
    dogId: 'dog-1',
    phase: 'Phase 1',
    redFlag: false,
    locationId: null,
    notes: '',
    picture: null,
    skillIds: [],
    milestoneIds: [],
    distractions,
    authorInstructorId: 'trainer-1',
    visibility: 'shared',
    sessionDate,
    createdDate: `${sessionDate}T12:00:00.000Z`,
    updatedDate: `${sessionDate}T12:00:00.000Z`,
  };
}

test('summaries use observed ordinal distributions and a real median category', () => {
  const reports = [
    report('r1', '2026-07-01', [{ distractionId: 'traffic', severity: 'Mild' }]),
    report('r2', '2026-07-02', [{ distractionId: 'traffic', severity: 'Severe' }]),
    report('r3', '2026-07-03', [{ distractionId: 'traffic', severity: 'Moderate' }]),
    report('r4', '2026-07-04', [{ distractionId: 'dogs', severity: 'Absent' }]),
  ];

  assert.deepEqual(summarizeDistractions(reports), [
    {
      distractionId: 'dogs',
      observations: 1,
      medianSeverity: 'Absent',
      distribution: { Absent: 1, Mild: 0, Moderate: 0, Severe: 0 },
    },
    {
      distractionId: 'traffic',
      observations: 3,
      medianSeverity: 'Moderate',
      distribution: { Absent: 0, Mild: 1, Moderate: 1, Severe: 1 },
    },
  ]);
});

test('even samples use a lower observed middle category instead of a decimal mean', () => {
  const reports = [
    report('r1', '2026-07-01', [{ distractionId: 'traffic', severity: 'Mild' }]),
    report('r2', '2026-07-02', [{ distractionId: 'traffic', severity: 'Severe' }]),
  ];

  assert.equal(summarizeDistractions(reports)[0]?.medianSeverity, 'Mild');
});

test('timeline contains only explicitly logged observations and sorts chronologically', () => {
  const reports = [
    report('later', '2026-07-03', [{ distractionId: 'traffic', severity: 'Severe' }]),
    report('unlogged', '2026-07-02', []),
    report('absent', '2026-07-01', [{ distractionId: 'traffic', severity: 'Absent' }]),
    report('other', '2026-07-04', [{ distractionId: 'dogs', severity: 'Moderate' }]),
  ];

  assert.deepEqual(distractionTimeline(reports, 'traffic'), [
    { reportId: 'absent', date: '2026-07-01', severity: 'Absent' },
    { reportId: 'later', date: '2026-07-03', severity: 'Severe' },
  ]);
  assert.deepEqual(distractionTimeline(reports, 'unknown'), []);
});

test('matching logs isolate the dog and stored category ID, never notes or labels', () => {
  const matching = report('match', '2026-07-01', [{ distractionId: 'traffic', severity: 'Mild' }]);
  const otherDog = { ...matching, id: 'other-dog', dogId: 'dog-2' };
  const notesOnly = { ...report('notes', '2026-07-02', []), notes: 'traffic' };
  const similarId = report('similar', '2026-07-03', [{ distractionId: 'traffic-other', severity: 'Severe' }]);
  assert.deepEqual(reportsForDistraction([otherDog, notesOnly, similarId, matching], 'dog-1', 'traffic'), [matching]);
});

test('explicit Absent is included, missing observations are excluded, and reports appear once', () => {
  const absent = report('absent', '2026-07-01', [
    { distractionId: 'traffic', severity: 'Absent' },
    { distractionId: 'dogs', severity: 'Severe' },
    { distractionId: 'traffic', severity: 'Absent' },
  ]);
  const missing = report('missing', '2026-07-02', []);
  assert.deepEqual(reportsForDistraction([absent, missing, absent], 'dog-1', 'traffic'), [absent]);
  assert.equal(absent.distractions[0].severity, 'Absent');
});

test('matching logs sort newest session first, then creation time, without mutating input', () => {
  const observation = [{ distractionId: 'traffic', severity: 'Mild' as const }];
  const oldSession = { ...report('backfilled', '2026-06-01', observation), createdDate: '2026-08-01T12:00:00Z' };
  const early = report('early', '2026-07-01', observation);
  const late = { ...early, id: 'late', createdDate: '2026-07-01T16:00:00Z' };
  const input = [oldSession, early, late];
  assert.deepEqual(reportsForDistraction(input, 'dog-1', 'traffic').map((r) => r.id), ['late', 'early', 'backfilled']);
  assert.deepEqual(input.map((r) => r.id), ['backfilled', 'early', 'late']);
});

test('empty inputs, unknown categories and another dog have empty results', () => {
  const logs = [report('r1', '2026-07-01', [{ distractionId: 'traffic', severity: 'Mild' }])];
  assert.deepEqual(reportsForDistraction([], 'dog-1', 'traffic'), []);
  assert.deepEqual(reportsForDistraction(logs, 'dog-1', 'unknown'), []);
  assert.deepEqual(reportsForDistraction(logs, 'dog-2', 'traffic'), []);
});

test('missing or retired template labels retain identifiable categories and matching logs', () => {
  const template = { id: 'traffic', title: 'Road traffic', sortOrder: 0, createdDate: '', updatedDate: '' };
  assert.equal(distractionLabel([template], 'traffic'), 'Road traffic');
  assert.equal(distractionLabel([], 'retired-id'), 'Unknown distraction (retired-id)');
  assert.equal(distractionLabel([{ ...template, title: '  ' }], 'traffic'), 'Unknown distraction (traffic)');
  const retired = report('retired', '2026-07-01', [{ distractionId: 'retired-id', severity: 'Absent' }]);
  assert.deepEqual(reportsForDistraction([retired], 'dog-1', 'retired-id'), [retired]);
});

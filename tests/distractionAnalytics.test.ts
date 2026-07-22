import assert from 'node:assert/strict';
import test from 'node:test';
import {
  distractionTimeline,
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

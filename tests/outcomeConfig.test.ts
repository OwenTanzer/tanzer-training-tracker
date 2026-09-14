import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOutcomeToCompletion, backfillAllowedOutcomes, canonicalAllowedOutcomes, isMilestoneOutcomeAllowed, normalizeMilestoneTemplate, outcomeLabel } from '../src/lib/outcomeConfig.ts';
import { dogStatistics, milestoneStatistics } from '../src/lib/milestoneAnalytics.ts';
import { FINAL_OUTCOMES, type Dog, type DogMilestoneCompletion, type MilestoneTemplate } from '../src/types.ts';

function milestone(overrides: Partial<MilestoneTemplate> = {}): MilestoneTemplate {
  return { id: 'running', phase: 'Phase 3', title: 'Running Guide Evaluation', sortOrder: 0,
    isFinalOutcomeMilestone: true, isTerminalOutcomeMilestone: false,
    allowedOutcomes: ['yes', 'no'], outcomeOptions: [
      { id: 'yes', label: 'Accepted', completesMilestone: true },
      { id: 'no', label: 'Declined', completesMilestone: false },
    ], repeatable: true, createdDate: '', updatedDate: '', ...overrides };
}
function completion(dogId: string, outcome: string | null): DogMilestoneCompletion {
  return { id: dogId, dogId, milestoneTemplateId: 'running', completed: false, dateCompleted: null, notes: null, photo: null, outcome };
}

test('legacy missing choices backfill, but an explicitly empty list stays empty', () => {
  assert.deepEqual(backfillAllowedOutcomes(), FINAL_OUTCOMES);
  assert.deepEqual(backfillAllowedOutcomes([]), []);
  assert.deepEqual(canonicalAllowedOutcomes(['no', 'yes', 'no', 'custom']), ['no', 'yes', 'custom']);
});
test('custom and retired choices survive normalization and JSON round trips', () => {
  const configured = milestone({ allowedOutcomes: ['no'] });
  const reloaded = normalizeMilestoneTemplate(JSON.parse(JSON.stringify(configured)));
  assert.equal(outcomeLabel(reloaded, 'no'), 'Declined');
  assert.equal(isMilestoneOutcomeAllowed(reloaded, 'yes'), false);
  assert.equal(isMilestoneOutcomeAllowed(reloaded, 'no'), true);
  assert.equal(isMilestoneOutcomeAllowed({ ...reloaded, isFinalOutcomeMilestone: false }, 'no'), false);
  assert.equal(outcomeLabel(reloaded, 'yes'), 'Accepted');
});
test('completion follows explicit option semantics; undo uses recorded semantics and date', () => {
  const record = completion('dog', null);
  applyOutcomeToCompletion(record, milestone(), 'yes', '2026-09-01');
  assert.equal(record.completed, true);
  assert.equal(record.outcomeLabel, 'Accepted');
  applyOutcomeToCompletion(record, milestone(), 'no', '2026-09-02');
  assert.equal(record.completed, false);
  const renamed = milestone({ outcomeOptions: [{ id: 'yes', label: 'Now pending', completesMilestone: false }] });
  applyOutcomeToCompletion(record, renamed, 'yes', '2026-09-01', { outcomeLabel: 'Accepted', completedMilestone: true });
  assert.equal(record.outcomeLabel, 'Accepted');
  assert.equal(record.completed, true);
  assert.equal(record.dateCompleted, '2026-09-01');
  applyOutcomeToCompletion(record, renamed, null, '2026-09-03');
  assert.equal(record.outcomeLabel, null);
  assert.equal(record.completed, false);
});
test('per-milestone denominator counts current dogs once, includes excluded dogs, and separates retakes', () => {
  const dogs = [{ id: 'a', name: 'A', excludedFromStats: true, released: true }, { id: 'b', name: 'B', graduated: true }, { id: 'c', name: 'C' }] as Dog[];
  const records = [completion('a', 'no'), completion('b', 'yes'), completion('deleted-dog', 'yes')];
  const stats = milestoneStatistics(dogs, [milestone(), milestone({ id: 'preliminary', title: 'Preliminary Blindfold' })], records,
    [{ dogId: 'a', milestoneTemplateId: 'running' }, { dogId: 'a', milestoneTemplateId: 'running' }, { dogId: 'deleted-dog', milestoneTemplateId: 'running' }] as never[]);
  assert.equal(stats[0].evaluated, 2);
  assert.equal(stats[0].noOutcome, 1);
  assert.equal(stats[0].attempts, 2);
  assert.deepEqual(stats[0].outcomes.map((o) => o.count), [1, 1]);
  assert.equal(stats[1].evaluated, 0);
  assert.equal(stats[1].noOutcome, 3);
  const dogStats = dogStatistics(dogs);
  assert.equal(dogStats.refined.percent, 100);
  assert.equal(dogStats.overall.percent, 50);
  assert.deepEqual(Object.values(dogStats.lists).map((list) => list.length), [3, 1, 1, 1]);
});
test('retired outcomes remain in charts; unknown/no decisions never become Placement Ready', () => {
  const stats = milestoneStatistics([{ id: 'a' }, { id: 'b' }], [milestone({ allowedOutcomes: [] })], [completion('a', 'no'), completion('b', null)], []);
  assert.deepEqual(stats[0].outcomes, [{ id: 'no', label: 'Declined (retired)', count: 1 }]);
  assert.equal(stats[0].noOutcome, 1);
});

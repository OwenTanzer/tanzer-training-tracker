import { FINAL_OUTCOMES, type MilestoneTemplate } from '../types';

interface MilestoneSeed {
  phase: MilestoneTemplate['phase'];
  title: string;
  sortOrder: number;
}

// Abby's own field-tested milestones, carried over verbatim from her account
// (issue #30) — a more informed default for new instructors than the original
// AI-generated placeholder list it replaces. Personalization after seeding is
// still fully supported; this only changes the starting point.
const MILESTONE_SEED: MilestoneSeed[] = [
  { phase: 'Phase 1', title: 'Colonial Street', sortOrder: 0 },
  { phase: 'Phase 1', title: 'Grounds Check Off', sortOrder: 1 },
  { phase: 'Phase 1', title: 'BJ’s Route', sortOrder: 2 },
  { phase: 'Phase 2', title: 'Court Street, Peekskill', sortOrder: 0 },
  { phase: 'Phase 2', title: 'Bank Street, Peekskill', sortOrder: 1 },
  { phase: 'Phase 2', title: 'Yorktown Route', sortOrder: 2 },
  { phase: 'Phase 2', title: 'Preliminary Blindfold Test', sortOrder: 3 },
  { phase: 'Phase 2', title: 'Escalator Training', sortOrder: 4 },
  { phase: 'Phase 2', title: 'Platform Training: Peekskill', sortOrder: 5 },
  { phase: 'Phase 2', title: 'Traffic Training: Phase 1', sortOrder: 6 },
  { phase: 'Phase 3', title: 'White Plains', sortOrder: 0 },
  { phase: 'Phase 3', title: 'Traffic Training: Phase 2', sortOrder: 1 },
  { phase: 'Phase 3', title: 'Platform Training: Katonah', sortOrder: 3 },
  { phase: 'Phase 3', title: 'Traffic Training Phase 3', sortOrder: 4 },
  { phase: 'Phase 3', title: 'Running Guide Evaluation', sortOrder: 4 },
  { phase: 'Phase 4', title: 'Traffic Training: Phase 4', sortOrder: 0 },
  { phase: 'Phase 4', title: 'Advanced Final Blindfold', sortOrder: 1 },
  { phase: 'Phase 4', title: 'Major City Travel: NYC', sortOrder: 2 },
  { phase: 'Phase 4', title: 'Platform Training: NYC Subway', sortOrder: 3 },
  { phase: 'Phase 4', title: 'Dog Matched with Student', sortOrder: 4 },
  { phase: 'Phase 4', title: 'Team Meets Graduation Standards', sortOrder: 5 },
];

export function buildDefaultMilestones(): MilestoneTemplate[] {
  const now = new Date().toISOString();
  return MILESTONE_SEED.map((seed) => ({
    id: crypto.randomUUID(),
    ...seed,
    // Abby's terminal Phase 4 evaluation — the one milestone whose result
    // decides whether a dog is placement-ready, needs additional
    // objectives, or is released. See MilestoneTemplate.isTerminalOutcomeMilestone.
    isFinalOutcomeMilestone: seed.title === 'Advanced Final Blindfold',
    isTerminalOutcomeMilestone: seed.title === 'Advanced Final Blindfold',
    // #33 names these two as the milestones that need to be retakeable —
    // the final evaluation itself, and traffic training at any phase.
    allowedOutcomes: [...FINAL_OUTCOMES],
    repeatable: seed.title === 'Advanced Final Blindfold' || seed.title.startsWith('Traffic Training'),
    createdDate: now,
    updatedDate: now,
  }));
}

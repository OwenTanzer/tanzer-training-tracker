import type { PhaseChecklistItem } from '../types';

interface ChecklistSeed {
  phase: PhaseChecklistItem['phase'];
  title: string;
  description: string;
  requiredForGraduation: boolean;
  sortOrder: number;
}

// Abby's own field-tested checklist, carried over verbatim from her account
// (issue #30) — a more informed default for new instructors than the original
// AI-generated placeholder list it replaces. Personalization after seeding is
// still fully supported; this only changes the starting point.
const CHECKLIST_SEED: ChecklistSeed[] = [
  { phase: 'Phase 1', title: 'Responds to Name', description: '', requiredForGraduation: true, sortOrder: 0 },
  { phase: 'Phase 1', title: 'Nose Target: Target Stick', description: '', requiredForGraduation: true, sortOrder: 1 },
  { phase: 'Phase 1', title: 'Obedience Routine', description: '', requiredForGraduation: true, sortOrder: 2 },
  { phase: 'Phase 1', title: 'Hallway Crate Exposure', description: '', requiredForGraduation: true, sortOrder: 4 },
  { phase: 'Phase 1', title: 'Collar Yielding: Backup', description: '', requiredForGraduation: true, sortOrder: 5 },
  { phase: 'Phase 1', title: 'Collar Yielding: Pivot', description: '', requiredForGraduation: true, sortOrder: 6 },
  { phase: 'Phase 1', title: 'Foot Target: Foam Step', description: '', requiredForGraduation: true, sortOrder: 7 },
  { phase: 'Phase 1', title: 'Foot Target: Definite Curb', description: '', requiredForGraduation: true, sortOrder: 8 },
  { phase: 'Phase 1', title: 'Foot Target: Blended Curb', description: '', requiredForGraduation: true, sortOrder: 9 },
  { phase: 'Phase 1', title: 'Load the Clicker', description: '', requiredForGraduation: true, sortOrder: 9 },
  { phase: 'Phase 1', title: 'Recall in Community Run', description: '', requiredForGraduation: true, sortOrder: 10 },
  { phase: 'Phase 1', title: 'Van Crate Exposure', description: '', requiredForGraduation: true, sortOrder: 11 },
  { phase: 'Phase 1', title: 'Food Manners: Taking Treats', description: '', requiredForGraduation: true, sortOrder: 12 },
  { phase: 'Phase 1', title: 'Food Manners: Dropped Treats', description: '', requiredForGraduation: true, sortOrder: 13 },
  { phase: 'Phase 1', title: 'Lead Out in Harness', description: '', requiredForGraduation: true, sortOrder: 14 },
  { phase: 'Phase 1', title: 'Introduce “Wait” Command', description: '', requiredForGraduation: true, sortOrder: 15 },
  { phase: 'Phase 1', title: 'Door Manners', description: '', requiredForGraduation: true, sortOrder: 16 },
  { phase: 'Phase 2', title: 'Basic Straight Line Travel', description: '', requiredForGraduation: true, sortOrder: 2 },
  { phase: 'Phase 2', title: 'Proofing Curbs', description: '', requiredForGraduation: true, sortOrder: 3 },
  { phase: 'Phase 2', title: 'Underfooting Exposure', description: '', requiredForGraduation: true, sortOrder: 4 },
  { phase: 'Phase 2', title: 'Nose Target: Door Handles', description: '', requiredForGraduation: true, sortOrder: 5 },
  { phase: 'Phase 2', title: 'Improved Leash Walking', description: '', requiredForGraduation: true, sortOrder: 6 },
  { phase: 'Phase 2', title: 'Foot Target: Steps', description: '', requiredForGraduation: true, sortOrder: 6 },
  { phase: 'Phase 2', title: 'Maintains Focus with Mild Distractions', description: '', requiredForGraduation: true, sortOrder: 7 },
  { phase: 'Phase 2', title: 'Obstacle Avoidance', description: '', requiredForGraduation: true, sortOrder: 7 },
  { phase: 'Phase 2', title: 'Counter Pull', description: '', requiredForGraduation: true, sortOrder: 8 },
  { phase: 'Phase 2', title: 'Nose Target: Staircase Railing', description: '', requiredForGraduation: true, sortOrder: 9 },
  { phase: 'Phase 2', title: 'Navigating Stairs', description: '', requiredForGraduation: true, sortOrder: 10 },
  { phase: 'Phase 2', title: 'Indoor Travel', description: '', requiredForGraduation: true, sortOrder: 11 },
  { phase: 'Phase 2', title: 'Working Past Dropped Food', description: '', requiredForGraduation: true, sortOrder: 12 },
  { phase: 'Phase 2', title: 'Turn Mechanics', description: '', requiredForGraduation: true, sortOrder: 14 },
  { phase: 'Phase 2', title: 'Settling for Short Periods', description: '', requiredForGraduation: true, sortOrder: 15 },
  { phase: 'Phase 3', title: 'Nose Target: Chair', description: '', requiredForGraduation: true, sortOrder: 0 },
  { phase: 'Phase 3', title: 'Nose Target: Generalize Door/Elevator', description: '', requiredForGraduation: true, sortOrder: 1 },
  { phase: 'Phase 3', title: 'Maintains Focus Amongst Moderate Distraction', description: '', requiredForGraduation: true, sortOrder: 2 },
  { phase: 'Phase 3', title: 'Foot Target: Escalator Plate', description: '', requiredForGraduation: true, sortOrder: 3 },
  { phase: 'Phase 3', title: 'Advanced Obstacle Avoidance', description: '', requiredForGraduation: true, sortOrder: 4 },
  { phase: 'Phase 3', title: 'Pedestrian Clearances', description: '', requiredForGraduation: true, sortOrder: 5 },
  { phase: 'Phase 3', title: 'Correcting Handler Alignment', description: '', requiredForGraduation: true, sortOrder: 6 },
  { phase: 'Phase 3', title: 'Destination-Oriented Travel', description: '', requiredForGraduation: true, sortOrder: 7 },
  { phase: 'Phase 3', title: 'Proofing “Close” Command', description: '', requiredForGraduation: true, sortOrder: 8 },
  { phase: 'Phase 3', title: 'Settling for Longer Periods', description: '', requiredForGraduation: true, sortOrder: 9 },
  { phase: 'Phase 3', title: 'Clean Turn Mechanics', description: '', requiredForGraduation: true, sortOrder: 10 },
  { phase: 'Phase 4', title: 'Maintains Focus Amongst Severe Distraction', description: '', requiredForGraduation: true, sortOrder: 3 },
  { phase: 'Phase 4', title: 'Advanced Heel While Trailing Wall', description: '', requiredForGraduation: true, sortOrder: 4 },
  { phase: 'Phase 4', title: 'Desensitized to Ruffwear Booties', description: '', requiredForGraduation: true, sortOrder: 5 },
  { phase: 'Phase 4', title: 'Desensitized to Head Collar', description: '', requiredForGraduation: true, sortOrder: 6 },
  { phase: 'Phase 4', title: 'Heeling with a White Cane', description: '', requiredForGraduation: true, sortOrder: 7 },
  { phase: 'Phase 4', title: 'Natural Traffic Checks', description: '', requiredForGraduation: true, sortOrder: 7 },
  { phase: 'Phase 4', title: 'Navigate Revolving Door', description: '', requiredForGraduation: true, sortOrder: 8 },
  { phase: 'Phase 4', title: 'Honey Trap Exercise', description: '', requiredForGraduation: true, sortOrder: 9 },
  { phase: 'Phase 4', title: 'Settling for Extended Periods', description: '', requiredForGraduation: true, sortOrder: 10 },
  { phase: 'Phase 4', title: 'Expose to Unifly Harness', description: '', requiredForGraduation: true, sortOrder: 11 },
  { phase: 'Phase 4', title: 'Generalizes Work Pattern Across Locations', description: '', requiredForGraduation: true, sortOrder: 16 },
  { phase: 'Phase 4', title: 'Customize Dog for Student’s Needs', description: '', requiredForGraduation: true, sortOrder: 17 },
];

export function buildDefaultChecklist(): PhaseChecklistItem[] {
  const now = new Date().toISOString();
  return CHECKLIST_SEED.map((seed) => ({
    id: crypto.randomUUID(),
    ...seed,
    createdDate: now,
    updatedDate: now,
  }));
}

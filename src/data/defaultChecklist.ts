import type { PhaseChecklistItem } from '../types';

let sortOrder = 0;
const item = (
  phase: PhaseChecklistItem['phase'],
  title: string,
  description = '',
): PhaseChecklistItem => ({
  id: crypto.randomUUID(),
  phase,
  title,
  description,
  requiredForGraduation: true,
  sortOrder: sortOrder++,
  createdDate: new Date().toISOString(),
  updatedDate: new Date().toISOString(),
});

export function buildDefaultChecklist(): PhaseChecklistItem[] {
  sortOrder = 0;
  return [
    item('Phase 1', 'Responds to name'),
    item('Phase 1', 'Basic leash comfort'),
    item('Phase 1', 'Accepts handling'),
    item('Phase 1', 'Begins crate comfort'),
    item('Phase 1', 'Calm behavior in low-distraction setting'),

    item('Phase 2', 'Follows basic commands'),
    item('Phase 2', 'Improved leash walking'),
    item('Phase 2', 'Maintains focus with mild distractions'),
    item('Phase 2', 'Settles after excitement'),
    item('Phase 2', 'Responds reliably to trainer cues'),

    item('Phase 3', 'Performs commands with higher distractions'),
    item('Phase 3', 'Shows improved impulse control'),
    item('Phase 3', 'Handles new environments'),
    item('Phase 3', 'Demonstrates social stability'),
    item('Phase 3', 'Recovers quickly from stressors'),

    item('Phase 4', 'Demonstrates advanced reliability'),
    item('Phase 4', 'Maintains training across locations'),
    item('Phase 4', 'Shows consistent behavior around distractions'),
    item('Phase 4', 'Meets graduation standards'),
    item('Phase 4', 'Final trainer approval completed'),
  ];
}

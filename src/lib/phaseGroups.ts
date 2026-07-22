import { PHASES, type Phase } from '../types.ts';

export interface PhaseItem {
  id: string;
  phase: Phase;
}

export interface PhaseItemGroup<T extends PhaseItem> {
  phase: Phase;
  items: T[];
}

export function groupPhaseItems<T extends PhaseItem>(items: T[]): PhaseItemGroup<T>[] {
  return PHASES.map((phase) => ({
    phase,
    items: items.filter((item) => item.phase === phase),
  }));
}

export function filterValidPhaseItemIds<T extends PhaseItem>(
  selectedIds: string[],
  items: T[],
): string[] {
  const validIds = new Set(items.map((item) => item.id));
  return selectedIds.filter((id) => validIds.has(id));
}

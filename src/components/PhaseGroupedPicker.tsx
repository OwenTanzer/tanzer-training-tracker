import { useState } from 'react';
import { groupPhaseItems, type PhaseItem } from '../lib/phaseGroups';
import { PHASES, type Phase } from '../types';

interface PickerItem extends PhaseItem {
  title: string;
}

interface PhaseGroupedPickerProps {
  items: PickerItem[];
  selectedIds: string[];
  currentPhase: Phase;
  itemKind: 'skills' | 'milestones';
  onToggle: (id: string) => void;
}

export function PhaseGroupedPicker({
  items,
  selectedIds,
  currentPhase,
  itemKind,
  onToggle,
}: PhaseGroupedPickerProps) {
  const [openPhases, setOpenPhases] = useState<Record<Phase, boolean>>(() =>
    Object.fromEntries(
      PHASES.map((phase) => [
        phase,
        phase === currentPhase ||
          items.some((item) => item.phase === phase && selectedIds.includes(item.id)),
      ]),
    ) as Record<Phase, boolean>,
  );

  return (
    <div className="space-y-2">
      {groupPhaseItems(items).map(({ phase, items: phaseItems }) => {
        const selectedCount = phaseItems.filter((item) =>
          selectedIds.includes(item.id),
        ).length;
        return (
          <details
            key={phase}
            open={openPhases[phase]}
            onToggle={(event) => {
              const open = event.currentTarget.open;
              setOpenPhases((previous) =>
                previous[phase] === open ? previous : { ...previous, [phase]: open },
              );
            }}
            className="rounded-md border border-gray-200 dark:border-gray-700"
          >
            <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <span className="flex items-center gap-1.5">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 transition-transform ${openPhases[phase] ? 'rotate-90' : ''}`}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span>{phase}</span>
              </span>
              <span className="flex items-center gap-2 text-xs font-normal text-gray-500">
                {phase === currentPhase && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                    Current
                  </span>
                )}
                {selectedCount > 0 && <span>{selectedCount} selected</span>}
              </span>
            </summary>
            <fieldset className="space-y-1 border-t border-gray-200 p-2 dark:border-gray-700">
              <legend className="sr-only">
                {phase} {itemKind}
              </legend>
              {phaseItems.map((item) => (
                <label
                  key={item.id}
                  className="flex min-h-9 items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => onToggle(item.id)}
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{item.title}</span>
                </label>
              ))}
              {phaseItems.length === 0 && (
                <p className="px-2 py-1 text-sm text-gray-400">
                  No {itemKind} set up for {phase} yet.
                </p>
              )}
            </fieldset>
          </details>
        );
      })}
    </div>
  );
}

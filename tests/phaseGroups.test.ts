import assert from 'node:assert/strict';
import test from 'node:test';
import { filterValidPhaseItemIds, groupPhaseItems } from '../src/lib/phaseGroups.ts';

const items = [
  { id: 'phase-3-skill', phase: 'Phase 3' as const },
  { id: 'phase-1-skill', phase: 'Phase 1' as const },
  { id: 'phase-2-skill', phase: 'Phase 2' as const },
];

test('phase items are grouped in curriculum order rather than input order', () => {
  const groups = groupPhaseItems(items);
  assert.deepEqual(
    groups.map(({ phase, items: phaseItems }) => [
      phase,
      phaseItems.map((item) => item.id),
    ]),
    [
      ['Phase 1', ['phase-1-skill']],
      ['Phase 2', ['phase-2-skill']],
      ['Phase 3', ['phase-3-skill']],
      ['Phase 4', []],
    ],
  );
});

test('valid selections are preserved across phases while stale ids are removed', () => {
  assert.deepEqual(
    filterValidPhaseItemIds(
      ['phase-1-skill', 'phase-3-skill', 'deleted-skill'],
      items,
    ),
    ['phase-1-skill', 'phase-3-skill'],
  );
});

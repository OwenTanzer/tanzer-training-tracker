import type { DogMilestoneCompletion, MilestoneTemplate } from '../types';
import { outcomeLabel } from '../lib/outcomeConfig';

export function MilestoneOutcomeSelect({ milestone, completion, onChange }: {
  milestone: MilestoneTemplate;
  completion: DogMilestoneCompletion | undefined;
  onChange: (outcome: string | null) => void;
}) {
  const recorded = completion?.outcome;
  const recordedLabel = recorded ? completion?.outcomeLabel ?? outcomeLabel(milestone, recorded) : '';
  const historical = !!recorded && (!milestone.allowedOutcomes.includes(recorded) ||
    recordedLabel !== outcomeLabel(milestone, recorded));
  // Prefix offered IDs so a historical display option cannot collide with a
  // user-defined/legacy ID, and selecting its renamed successor fires change.
  const value = historical ? 'recorded' : recorded ? `option:${recorded}` : '';
  return (
    <select
      aria-label={`${milestone.title} outcome`}
      value={value}
      onChange={(event) => {
        const selected = event.target.value;
        if (!selected) onChange(null);
        else if (selected.startsWith('option:')) onChange(selected.slice('option:'.length));
      }}
      className="max-w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
    >
      <option value="">No decision yet</option>
      {historical && <option value="recorded" disabled>{recordedLabel} (recorded)</option>}
      {milestone.allowedOutcomes.map((id) => (
        <option key={id} value={`option:${id}`}>{outcomeLabel(milestone, id)}</option>
      ))}
    </select>
  );
}

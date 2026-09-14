import { useState } from 'react';
import type { MilestoneOutcomeOption, MilestoneTemplate } from '../types';
import { outcomeOptions } from '../lib/outcomeConfig';
import { saveMilestoneOutcomeOptions } from '../data/store';

export function MilestoneOutcomeEditor({ milestone }: { milestone: MilestoneTemplate }) {
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<MilestoneOutcomeOption[]>([]);
  const [error, setError] = useState('');
  function start() {
    setOptions(outcomeOptions(milestone).filter((option) => milestone.allowedOutcomes.includes(option.id)).map((option) => ({ ...option })));
    setError('');
    setEditing(true);
  }
  function add(label = '') {
    setOptions((previous) => [...previous, { id: crypto.randomUUID(), label, completesMilestone: false }]);
  }
  if (!editing) return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">
        {milestone.allowedOutcomes.length
          ? outcomeOptions(milestone).filter((option) => milestone.allowedOutcomes.includes(option.id)).map((option) => option.label).join(' · ')
          : 'No choices yet — add the results this evaluation can have.'}
      </p>
      <button type="button" onClick={start} className="text-sm font-medium text-sky-600 hover:underline">Edit outcome choices</button>
    </div>
  );
  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (saveMilestoneOutcomeOptions(milestone.id, options)) setEditing(false);
      else setError('Use a unique, non-empty name for each choice. If those are valid, check available device storage and try again.');
    }}>
      {options.map((option, index) => (
        <div key={option.id} className="space-y-1 rounded-md border border-gray-200 p-2 dark:border-gray-700">
          <div className="flex gap-2">
            <input aria-label={`Outcome ${index + 1} name`} required value={option.label}
              onChange={(event) => setOptions(options.map((entry) => entry.id === option.id ? { ...entry, label: event.target.value } : entry))}
              className="min-w-0 flex-1 rounded border border-gray-300 bg-transparent px-2 py-1 text-sm dark:border-gray-600" />
            <button type="button" aria-label={`Remove ${option.label || 'choice'}`} onClick={() => setOptions(options.filter((entry) => entry.id !== option.id))}
              className="text-xs text-red-500">Remove</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input type="checkbox" checked={option.completesMilestone}
              onChange={(event) => setOptions(options.map((entry) => entry.id === option.id ? { ...entry, completesMilestone: event.target.checked } : entry))} />
            Completes this milestone
          </label>
        </div>
      ))}
      <button type="button" onClick={() => add()} className="text-sm text-sky-600">+ Add choice</button>
      <p className="text-xs text-gray-500">Completion applies to this milestone only. Release or graduation is a separate action on the dog's profile. Changes apply to future records; earlier results keep their recorded labels.</p>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" className="rounded bg-sky-500 px-3 py-1.5 text-sm font-medium text-white">Save choices</button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-gray-500">Cancel</button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TemplateListEditor } from '../components/TemplateListEditor';
import {
  createChecklistItem,
  createDistractionTemplate,
  createMilestoneTemplate,
  deleteChecklistItem,
  deleteDistractionTemplate,
  deleteMilestoneTemplate,
  renameChecklistItem,
  renameDistractionTemplate,
  renameMilestoneTemplate,
  reorderChecklistItems,
  reorderDistractionTemplates,
  reorderMilestoneTemplates,
  setMilestoneAllowedOutcomes,
  toggleMilestoneFinalOutcomeFlag,
  toggleMilestoneRepeatable,
  toggleMilestoneTerminalOutcome,
  useChecklistItems,
  useDistractionTemplates,
  useMilestoneTemplates,
} from '../data/store';
import { FINAL_OUTCOMES, PHASES, type FinalOutcome, type Phase } from '../types';

export function ManageTemplates() {
  const [phase, setPhase] = useState<Phase>('Phase 1');
  const skills = useChecklistItems(phase);
  const milestones = useMilestoneTemplates(phase);
  const distractions = useDistractionTemplates();

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Link to="/" className="text-sm text-sky-500 hover:underline">
        ← Back to Home
      </Link>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Manage Training Options
        </h1>
        <p className="text-sm text-gray-500">
          These are shared by every dog. Adding, renaming, or removing one here updates
          it everywhere immediately, and progress bars recalculate to match.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PHASES.map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className={
              p === phase
                ? 'rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800'
            }
          >
            {p}
          </button>
        ))}
      </div>

      <TemplateListEditor
        label={`${phase} Skills`}
        addPlaceholder="New skill"
        items={skills}
        onAdd={(title) => createChecklistItem(phase, title)}
        onRename={renameChecklistItem}
        onDelete={deleteChecklistItem}
        onReorder={(orderedIds) => reorderChecklistItems(phase, orderedIds)}
      />

      <div>
        <TemplateListEditor
          label={`${phase} Milestones`}
          addPlaceholder="New milestone"
          items={milestones}
          onAdd={(title) => createMilestoneTemplate(phase, title)}
          onRename={renameMilestoneTemplate}
          onDelete={deleteMilestoneTemplate}
          onReorder={(orderedIds) => reorderMilestoneTemplates(phase, orderedIds)}
          renderExtra={(item) => (
            <>
              <button
                type="button"
                title={
                  item.isFinalOutcomeMilestone
                    ? 'This is the final outcome milestone — click to unmark it'
                    : 'Mark as the final outcome milestone (e.g. Advanced Final Blindfold): dog profiles get a Placement Ready / Additional Objectives / Fail picker for it instead of a plain checkbox'
                }
                onClick={() => toggleMilestoneFinalOutcomeFlag(item.id)}
                className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
                  item.isFinalOutcomeMilestone
                    ? 'border-sky-300 bg-sky-50 text-sky-600 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-400'
                    : 'border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'
                }`}
              >
                🎯 Final outcome
              </button>
              {item.isFinalOutcomeMilestone && (
                <button
                  type="button"
                  title={
                    item.repeatable
                      ? 'This milestone keeps a full history of attempts — click to make it a single, overwritable decision again'
                      : 'Make this milestone repeatable: each recorded outcome adds to a history of attempts (e.g. a failed evaluation, then a passed retake) instead of overwriting the last decision'
                  }
                  onClick={() => toggleMilestoneRepeatable(item.id)}
                  className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
                    item.repeatable
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                      : 'border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800'
                  }`}
                >
                  🔁 Repeatable
                </button>
              )}
            </>
          )}
        />
        <div className="mt-3 space-y-2">
          {milestones
            .filter((item) => item.isFinalOutcomeMilestone)
            .map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {item.title} outcome prompt
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleMilestoneRepeatable(item.id)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${
                      item.repeatable
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                        : 'border-gray-300 text-gray-500 dark:border-gray-600'
                    }`}
                  >
                    Repeatable: {item.repeatable ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    title="Use this one milestone for trainer outcome analytics and automatic release on Fail"
                    onClick={() => toggleMilestoneTerminalOutcome(item.id)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${
                      item.isTerminalOutcomeMilestone
                        ? 'border-violet-300 bg-violet-50 text-violet-600 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-400'
                        : 'border-gray-300 text-gray-500 dark:border-gray-600'
                    }`}
                  >
                    Terminal analytics: {item.isTerminalOutcomeMilestone ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {FINAL_OUTCOMES.map((outcome: FinalOutcome) => {
                    const checked = item.allowedOutcomes.includes(outcome);
                    return (
                      <label key={outcome} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={checked && item.allowedOutcomes.length === 1}
                          onChange={() => setMilestoneAllowedOutcomes(item.id, checked ? item.allowedOutcomes.filter((value) => value !== outcome) : [...item.allowedOutcomes, outcome])}
                        />
                        {outcome}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  These choices apply to future prompts only. Existing dog outcomes and attempt history are preserved.
                </p>
              </div>
            ))}
        </div>

        <p className="text-xs text-gray-400">
          Flag one milestone (e.g. "Advanced Final Blindfold") as the final outcome — dog
          profiles get a Placement Ready / Additional Objectives / Fail picker for it instead of
          a plain checkbox, and Trainer History summarizes the results. A final-outcome
          milestone can also be marked repeatable (e.g. traffic training or the final test
          itself) — each recorded outcome adds to a history of attempts instead of overwriting
          the last one.
        </p>
      </div>

      <div>
        <TemplateListEditor
          label="Distractions"
          addPlaceholder="New distraction"
          items={distractions}
          onAdd={(title) => createDistractionTemplate(title)}
          onRename={renameDistractionTemplate}
          onDelete={deleteDistractionTemplate}
          onReorder={reorderDistractionTemplates}
        />
        <p className="text-xs text-gray-400">
          Shared across every phase — distractions can come up at any point in training.
        </p>
      </div>
    </div>
  );
}

import { FINAL_OUTCOMES, type FinalOutcome, type MilestoneTemplate, type MilestoneOutcomeOption, type DogMilestoneCompletion, type MilestoneOutcomeAttempt } from '../types.ts';

// IDs and ordering belong to the instructor, not a global vocabulary.
export function canonicalAllowedOutcomes(outcomes: readonly FinalOutcome[]): FinalOutcome[] {
  return [...new Set(outcomes.filter((value) => typeof value === 'string' && value.trim()))];
}

export function backfillAllowedOutcomes(outcomes?: readonly FinalOutcome[]): FinalOutcome[] {
  return outcomes === undefined ? [...FINAL_OUTCOMES] : canonicalAllowedOutcomes(outcomes);
}

export function outcomeOptions(template: Pick<MilestoneTemplate, 'allowedOutcomes' | 'outcomeOptions'>): MilestoneOutcomeOption[] {
  return template.outcomeOptions ?? backfillAllowedOutcomes(template.allowedOutcomes).map((id) => ({
    id, label: id, completesMilestone: id === 'Placement Ready',
  }));
}

export function outcomeLabel(template: Pick<MilestoneTemplate, 'allowedOutcomes' | 'outcomeOptions'>, id: string): string {
  return outcomeOptions(template).find((option) => option.id === id)?.label ?? id;
}

export function isMilestoneOutcomeAllowed(
  template: Pick<MilestoneTemplate, 'isFinalOutcomeMilestone' | 'allowedOutcomes' | 'outcomeOptions'>,
  outcome: FinalOutcome,
): boolean {
  return template.isFinalOutcomeMilestone && template.allowedOutcomes.includes(outcome) &&
    outcomeOptions(template).some((option) => option.id === outcome);
}

// Pure migration: no dog status or recorded completion is derived from labels.
export function normalizeMilestoneTemplate(template: MilestoneTemplate): MilestoneTemplate {
  const allowed = backfillAllowedOutcomes(template.allowedOutcomes);
  const options = outcomeOptions({ ...template, allowedOutcomes: allowed });
  return {
    ...template,
    isFinalOutcomeMilestone: template.isFinalOutcomeMilestone ?? false,
    isTerminalOutcomeMilestone: template.isTerminalOutcomeMilestone ?? false,
    repeatable: template.repeatable ?? false,
    outcomeOptions: options,
    allowedOutcomes: allowed.filter((id) => options.some((option) => option.id === id)),
  };
}

// Only the milestone record is writable here. Dog lifecycle is deliberately
// absent from this function's inputs; Release/Reactivate/Graduate are explicit.
export function applyOutcomeToCompletion(
  completion: DogMilestoneCompletion,
  template: MilestoneTemplate,
  outcome: FinalOutcome | null,
  recordedAt: string,
  snapshot?: Pick<MilestoneOutcomeAttempt, 'outcomeLabel' | 'completedMilestone'>,
): void {
  const option = outcomeOptions(template).find((candidate) => candidate.id === outcome);
  completion.outcome = outcome;
  completion.outcomeLabel = outcome === null ? null : snapshot?.outcomeLabel ?? option?.label ?? outcome;
  completion.completed = outcome !== null && (snapshot?.completedMilestone ?? option?.completesMilestone ?? false);
  completion.dateCompleted = completion.completed ? recordedAt : null;
}

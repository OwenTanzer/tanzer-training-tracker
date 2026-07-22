import { FINAL_OUTCOMES, type FinalOutcome, type MilestoneTemplate } from '../types.ts';

export function canonicalAllowedOutcomes(
  outcomes: readonly FinalOutcome[],
): FinalOutcome[] {
  return FINAL_OUTCOMES.filter((outcome) => outcomes.includes(outcome));
}

export function backfillAllowedOutcomes(
  outcomes?: readonly FinalOutcome[],
): FinalOutcome[] {
  const canonical = canonicalAllowedOutcomes(outcomes ?? []);
  return canonical.length > 0 ? canonical : [...FINAL_OUTCOMES];
}

export function isMilestoneOutcomeAllowed(
  template: Pick<MilestoneTemplate, 'isFinalOutcomeMilestone' | 'allowedOutcomes'>,
  outcome: FinalOutcome,
): boolean {
  return template.isFinalOutcomeMilestone && template.allowedOutcomes.includes(outcome);
}

export function terminalOutcomeMilestoneId(
  templates: readonly Pick<MilestoneTemplate, 'id' | 'isTerminalOutcomeMilestone'>[],
): string | null {
  return templates.find((template) => template.isTerminalOutcomeMilestone)?.id ?? null;
}

interface OutcomeRecord {
  dogId: string;
  milestoneTemplateId: string;
  outcome: FinalOutcome | null;
}

export function countTerminalOutcomes(
  records: readonly OutcomeRecord[],
  templates: readonly Pick<MilestoneTemplate, 'id' | 'isTerminalOutcomeMilestone'>[],
): Record<FinalOutcome, number> {
  const terminalId = terminalOutcomeMilestoneId(templates);
  const counts: Record<FinalOutcome, number> = {
    'Placement Ready': 0,
    'Additional Objectives': 0,
    Fail: 0,
  };
  if (!terminalId) return counts;

  records.forEach((record) => {
    if (record.milestoneTemplateId === terminalId && record.outcome) {
      counts[record.outcome] += 1;
    }
  });
  return counts;
}

export function dogHasTerminalFailure(
  dogId: string,
  completions: readonly OutcomeRecord[],
  templates: readonly Pick<MilestoneTemplate, 'id' | 'isTerminalOutcomeMilestone'>[],
): boolean {
  const terminalId = terminalOutcomeMilestoneId(templates);
  if (!terminalId) return false;
  return completions.some(
    (completion) =>
      completion.dogId === dogId &&
      completion.milestoneTemplateId === terminalId &&
      completion.outcome === 'Fail',
  );
}

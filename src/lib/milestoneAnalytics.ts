import type { Dog, DogMilestoneCompletion, MilestoneOutcomeAttempt, MilestoneTemplate } from '../types.ts';
import { outcomeOptions } from './outcomeConfig.ts';

export interface MilestoneStats {
  id: string;
  title: string;
  phase: string;
  outcomes: { id: string; label: string; count: number }[];
  evaluated: number;
  noOutcome: number;
  attempts: number;
}

// One current result per dog per milestone. Retakes are a separate measure.
// Exclusion from success rate intentionally does not enter this calculation.
export function milestoneStatistics(
  dogs: readonly Pick<Dog, 'id'>[],
  templates: readonly MilestoneTemplate[],
  completions: readonly DogMilestoneCompletion[],
  attempts: readonly MilestoneOutcomeAttempt[],
): MilestoneStats[] {
  const dogIds = new Set(dogs.map((dog) => dog.id));
  return [...templates].sort((a, b) => a.phase.localeCompare(b.phase) || a.sortOrder - b.sortOrder)
    .flatMap((template) => {
      const records = completions.filter((record) => record.milestoneTemplateId === template.id && dogIds.has(record.dogId));
      if (!template.isFinalOutcomeMilestone && !records.some((record) => record.outcome)) return [];
      const current = new Map(records.map((record) => [record.dogId, record]));
      const options = outcomeOptions(template);
      const counts = new Map(template.allowedOutcomes.map((id) => [id, {
        id, label: options.find((o) => o.id === id)?.label ?? id, count: 0,
      }]));
      let evaluated = 0;
      for (const record of current.values()) {
        if (!record.outcome) continue;
        const entry = counts.get(record.outcome) ?? {
          id: record.outcome,
          label: `${options.find((o) => o.id === record.outcome)?.label ?? record.outcomeLabel ?? record.outcome} (retired)`,
          count: 0,
        };
        entry.count += 1;
        evaluated += 1;
        counts.set(record.outcome, entry);
      }
      return [{
        id: template.id, title: template.title, phase: template.phase,
        outcomes: [...counts.values()], evaluated, noOutcome: dogIds.size - evaluated,
        attempts: attempts.filter((attempt) => attempt.milestoneTemplateId === template.id && dogIds.has(attempt.dogId)).length,
      }];
    });
}

export function dogStatistics(dogs: readonly Dog[]) {
  const all = [...dogs].sort((a, b) => a.name.localeCompare(b.name));
  const lists = {
    all,
    active: all.filter((dog) => !dog.graduated && !dog.released),
    graduated: all.filter((dog) => dog.graduated),
    released: all.filter((dog) => dog.released),
  };
  function successRate(source: readonly Dog[]) {
    const graduated = source.filter((dog) => dog.graduated).length;
    const released = source.filter((dog) => dog.released).length;
    return { graduated, released, percent: graduated + released ? Math.round(100 * graduated / (graduated + released)) : null };
  }
  return {
    lists,
    overall: successRate(dogs),
    refined: successRate(dogs.filter((dog) => !dog.excludedFromStats)),
  };
}

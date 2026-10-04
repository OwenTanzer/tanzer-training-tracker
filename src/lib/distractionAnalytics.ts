import {
  DISTRACTION_SEVERITIES,
  type DistractionSeverity,
  type DistractionTemplate,
  type TrainingReport,
} from '../types.ts';

const SEVERITY_RANK: Record<DistractionSeverity, number> = {
  Absent: 0,
  Mild: 1,
  Moderate: 2,
  Severe: 3,
};

export interface DistractionTimelinePoint {
  reportId: string;
  date: string;
  severity: DistractionSeverity;
}

export interface DistractionSummary {
  distractionId: string;
  observations: number;
  medianSeverity: DistractionSeverity;
  distribution: Record<DistractionSeverity, number>;
}

function emptyDistribution(): Record<DistractionSeverity, number> {
  return {
    Absent: 0,
    Mild: 0,
    Moderate: 0,
    Severe: 0,
  };
}

export function distractionSeverityRank(severity: DistractionSeverity): number {
  return SEVERITY_RANK[severity];
}

export function distractionTimeline(
  reports: readonly TrainingReport[],
  distractionId: string,
): DistractionTimelinePoint[] {
  return reports
    .flatMap((report) =>
      report.distractions
        .filter((observation) => observation.distractionId === distractionId)
        .map((observation) => ({
          reportId: report.id,
          date: report.sessionDate,
          severity: observation.severity,
          createdDate: report.createdDate,
        })),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdDate.localeCompare(b.createdDate) ||
        a.reportId.localeCompare(b.reportId),
    )
    .map(({ createdDate: _createdDate, ...point }) => point);
}

export function summarizeDistractions(
  reports: readonly TrainingReport[],
): DistractionSummary[] {
  const severitiesById = new Map<string, DistractionSeverity[]>();

  reports.forEach((report) => {
    report.distractions.forEach((observation) => {
      const existing = severitiesById.get(observation.distractionId) ?? [];
      existing.push(observation.severity);
      severitiesById.set(observation.distractionId, existing);
    });
  });

  return [...severitiesById.entries()]
    .map(([distractionId, severities]) => {
      const sorted = [...severities].sort(
        (a, b) => distractionSeverityRank(a) - distractionSeverityRank(b),
      );
      const distribution = emptyDistribution();
      severities.forEach((severity) => {
        distribution[severity] += 1;
      });

      // Ordinal data has no meaningful decimal midpoint. For an even sample,
      // use the lower central observed category rather than inventing a value.
      const medianSeverity = sorted[Math.floor((sorted.length - 1) / 2)];
      return {
        distractionId,
        observations: severities.length,
        medianSeverity,
        distribution,
      };
    })
    .sort((a, b) => a.distractionId.localeCompare(b.distractionId));
}

export function observedSeverityLabels(
  distribution: Record<DistractionSeverity, number>,
): string {
  return DISTRACTION_SEVERITIES.filter((severity) => distribution[severity] > 0)
    .map((severity) => `${severity} ${distribution[severity]}`)
    .join(' / ');
}

// Only local TrainingReports belong here; shared pass-back projections have
// foreign category IDs and must remain in their separate history overlay.
export function reportsForDistraction(
  reports: readonly TrainingReport[],
  dogId: string,
  distractionId: string,
): TrainingReport[] {
  const seen = new Set<string>();
  return reports
    .filter((report) => {
      if (report.dogId !== dogId || seen.has(report.id) ||
          !report.distractions.some((item) => item.distractionId === distractionId)) return false;
      seen.add(report.id);
      return true;
    })
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) ||
      b.createdDate.localeCompare(a.createdDate));
}

export function distractionLabel(
  templates: readonly DistractionTemplate[],
  distractionId: string,
): string {
  return templates.find((template) => template.id === distractionId)?.title.trim() ||
    `Unknown distraction (${distractionId})`;
}

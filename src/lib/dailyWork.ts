export interface DatedDogSession {
  dogId: string;
  sessionDate: string;
}

export interface AssignableDog {
  released: boolean;
  graduated: boolean;
  passBackCopies: readonly unknown[];
}

export type DailyWorkLevel = 'none' | 'once' | 'multiple';

export function sessionCountsByDogOnDate(
  reports: readonly DatedDogSession[],
  date: string,
): Record<string, number> {
  return reports.reduce<Record<string, number>>((counts, report) => {
    if (report.sessionDate === date) {
      counts[report.dogId] = (counts[report.dogId] ?? 0) + 1;
    }
    return counts;
  }, {});
}

export function dailyWorkLevel(count: number): DailyWorkLevel {
  if (count >= 2) return 'multiple';
  if (count === 1) return 'once';
  return 'none';
}

export function isCurrentlyAssigned(dog: AssignableDog): boolean {
  return !dog.released && !dog.graduated && dog.passBackCopies.length === 0;
}

export function isDogNeedingAttention(
  dog: AssignableDog & { id: string; folderId: string },
  pinnedFolderId: string | null,
  yesterdaySessionCounts: Readonly<Record<string, number>>,
): boolean {
  return (
    pinnedFolderId !== null &&
    dog.folderId === pinnedFolderId &&
    isCurrentlyAssigned(dog) &&
    (yesterdaySessionCounts[dog.id] ?? 0) === 0
  );
}

export function dailyWorkSurfaceClass(count: number): string {
  const level = dailyWorkLevel(count);
  if (level === 'multiple') {
    return 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/50';
  }
  if (level === 'once') {
    return 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/35';
  }
  return 'border-gray-200 dark:border-gray-700';
}

export function previousLocalDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(year, month - 1, day, 12);
  previous.setDate(previous.getDate() - 1);
  const previousYear = previous.getFullYear();
  const previousMonth = String(previous.getMonth() + 1).padStart(2, '0');
  const previousDay = String(previous.getDate()).padStart(2, '0');
  return `${previousYear}-${previousMonth}-${previousDay}`;
}

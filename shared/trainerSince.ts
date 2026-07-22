const TRAINER_SINCE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function localCalendarMonth(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function isTrainerSince(value: string, currentMonth = localCalendarMonth()): boolean {
  return TRAINER_SINCE_PATTERN.test(value) && value <= currentMonth;
}

export function trainerSinceFromIso(value: string): string {
  return value.slice(0, 7);
}

export function formatTrainerSince(value: string, locale = 'en-US'): string | null {
  const match = TRAINER_SINCE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return new Date(year, monthIndex, 1, 12).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
}

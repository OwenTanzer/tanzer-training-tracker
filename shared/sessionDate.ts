export function localSessionDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function storedDateOnly(value: string): string {
  return value.slice(0, 10);
}

export function storedLocalCalendarDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return localSessionDate(new Date(value));
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return localSessionDate(new Date(year, month - 1, day, 12)) === value;
}

export function calendarDateAtLocalNoon(value: string): Date {
  return new Date(`${storedDateOnly(value)}T12:00:00`);
}

// A legacy ISO timestamp cannot reveal the trainer's historical timezone.
// UTC is therefore the only deterministic migration that both the browser
// and Worker can reproduce for owner and shared/pass-back views.
export function legacySessionDate(createdDate: string): string {
  return storedDateOnly(createdDate);
}

export function isFutureSessionDate(
  sessionDate: string,
  today = localSessionDate(),
): boolean {
  return sessionDate > today;
}

export function localSessionDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// A legacy ISO timestamp cannot reveal the trainer's historical timezone.
// UTC is therefore the only deterministic migration that both the browser
// and Worker can reproduce for owner and shared/pass-back views.
export function legacySessionDate(createdDate: string): string {
  return createdDate.slice(0, 10);
}

export function isFutureSessionDate(
  sessionDate: string,
  today = localSessionDate(),
): boolean {
  return sessionDate > today;
}

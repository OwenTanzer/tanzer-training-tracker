import { useSyncExternalStore } from 'react';

export type LogLevel = 'info' | 'error';

export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  message: string;
  detail?: string;
}

const STORAGE_KEY = 'abbys-dog-chej:diagnostics:v1';
const MAX_ENTRIES = 200;

let entries: LogEntry[] = loadEntries();
const listeners = new Set<() => void>();

function loadEntries(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage unavailable; diagnostics stay in-memory for this session
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function logEvent(message: string, detail?: string, level: LogLevel = 'info') {
  entries = [
    {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      level,
      message,
      detail,
    },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  persist();
  notify();
}

export function logError(message: string, detail?: string) {
  logEvent(message, detail, 'error');
}

export function clearLog() {
  entries = [];
  persist();
  notify();
}

export function useDiagnosticLog(): LogEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entries,
  );
}

export function installGlobalErrorLogging() {
  window.addEventListener('error', (event) => {
    logError(event.message, event.error?.stack ?? event.filename);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    logError(
      'Unhandled promise rejection',
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
    );
  });
}

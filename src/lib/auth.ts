import { useSyncExternalStore } from 'react';
import * as api from './api';

export interface Session {
  token: string;
  instructorId: string;
  name: string;
}

const SESSION_KEY = 'abbys-dog-chej:session';

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

let session: Session | null = loadSession();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function persistSession() {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    api.setToken(session.token);
  } else {
    localStorage.removeItem(SESSION_KEY);
    api.clearToken();
  }
}

// Keep api.ts's in-memory token in sync with whatever session we loaded at
// module init (api.ts's requests read the token fresh on every call, but it
// needs to be primed once up front).
if (session) api.setToken(session.token);

api.setUnauthorizedHandler(() => {
  session = null;
  persistSession();
  notify();
});

export function useSession(): Session | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
  );
}

export async function login(name: string, passcode: string): Promise<void> {
  const res = await api.login(name, passcode);
  session = { token: res.token, instructorId: res.instructorId, name: res.name };
  persistSession();
  notify();
}

export async function createAccount(name: string, passcode: string): Promise<void> {
  const res = await api.createInstructor(name, passcode);
  session = { token: res.token, instructorId: res.instructorId, name: res.name };
  persistSession();
  notify();
}

export async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch {
    // Best-effort server-side revoke — clear the local session regardless so
    // the user isn't stuck if the server is unreachable.
  }
  session = null;
  persistSession();
  notify();
}

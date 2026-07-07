import { useSyncExternalStore } from 'react';
import * as api from './api';

export interface Session {
  token: string;
  instructorId: string;
  name: string;
  profilePhotoUrl: string | null;
  createdAt: string;
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
  session = {
    token: res.token,
    instructorId: res.instructorId,
    name: res.name,
    profilePhotoUrl: res.profilePhotoUrl,
    createdAt: res.createdAt,
  };
  persistSession();
  notify();
}

export async function createAccount(name: string, passcode: string): Promise<void> {
  const res = await api.createInstructor(name, passcode);
  session = {
    token: res.token,
    instructorId: res.instructorId,
    name: res.name,
    profilePhotoUrl: res.profilePhotoUrl,
    createdAt: res.createdAt,
  };
  persistSession();
  notify();
}

export async function updateAccount(patch: {
  name?: string;
  profilePhotoKey?: string | null;
}): Promise<void> {
  const res = await api.updateAccount(patch);
  if (!session) return;
  session = { ...session, name: res.name, profilePhotoUrl: res.profilePhotoUrl };
  persistSession();
  notify();
}

// A device's session only ever learns a name/photo change through login(),
// createAccount(), or updateAccount() above — never automatically. So a
// second device that's been signed in since before a change (e.g. a photo
// uploaded from the phone) keeps showing stale name/photo indefinitely,
// with no logout required to surface it, unless something calls this.
// App.tsx does, once per session on load.
export async function refreshAccount(): Promise<void> {
  if (!session) return;
  const token = session.token;
  const res = await api.getAccount();
  // A logout or account switch mid-request must not let a stale response
  // overwrite whatever session is active now — mirrors the token check in
  // api.ts's 401 handler and the generation guard in store.ts's
  // hydrateFromServer.
  if (!session || session.token !== token) return;
  session = { ...session, name: res.name, profilePhotoUrl: res.profilePhotoUrl };
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Vite inlines env vars at build time, so a build that forgot to set this
// (a local dev server with no .env.local, or a deploy workflow missing the
// env var) would otherwise silently construct requests like
// "undefined/api/data" — same-origin, so they 404 in a confusing way instead
// of failing obviously. Fail loudly and immediately instead: this throws
// during module evaluation, before the app ever renders.
if (!API_BASE_URL) {
  const message =
    'VITE_API_BASE_URL is not set — the app has no API to talk to. Set it in ' +
    '.env.local for local dev, or as a build-time env var in deploy.yml for production.';
  console.error(message);
  throw new Error(message);
}

const TOKEN_KEY = 'abbys-dog-chej:session-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Registered by auth.ts so a 401 from anywhere can clear the session and
// bounce to the Login screen, without every call site needing its own logic.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const requestToken = auth ? getToken() : null;
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }

  // A 401 only means "your session expired" for a request that actually sent
  // one — the login/create-account endpoints (auth: false) also return 401
  // for a plain wrong passcode, which is a normal error to show verbatim,
  // not a session to clear. It also only means *this browser tab's active
  // session* expired if the token that got rejected is still the current
  // one — a slow request from a session the user has since logged out of
  // (or switched away from) can resolve with a 401 well after a different
  // session has logged in, and must not be allowed to log that new session
  // out too.
  if (auth && response.status === 401) {
    if (getToken() === requestToken) {
      clearToken();
      unauthorizedHandler?.();
    }
    throw new ApiError('Your session expired — please log in again.', 401);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // fall back to the generic message above
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface AccountResponse {
  token: string;
  instructorId: string;
  name: string;
  profilePhotoUrl: string | null;
  createdAt: string;
}

export function createInstructor(name: string, passcode: string): Promise<AccountResponse> {
  return request('/api/instructors', { method: 'POST', body: { name, passcode }, auth: false });
}

export function login(name: string, passcode: string): Promise<AccountResponse> {
  return request('/api/login', { method: 'POST', body: { name, passcode }, auth: false });
}

export function logout(): Promise<{ ok: boolean }> {
  return request('/api/login', { method: 'DELETE' });
}

export interface AccountUpdateResponse {
  instructorId: string;
  name: string;
  profilePhotoUrl: string | null;
}

export function updateAccount(patch: {
  name?: string;
  profilePhotoKey?: string | null;
}): Promise<AccountUpdateResponse> {
  return request('/api/account', { method: 'PATCH', body: patch });
}

export interface DataResponse {
  blob: unknown;
  updatedAt: string;
}

export function fetchData(): Promise<DataResponse> {
  return request('/api/data');
}

export function putData(blob: unknown, expectedUpdatedAt?: string): Promise<{ updatedAt: string }> {
  return request('/api/data', { method: 'PUT', body: { blob, expectedUpdatedAt } });
}

export async function uploadPhoto(blob: Blob): Promise<{ url: string; key: string }> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': blob.type || 'image/jpeg' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/photos`, { method: 'POST', headers, body: blob });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0);
  }

  // See request()'s matching comment: only clear the session if the token
  // that got rejected is still the one currently active.
  if (response.status === 401) {
    if (getToken() === token) {
      clearToken();
      unauthorizedHandler?.();
    }
    throw new ApiError('Your session expired — please log in again.', 401);
  }
  if (!response.ok) {
    throw new ApiError(`Photo upload failed (${response.status})`, response.status);
  }
  return response.json();
}

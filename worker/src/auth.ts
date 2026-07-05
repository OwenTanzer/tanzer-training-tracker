// Bcrypt needs Node's native bindings, unavailable in the Workers V8 isolate,
// so passcodes are hashed with PBKDF2 via the runtime's native Web Crypto
// (crypto.subtle) instead — no external dependency needed.
const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Constant-time-ish comparison so a failed passcode check can't leak timing
// information about how many leading hex characters matched.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function hashPasscode(
  passcode: string,
  saltHex?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passcode),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPasscode(
  passcode: string,
  saltHex: string,
  expectedHash: string,
): Promise<boolean> {
  const { hash } = await hashPasscode(passcode, saltHex);
  return timingSafeEqual(hash, expectedHash);
}

export function generateToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

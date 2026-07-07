import { generateId, generateToken, hashPasscode, sessionExpiry, verifyPasscode } from './auth';
import type { Env } from './types';

// Mirrors the shape of `emptyDatabase()` in the frontend's src/data/db.ts,
// minus the default checklist/milestone seed content (that lives in the
// frontend's defaultChecklist.ts/defaultMilestones.ts). The frontend is
// expected to immediately follow account creation with a real PUT /api/data
// containing its own client-side defaults, so that "what are the default
// skills" logic only lives in one place.
const EMPTY_BLOB = JSON.stringify({
  folders: [],
  dogs: [],
  reports: [],
  locations: [],
  checklistItems: [],
  completions: [],
  milestoneTemplates: [],
  dogMilestoneCompletions: [],
});

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = allowedOrigin(request, env);
  return {
    'Access-Control-Allow-Origin': origin ?? 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function photoUrlForKey(request: Request, key: string | null | undefined): string | null {
  if (!key) return null;
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/photos/${key}`;
}

function json(request: Request, env: Env, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  });
}

function errorResponse(request: Request, env: Env, message: string, status: number): Response {
  return json(request, env, { error: message }, status);
}

async function requireAuth(request: Request, env: Env): Promise<string | Response> {
  const header = request.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) return errorResponse(request, env, 'Missing bearer token', 401);

  const row = await env.DB.prepare('SELECT instructor_id, expires_at FROM sessions WHERE token = ?')
    .bind(token)
    .first<{ instructor_id: string; expires_at: string }>();

  if (!row) return errorResponse(request, env, 'Invalid session', 401);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return errorResponse(request, env, 'Session expired', 401);
  }
  return row.instructor_id;
}

async function handleCreateInstructor(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ name?: string; passcode?: string }>();
  const name = body.name?.trim();
  const passcode = body.passcode;
  if (!name || !passcode) return errorResponse(request, env, 'name and passcode are required', 400);
  if (passcode.length < 4) {
    return errorResponse(request, env, 'Passcode must be at least 4 characters', 400);
  }

  const existing = await env.DB.prepare('SELECT id FROM instructors WHERE name = ? COLLATE NOCASE')
    .bind(name)
    .first();
  if (existing) return errorResponse(request, env, 'That name is already taken', 409);

  const id = generateId();
  const { hash, salt } = await hashPasscode(passcode);
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO instructors (id, name, passcode_hash, passcode_salt, created_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(id, name, hash, salt, now),
    env.DB.prepare(
      'INSERT INTO instructor_data (instructor_id, blob, updated_at) VALUES (?, ?, ?)',
    ).bind(id, EMPTY_BLOB, now),
  ]);

  const token = generateToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, instructor_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(token, id, now, sessionExpiry())
    .run();

  return json(
    request,
    env,
    { token, instructorId: id, name, profilePhotoUrl: null, createdAt: now, updatedAt: now },
    201,
  );
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ name?: string; passcode?: string }>();
  const name = body.name?.trim();
  const passcode = body.passcode;
  if (!name || !passcode) return errorResponse(request, env, 'name and passcode are required', 400);

  const instructor = await env.DB.prepare(
    'SELECT id, passcode_hash, passcode_salt, profile_photo_key, created_at FROM instructors WHERE name = ? COLLATE NOCASE',
  )
    .bind(name)
    .first<{
      id: string;
      passcode_hash: string;
      passcode_salt: string;
      profile_photo_key: string | null;
      created_at: string;
    }>();
  if (!instructor) return errorResponse(request, env, 'Instructor not found', 404);

  const valid = await verifyPasscode(passcode, instructor.passcode_salt, instructor.passcode_hash);
  if (!valid) return errorResponse(request, env, 'Incorrect passcode', 401);

  const token = generateToken();
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token, instructor_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(token, instructor.id, now, sessionExpiry())
    .run();

  return json(
    request,
    env,
    {
      token,
      instructorId: instructor.id,
      name,
      profilePhotoUrl: photoUrlForKey(request, instructor.profile_photo_key),
      createdAt: instructor.created_at,
    },
    200,
  );
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  return json(request, env, { ok: true }, 200);
}

async function handleGetData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare('SELECT blob, updated_at FROM instructor_data WHERE instructor_id = ?')
    .bind(auth)
    .first<{ blob: string; updated_at: string }>();
  if (!row) return errorResponse(request, env, 'No data found for this instructor', 404);

  return json(request, env, { blob: JSON.parse(row.blob), updatedAt: row.updated_at }, 200);
}

async function handlePutData(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json<{ blob?: unknown; expectedUpdatedAt?: string }>();
  if (body.blob === undefined) return errorResponse(request, env, 'blob is required', 400);

  const now = new Date().toISOString();
  const blobJson = JSON.stringify(body.blob);

  // Optimistic concurrency: the client must tell us the updatedAt it last
  // saw. If someone else's write landed first (a second tab/device), zero
  // rows match and we return 409 rather than silently clobbering their
  // change — this exact race is what caused the bug this migration fixes.
  const result = body.expectedUpdatedAt
    ? await env.DB.prepare(
        'UPDATE instructor_data SET blob = ?, updated_at = ? WHERE instructor_id = ? AND updated_at = ?',
      )
        .bind(blobJson, now, auth, body.expectedUpdatedAt)
        .run()
    : await env.DB.prepare('UPDATE instructor_data SET blob = ?, updated_at = ? WHERE instructor_id = ?')
        .bind(blobJson, now, auth)
        .run();

  if (result.meta.changes === 0) {
    return errorResponse(request, env, 'Data changed elsewhere — reload before continuing', 409);
  }

  return json(request, env, { updatedAt: now }, 200);
}

async function handleUploadPhoto(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const contentType = request.headers.get('Content-Type') ?? 'image/jpeg';
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return errorResponse(request, env, 'Empty photo body', 400);
  if (body.byteLength > 8 * 1024 * 1024) {
    return errorResponse(request, env, 'Photo too large (max 8MB)', 413);
  }

  const key = `instructors/${auth}/${generateId()}.jpg`;
  await env.PHOTOS.put(key, body, { httpMetadata: { contentType } });

  return json(request, env, { url: photoUrlForKey(request, key), key }, 201);
}

async function handleUpdateAccount(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json<{ name?: string; profilePhotoKey?: string | null }>();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return errorResponse(request, env, 'name cannot be empty', 400);
    const existing = await env.DB.prepare(
      'SELECT id FROM instructors WHERE name = ? COLLATE NOCASE AND id != ?',
    )
      .bind(name, auth)
      .first();
    if (existing) return errorResponse(request, env, 'That name is already taken', 409);
    updates.push('name = ?');
    values.push(name);
  }

  if (body.profilePhotoKey !== undefined) {
    const key = body.profilePhotoKey;
    if (key !== null) {
      if (!key.startsWith(`instructors/${auth}/`)) {
        return errorResponse(request, env, 'profilePhotoKey does not belong to this instructor', 403);
      }
      const object = await env.PHOTOS.head(key);
      if (!object) return errorResponse(request, env, 'profilePhotoKey does not exist', 400);
    }
    updates.push('profile_photo_key = ?');
    values.push(key);
  }

  if (updates.length === 0) return errorResponse(request, env, 'Nothing to update', 400);

  await env.DB.prepare(`UPDATE instructors SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values, auth)
    .run();

  const row = await env.DB.prepare('SELECT name, profile_photo_key FROM instructors WHERE id = ?')
    .bind(auth)
    .first<{ name: string; profile_photo_key: string | null }>();
  if (!row) return errorResponse(request, env, 'Instructor not found', 404);

  return json(
    request,
    env,
    { instructorId: auth, name: row.name, profilePhotoUrl: photoUrlForKey(request, row.profile_photo_key) },
    200,
  );
}

async function handleGetPhoto(request: Request, env: Env, key: string): Promise<Response> {
  // Deliberately not auth-gated: an <img src="..."> request can't attach an
  // Authorization header. Access control instead relies on the key being
  // two unguessable UUIDs (instructors/{uuid}/{uuid}.jpg) — fine for a
  // low-stakes internal tool, but note this means anyone with the exact URL
  // can view that one photo.
  const object = await env.PHOTOS.get(key);
  if (!object) return errorResponse(request, env, 'Not found', 404);

  return new Response(object.body, {
    status: 200,
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'private, max-age=31536000, immutable',
      ...corsHeaders(request, env),
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const { method } = request;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (pathname === '/' && method === 'GET') {
        return json(request, env, { status: 'ok' });
      }
      if (pathname === '/api/instructors' && method === 'POST') {
        return await handleCreateInstructor(request, env);
      }
      if (pathname === '/api/login' && method === 'POST') {
        return await handleLogin(request, env);
      }
      if (pathname === '/api/login' && method === 'DELETE') {
        return await handleLogout(request, env);
      }
      if (pathname === '/api/data' && method === 'GET') {
        return await handleGetData(request, env);
      }
      if (pathname === '/api/data' && method === 'PUT') {
        return await handlePutData(request, env);
      }
      if (pathname === '/api/photos' && method === 'POST') {
        return await handleUploadPhoto(request, env);
      }
      if (pathname === '/api/account' && method === 'PATCH') {
        return await handleUpdateAccount(request, env);
      }
      if (pathname.startsWith('/api/photos/') && method === 'GET') {
        return await handleGetPhoto(request, env, pathname.slice('/api/photos/'.length));
      }
      return errorResponse(request, env, 'Not found', 404);
    } catch (err) {
      console.error(err);
      return errorResponse(request, env, 'Internal error', 500);
    }
  },
};

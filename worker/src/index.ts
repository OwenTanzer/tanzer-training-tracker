import { legacySessionDate } from '../../shared/sessionDate';
import { isTrainerSince, trainerSinceFromIso } from '../../shared/trainerSince';
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

// Minimal shapes for the specific blob fields this worker actually reads or
// writes (pass-back linkage, reports, and the templates a shared report's
// ids resolve against) — everything else in a blob passes through untouched
// via object spread, same as how handlePutData/handleGetData already treat
// the rest of the blob as opaque JSON.
interface BlobLink {
  linkId: string;
  instructorId: string;
  instructorName: string;
  dogId: string;
  linkedDate: string;
}

interface BlobDog {
  id: string;
  name: string;
  profilePhoto: string | null;
  folderId: string;
  passBackSource: BlobLink | null;
  passBackCopies: BlobLink[];
}

interface BlobFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  sortOrder: number;
  createdDate: string;
  updatedDate: string;
}

interface BlobDistractionObservation {
  distractionId: string;
  severity: string;
}

interface BlobReport {
  id: string;
  dogId: string;
  phase: string;
  redFlag: boolean;
  locationId: string | null;
  notes: string;
  picture: string | null;
  skillIds: string[];
  milestoneIds: string[];
  distractions: BlobDistractionObservation[];
  authorInstructorId: string | null;
  visibility: string;
  sessionDate?: string;
  createdDate: string;
  updatedDate: string;
}

// The Worker reads raw stored blobs directly from D1 — it never goes
// through the frontend's normalizeDatabase (src/data/db.ts), which only
// runs client-side, on load, and isn't guaranteed to have run-and-saved for
// any given account: hydrateFromServer normalizes into the client's
// in-memory state but doesn't PUT the result back, so an account that
// hasn't triggered a mutation since before #32/#33/#34 shipped can still
// have these fields genuinely missing in what's stored server-side. These
// two helpers are the Worker-side equivalent of backfillDogs/backfillReports
// in db.ts, applied only to the fields this file actually reads — an
// undefined passBackCopies would throw on spread (`[...undefined, x]`), and
// an undefined authorInstructorId/visibility would silently exclude an
// old-but-otherwise-eligible report from the shared projection instead of
// correctly defaulting it (mirrors normalizeDatabase's own
// `authorInstructorId ?? ownerInstructorId` rule: a report predating
// authorship tracking was necessarily self-authored by whoever owns the
// blob it's found in).
function normalizeBlobDog(dog: BlobDog): BlobDog {
  return {
    ...dog,
    passBackSource: dog.passBackSource ?? null,
    passBackCopies: dog.passBackCopies ?? [],
  };
}

function normalizeBlobReport(report: BlobReport, ownerInstructorId: string): BlobReport {
  return {
    ...report,
    skillIds: report.skillIds ?? [],
    milestoneIds: report.milestoneIds ?? [],
    distractions: report.distractions ?? [],
    authorInstructorId: report.authorInstructorId ?? ownerInstructorId,
    visibility: report.visibility ?? (report.redFlag ? 'private' : 'shared'),
  };
}

interface BlobTitledItem {
  id: string;
  title: string;
}

interface BlobLocationItem {
  id: string;
  name: string;
}

// Resolves a receiving blob's linked dogs against each source instructor's
// own blob into read-only SharedReportView-shaped records: only reports
// that are both source-authored for that exact link and currently
// visibility: 'shared' are eligible, and every id (skill/milestone/
// distraction/location) is resolved to a label here, at the source, since
// those ids mean nothing in the recipient's own template id space.
function resolveSharedReports(
  ownerDogs: BlobDog[],
  sourceBlobsByInstructorId: Map<string, Record<string, unknown>>,
): unknown[] {
  const shared: unknown[] = [];

  for (const dog of ownerDogs) {
    const link = dog.passBackSource;
    if (!link) continue;
    const sourceBlob = sourceBlobsByInstructorId.get(link.instructorId);
    if (!sourceBlob) continue;

    const sourceReports = (sourceBlob.reports as BlobReport[] | undefined) ?? [];
    const checklistItems = (sourceBlob.checklistItems as BlobTitledItem[] | undefined) ?? [];
    const milestoneTemplates = (sourceBlob.milestoneTemplates as BlobTitledItem[] | undefined) ?? [];
    const distractionTemplates = (sourceBlob.distractionTemplates as BlobTitledItem[] | undefined) ?? [];
    const locations = (sourceBlob.locations as BlobLocationItem[] | undefined) ?? [];

    const skillTitle = (id: string) => checklistItems.find((c) => c.id === id)?.title ?? id;
    const milestoneTitle = (id: string) => milestoneTemplates.find((m) => m.id === id)?.title ?? id;
    const distractionTitle = (id: string) =>
      distractionTemplates.find((d) => d.id === id)?.title ?? id;
    const locationName = (id: string | null) =>
      id ? (locations.find((l) => l.id === id)?.name ?? null) : null;

    for (const report of sourceReports) {
      if (
        report.dogId !== link.dogId ||
        report.authorInstructorId !== link.instructorId ||
        report.visibility !== 'shared'
      ) {
        continue;
      }
      shared.push({
        id: `shared:${link.linkId}:${report.id}`,
        dogId: dog.id,
        sourceInstructorId: link.instructorId,
        sourceDogId: link.dogId,
        sourceReportId: report.id,
        phase: report.phase,
        locationLabel: locationName(report.locationId),
        notes: report.notes,
        picture: report.picture,
        skillLabels: report.skillIds.map(skillTitle),
        milestoneLabels: report.milestoneIds.map(milestoneTitle),
        distractionLabels: report.distractions.map((d) => ({
          title: distractionTitle(d.distractionId),
          severity: d.severity,
        })),
        authorInstructorName: link.instructorName,
        sessionDate: report.sessionDate ?? legacySessionDate(report.createdDate),
        createdDate: report.createdDate,
        updatedDate: report.updatedDate,
      });
    }
  }

  return shared;
}

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
    env.DB.prepare(
      'INSERT INTO instructor_profiles (instructor_id, trainer_since) VALUES (?, ?)',
    ).bind(id, trainerSinceFromIso(now)),
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
    {
      token,
      instructorId: id,
      name,
      profilePhotoUrl: null,
      trainerSince: trainerSinceFromIso(now),
      createdAt: now,
      updatedAt: now,
    },
    201,
  );
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ name?: string; passcode?: string }>();
  const name = body.name?.trim();
  const passcode = body.passcode;
  if (!name || !passcode) return errorResponse(request, env, 'name and passcode are required', 400);

  const instructor = await env.DB.prepare(
    `SELECT i.id, i.passcode_hash, i.passcode_salt, i.profile_photo_key, i.created_at,
            COALESCE(p.trainer_since, substr(i.created_at, 1, 7)) AS trainer_since
       FROM instructors i
       LEFT JOIN instructor_profiles p ON p.instructor_id = i.id
      WHERE i.name = ? COLLATE NOCASE`,
  )
    .bind(name)
    .first<{
      id: string;
      passcode_hash: string;
      passcode_salt: string;
      profile_photo_key: string | null;
      trainer_since: string;
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
      trainerSince: instructor.trainer_since,
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

  const blob = JSON.parse(row.blob) as Record<string, unknown>;

  // Sync projection (#32/#34): recomputed fresh on every fetch rather than
  // copied once and left to drift, so a report going private just stops
  // appearing on the next GET and a newly-shared one just starts — no
  // separate "un-sync" step needed anywhere.
  const dogs = ((blob.dogs as BlobDog[] | undefined) ?? []).map(normalizeBlobDog);
  const sourceInstructorIds = Array.from(
    new Set(
      dogs
        .map((dog) => dog.passBackSource?.instructorId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );

  let sharedReports: unknown[] = [];
  if (sourceInstructorIds.length > 0) {
    const placeholders = sourceInstructorIds.map(() => '?').join(', ');
    const sourceRows = await env.DB.prepare(
      `SELECT instructor_id, blob FROM instructor_data WHERE instructor_id IN (${placeholders})`,
    )
      .bind(...sourceInstructorIds)
      .all<{ instructor_id: string; blob: string }>();
    const sourceBlobsByInstructorId = new Map(
      sourceRows.results.map((r) => {
        const sourceBlob = JSON.parse(r.blob) as Record<string, unknown>;
        const rawReports = (sourceBlob.reports as BlobReport[] | undefined) ?? [];
        const normalizedReports = rawReports.map((report) =>
          normalizeBlobReport(report, r.instructor_id),
        );
        return [r.instructor_id, { ...sourceBlob, reports: normalizedReports }];
      }),
    );
    sharedReports = resolveSharedReports(dogs, sourceBlobsByInstructorId);
  }

  return json(request, env, { blob, updatedAt: row.updated_at, sharedReports }, 200);
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

// Creates the linked pass-back copy (#32/#34): a brand-new Dog in the target
// instructor's own blob, carrying passBackSource back to the origin, plus a
// row in dog_transfers recording the relation authoritatively. This is the
// first endpoint that ever writes to two different instructors' rows in one
// request — everything else in this file is scoped to the caller's own
// instructor_id only.
//
// The transfer relation itself lives in dog_transfers (a single-row INSERT,
// no CAS ambiguity — link_id is always a fresh UUID) rather than inside two
// opaque blob columns, specifically to avoid coupling this endpoint's
// atomicity to *two* independent whole-blob CAS writes. Only the target
// blob write (materializing the copy Dog) is CAS'd against a genuine,
// routine race — a concurrent edit from the target instructor's own other
// session. The dog_transfers insert that follows it can only fail on an
// actual DB error, not a routine concurrent edit, so the "did the whole
// transfer land" question no longer depends on two independent optimistic
// writes both landing in the same request. The source blob's
// passBackCopies entry (kept for display continuity — see BlobDog) is now a
// best-effort denormalized cache, not authoritative: if that write loses a
// race, the transfer has still fully succeeded (target dog created,
// dog_transfers row inserted), so it's simply retried on a best-effort
// basis rather than rolled back.
async function handleTransferDog(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json<{
    dogId?: string;
    targetInstructorName?: string;
    allowDuplicate?: boolean;
  }>();
  const dogId = body.dogId;
  const targetInstructorName = body.targetInstructorName?.trim();
  if (!dogId || !targetInstructorName) {
    return errorResponse(request, env, 'dogId and targetInstructorName are required', 400);
  }

  const sourceRow = await env.DB.prepare(
    'SELECT blob, updated_at FROM instructor_data WHERE instructor_id = ?',
  )
    .bind(auth)
    .first<{ blob: string; updated_at: string }>();
  if (!sourceRow) return errorResponse(request, env, 'No data found for this instructor', 404);

  const sourceBlob = JSON.parse(sourceRow.blob) as Record<string, unknown>;
  // Normalized before use: an old, never-resaved dog record with no
  // passBackCopies at all would otherwise throw on `[...d.passBackCopies, x]`
  // below (spreading undefined) — see normalizeBlobDog's own comment.
  const sourceDogs = ((sourceBlob.dogs as BlobDog[] | undefined) ?? []).map(normalizeBlobDog);
  const sourceDog = sourceDogs.find((d) => d.id === dogId);
  if (!sourceDog) return errorResponse(request, env, 'Dog not found', 404);

  const sourceInstructor = await env.DB.prepare('SELECT name FROM instructors WHERE id = ?')
    .bind(auth)
    .first<{ name: string }>();
  if (!sourceInstructor) return errorResponse(request, env, 'Instructor not found', 404);

  // First endpoint that exposes another instructor's identity to an
  // authenticated peer — scoped to an exact-name lookup only, same query
  // shape as the existing name-uniqueness checks in handleCreateInstructor/
  // handleUpdateAccount, not a general list/search.
  const target = await env.DB.prepare('SELECT id, name FROM instructors WHERE name = ? COLLATE NOCASE')
    .bind(targetInstructorName)
    .first<{ id: string; name: string }>();
  if (!target) return errorResponse(request, env, 'Instructor not found', 404);
  if (target.id === auth) {
    return errorResponse(request, env, 'Cannot transfer a dog to yourself', 400);
  }

  // Idempotency: repeating the same transfer (double-tap, retried request)
  // must not silently fork the dog into two divergent copies. Queries
  // dog_transfers rather than sourceDog.passBackCopies — the latter is now
  // a best-effort cache that can legitimately lag behind, so it's no longer
  // safe to treat as authoritative for this check.
  const existingTransfer = await env.DB.prepare(
    'SELECT link_id, target_dog_id, linked_date FROM dog_transfers WHERE source_dog_id = ? AND target_instructor_id = ?',
  )
    .bind(dogId, target.id)
    .first<{ link_id: string; target_dog_id: string; linked_date: string }>();
  if (existingTransfer && !body.allowDuplicate) {
    return json(
      request,
      env,
      {
        alreadyLinked: true,
        link: {
          linkId: existingTransfer.link_id,
          instructorId: target.id,
          instructorName: target.name,
          dogId: existingTransfer.target_dog_id,
          linkedDate: existingTransfer.linked_date,
        },
        updatedAt: sourceRow.updated_at,
      },
      200,
    );
  }

  const targetRow = await env.DB.prepare(
    'SELECT blob, updated_at FROM instructor_data WHERE instructor_id = ?',
  )
    .bind(target.id)
    .first<{ blob: string; updated_at: string }>();
  if (!targetRow) return errorResponse(request, env, 'Instructor not found', 404);

  const targetBlob = JSON.parse(targetRow.blob) as Record<string, unknown>;
  const targetFolders = (targetBlob.folders as BlobFolder[] | undefined) ?? [];
  const targetDogs = (targetBlob.dogs as BlobDog[] | undefined) ?? [];

  const now = new Date().toISOString();

  // A brand-new account may have zero folders, and the source instructor
  // can't see the target's folder tree to pick one — find-or-create a
  // well-known root-level landing spot; the recipient can move it later.
  let passBacksFolder = targetFolders.find(
    (f) => f.parentFolderId === null && f.name === 'Pass-backs',
  );
  let updatedFolders = targetFolders;
  if (!passBacksFolder) {
    passBacksFolder = {
      id: generateId(),
      name: 'Pass-backs',
      parentFolderId: null,
      sortOrder: targetFolders.filter((f) => f.parentFolderId === null).length,
      createdDate: now,
      updatedDate: now,
    };
    updatedFolders = [...targetFolders, passBacksFolder];
  }

  const linkId = generateId();
  const newDogId = generateId();
  const newDog = {
    id: newDogId,
    name: sourceDog.name,
    profilePhoto: sourceDog.profilePhoto,
    folderId: passBacksFolder.id,
    sortOrder: targetDogs.filter((d) => d.folderId === passBacksFolder!.id).length,
    currentPhase: 'Phase 1',
    graduationProgress: 0,
    graduationStatus: 'Not Started',
    released: false,
    releasedDate: null,
    graduated: false,
    graduatedDate: null,
    // Defaults excluded from the receiving instructor's stats — it's
    // someone else's training judgment landing here, not this instructor's
    // own outcome; they can flip the existing toggle if they want it counted.
    excludedFromStats: true,
    passBackSource: {
      linkId,
      instructorId: auth,
      instructorName: sourceInstructor.name,
      dogId: sourceDog.id,
      linkedDate: now,
    },
    passBackCopies: [],
    createdDate: now,
    updatedDate: now,
  };

  const updatedTargetBlob = {
    ...targetBlob,
    folders: updatedFolders,
    dogs: [...targetDogs, newDog],
  };

  // Step 1: CAS the target blob write — the one genuine, routine race in
  // this endpoint (the target instructor editing concurrently). Nothing has
  // been committed yet if this fails; the client just retries the whole
  // transfer.
  const targetWrite = await env.DB.prepare(
    'UPDATE instructor_data SET blob = ?, updated_at = ? WHERE instructor_id = ? AND updated_at = ?',
  )
    .bind(JSON.stringify(updatedTargetBlob), now, target.id, targetRow.updated_at)
    .run();
  if (targetWrite.meta.changes === 0) {
    return errorResponse(request, env, 'Target instructor changed elsewhere — try again', 409);
  }

  const newLink: BlobLink = {
    linkId,
    instructorId: target.id,
    instructorName: target.name,
    dogId: newDogId,
    linkedDate: now,
  };

  // Step 2: record the transfer authoritatively. Not CAS'd — link_id is a
  // fresh UUID, so this has no "someone else's write" to race against; it
  // only fails on a genuine DB error. If it does, the target dog now exists
  // without a recorded link — a real inconsistency, but a far rarer failure
  // mode than the target write's routine CAS race, so a best-effort
  // rollback of the target write is enough here rather than a full
  // multi-step compensation scheme.
  try {
    await env.DB.prepare(
      'INSERT INTO dog_transfers (link_id, source_instructor_id, source_dog_id, target_instructor_id, target_dog_id, linked_date) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(linkId, auth, dogId, target.id, newDogId, now)
      .run();
  } catch (err) {
    console.error('dog_transfers insert failed after target blob write succeeded', err);
    await env.DB.prepare(
      'UPDATE instructor_data SET blob = ?, updated_at = ? WHERE instructor_id = ? AND updated_at = ?',
    )
      .bind(targetRow.blob, new Date().toISOString(), target.id, now)
      .run();
    return errorResponse(request, env, 'Transfer could not be recorded — try again', 500);
  }

  // Step 3: best-effort display-continuity update of the source dog's
  // passBackCopies — not part of the transfer's correctness (dog_transfers
  // is already authoritative), so a lost CAS race here just means this
  // field lags until the next successful write touches it. One attempt,
  // no retry, no rollback of steps 1-2 if it doesn't land.
  const updatedSourceBlob = {
    ...sourceBlob,
    dogs: sourceDogs.map((d) =>
      d.id === dogId ? { ...d, passBackCopies: [...d.passBackCopies, newLink] } : d,
    ),
  };
  const sourceWrite = await env.DB.prepare(
    'UPDATE instructor_data SET blob = ?, updated_at = ? WHERE instructor_id = ? AND updated_at = ?',
  )
    .bind(JSON.stringify(updatedSourceBlob), now, auth, sourceRow.updated_at)
    .run();
  const sourceUpdatedAt = sourceWrite.meta.changes > 0 ? now : sourceRow.updated_at;

  return json(request, env, { dog: newDog, link: newLink, updatedAt: sourceUpdatedAt }, 201);
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

// Lets an already-signed-in device (e.g. a laptop with a session from
// before a photo/name change on the phone) pick up the current name/photo
// without forcing a logout+login — see the login/create/PATCH handlers
// above for where those fields actually get written.
async function handleGetAccount(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const row = await env.DB.prepare(
    `SELECT i.name, i.profile_photo_key,
            COALESCE(p.trainer_since, substr(i.created_at, 1, 7)) AS trainer_since
       FROM instructors i
       LEFT JOIN instructor_profiles p ON p.instructor_id = i.id
      WHERE i.id = ?`,
  )
    .bind(auth)
    .first<{ name: string; profile_photo_key: string | null; trainer_since: string }>();
  if (!row) return errorResponse(request, env, 'Instructor not found', 404);

  return json(
    request,
    env,
    {
      instructorId: auth,
      name: row.name,
      profilePhotoUrl: photoUrlForKey(request, row.profile_photo_key),
      trainerSince: row.trainer_since,
    },
    200,
  );
}

async function handleUpdateAccount(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const body = await request.json<{
    name?: string;
    profilePhotoKey?: string | null;
    trainerSince?: string;
  }>();
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

  if (body.trainerSince !== undefined && !isTrainerSince(body.trainerSince)) {
    return errorResponse(request, env, 'trainerSince must use YYYY-MM format', 400);
  }

  if (updates.length === 0 && body.trainerSince === undefined) {
    return errorResponse(request, env, 'Nothing to update', 400);
  }

  if (updates.length > 0) {
    await env.DB.prepare(`UPDATE instructors SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values, auth)
      .run();
  }

  if (body.trainerSince !== undefined) {
    await env.DB.prepare(
      `INSERT INTO instructor_profiles (instructor_id, trainer_since) VALUES (?, ?)
       ON CONFLICT(instructor_id) DO UPDATE SET trainer_since = excluded.trainer_since`,
    )
      .bind(auth, body.trainerSince)
      .run();
  }

  const row = await env.DB.prepare(
    `SELECT i.name, i.profile_photo_key,
            COALESCE(p.trainer_since, substr(i.created_at, 1, 7)) AS trainer_since
       FROM instructors i
       LEFT JOIN instructor_profiles p ON p.instructor_id = i.id
      WHERE i.id = ?`,
  )
    .bind(auth)
    .first<{ name: string; profile_photo_key: string | null; trainer_since: string }>();
  if (!row) return errorResponse(request, env, 'Instructor not found', 404);

  return json(
    request,
    env,
    {
      instructorId: auth,
      name: row.name,
      profilePhotoUrl: photoUrlForKey(request, row.profile_photo_key),
      trainerSince: row.trainer_since,
    },
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
      if (pathname === '/api/dogs/transfer' && method === 'POST') {
        return await handleTransferDog(request, env);
      }
      if (pathname === '/api/photos' && method === 'POST') {
        return await handleUploadPhoto(request, env);
      }
      if (pathname === '/api/account' && method === 'GET') {
        return await handleGetAccount(request, env);
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

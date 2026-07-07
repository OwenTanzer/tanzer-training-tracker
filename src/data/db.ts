import type {
  Dog,
  DogChecklistCompletion,
  DogMilestoneCompletion,
  Folder,
  Location,
  MilestoneTemplate,
  Phase,
  PhaseChecklistItem,
  TrainingReport,
} from '../types';
import { buildDefaultChecklist } from './defaultChecklist';
import { buildDefaultMilestones } from './defaultMilestones';

export interface Database {
  folders: Folder[];
  dogs: Dog[];
  reports: TrainingReport[];
  locations: Location[];
  checklistItems: PhaseChecklistItem[];
  completions: DogChecklistCompletion[];
  milestoneTemplates: MilestoneTemplate[];
  dogMilestoneCompletions: DogMilestoneCompletion[];
  // One-time gate for migrateLegacyDefaultTemplates() (#30) — true means this
  // account's checklist/milestones either started on, or have already been
  // upgraded to, Abby's real defaults, so the migration must never touch them
  // again. Without this, any edit made after a migration run would look
  // "different from Abby's defaults" and get silently overwritten on the next
  // login.
  templatesMigratedToAbbyDefaults: boolean;
}

const STORAGE_KEY = 'abbys-dog-chej:db:v1';

export function emptyDatabase(): Database {
  return {
    folders: [],
    dogs: [],
    reports: [],
    locations: [],
    checklistItems: buildDefaultChecklist(),
    completions: [],
    milestoneTemplates: buildDefaultMilestones(),
    dogMilestoneCompletions: [],
    templatesMigratedToAbbyDefaults: true,
  };
}

// Milestones used to be freeform per-dog entries (dogId, phase, title, completed...).
// They're now global templates shared by every dog, like checklist items, with
// completion tracked separately per dog. This converts any old-shape data on load
// so nobody's existing folders/dogs/reports/milestones are lost in the switch.
interface LegacyMilestone {
  id: string;
  dogId: string;
  phase: Phase;
  title: string;
  completed: boolean;
  dateCompleted: string | null;
  notes: string | null;
  photo: string | null;
  createdDate: string;
  updatedDate: string;
}

function migrateLegacyMilestones(legacy: LegacyMilestone[]): {
  milestoneTemplates: MilestoneTemplate[];
  dogMilestoneCompletions: DogMilestoneCompletion[];
} {
  const milestoneTemplates: MilestoneTemplate[] = [];
  const dogMilestoneCompletions: DogMilestoneCompletion[] = [];
  const templateIdByKey = new Map<string, string>();

  [...legacy]
    .sort((a, b) => a.createdDate.localeCompare(b.createdDate))
    .forEach((m) => {
      const key = `${m.phase}::${m.title}`;
      let templateId = templateIdByKey.get(key);
      if (!templateId) {
        templateId = crypto.randomUUID();
        templateIdByKey.set(key, templateId);
        milestoneTemplates.push({
          id: templateId,
          phase: m.phase,
          title: m.title,
          sortOrder: milestoneTemplates.length,
          createdDate: m.createdDate,
          updatedDate: m.updatedDate,
        });
      }
      dogMilestoneCompletions.push({
        id: m.id,
        dogId: m.dogId,
        milestoneTemplateId: templateId,
        completed: m.completed,
        dateCompleted: m.dateCompleted,
        notes: m.notes,
        photo: m.photo,
      });
    });

  return { milestoneTemplates, dogMilestoneCompletions };
}

// Folders/dogs predating manual drag-reordering (#16) won't have a sortOrder,
// so give each one a stable position based on its existing array order,
// grouped by sibling group (parent folder, or containing folder for dogs).
function backfillSortOrder<T extends { sortOrder?: number }>(
  items: T[],
  groupKey: (item: T) => string,
): (T & { sortOrder: number })[] {
  const counters = new Map<string, number>();
  return items.map((item) => {
    if (typeof item.sortOrder === 'number') return item as T & { sortOrder: number };
    const key = groupKey(item);
    const next = counters.get(key) ?? 0;
    counters.set(key, next + 1);
    return { ...item, sortOrder: next };
  });
}

// Dogs predating the "released" status (#13) won't have these fields in their
// stored JSON at all, so they'd otherwise come back as undefined.
function backfillDogs(dogs: Dog[]): Dog[] {
  return backfillSortOrder(
    dogs.map((dog) => ({
      ...dog,
      released: dog.released ?? false,
      releasedDate: dog.releasedDate ?? null,
    })),
    (dog) => dog.folderId,
  );
}

function backfillFolders(folders: Folder[]): Folder[] {
  return backfillSortOrder(folders, (folder) => folder.parentFolderId ?? 'root');
}

// Reports predating "skills worked on" (#18) won't have skillIds stored.
function backfillReports(reports: TrainingReport[]): TrainingReport[] {
  return reports.map((report) => ({
    ...report,
    skillIds: report.skillIds ?? [],
  }));
}

// Completions predating the "in progress" status (#18) won't have inProgress stored.
function backfillCompletions(completions: DogChecklistCompletion[]): DogChecklistCompletion[] {
  return completions.map((completion) => ({
    ...completion,
    inProgress: completion.inProgress ?? false,
  }));
}

export function normalizeDatabase(parsed: Record<string, unknown>): Database {
  if (
    Array.isArray(parsed.milestoneTemplates) &&
    Array.isArray(parsed.dogMilestoneCompletions)
  ) {
    const database = parsed as unknown as Database;
    database.folders = backfillFolders(database.folders ?? []);
    database.dogs = backfillDogs(database.dogs ?? []);
    database.reports = backfillReports(database.reports ?? []);
    database.completions = backfillCompletions(database.completions ?? []);
    // Accounts persisted before #30 won't have this field at all — treat its
    // absence as "not yet migrated" so migrateLegacyDefaultTemplates() runs
    // for them exactly once.
    database.templatesMigratedToAbbyDefaults = database.templatesMigratedToAbbyDefaults ?? false;
    return database;
  }

  const legacy = Array.isArray(parsed.milestones)
    ? (parsed.milestones as LegacyMilestone[])
    : [];
  const migrated = migrateLegacyMilestones(legacy);

  const database: Database = {
    folders: backfillFolders((parsed.folders as Folder[]) ?? []),
    dogs: backfillDogs((parsed.dogs as Dog[]) ?? []),
    reports: backfillReports((parsed.reports as TrainingReport[]) ?? []),
    locations: (parsed.locations as Location[]) ?? [],
    checklistItems: (parsed.checklistItems as PhaseChecklistItem[]) ?? buildDefaultChecklist(),
    completions: backfillCompletions((parsed.completions as DogChecklistCompletion[]) ?? []),
    milestoneTemplates:
      migrated.milestoneTemplates.length > 0
        ? migrated.milestoneTemplates
        : buildDefaultMilestones(),
    dogMilestoneCompletions: migrated.dogMilestoneCompletions,
    templatesMigratedToAbbyDefaults: (parsed.templatesMigratedToAbbyDefaults as boolean | undefined) ?? false,
  };
  return database;
}

// Reads/writes the legacy single-browser key. normalizeDatabase itself is a
// pure function (safe to reuse for server-fetched blobs too, e.g. from
// store.ts) — this is the only place that persists an upgraded shape back to
// that specific key, since it's the only caller that owns it.
export function loadDatabase(): Database {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const db = emptyDatabase();
    saveDatabase(db);
    return db;
  }
  try {
    const db = normalizeDatabase(JSON.parse(raw));
    saveDatabase(db);
    return db;
  } catch {
    const db = emptyDatabase();
    saveDatabase(db);
    return db;
  }
}

export function saveDatabase(db: Database): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

// Server-backed accounts cache their last-synced blob under a key scoped to
// the instructor, completely separate from the legacy single-browser
// STORAGE_KEY above — that key is reserved for Phase 4's "import this
// browser's existing data" migration and must never be overwritten by the
// server-backed code path, or the very data that migration needs to read
// would be destroyed before it ships.
function serverCacheKey(instructorId: string): string {
  return `abbys-dog-chej:server-cache:${instructorId}`;
}

export interface ServerCacheEntry {
  blob: Database;
  // The server's updated_at as of the last confirmed sync, not a value made
  // up for this cache entry — callers must pass through their own
  // lastKnownUpdatedAt. This is what lets a later PUT built from this cache
  // (e.g. after an offline fallback) still use optimistic concurrency
  // correctly instead of being forced into a blind unconditional write.
  updatedAt: string | null;
}

export function loadServerCache(instructorId: string): ServerCacheEntry | null {
  try {
    const raw = localStorage.getItem(serverCacheKey(instructorId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ServerCacheEntry> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.blob) return null;
    return {
      blob: normalizeDatabase(parsed.blob as unknown as Record<string, unknown>),
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

export function saveServerCache(
  instructorId: string,
  blob: Database,
  updatedAt: string | null,
): boolean {
  try {
    const entry: ServerCacheEntry = { blob, updatedAt };
    localStorage.setItem(serverCacheKey(instructorId), JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

// Marks whether the legacy STORAGE_KEY blob has already been offered for
// import into a server account (either imported or explicitly declined), so
// a device isn't re-prompted on every future login.
const LEGACY_CLAIMED_KEY = 'abbys-dog-chej:db:v1:claimed';

// Side-effect-free read of the legacy key — unlike loadDatabase(), never
// writes STORAGE_KEY, since this is only used to peek at pre-migration data
// for the one-time import prompt, not to adopt it as the active database.
export function peekLegacyDatabase(): Database | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeDatabase(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function hasLegacyContent(db: Database): boolean {
  return (
    db.folders.length > 0 ||
    db.dogs.length > 0 ||
    db.reports.length > 0 ||
    db.locations.length > 0
  );
}

export function isLegacyDataClaimed(): boolean {
  return localStorage.getItem(LEGACY_CLAIMED_KEY) === 'true';
}

export function markLegacyDataClaimed(): void {
  localStorage.setItem(LEGACY_CLAIMED_KEY, 'true');
}

// The legacy blob embeds photos as base64 data: URLs (often multiple MB), so
// it's typically the single largest thing in localStorage. Once it's no
// longer reachable through the import prompt — imported, explicitly
// declined, or superseded by an account that already has its own real data —
// it's pure dead weight sitting between the device and its storage quota.
export function clearLegacyDatabase(): void {
  localStorage.removeItem(STORAGE_KEY);
}

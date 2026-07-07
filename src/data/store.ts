import { useSyncExternalStore } from 'react';
import type {
  Dog,
  DogChecklistCompletion,
  DogMilestoneCompletion,
  Folder,
  GraduationStatus,
  Location,
  MilestoneTemplate,
  Phase,
  PhaseChecklistItem,
  TrainingReport,
} from '../types';
import {
  clearLegacyDatabase,
  emptyDatabase,
  hasLegacyContent,
  isLegacyDataClaimed,
  loadServerCache,
  markLegacyDataClaimed,
  normalizeDatabase,
  peekLegacyDatabase,
  saveServerCache,
  type Database,
} from './db';
import { buildDefaultChecklist } from './defaultChecklist';
import { buildDefaultMilestones } from './defaultMilestones';
import { logError, logEvent } from '../lib/diagnostics';
import { ApiError, fetchData, putData, uploadPhoto } from '../lib/api';
import { dataUrlToBlob } from '../lib/compressImage';

let db: Database = emptyDatabase();
let currentInstructorId: string | null = null;
let hydrated = false;
let lastKnownUpdatedAt: string | null = null;

// Bumped by every hydrateFromServer()/resetLocalStore() call (i.e. every
// session transition). Async work kicked off by an earlier generation checks
// this before applying its result, so a slow response from a session the
// user has since logged out of (or switched away from) can't resurrect that
// session's data into the current one — including PUTting it onto whatever
// account is now active.
let generation = 0;

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
let syncStatus: SyncStatus = 'idle';
let syncInFlight = false;
let pendingSync = false;

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function notify(): boolean {
  // Store actions mutate nested arrays/objects in place for simplicity, but
  // useSyncExternalStore relies on reference equality to detect changes —
  // without this shallow clone, React can skip re-rendering after a mutation
  // and the UI won't reflect the change until something else forces a render.
  db = { ...db };
  let persistedLocally = true;
  if (currentInstructorId) {
    persistedLocally = saveServerCache(currentInstructorId, db, lastKnownUpdatedAt);
    if (!persistedLocally) {
      logError(
        'Local cache save failed',
        'Browser storage is likely full. Try removing an old photo or report, then save again.',
      );
    }
  }
  notifyListeners();
  syncToServer();
  return persistedLocally;
}

// The server holds one JSON blob per instructor. Rather than sending a PUT
// per mutation (which would race against itself — two rapid edits could
// send the same expectedUpdatedAt and the second would spuriously 409
// against its own sibling, not a real cross-device conflict), in-flight
// writes are serialized: at most one PUT runs at a time, and any mutation
// that arrives while one is in flight just marks "there's newer state to
// send" rather than firing a second concurrent request. When the in-flight
// one finishes, the latest db/lastKnownUpdatedAt goes out next.
function syncToServer(): void {
  if (!hydrated) return;
  if (syncInFlight) {
    pendingSync = true;
    return;
  }
  runSync();
}

function runSync(): void {
  const myGeneration = generation;
  syncInFlight = true;
  syncStatus = 'syncing';
  notifyListeners();
  const blobSnapshot = db;
  const expectedUpdatedAt = lastKnownUpdatedAt ?? undefined;
  putData(blobSnapshot, expectedUpdatedAt)
    .then((res) => {
      if (myGeneration !== generation) return;
      lastKnownUpdatedAt = res.updatedAt;
      syncStatus = 'synced';
      // notify()'s cache write happens synchronously at edit time, tagged
      // with whatever lastKnownUpdatedAt was *before* this PUT — it can't
      // know the new value this PUT is about to confirm. Re-saving here with
      // the blob+updatedAt pair that's now actually confirmed keeps the
      // cache from drifting stale relative to the server, which is what an
      // offline-fallback recovery's next save depends on to avoid a false
      // 409 (or, with an even staler cache, a blind overwrite).
      if (currentInstructorId) saveServerCache(currentInstructorId, blobSnapshot, res.updatedAt);
    })
    .catch((err: unknown) => {
      if (myGeneration !== generation) return;
      syncStatus = 'error';
      if (err instanceof ApiError && err.status === 409) {
        logError(
          'Changes not saved',
          "Your data changed elsewhere (another tab or device) — reload the page before continuing so you don't lose recent changes.",
        );
      } else if (err instanceof ApiError && err.status === 401) {
        logError('Signed out', 'Your session expired — log back in to keep syncing your changes.');
      } else {
        logError(
          'Changes not synced yet',
          'Could not reach the server. This change is saved on this device and will sync once back online.',
        );
      }
    })
    .finally(() => {
      // A stale generation's request must not touch syncInFlight/pendingSync
      // at all once a newer session has started — resetLocalStore() already
      // reset both explicitly for the new generation, and by now they may
      // correctly reflect a genuinely in-flight request of *its own*.
      // Unconditionally clearing syncInFlight here would falsely "unlock"
      // that request mid-flight, letting a second one for the same new
      // session fire concurrently — exactly the same-account self-race this
      // queue exists to prevent.
      if (myGeneration !== generation) return;
      syncInFlight = false;
      notifyListeners();
      if (pendingSync) {
        pendingSync = false;
        runSync();
      }
    });
}

export async function hydrateFromServer(instructorId: string): Promise<void> {
  const myGeneration = ++generation;
  currentInstructorId = instructorId;
  try {
    const { blob, updatedAt } = await fetchData();
    // A newer session (another hydrate, or a logout) has since taken over —
    // this response belongs to a session that's no longer active, so drop it
    // rather than resurrecting its data (and instructorId) as if it were current.
    if (myGeneration !== generation) return;
    db = normalizeDatabase(blob as Record<string, unknown>);
    lastKnownUpdatedAt = updatedAt;
    hydrated = true;
    syncStatus = 'synced';
    pruneUnreachableLegacyData();
    notifyListeners();
  } catch (err) {
    if (myGeneration !== generation) return;
    // Offline fallback: fall back to this instructor's last-synced local
    // cache rather than blocking entirely, but only for a genuine network
    // failure — an auth error means the cache may belong to a session that's
    // no longer valid, so surface that instead of silently showing stale data.
    if (err instanceof ApiError && err.status === 0) {
      const cached = loadServerCache(instructorId);
      if (cached) {
        db = cached.blob;
        // Carrying over the updatedAt this cache was last confirmed against
        // (not discarding it) is what keeps optimistic concurrency intact
        // across an offline period — without it, the next edit's PUT would
        // go out with expectedUpdatedAt undefined, which the Worker treats
        // as an unconditional write, silently clobbering anything written
        // by another device in the meantime instead of correctly 409-ing.
        lastKnownUpdatedAt = cached.updatedAt;
        hydrated = true;
        syncStatus = 'error';
        pruneUnreachableLegacyData();
        logError('Showing offline copy', "Could not reach the server, so you're seeing this device's last synced copy.");
        notifyListeners();
        return;
      }
    }
    throw err;
  }
}

// A brand-new account's server blob has empty checklist/milestone arrays —
// the Worker deliberately doesn't know the app's default templates, so the
// client seeds them once here (the same defaults a fresh local install has
// always gotten via emptyDatabase()), right after the first successful hydrate.
export function seedDefaultTemplatesIfEmpty(): void {
  if (db.checklistItems.length > 0 || db.milestoneTemplates.length > 0) return;
  const defaults = emptyDatabase();
  db = {
    ...db,
    checklistItems: defaults.checklistItems,
    milestoneTemplates: defaults.milestoneTemplates,
    templatesMigratedToAbbyDefaults: true,
  };
  notifyListeners();
  syncToServer();
}

function checklistContentSignature(items: PhaseChecklistItem[]): string[] {
  return items
    .map((i) => `${i.phase}::${i.title}::${i.description}::${i.requiredForGraduation}::${i.sortOrder}`)
    .sort();
}

function milestoneContentSignature(items: MilestoneTemplate[]): string[] {
  return items.map((i) => `${i.phase}::${i.title}::${i.sortOrder}`).sort();
}

function sameSignature(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, idx) => v === b[idx]);
}

// One-time migration (#30): every account that predates Abby's real,
// field-tested checklist/milestones gets upgraded to them, replacing whatever
// AI-generated placeholder content (edited or not) it currently has. This is
// intentionally unconditional — unlike an earlier version of this migration,
// it no longer skips accounts just because a title or description was edited.
//
// Guarded by db.templatesMigratedToAbbyDefaults so it only ever runs once per
// account: after it fires (or after seedDefaultTemplatesIfEmpty seeds a brand
// new account directly from Abby's defaults), any edits the trainer makes are
// permanent and never re-clobbered on a later login.
//
// Known tradeoff: checklist/milestone completions are keyed by item ID, and
// Abby's curriculum has no equivalent mapping from the old placeholder items,
// so any completions already recorded against the pre-migration items are
// orphaned (they stop rendering as checked off) once this runs. Accepted
// deliberately — see #30.
export function migrateLegacyDefaultTemplates(): void {
  if (db.templatesMigratedToAbbyDefaults) return;
  if (db.checklistItems.length === 0 && db.milestoneTemplates.length === 0) return; // handled by seed path above

  const targetChecklist = buildDefaultChecklist();
  const targetMilestones = buildDefaultMilestones();
  const alreadyCurrent =
    sameSignature(checklistContentSignature(db.checklistItems), checklistContentSignature(targetChecklist)) &&
    sameSignature(milestoneContentSignature(db.milestoneTemplates), milestoneContentSignature(targetMilestones));

  db = alreadyCurrent
    ? { ...db, templatesMigratedToAbbyDefaults: true }
    : {
        ...db,
        checklistItems: targetChecklist,
        milestoneTemplates: targetMilestones,
        templatesMigratedToAbbyDefaults: true,
      };
  notifyListeners();
  syncToServer();
}

// If this device already ran the pre-backend version of the app, it has real
// data sitting in the legacy single-browser key. Only surfaced when the
// signed-in account's server blob is still empty — never offered against an
// account that already has real data, since importing would silently
// overwrite it via a whole-blob PUT.
//
// This stays available across dismissals on purpose: the legacy blob is only
// ever marked claimed by a *successful* import or an *explicit* "I don't want
// this" decline (see declineLegacyImport), never by a casual "not now" —
// closing the prompt, reloading, or navigating away must not burn the one
// obvious bridge back to a device's only copy of its pre-account data.
export function getImportableLegacyDatabase(): Database | null {
  if (isLegacyDataClaimed()) return null;
  if (hasLegacyContent(db)) return null;
  const legacy = peekLegacyDatabase();
  return legacy && hasLegacyContent(legacy) ? legacy : null;
}

// Permanently stops offering the import. Only call this from an explicit,
// deliberately-confirmed "I don't want to import this" action — never from a
// plain dismiss/"not now", which should just hide the prompt for now without
// touching this.
export function declineLegacyImport(): void {
  markLegacyDataClaimed();
  clearLegacyDatabase();
  notifyListeners();
}

// If this account already has its own real data, getImportableLegacyDatabase()
// will never offer this device's pre-account blob for import (it only offers
// import into an empty account) — so a device that reached "has legacy data"
// and "already has a populated account" without ever explicitly importing or
// declining (e.g. the account was populated on a different device, or before
// this cleanup existed) would otherwise keep that now-unreachable blob
// forever, quietly eating into the device's storage quota.
function pruneUnreachableLegacyData(): void {
  if (isLegacyDataClaimed()) return;
  if (!hasLegacyContent(db)) return;
  markLegacyDataClaimed();
  clearLegacyDatabase();
}

// Reactive (unlike calling getImportableLegacyDatabase() directly in a render
// body), so a badge driven by this updates the moment an import completes or
// gets declined elsewhere — e.g. from the Diagnostics page, a route Diagnostics
// itself is mounted under, not the component holding this hook.
export function useLegacyImportAvailable(): boolean {
  return useSyncExternalStore(subscribe, () => getImportableLegacyDatabase() !== null);
}

async function uploadEmbeddedPhoto(value: string | null): Promise<string | null> {
  if (!value || !value.startsWith('data:')) return value;
  const blob = await dataUrlToBlob(value);
  const { url } = await uploadPhoto(blob);
  return url;
}

// Legacy photos are embedded as base64 data: URLs; the server blob expects
// R2 URLs instead, so each one is uploaded individually before the whole-blob
// PUT. Left un-caught on failure (see importLegacyDatabase) so the caller can
// offer a retry rather than importing with some photos silently dropped.
async function migratePhotosToServer(source: Database): Promise<Database> {
  const dogs = await Promise.all(
    source.dogs.map(async (dog) => ({
      ...dog,
      profilePhoto: await uploadEmbeddedPhoto(dog.profilePhoto),
    })),
  );
  const reports = await Promise.all(
    source.reports.map(async (report) => ({
      ...report,
      picture: await uploadEmbeddedPhoto(report.picture),
    })),
  );
  const dogMilestoneCompletions = await Promise.all(
    source.dogMilestoneCompletions.map(async (completion) => ({
      ...completion,
      photo: await uploadEmbeddedPhoto(completion.photo),
    })),
  );
  return { ...source, dogs, reports, dogMilestoneCompletions };
}

// Runs outside the normal serialized sync queue and awaits the PUT directly
// (rather than the fire-and-forget syncToServer()) so the caller can show a
// real success/failure result and only mark the legacy data claimed once
// it's actually confirmed saved on the server.
export async function importLegacyDatabase(legacy: Database): Promise<void> {
  const myGeneration = generation;
  const migrated = await migratePhotosToServer(legacy);
  const expectedUpdatedAt = lastKnownUpdatedAt ?? undefined;
  const { updatedAt } = await putData(migrated, expectedUpdatedAt);
  // The session this import was started for is no longer active (e.g. the
  // user logged out mid-upload) — the data landed on the server under that
  // session's account, but applying it to *this* generation's local state
  // would show one account's just-imported data under a different one.
  if (myGeneration !== generation) return;
  db = migrated;
  lastKnownUpdatedAt = updatedAt;
  syncStatus = 'synced';
  if (currentInstructorId) saveServerCache(currentInstructorId, db, lastKnownUpdatedAt);
  markLegacyDataClaimed();
  clearLegacyDatabase();
  notifyListeners();
}

export function resetLocalStore(): void {
  generation++;
  db = emptyDatabase();
  currentInstructorId = null;
  hydrated = false;
  lastKnownUpdatedAt = null;
  syncStatus = 'idle';
  // A PUT belonging to the session being closed may still be in flight (its
  // completion handlers are now moot — see the generation check in
  // runSync()'s .finally()). Declaring the queue empty here, rather than
  // leaving it to that request's own cleanup, means the next session starts
  // with a genuinely clean slate instead of possibly waiting on (or being
  // silently gated behind) a request nobody cares about anymore.
  syncInFlight = false;
  pendingSync = false;
  notifyListeners();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useDatabase(): Database {
  return useSyncExternalStore(subscribe, () => db);
}

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => hydrated);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => syncStatus);
}

export interface DatabaseCounts {
  folders: number;
  dogs: number;
  reports: number;
  locations: number;
  checklistItems: number;
  completions: number;
  milestoneTemplates: number;
  dogMilestoneCompletions: number;
  storageBytes: number;
}

export function useDatabaseCounts(): DatabaseCounts {
  const state = useDatabase();
  return {
    folders: state.folders.length,
    dogs: state.dogs.length,
    reports: state.reports.length,
    locations: state.locations.length,
    checklistItems: state.checklistItems.length,
    completions: state.completions.length,
    milestoneTemplates: state.milestoneTemplates.length,
    dogMilestoneCompletions: state.dogMilestoneCompletions.length,
    storageBytes: JSON.stringify(state).length,
  };
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function statusForProgress(progress: number): GraduationStatus {
  if (progress >= 100) return 'Graduated';
  if (progress >= 75) return 'Near Graduation';
  if (progress > 0) return 'In Progress';
  return 'Not Started';
}

export function computeGraduationProgress(dogId: string): number {
  const total = db.checklistItems.length + db.milestoneTemplates.length;
  if (total === 0) return 0;
  const completedChecklist = db.completions.filter(
    (c) => c.dogId === dogId && c.completed,
  ).length;
  const completedMilestones = db.dogMilestoneCompletions.filter(
    (c) => c.dogId === dogId && c.completed,
  ).length;
  return Math.round(((completedChecklist + completedMilestones) / total) * 100);
}

function refreshDogProgress(dogId: string) {
  const dog = db.dogs.find((d) => d.id === dogId);
  if (!dog) return;
  const progress = computeGraduationProgress(dogId);
  dog.graduationProgress = progress;
  dog.graduationStatus = statusForProgress(progress);
  dog.updatedDate = now();
}

function refreshAllDogsProgress() {
  db.dogs.forEach((dog) => {
    const progress = computeGraduationProgress(dog.id);
    dog.graduationProgress = progress;
    dog.graduationStatus = statusForProgress(progress);
  });
}

// ---- Folders ----

export function useFolders(): Folder[] {
  return useDatabase().folders;
}

export function useFolder(id: string | null): Folder | undefined {
  return useDatabase().folders.find((f) => f.id === id);
}

export function useChildFolders(parentFolderId: string | null): Folder[] {
  return useDatabase()
    .folders.filter((f) => f.parentFolderId === parentFolderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createFolder(name: string, parentFolderId: string | null): Folder {
  const siblingCount = db.folders.filter((f) => f.parentFolderId === parentFolderId).length;
  const folder: Folder = {
    id: uid(),
    name,
    parentFolderId,
    sortOrder: siblingCount,
    createdDate: now(),
    updatedDate: now(),
  };
  db.folders.push(folder);
  notify();
  logEvent('Folder created', folder.name);
  return folder;
}

export function reorderFolders(parentFolderId: string | null, orderedIds: string[]): void {
  orderedIds.forEach((id, index) => {
    const folder = db.folders.find((f) => f.id === id && f.parentFolderId === parentFolderId);
    if (folder) folder.sortOrder = index;
  });
  notify();
  logEvent('Folders reordered', `parent ${parentFolderId ?? 'root'}`);
}

export function renameFolder(id: string, name: string): boolean {
  const folder = db.folders.find((f) => f.id === id);
  if (!folder) return false;
  folder.name = name;
  folder.updatedDate = now();
  return notify();
}

function isDescendantOfFolder(candidateId: string, ancestorId: string): boolean {
  let current = db.folders.find((f) => f.id === candidateId);
  while (current?.parentFolderId) {
    if (current.parentFolderId === ancestorId) return true;
    current = db.folders.find((f) => f.id === current!.parentFolderId);
  }
  return false;
}

export interface MoveFolderResult {
  moved: boolean;
  reason?: string;
}

export function moveFolder(id: string, newParentId: string | null): MoveFolderResult {
  const folder = db.folders.find((f) => f.id === id);
  if (!folder) return { moved: false, reason: 'Folder not found.' };
  if (newParentId === id) {
    return { moved: false, reason: "A folder can't be moved into itself." };
  }
  if (newParentId && isDescendantOfFolder(newParentId, id)) {
    return { moved: false, reason: "Can't move a folder into one of its own subfolders." };
  }
  const siblingCount = db.folders.filter(
    (f) => f.parentFolderId === newParentId && f.id !== id,
  ).length;
  folder.parentFolderId = newParentId;
  folder.sortOrder = siblingCount;
  folder.updatedDate = now();
  notify();
  logEvent('Folder moved', `${id} -> ${newParentId ?? 'root'}`);
  return { moved: true };
}

export interface DeleteFolderResult {
  deleted: boolean;
  reason?: string;
}

export function deleteFolder(id: string): DeleteFolderResult {
  const hasSubfolders = db.folders.some((f) => f.parentFolderId === id);
  const hasDogs = db.dogs.some((d) => d.folderId === id);
  if (hasSubfolders || hasDogs) {
    return {
      deleted: false,
      reason: 'This folder still has subfolders or dogs in it. Move or delete them first.',
    };
  }
  db.folders = db.folders.filter((f) => f.id !== id);
  notify();
  logEvent('Folder deleted', id);
  return { deleted: true };
}

// ---- Dogs ----

export function useDogsInFolder(folderId: string): Dog[] {
  return useDatabase()
    .dogs.filter((d) => d.folderId === folderId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function useDog(id: string | undefined): Dog | undefined {
  return useDatabase().dogs.find((d) => d.id === id);
}

export function createDog(
  name: string,
  folderId: string,
  profilePhoto: string | null = null,
): Dog {
  const siblingCount = db.dogs.filter((d) => d.folderId === folderId).length;
  const dog: Dog = {
    id: uid(),
    name,
    profilePhoto,
    folderId,
    sortOrder: siblingCount,
    currentPhase: 'Phase 1',
    graduationProgress: 0,
    graduationStatus: 'Not Started',
    released: false,
    releasedDate: null,
    createdDate: now(),
    updatedDate: now(),
  };
  db.dogs.push(dog);
  notify();
  logEvent('Dog created', dog.name);
  return dog;
}

export function reorderDogs(folderId: string, orderedIds: string[]): void {
  orderedIds.forEach((id, index) => {
    const dog = db.dogs.find((d) => d.id === id && d.folderId === folderId);
    if (dog) dog.sortOrder = index;
  });
  notify();
  logEvent('Dogs reordered', `folder ${folderId}`);
}

export function updateDog(id: string, updates: Partial<Dog>): boolean {
  const dog = db.dogs.find((d) => d.id === id);
  if (!dog) return false;
  Object.assign(dog, updates, { updatedDate: now() });
  return notify();
}

export function releaseDog(id: string): boolean {
  const dog = db.dogs.find((d) => d.id === id);
  if (!dog) return false;
  dog.released = true;
  dog.releasedDate = now();
  dog.updatedDate = now();
  const persisted = notify();
  logEvent('Dog released', id);
  return persisted;
}

export function reactivateDog(id: string): boolean {
  const dog = db.dogs.find((d) => d.id === id);
  if (!dog) return false;
  dog.released = false;
  dog.releasedDate = null;
  dog.updatedDate = now();
  const persisted = notify();
  logEvent('Dog reactivated', id);
  return persisted;
}

export function moveDog(id: string, newFolderId: string): boolean {
  const siblingCount = db.dogs.filter(
    (d) => d.folderId === newFolderId && d.id !== id,
  ).length;
  const persisted = updateDog(id, { folderId: newFolderId, sortOrder: siblingCount });
  logEvent('Dog moved', `${id} -> folder ${newFolderId}`);
  return persisted;
}

export function deleteDog(id: string): void {
  db.dogs = db.dogs.filter((d) => d.id !== id);
  db.reports = db.reports.filter((r) => r.dogId !== id);
  db.completions = db.completions.filter((c) => c.dogId !== id);
  db.dogMilestoneCompletions = db.dogMilestoneCompletions.filter((c) => c.dogId !== id);
  notify();
  logEvent('Dog deleted', id);
}

// ---- Training Reports ----

export function useReportsForDog(dogId: string): TrainingReport[] {
  return useDatabase()
    .reports.filter((r) => r.dogId === dogId)
    .sort((a, b) => b.createdDate.localeCompare(a.createdDate));
}

export function useRedFlaggedReports(): TrainingReport[] {
  return useDatabase()
    .reports.filter((r) => r.redFlag)
    .sort((a, b) => b.createdDate.localeCompare(a.createdDate));
}

export interface NewReportInput {
  dogId: string;
  phase: Phase;
  redFlag: boolean;
  locationId: string | null;
  notes: string;
  picture: string | null;
  skillIds: string[];
}

function markSkillsInProgress(dogId: string, skillIds: string[]) {
  skillIds.forEach((checklistItemId) => {
    let completion = db.completions.find(
      (c) => c.dogId === dogId && c.checklistItemId === checklistItemId,
    );
    if (!completion) {
      completion = {
        id: uid(),
        dogId,
        checklistItemId,
        completed: false,
        inProgress: true,
        dateCompleted: null,
        notes: null,
      };
      db.completions.push(completion);
    } else if (!completion.completed) {
      completion.inProgress = true;
    }
  });
}

// "In progress" is derived from which reports mention a skill — markSkillsInProgress
// sets it, but nothing ever unsets it, so editing a report to drop a skill or
// deleting a report outright would otherwise leave that flag stuck on. Called
// after any edit/delete, this re-scans the dog's remaining reports and clears
// inProgress on any not-yet-completed skill no longer referenced by any of them.
function recomputeDogSkillProgress(dogId: string): void {
  const referencedSkillIds = new Set(
    db.reports.filter((r) => r.dogId === dogId).flatMap((r) => r.skillIds),
  );
  db.completions.forEach((c) => {
    if (c.dogId === dogId && c.inProgress && !c.completed && !referencedSkillIds.has(c.checklistItemId)) {
      c.inProgress = false;
    }
  });
}

export function createReport(
  input: NewReportInput,
): { report: TrainingReport; persisted: boolean } {
  const report: TrainingReport = {
    id: uid(),
    ...input,
    createdDate: now(),
    updatedDate: now(),
  };
  db.reports.push(report);
  if (input.locationId) {
    const location = db.locations.find((l) => l.id === input.locationId);
    if (location) location.lastUsedDate = now();
  }
  markSkillsInProgress(input.dogId, input.skillIds);
  const persisted = notify();
  logEvent(
    'Training report created',
    `dog ${input.dogId}, ${input.phase}${input.redFlag ? ', red-flagged' : ''}, ${input.skillIds.length} skill(s) worked on`,
  );
  return { report, persisted };
}

export function toggleReportRedFlag(id: string): void {
  const report = db.reports.find((r) => r.id === id);
  if (!report) return;
  report.redFlag = !report.redFlag;
  report.updatedDate = now();
  notify();
  logEvent('Report red flag toggled', `report ${id} -> ${report.redFlag}`);
}

export interface UpdateReportInput {
  phase: Phase;
  redFlag: boolean;
  locationId: string | null;
  notes: string;
  picture: string | null;
  skillIds: string[];
}

export function updateReport(id: string, updates: UpdateReportInput): boolean {
  const report = db.reports.find((r) => r.id === id);
  if (!report) return false;
  Object.assign(report, updates, { updatedDate: now() });
  if (updates.locationId) {
    const location = db.locations.find((l) => l.id === updates.locationId);
    if (location) location.lastUsedDate = now();
  }
  markSkillsInProgress(report.dogId, updates.skillIds);
  recomputeDogSkillProgress(report.dogId);
  const persisted = notify();
  logEvent('Report updated', id);
  return persisted;
}

export function deleteReport(id: string): void {
  const report = db.reports.find((r) => r.id === id);
  if (!report) return;
  db.reports = db.reports.filter((r) => r.id !== id);
  recomputeDogSkillProgress(report.dogId);
  notify();
  logEvent('Report deleted', id);
}

// ---- Locations ----

export function useLocations(): Location[] {
  return useDatabase().locations;
}

export function createLocation(name: string): Location {
  const location: Location = {
    id: uid(),
    name,
    createdDate: now(),
    lastUsedDate: now(),
  };
  db.locations.push(location);
  notify();
  return location;
}

// ---- Phase Checklists (global "skills" templates) ----

export function useChecklistItems(phase?: Phase): PhaseChecklistItem[] {
  const items = useDatabase().checklistItems;
  const filtered = phase ? items.filter((i) => i.phase === phase) : items;
  return [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createChecklistItem(phase: Phase, title: string): PhaseChecklistItem {
  const siblingCount = db.checklistItems.filter((i) => i.phase === phase).length;
  const item: PhaseChecklistItem = {
    id: uid(),
    phase,
    title,
    description: '',
    requiredForGraduation: true,
    sortOrder: siblingCount,
    createdDate: now(),
    updatedDate: now(),
  };
  db.checklistItems.push(item);
  refreshAllDogsProgress();
  notify();
  logEvent('Skill created', `${phase}: ${title}`);
  return item;
}

export function renameChecklistItem(id: string, title: string): boolean {
  const item = db.checklistItems.find((i) => i.id === id);
  if (!item) return false;
  item.title = title;
  item.updatedDate = now();
  return notify();
}

export function deleteChecklistItem(id: string): void {
  db.checklistItems = db.checklistItems.filter((i) => i.id !== id);
  db.completions = db.completions.filter((c) => c.checklistItemId !== id);
  refreshAllDogsProgress();
  notify();
  logEvent('Skill deleted', id);
}

export function reorderChecklistItem(id: string, direction: 'up' | 'down'): void {
  const item = db.checklistItems.find((i) => i.id === id);
  if (!item) return;
  const siblings = db.checklistItems
    .filter((i) => i.phase === item.phase)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((i) => i.id === id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;
  const other = siblings[swapIndex];
  [item.sortOrder, other.sortOrder] = [other.sortOrder, item.sortOrder];
  notify();
}

export function useDogCompletions(dogId: string): DogChecklistCompletion[] {
  return useDatabase().completions.filter((c) => c.dogId === dogId);
}

export function toggleChecklistCompletion(
  dogId: string,
  checklistItemId: string,
): void {
  let completion = db.completions.find(
    (c) => c.dogId === dogId && c.checklistItemId === checklistItemId,
  );
  if (!completion) {
    completion = {
      id: uid(),
      dogId,
      checklistItemId,
      completed: false,
      inProgress: false,
      dateCompleted: null,
      notes: null,
    };
    db.completions.push(completion);
  }
  completion.completed = !completion.completed;
  completion.dateCompleted = completion.completed ? now() : null;
  if (completion.completed) completion.inProgress = false;
  refreshDogProgress(dogId);
  notify();
  logEvent(
    'Checklist item toggled',
    `dog ${dogId}, item ${checklistItemId} -> ${completion.completed}`,
  );
}

// ---- Milestones (global templates, like checklist items) ----

export function useMilestoneTemplates(phase?: Phase): MilestoneTemplate[] {
  const items = useDatabase().milestoneTemplates;
  const filtered = phase ? items.filter((m) => m.phase === phase) : items;
  return [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createMilestoneTemplate(phase: Phase, title: string): MilestoneTemplate {
  const siblingCount = db.milestoneTemplates.filter((m) => m.phase === phase).length;
  const template: MilestoneTemplate = {
    id: uid(),
    phase,
    title,
    sortOrder: siblingCount,
    createdDate: now(),
    updatedDate: now(),
  };
  db.milestoneTemplates.push(template);
  refreshAllDogsProgress();
  notify();
  logEvent('Milestone template created', `${phase}: ${title}`);
  return template;
}

export function renameMilestoneTemplate(id: string, title: string): boolean {
  const template = db.milestoneTemplates.find((m) => m.id === id);
  if (!template) return false;
  template.title = title;
  template.updatedDate = now();
  return notify();
}

export function deleteMilestoneTemplate(id: string): void {
  db.milestoneTemplates = db.milestoneTemplates.filter((m) => m.id !== id);
  db.dogMilestoneCompletions = db.dogMilestoneCompletions.filter(
    (c) => c.milestoneTemplateId !== id,
  );
  refreshAllDogsProgress();
  notify();
  logEvent('Milestone template deleted', id);
}

export function reorderMilestoneTemplate(id: string, direction: 'up' | 'down'): void {
  const template = db.milestoneTemplates.find((m) => m.id === id);
  if (!template) return;
  const siblings = db.milestoneTemplates
    .filter((m) => m.phase === template.phase)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((m) => m.id === id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;
  const other = siblings[swapIndex];
  [template.sortOrder, other.sortOrder] = [other.sortOrder, template.sortOrder];
  notify();
}

export function useDogMilestoneCompletions(dogId: string): DogMilestoneCompletion[] {
  return useDatabase().dogMilestoneCompletions.filter((c) => c.dogId === dogId);
}

export function toggleDogMilestoneCompletion(
  dogId: string,
  milestoneTemplateId: string,
): void {
  let completion = db.dogMilestoneCompletions.find(
    (c) => c.dogId === dogId && c.milestoneTemplateId === milestoneTemplateId,
  );
  if (!completion) {
    completion = {
      id: uid(),
      dogId,
      milestoneTemplateId,
      completed: false,
      dateCompleted: null,
      notes: null,
      photo: null,
    };
    db.dogMilestoneCompletions.push(completion);
  }
  completion.completed = !completion.completed;
  completion.dateCompleted = completion.completed ? now() : null;
  refreshDogProgress(dogId);
  notify();
  logEvent(
    'Milestone toggled',
    `dog ${dogId}, milestone ${milestoneTemplateId} -> ${completion.completed}`,
  );
}

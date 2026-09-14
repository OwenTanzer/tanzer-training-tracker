import { SyncEngine, copy, equal, type Conflict, type Document, type Status } from '../lib/sync';
import { dogStatistics, milestoneStatistics, type MilestoneStats } from '../lib/milestoneAnalytics';
import {
  isFutureSessionDate,
  isValidCalendarDate,
  localSessionDate,
} from '../../shared/sessionDate';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type {
  Dog,
  DistractionObservation,
  DistractionTemplate,
  DogChecklistCompletion,
  DogEvent,
  DogMilestoneCompletion,
  FinalOutcome,
  Folder,
  GraduationStatus,
  Location,
  MilestoneOutcomeAttempt,
  MilestoneTemplate,
  MilestoneOutcomeOption,
  Phase,
  PhaseChecklistItem,
  SharedReportView,
  TrainingReport,
} from '../types';
import {
  clearLegacyDatabase,
  emptyDatabase,
  hasLegacyContent,
  isLegacyDataClaimed,
  loadServerCache,
  loadOutbox,
  saveOutbox,
  markLegacyDataClaimed,
  normalizeDatabase,
  peekLegacyDatabase,
  saveServerCache,
  type Database,
} from './db';
import { buildDefaultChecklist } from './defaultChecklist';
import { buildDefaultMilestones } from './defaultMilestones';
import { logError, logEvent } from '../lib/diagnostics';
import { ApiError, fetchData, putData, transferDog, uploadPhoto, getToken } from '../lib/api';
import { dataUrlToBlob } from '../lib/compressImage';
import {
  backfillAllowedOutcomes,
  applyOutcomeToCompletion,
  outcomeOptions,
  outcomeLabel,
  isMilestoneOutcomeAllowed,
} from '../lib/outcomeConfig';
import {
  isCurrentlyAssigned,
  isDogNeedingAttention,
  previousLocalDate,
  sessionCountsByDogOnDate,
} from '../lib/dailyWork';
let db: Database = emptyDatabase();
let currentInstructorId: string | null = null;
let hydrated = false;
let storeToken: string | null = null;
// Server-computed, read-only overlay (#32/#34) — populated on every
// hydrateFromServer(), never included in what notify()/syncToServer() PUTs
// (it lives entirely outside `db`), so a recipient's own stored blob can
// never accidentally absorb another instructor's report data.
let sharedReports: SharedReportView[] = [];

// Bumped by every hydrateFromServer()/resetLocalStore() call (i.e. every
// session transition). Async work kicked off by an earlier generation checks
// this before applying its result, so a slow response from a session the
// user has since logged out of (or switched away from) can't resurrect that
// session's data into the current one — including PUTting it onto whatever
// account is now active.
let generation = 0;

export type SyncStatus = Status;
let syncStatus: SyncStatus = 'idle';
let engine: SyncEngine | null = null;
let syncConflicts: Conflict[] = [];
const listeners = new Set<() => void>();
function notifyListeners() { listeners.forEach((listener) => listener()); }
const documentOf = (value: Database): Document => value as unknown as Document;

function notify(): boolean {
  db = { ...db };
  const saved = engine?.stage(documentOf(db)) ?? false;
  syncStatus = engine?.status ?? 'storage-error';
  if (!saved) logError('Local save failed', 'Keep this page open until your changes reach the server. Do not record the same log again.');
  notifyListeners();
  return saved;
}
function syncToServer(): void { notify(); }
export async function retrySync(): Promise<void> { await engine?.flush(); }
export function resolveSyncConflict(index: number, side: 'local' | 'remote'): void { engine?.resolve(index, side); }
export function useSyncConflicts(): Conflict[] { return useSyncExternalStore(subscribe, () => syncConflicts); }
export function getStoreIdentity() { return { generation, instructorId: currentInstructorId }; }
export function getSyncState() { return { status: syncStatus, conflicts: syncConflicts, blob: db }; }

let releaseAccountLock: (() => void) | null = null;
let accountLockDone: Promise<unknown> = Promise.resolve();
async function acquireAccountLock(instructorId: string, ownerGeneration: number): Promise<boolean> {
  releaseAccountLock?.();
  await accountLockDone;
  if (ownerGeneration !== generation) return false;
  if (typeof navigator === 'undefined' || !navigator.locks) {
    if (typeof window === 'undefined') return true; // Non-browser test runtime.
    throw new Error('This browser cannot safely coordinate saved changes. Open the app in an updated browser.');
  }
  return new Promise<boolean>((resolve, reject) => {
    accountLockDone = navigator.locks.request(`training-tracker:${instructorId}`, { ifAvailable: true }, async lock => {
      if (!lock || ownerGeneration !== generation) { resolve(false); return; }
      await new Promise<void>(release => { releaseAccountLock = release; resolve(true); });
    }).catch(reject);
  });
}

export async function hydrateFromServer(instructorId: string, token: string | null = getToken()): Promise<void> {
  const inMemory = currentInstructorId === instructorId ? engine?.envelope() : null;
  const myGeneration = ++generation;
  engine?.stop();
  const acquired = await acquireAccountLock(instructorId, myGeneration);
  if (myGeneration !== generation) return;
  if (!acquired) throw new Error('This account is open in another tab. Close that tab, then retry here so its pending changes stay safe.');
  currentInstructorId = instructorId;
  storeToken = token;
  const pending = inMemory ?? loadOutbox(instructorId);
  const cached = loadServerCache(instructorId);
  let remote: Awaited<ReturnType<typeof fetchData>> | null = null;
  try { remote = await fetchData(token); }
  catch (err) {
    if (myGeneration !== generation) return;
    if (!(err instanceof ApiError) || err.status !== 0 || (!pending && !cached)) throw err;
  }
  if (myGeneration !== generation) return;
  const serverBlob = remote ? normalizeDatabase(remote.blob as Document, instructorId) : null;
  // Old caches did not distinguish confirmed data from pending work. Treat
  // their contents as additions/unknown edits, never infer deletions from
  // their absence. Differences require a choice rather than discarding them.
  const initial = pending ?? (cached ? {
    base: {}, local: documentOf(cached.blob), revision: cached.updatedAt, batchId: crypto.randomUUID(),
  } : { base: documentOf(serverBlob!), local: documentOf(serverBlob!), revision: remote!.updatedAt, batchId: crypto.randomUUID() });
  engine = new SyncEngine({
    read: async () => {
      const response = await fetchData(token);
      return { blob: documentOf(normalizeDatabase(response.blob as Document, instructorId)), updatedAt: response.updatedAt };
    },
    write: (blob, revision) => putData(blob, revision, token),
    persist: (entry) => {
      if (myGeneration !== generation) return false;
      const saved = saveOutbox(instructorId, entry);
      // Compatibility cache is only a convenience; outbox is authoritative.
      if (saved) saveServerCache(instructorId, entry.local as unknown as Database, entry.revision);
      return saved;
    },
    changed: (local, status, conflicts) => {
      if (myGeneration !== generation) return;
      db = copy(local) as unknown as Database;
      syncStatus = status; syncConflicts = conflicts; notifyListeners();
    },
    diagnostic: (event, detail) => logEvent(event, detail),
  }, initial);
  db = copy(initial.local) as unknown as Database;
  sharedReports = (remote?.sharedReports ?? []) as SharedReportView[];
  hydrated = true;
  if (remote) engine.reconcile({ blob: documentOf(serverBlob!), updatedAt: remote.updatedAt });
  else { engine.status = 'pending'; engine.persist(); syncStatus = engine.status; }
  pruneUnreachableLegacyData();
  notifyListeners();
  if (!engine.conflicts.length && !equal(engine.base, engine.local)) void engine.flush();
}

// iOS may suspend JavaScript in the background. Pending work survives there;
// resume the queue when execution/connectivity resumes, without a new edit.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void retrySync());
  window.addEventListener('pageshow', () => void retrySync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void retrySync();
  });
  window.addEventListener('beforeunload', (event) => {
    if (syncStatus === 'storage-error') { event.preventDefault(); event.returnValue = ''; }
  });
}

// A brand-new account's server blob has empty checklist/milestone arrays —
// the Worker deliberately doesn't know the app's default templates, so the
// client seeds them once here (the same defaults a fresh local install has
// always gotten via emptyDatabase()), right after the first successful hydrate.
export function seedDefaultTemplatesIfEmpty(): void {
  if (syncConflicts.length) return;
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
  if (syncConflicts.length) return;
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
      // Legacy reports predate any instructor-id concept, so
      // normalizeDatabase left authorInstructorId null — now that this data
      // is finally being claimed by a real account, tag it with that owner.
      authorInstructorId: report.authorInstructorId ?? currentInstructorId,
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

// Import joins the durable queue. Claim the legacy copy only after server
// acknowledgement; preserve it while offline or awaiting conflict recovery.
export async function importLegacyDatabase(legacy: Database): Promise<void> {
  const myGeneration = generation;
  await retrySync();
  if (myGeneration !== generation || syncStatus !== 'synced') throw new Error('Finish syncing existing changes before importing.');
  const before = copy(db);
  const migrated = await migratePhotosToServer(legacy);
  if (myGeneration !== generation) throw new Error('Account changed. Sign in to the original account before importing.');
  if (!equal(before, db)) throw new Error('Data changed during import. Try importing again.');
  db = migrated;
  notify();
  await retrySync();
  if (myGeneration !== generation || syncStatus !== 'synced') throw new Error('Import is pending. Keep the original data until synchronization completes.');
  markLegacyDataClaimed();
  clearLegacyDatabase();
}

export function resetLocalStore(): void {
  generation++;
  releaseAccountLock?.();
  releaseAccountLock = null;
  db = emptyDatabase();
  currentInstructorId = null;
  storeToken = null;
  hydrated = false;
  sharedReports = [];
  syncStatus = 'idle';
  // In-flight callbacks cannot apply to a newer account; pending work stays
  // in this instructor’s outbox and resumes on a later sign-in.
  engine?.stop();
  engine = null;
  syncConflicts = [];
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
  distractionTemplates: number;
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
    distractionTemplates: state.distractionTemplates.length,
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
  // A graduated dog's displayed progress is frozen (#31) — later edits to the
  // shared checklist/milestone templates change the denominator this would
  // otherwise recompute against, which would retroactively make an already-
  // graduated dog look incomplete.
  if (dog.graduated) return;
  const progress = computeGraduationProgress(dogId);
  dog.graduationProgress = progress;
  dog.graduationStatus = statusForProgress(progress);
  dog.updatedDate = now();
}

function refreshAllDogsProgress() {
  db.dogs.forEach((dog) => {
    if (dog.graduated) return;
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
  // A pinned folder that gets deleted must not leave Trainer History pointing
  // at a dangling id.
  if (db.pinnedFolderId === id) db.pinnedFolderId = null;
  notify();
  logEvent('Folder deleted', id);
  return { deleted: true };
}

// The one folder pinned to the top of Trainer History for quick access.
export function usePinnedFolderId(): string | null {
  return useDatabase().pinnedFolderId;
}

export function setPinnedFolder(folderId: string | null): boolean {
  db.pinnedFolderId = folderId;
  const persisted = notify();
  logEvent('Pinned folder set', folderId ?? 'none');
  return persisted;
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
    releasedByTerminalOutcome: false,
    graduated: false,
    graduatedDate: null,
    excludedFromStats: false,
    passBackSource: null,
    passBackCopies: [],
    createdDate: now(),
    updatedDate: now(),
  };
  db.dogs.push(dog);
  notify();
  logEvent('Dog created', dog.name);
  return dog;
}

export interface TransferDogResult {
  // True when this dog was already passed back to that instructor and the
  // server returned the existing link instead of creating a second copy.
  alreadyLinked: boolean;
  instructorName: string;
}

// Creates a linked pass-back copy of this dog on another instructor's
// account (#32/#34). Flush pending edits first, then reconcile the server’s
// transfer result with edits made while that request was in flight.
export async function transferDogToInstructor(
  dogId: string,
  targetInstructorName: string,
  allowDuplicate = false,
): Promise<TransferDogResult> {
  const myGeneration = generation;
  await retrySync();
  if (myGeneration !== generation || syncStatus !== 'synced') throw new Error('Sync your pending changes before transferring a dog.');
  const response = await transferDog(dogId, targetInstructorName, allowDuplicate, storeToken);
  const result: TransferDogResult = {
    alreadyLinked: response.alreadyLinked ?? false,
    instructorName: response.link.instructorName,
  };

  // A newer session has since taken over — applying this to the current
  // generation's local state would show one account's transfer under a
  // different one (same hazard hydrateFromServer/importLegacyDatabase guard).
  if (myGeneration !== generation) return result;

  // Transfer writes occur on the server. Reconcile them with any edits made
  // while the request was in flight instead of stamping local data confirmed.
  await engine?.refresh();
  logEvent(
    'Dog transferred',
    result.alreadyLinked
      ? `dog ${dogId} already passed back to ${result.instructorName}`
      : `dog ${dogId} -> ${result.instructorName}`,
  );
  return result;
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
  // Released and Graduated are mutually exclusive outcomes for a dog —
  // Graduated status must be removed first (see markDogGraduated's own
  // guard for the reverse direction).
  if (dog.graduated) return false;
  dog.released = true;
  dog.releasedDate = now();
  dog.releasedByTerminalOutcome = false;
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
  dog.releasedByTerminalOutcome = false;
  dog.updatedDate = now();
  const persisted = notify();
  logEvent('Dog reactivated', id);
  return persisted;
}

// Lets a trainer omit one dog (a pass-back, a health release, etc.) from the
// "refined" success-rate calculation on Trainer History without touching
// anything about the dog's actual record — released/graduated status,
// progress, and completions are all completely unaffected.
export function toggleDogExcludedFromStats(id: string): boolean {
  const dog = db.dogs.find((d) => d.id === id);
  if (!dog) return false;
  dog.excludedFromStats = !dog.excludedFromStats;
  dog.updatedDate = now();
  const persisted = notify();
  logEvent('Dog stats-exclusion toggled', `${id} -> ${dog.excludedFromStats}`);
  return persisted;
}

// Checks off every current checklist item and milestone for this dog, then
// freezes graduationProgress/graduationStatus at 100%/Graduated (enforced by
// the `dog.graduated` guard in refreshDogProgress/refreshAllDogsProgress), so
// adding a new skill/milestone template later never makes an already-
// graduated dog look incomplete again.
export function markDogGraduated(
  id: string,
  graduationDate = localSessionDate(),
): boolean {
  const dog = db.dogs.find((d) => d.id === id);
  if (!dog) return false;
  if (!isValidCalendarDate(graduationDate) || isFutureSessionDate(graduationDate)) return false;
  // Released and Graduated are mutually exclusive outcomes for a dog — a
  // released dog must be reactivated first (see releaseDog's own guard for
  // the reverse direction).
  if (dog.released) return false;
  const completedAt = now();

  db.checklistItems.forEach((item) => {
    let completion = db.completions.find(
      (c) => c.dogId === id && c.checklistItemId === item.id,
    );
    if (!completion) {
      completion = {
        id: uid(),
        dogId: id,
        checklistItemId: item.id,
        completed: true,
        inProgress: false,
        dateCompleted: completedAt,
        notes: null,
        flagged: false,
      };
      db.completions.push(completion);
    } else {
      completion.completed = true;
      completion.inProgress = false;
      completion.dateCompleted = completedAt;
    }
  });

  db.milestoneTemplates.forEach((template) => {
    let completion = db.dogMilestoneCompletions.find(
      (c) => c.dogId === id && c.milestoneTemplateId === template.id,
    );
    if (!completion) {
      completion = {
        id: uid(),
        dogId: id,
        milestoneTemplateId: template.id,
        completed: true,
        dateCompleted: completedAt,
        notes: null,
        photo: null,
        outcome: null,
      };
      db.dogMilestoneCompletions.push(completion);
    } else {
      completion.completed = true;
      completion.dateCompleted = completedAt;
    }
  });

  dog.graduated = true;
  dog.graduatedDate = graduationDate;
  dog.graduationStatus = 'Graduated';
  dog.graduationProgress = 100;
  dog.updatedDate = completedAt;
  const persisted = notify();
  logEvent('Dog graduated', id);
  return persisted;
}

export function updateDogGraduationDate(id: string, graduationDate: string): boolean {
  const dog = db.dogs.find((d) => d.id === id);
  if (
    !dog?.graduated ||
    !isValidCalendarDate(graduationDate) ||
    isFutureSessionDate(graduationDate)
  ) {
    return false;
  }
  dog.graduatedDate = graduationDate;
  dog.updatedDate = now();
  const persisted = notify();
  logEvent('Dog graduation date updated', `${id} -> ${graduationDate}`);
  return persisted;
}

// Cheap undo: only lifts the freeze and lets progress recompute live from
// whatever's actually completed — it deliberately does not uncheck anything
// markDogGraduated checked off, since "remove graduated status" and "undo
// every checkbox" are different asks and the latter is easy to do by hand
// from the checklist if that's really what's wanted.
export function removeDogGraduatedStatus(id: string): boolean {
  const dog = db.dogs.find((d) => d.id === id);
  if (!dog) return false;
  dog.graduated = false;
  dog.graduatedDate = null;
  dog.updatedDate = now();
  refreshDogProgress(id);
  const persisted = notify();
  logEvent('Dog graduated status removed', id);
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
  db.dogEvents = db.dogEvents.filter((event) => event.dogId !== id);
  notify();
  logEvent('Dog deleted', id);
}

// ---- Training Reports ----

export function useReportsForDog(dogId: string): TrainingReport[] {
  return useDatabase()
    .reports.filter((r) => r.dogId === dogId)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.createdDate.localeCompare(a.createdDate));
}

// Read-only overlay of another instructor's shared reports on a pass-back
// copy dog (#32/#34) — kept separate from useReportsForDog rather than
// merged into it, since SharedReportView and TrainingReport are different
// shapes (resolved labels vs. ids) meant to render differently; a silent
// merge would force every consumer to type-discriminate.
export function useSharedReportsForDog(dogId: string): SharedReportView[] {
  return useSyncExternalStore(subscribe, () => sharedReports)
    .filter((r) => r.dogId === dogId)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.createdDate.localeCompare(a.createdDate));
}

// Session counts (#35) are purely informational — derived from how many of a
// dog's logs mention a skill/milestone as worked on, independent of whether
// it's since been marked complete. Nothing here drives completion; the
// trainer still does that explicitly via toggleChecklistCompletion /
// toggleDogMilestoneCompletion.
export function useDogSkillSessionCounts(dogId: string): Record<string, number> {
  const reports = useDatabase().reports;
  const counts: Record<string, number> = {};
  reports.forEach((r) => {
    if (r.dogId !== dogId) return;
    r.skillIds.forEach((id) => {
      counts[id] = (counts[id] ?? 0) + 1;
    });
  });
  return counts;
}

export function useDogMilestoneSessionCounts(dogId: string): Record<string, number> {
  const reports = useDatabase().reports;
  const counts: Record<string, number> = {};
  reports.forEach((r) => {
    if (r.dogId !== dogId) return;
    r.milestoneIds.forEach((id) => {
      counts[id] = (counts[id] ?? 0) + 1;
    });
  });
  return counts;
}

function msUntilNextLocalMidnight(): number {
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0); // Date normalizes this to the next day's 00:00.
  return midnight.getTime() - Date.now();
}

// Daily work (#47) is deliberately derived from canonical sessionDate values,
// rather than a resettable flag that can disagree with the training logs.
// Counts therefore update when a report is added, deleted, or backdated and
// cannot be manually hidden. The derived date only rolls
// over on the next render — a tab left open across midnight with nothing
// else triggering a render would otherwise keep showing yesterday's badge
// indefinitely, so this schedules its own re-render for the next local
// midnight (and the one after that, for as long as the component stays
// mounted) purely to force that recomputation.
function useCurrentLocalDate(): string {
  const [date, setDate] = useState(localSessionDate);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      timer = setTimeout(() => {
        setDate(localSessionDate());
        scheduleNext();
      }, msUntilNextLocalMidnight());
    }
    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  return date;
}

export function useDailySessionCounts(): Record<string, number> {
  const reports = useDatabase().reports;
  const today = useCurrentLocalDate();
  // Report writes preserve the nested array reference, so derive this inexpensive
  // count on every database render rather than caching against a stale reference.
  return sessionCountsByDogOnDate(reports, today);
}

export function useDogSessionCountToday(dogId: string): number {
  return useDailySessionCounts()[dogId] ?? 0;
}

export function useRedFlaggedReports(): TrainingReport[] {
  return useDatabase()
    .reports.filter((r) => r.redFlag)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.createdDate.localeCompare(a.createdDate));
}

export interface NewReportInput {
  dogId: string;
  phase: Phase;
  redFlag: boolean;
  locationId: string | null;
  notes: string;
  picture: string | null;
  skillIds: string[];
  milestoneIds: string[];
  distractions: DistractionObservation[];
  sessionDate: string;
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
        flagged: false,
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
  reportId: string = uid(),
): { report: TrainingReport; persisted: boolean } {
  if (!db.dogs.some(d => d.id === input.dogId)) throw new Error('This dog is not in the active account. Reopen the correct dog before saving.');
  const existing = db.reports.find((r) => r.id === reportId);
  if (existing) {
    if (existing.dogId !== input.dogId) throw new Error('This saved log belongs to another dog. Reopen the correct log.');
    return { report: existing, persisted: updateReport(existing.id, input) };
  }
  const report: TrainingReport = {
    id: reportId,
    ...input,
    authorInstructorId: currentInstructorId,
    visibility: input.redFlag ? 'private' : 'shared',
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
    'Training log created',
    `dog ${input.dogId}, ${input.phase}${input.redFlag ? ', red-flagged' : ''}, ${input.skillIds.length} skill(s) worked on`,
  );
  return { report, persisted };
}

export function toggleReportRedFlag(id: string): void {
  const report = db.reports.find((r) => r.id === id);
  if (!report) return;
  report.redFlag = !report.redFlag;
  report.visibility = report.redFlag ? 'private' : 'shared';
  report.updatedDate = now();
  notify();
  logEvent('Log red flag toggled', `log ${id} -> ${report.redFlag}`);
}

export interface UpdateReportInput {
  phase: Phase;
  redFlag: boolean;
  locationId: string | null;
  notes: string;
  picture: string | null;
  skillIds: string[];
  milestoneIds: string[];
  distractions: DistractionObservation[];
  sessionDate: string;
}

export function updateReport(id: string, updates: UpdateReportInput): boolean {
  const report = db.reports.find((r) => r.id === id);
  if (!report) return false;
  Object.assign(report, updates, { updatedDate: now() });
  report.visibility = report.redFlag ? 'private' : 'shared';
  if (updates.locationId) {
    const location = db.locations.find((l) => l.id === updates.locationId);
    if (location) location.lastUsedDate = now();
  }
  markSkillsInProgress(report.dogId, updates.skillIds);
  recomputeDogSkillProgress(report.dogId);
  const persisted = notify();
  logEvent('Log updated', id);
  return persisted;
}

export function deleteReport(id: string): void {
  const report = db.reports.find((r) => r.id === id);
  if (!report) return;
  db.reports = db.reports.filter((r) => r.id !== id);
  recomputeDogSkillProgress(report.dogId);
  notify();
  logEvent('Log deleted', id);
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

export function reorderChecklistItems(phase: Phase, orderedIds: string[]): void {
  orderedIds.forEach((id, index) => {
    const item = db.checklistItems.find((i) => i.id === id && i.phase === phase);
    if (item) item.sortOrder = index;
  });
  notify();
  logEvent('Skills reordered', `phase ${phase}`);
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
      flagged: false,
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

// Independent of completed/in-progress state — a skill can be flagged whether
// it's not started, in progress, or already completed. Kept separate from the
// whole-log red flag (#34), which flags an entire training log rather than
// one specific skill.
export function toggleChecklistItemFlag(dogId: string, checklistItemId: string): void {
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
      flagged: false,
    };
    db.completions.push(completion);
  }
  completion.flagged = !completion.flagged;
  notify();
  logEvent(
    'Checklist item flag toggled',
    `dog ${dogId}, item ${checklistItemId} -> ${completion.flagged}`,
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
    isFinalOutcomeMilestone: false,
    isTerminalOutcomeMilestone: false,
    allowedOutcomes: [],
    outcomeOptions: [],
    repeatable: false,
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

// Outcome prompts never change a dog's release/graduation state.
export function toggleMilestoneFinalOutcomeFlag(id: string): boolean {
  const template = db.milestoneTemplates.find((m) => m.id === id);
  if (!template) return false;
  template.isFinalOutcomeMilestone = !template.isFinalOutcomeMilestone;
  template.updatedDate = now();
  if (template.isFinalOutcomeMilestone) {
    template.allowedOutcomes = backfillAllowedOutcomes(template.allowedOutcomes);
  } else if (template.isTerminalOutcomeMilestone) {
    template.isTerminalOutcomeMilestone = false;
  }
  const persisted = notify();
  logEvent(
    'Milestone final-outcome flag toggled',
    `${id} -> ${template.isFinalOutcomeMilestone}`,
  );
  return persisted;
}

// Changes which choices are offered for future decisions. Existing dog
// completions and repeatable-attempt history are deliberately untouched.
export function saveMilestoneOutcomeOptions(
  id: string,
  offered: readonly MilestoneOutcomeOption[],
): boolean {
  const template = db.milestoneTemplates.find((m) => m.id === id);
  const options = offered.map((option) => ({ ...option, label: option.label.trim() }));
  if (!template || options.some((option) => !option.id || !option.label) ||
      new Set(options.map((o) => o.id)).size !== options.length ||
      new Set(options.map((o) => o.label.toLocaleLowerCase())).size !== options.length) return false;
  // Retain definitions for removed choices; IDs are never reused or remapped.
  const retired = outcomeOptions(template).filter((old) => !options.some((o) => o.id === old.id));
  template.outcomeOptions = [...options, ...retired];
  template.allowedOutcomes = options.map((option) => option.id);
  template.updatedDate = now();
  return notify();
}

// Marks (or unmarks) a milestone as repeatable (#33). Turning it on runs a
// one-time, real migration: any dog that already had a decided outcome on
// this milestone from before it was repeatable gets that decision preserved
// as attempt #1 in the ledger, rather than the history starting blank and
// silently losing it. dateCompleted only ever exists for a Placement Ready
// outcome (see DogMilestoneCompletion) — for Additional Objectives/Fail
// there is no historical timestamp anywhere in the pre-ledger schema, so
// those fall back to today's date and are flagged
// migratedFromLegacyCompletion so the UI can say "date unknown (migrated)"
// instead of presenting a fabricated date as fact.

export function toggleMilestoneRepeatable(id: string): boolean {
  const template = db.milestoneTemplates.find((m) => m.id === id);
  if (!template) return false;
  const turningOn = !template.repeatable;
  template.repeatable = turningOn;
  template.updatedDate = now();

  if (turningOn) {
    const alreadyLedgered = new Set(
      db.milestoneOutcomeAttempts
        .filter((a) => a.milestoneTemplateId === id)
        .map((a) => a.dogId),
    );
    db.dogMilestoneCompletions
      .filter(
        (c) => c.milestoneTemplateId === id && c.outcome !== null && !alreadyLedgered.has(c.dogId),
      )
      .forEach((c) => {
        db.milestoneOutcomeAttempts.push({
          id: uid(),
          dogId: c.dogId,
          milestoneTemplateId: id,
          outcome: c.outcome as FinalOutcome,
          outcomeLabel: c.outcomeLabel ?? outcomeLabel(template, c.outcome!),
          completedMilestone: c.completed,
          attemptDate: c.dateCompleted ?? now(),
          migratedFromLegacyCompletion: true,
          notes: null,
        });
      });
  }

  const persisted = notify();
  logEvent('Milestone repeatable flag toggled', `${id} -> ${template.repeatable}`);
  return persisted;
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

export function reorderMilestoneTemplates(phase: Phase, orderedIds: string[]): void {
  orderedIds.forEach((id, index) => {
    const template = db.milestoneTemplates.find((m) => m.id === id && m.phase === phase);
    if (template) template.sortOrder = index;
  });
  notify();
  logEvent('Milestones reordered', `phase ${phase}`);
}

export function useDogMilestoneCompletions(dogId: string): DogMilestoneCompletion[] {
  return useDatabase().dogMilestoneCompletions.filter((c) => c.dogId === dogId);
}

// Full attempt history for one dog's repeatable milestone (#33), oldest
// first. Reads the ledger directly — no synthetic fallback needed, since by
// the time a milestone is repeatable, toggleMilestoneRepeatable has already
// migrated any pre-existing decision into a real ledger row.
export function useMilestoneAttempts(
  dogId: string,
  milestoneTemplateId: string,
): MilestoneOutcomeAttempt[] {
  return useDatabase()
    .milestoneOutcomeAttempts.filter(
      (a) => a.dogId === dogId && a.milestoneTemplateId === milestoneTemplateId,
    )
    .sort((a, b) => a.attemptDate.localeCompare(b.attemptDate));
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
      outcome: null,
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

function findOrCreateMilestoneCompletion(
  dogId: string,
  milestoneTemplateId: string,
): DogMilestoneCompletion {
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
      outcome: null,
    };
    db.dogMilestoneCompletions.push(completion);
  }
  return completion;
}

// Shared single-decision / retake / undo mutation. Only milestone state is
// touched; dog release and graduation remain explicit profile actions.
function applyMilestoneOutcomeState(
  dogId: string,
  milestoneTemplateId: string,
  outcome: FinalOutcome | null,
  recordedAt = now(),
  snapshot?: Pick<MilestoneOutcomeAttempt, 'outcomeLabel' | 'completedMilestone'>,
): void {
  const completion = findOrCreateMilestoneCompletion(dogId, milestoneTemplateId);
  const template = db.milestoneTemplates.find((m) => m.id === milestoneTemplateId);
  if (!template) return;
  applyOutcomeToCompletion(completion, template, outcome, recordedAt, snapshot);
  refreshDogProgress(dogId);
}

// Single decisions can be corrected or cleared. Dog lifecycle stays unchanged.
export function setMilestoneOutcome(
  dogId: string,
  milestoneTemplateId: string,
  outcome: FinalOutcome | null,
): boolean {
  const template = db.milestoneTemplates.find((m) => m.id === milestoneTemplateId);
  if (!template || template.repeatable || !db.dogs.some((d) => d.id === dogId)) return false;
  if (outcome !== null && !isMilestoneOutcomeAllowed(template, outcome)) return false;
  applyMilestoneOutcomeState(dogId, milestoneTemplateId, outcome);
  const persisted = notify();
  logEvent(
    'Milestone outcome set',
    `dog ${dogId}, milestone ${milestoneTemplateId} -> ${outcome ?? 'cleared'}`,
  );
  return persisted;
}

// Records a new historical attempt on a repeatable final-outcome milestone
// (#33) — the only function that ever appends to milestoneOutcomeAttempts.
// Pushes the event first, then mirrors it into the milestone completion state
// via the exact same applyMilestoneOutcomeState used by the non-repeatable
// path, so "what's the dog's current status" reads identically either way.
export type MilestoneAttemptResult =
  | { applied: false; reason: 'invalid' | 'conflict' }
  | { applied: true; cached: boolean; attemptId: string };

export function recordMilestoneOutcomeAttempt(
  dogId: string,
  milestoneTemplateId: string,
  outcome: FinalOutcome,
  notes: string | null = null,
  attemptId: string = uid(),
): MilestoneAttemptResult {
  // The recording form supplies one ID per attempt, so a repeated submission
  // retries persistence rather than appending a second historical event.
  const existing = db.milestoneOutcomeAttempts.find((attempt) => attempt.id === attemptId);
  if (existing) {
    if (existing.dogId !== dogId || existing.milestoneTemplateId !== milestoneTemplateId ||
        existing.outcome !== outcome || existing.notes !== notes) {
      return { applied: false, reason: 'conflict' };
    }
    return { applied: true, cached: notify(), attemptId };
  }
  const template = db.milestoneTemplates.find((m) => m.id === milestoneTemplateId);
  if (!template?.repeatable || !isMilestoneOutcomeAllowed(template, outcome) ||
      !db.dogs.some((d) => d.id === dogId)) return { applied: false, reason: 'invalid' };
  const attempt: MilestoneOutcomeAttempt = {
    id: attemptId,
    dogId,
    milestoneTemplateId,
    outcome,
    outcomeLabel: outcomeLabel(template, outcome),
    completedMilestone: outcomeOptions(template).find((o) => o.id === outcome)?.completesMilestone ?? false,
    attemptDate: now(),
    migratedFromLegacyCompletion: false,
    notes,
  };
  db.milestoneOutcomeAttempts.push(attempt);
  applyMilestoneOutcomeState(dogId, milestoneTemplateId, outcome, attempt.attemptDate, attempt);
  const cached = notify();
  logEvent(
    'Milestone attempt recorded',
    `dog ${dogId}, milestone ${milestoneTemplateId} -> ${outcome}`,
  );
  // A failed local cache write is not a rejected mutation: the result is
  // already in history and its server synchronization may succeed.
  return { applied: true, cached, attemptId };
}

// Removes the most recent attempt on a repeatable milestone (a mis-click,
// wrong outcome selected) and recomputes the milestone completion state from
// whatever's now latest — or clears it entirely if that was the only
// attempt. Deliberately calls applyMilestoneOutcomeState directly, never
// recordMilestoneOutcomeAttempt or setMilestoneOutcome: this must never
// append, or an undo would immediately recreate the very attempt it just
// removed.
export function deleteMostRecentMilestoneAttempt(
  dogId: string,
  milestoneTemplateId: string,
): boolean {
  const attempts = db.milestoneOutcomeAttempts
    .filter((a) => a.dogId === dogId && a.milestoneTemplateId === milestoneTemplateId)
    .sort((a, b) => a.attemptDate.localeCompare(b.attemptDate));
  const last = attempts[attempts.length - 1];
  if (!last) return false;

  db.milestoneOutcomeAttempts = db.milestoneOutcomeAttempts.filter((a) => a.id !== last.id);
  const newLatest = attempts[attempts.length - 2] ?? null;
  applyMilestoneOutcomeState(dogId, milestoneTemplateId, newLatest?.outcome ?? null,
    newLatest?.attemptDate ?? now(), newLatest ?? undefined);
  const persisted = notify();
  logEvent(
    'Milestone attempt undone',
    `dog ${dogId}, milestone ${milestoneTemplateId}, removed ${last.outcome}`,
  );
  return persisted;
}

// ---- Contextual dog events (#55) ----

export function useDogEvents(dogId: string): DogEvent[] {
  return useDatabase()
    .dogEvents.filter((event) => event.dogId === dogId)
    .sort(
      (a, b) =>
        a.eventDate.localeCompare(b.eventDate) || a.createdDate.localeCompare(b.createdDate),
    );
}

export function createDogEvent(dogId: string, eventDate: string, label: string): DogEvent | null {
  const normalizedLabel = label.trim();
  if (!normalizedLabel || !isValidCalendarDate(eventDate)) return null;
  const timestamp = now();
  const event: DogEvent = {
    id: uid(),
    dogId,
    eventDate,
    label: normalizedLabel,
    createdDate: timestamp,
    updatedDate: timestamp,
  };
  db.dogEvents.push(event);
  notify();
  logEvent('Dog context event created', `dog ${dogId}, ${eventDate}: ${normalizedLabel}`);
  return event;
}

export function updateDogEvent(id: string, eventDate: string, label: string): boolean {
  const event = db.dogEvents.find((candidate) => candidate.id === id);
  const normalizedLabel = label.trim();
  if (!event || !normalizedLabel || !isValidCalendarDate(eventDate)) return false;
  event.eventDate = eventDate;
  event.label = normalizedLabel;
  event.updatedDate = now();
  const persisted = notify();
  logEvent('Dog context event updated', `${id} -> ${eventDate}: ${normalizedLabel}`);
  return persisted;
}

export function deleteDogEvent(id: string): void {
  db.dogEvents = db.dogEvents.filter((event) => event.id !== id);
  notify();
  logEvent('Dog context event deleted', id);
}

// ---- Distraction Templates (global, shared across phases) (#36) ----

export function useDistractionTemplates(): DistractionTemplate[] {
  return [...useDatabase().distractionTemplates].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function createDistractionTemplate(title: string): DistractionTemplate {
  const template: DistractionTemplate = {
    id: uid(),
    title,
    sortOrder: db.distractionTemplates.length,
    createdDate: now(),
    updatedDate: now(),
  };
  db.distractionTemplates.push(template);
  notify();
  logEvent('Distraction template created', title);
  return template;
}

export function renameDistractionTemplate(id: string, title: string): boolean {
  const template = db.distractionTemplates.find((d) => d.id === id);
  if (!template) return false;
  template.title = title;
  template.updatedDate = now();
  return notify();
}

export function deleteDistractionTemplate(id: string): void {
  db.distractionTemplates = db.distractionTemplates.filter((d) => d.id !== id);
  db.reports.forEach((r) => {
    r.distractions = r.distractions.filter((d) => d.distractionId !== id);
  });
  notify();
  logEvent('Distraction template deleted', id);
}

export function reorderDistractionTemplates(orderedIds: string[]): void {
  orderedIds.forEach((id, index) => {
    const template = db.distractionTemplates.find((d) => d.id === id);
    if (template) template.sortOrder = index;
  });
  notify();
  logEvent('Distraction templates reordered', '');
}

// ---- Trainer History dashboard (#27) ----
//
// Everything here is derived from this account's own db state — there is no
// cross-instructor aggregation to guard against, since each instructor's data
// is already a wholly separate server blob (see hydrateFromServer). Success
// rate is a simple graduated-vs-released ratio (dogs still in progress never
// count toward it either way) — it does not attempt the fuller outcome model
// from #32/#33/#34 (pass-back, configurable milestone outcomes), which
// hasn't landed yet.

export interface DogActivitySummary {
  dog: Dog;
  lastWorkedDate: string | null;
}

export interface SuccessRate {
  // null means no graduated-or-released dog exists yet to compute a rate
  // from — every dog is still in progress.
  percent: number | null;
  graduated: number;
  released: number;
}

export interface TrainerHistoryStats {
  totalDogs: number;
  activeDogs: number;
  graduatedDogs: number;
  releasedDogs: number;
  recentlyWorkedDogs: DogActivitySummary[];
  dogsNeedingAttention: DogActivitySummary[];
  successRateOverall: SuccessRate;
  successRateRefined: SuccessRate;
  milestoneStats: MilestoneStats[];
  dogLists: ReturnType<typeof dogStatistics>['lists'];
}

export function useTrainerHistoryStats(): TrainerHistoryStats {
  const state = useDatabase();
  const today = useCurrentLocalDate();

  return useMemo(() => {
    const { dogs, reports, dogMilestoneCompletions, milestoneTemplates, milestoneOutcomeAttempts } =
      state;

    const graduatedDogs = dogs.filter((d) => d.graduated).length;
    const releasedDogs = dogs.filter((d) => d.released).length;
    const activeDogs = dogs.filter((d) => !d.graduated && !d.released).length;

    const dogStats = dogStatistics(dogs);
    const successRateOverall = dogStats.overall;
    const successRateRefined = dogStats.refined;
    const milestoneStats = milestoneStatistics(dogs, milestoneTemplates, dogMilestoneCompletions, milestoneOutcomeAttempts);

    const lastWorkedByDog = new Map<string, string>();
    reports.forEach((r) => {
      const existing = lastWorkedByDog.get(r.dogId);
      if (!existing || r.sessionDate > existing) lastWorkedByDog.set(r.dogId, r.sessionDate);
    });

    const recentlyWorkedDogs: DogActivitySummary[] = [...lastWorkedByDog.entries()]
      .map(([dogId, lastWorkedDate]) => {
        const dog = dogs.find((d) => d.id === dogId);
        return dog ? { dog, lastWorkedDate } : null;
      })
      .filter((x): x is { dog: Dog; lastWorkedDate: string } =>
        x !== null && isCurrentlyAssigned(x.dog))
      .sort((a, b) => b.lastWorkedDate.localeCompare(a.lastWorkedDate))
      .slice(0, 5);

    const yesterdaySessionCounts = sessionCountsByDogOnDate(reports, previousLocalDate(today));
    const dogsNeedingAttention: DogActivitySummary[] = dogs
      .filter((dog) => isDogNeedingAttention(dog, state.pinnedFolderId, yesterdaySessionCounts))
      .map((d) => ({ dog: d, lastWorkedDate: lastWorkedByDog.get(d.id) ?? null }))
      .sort((a, b) => (a.lastWorkedDate ?? '').localeCompare(b.lastWorkedDate ?? ''));

    return {
      totalDogs: dogs.length,
      activeDogs,
      graduatedDogs,
      releasedDogs,
      recentlyWorkedDogs,
      dogsNeedingAttention,
      successRateOverall,
      successRateRefined,
      milestoneStats,
      dogLists: dogStats.lists,
    };
  }, [state, today]);
}

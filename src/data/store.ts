import { useSyncExternalStore } from 'react';
import type {
  Dog,
  DogChecklistCompletion,
  Folder,
  GraduationStatus,
  Location,
  Milestone,
  Phase,
  PhaseChecklistItem,
  TrainingReport,
} from '../types';
import { loadDatabase, saveDatabase, type Database } from './db';
import { logEvent } from '../lib/diagnostics';

let db: Database = loadDatabase();
const listeners = new Set<() => void>();

function notify() {
  saveDatabase(db);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useDatabase(): Database {
  return useSyncExternalStore(subscribe, () => db);
}

export interface DatabaseCounts {
  folders: number;
  dogs: number;
  reports: number;
  locations: number;
  checklistItems: number;
  completions: number;
  milestones: number;
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
    milestones: state.milestones.length,
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
  const total = db.checklistItems.length;
  if (total === 0) return 0;
  const completed = db.completions.filter(
    (c) => c.dogId === dogId && c.completed,
  ).length;
  return Math.round((completed / total) * 100);
}

function refreshDogProgress(dogId: string) {
  const dog = db.dogs.find((d) => d.id === dogId);
  if (!dog) return;
  const progress = computeGraduationProgress(dogId);
  dog.graduationProgress = progress;
  dog.graduationStatus = statusForProgress(progress);
  dog.updatedDate = now();
}

// ---- Folders ----

export function useFolders(): Folder[] {
  return useDatabase().folders;
}

export function useFolder(id: string | null): Folder | undefined {
  return useDatabase().folders.find((f) => f.id === id);
}

export function useChildFolders(parentFolderId: string | null): Folder[] {
  return useDatabase().folders.filter((f) => f.parentFolderId === parentFolderId);
}

export function createFolder(name: string, parentFolderId: string | null): Folder {
  const folder: Folder = {
    id: uid(),
    name,
    parentFolderId,
    createdDate: now(),
    updatedDate: now(),
  };
  db.folders.push(folder);
  notify();
  logEvent('Folder created', folder.name);
  return folder;
}

export function renameFolder(id: string, name: string): void {
  const folder = db.folders.find((f) => f.id === id);
  if (!folder) return;
  folder.name = name;
  folder.updatedDate = now();
  notify();
}

export function deleteFolder(id: string): void {
  db.folders = db.folders.filter((f) => f.id !== id);
  notify();
  logEvent('Folder deleted', id);
}

// ---- Dogs ----

export function useDogsInFolder(folderId: string): Dog[] {
  return useDatabase().dogs.filter((d) => d.folderId === folderId);
}

export function useDog(id: string | undefined): Dog | undefined {
  return useDatabase().dogs.find((d) => d.id === id);
}

export function createDog(
  name: string,
  folderId: string,
  profilePhoto: string | null = null,
): Dog {
  const dog: Dog = {
    id: uid(),
    name,
    profilePhoto,
    folderId,
    currentPhase: 'Phase 1',
    graduationProgress: 0,
    graduationStatus: 'Not Started',
    createdDate: now(),
    updatedDate: now(),
  };
  db.dogs.push(dog);
  notify();
  logEvent('Dog created', dog.name);
  return dog;
}

export function updateDog(id: string, updates: Partial<Dog>): void {
  const dog = db.dogs.find((d) => d.id === id);
  if (!dog) return;
  Object.assign(dog, updates, { updatedDate: now() });
  notify();
}

export function deleteDog(id: string): void {
  db.dogs = db.dogs.filter((d) => d.id !== id);
  db.reports = db.reports.filter((r) => r.dogId !== id);
  db.completions = db.completions.filter((c) => c.dogId !== id);
  db.milestones = db.milestones.filter((m) => m.dogId !== id);
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
}

export function createReport(input: NewReportInput): TrainingReport {
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
  const dog = db.dogs.find((d) => d.id === input.dogId);
  if (dog) dog.currentPhase = input.phase;
  notify();
  logEvent(
    'Training report created',
    `dog ${input.dogId}, ${input.phase}${input.redFlag ? ', red-flagged' : ''}`,
  );
  return report;
}

export function toggleReportRedFlag(id: string): void {
  const report = db.reports.find((r) => r.id === id);
  if (!report) return;
  report.redFlag = !report.redFlag;
  report.updatedDate = now();
  notify();
  logEvent('Report red flag toggled', `report ${id} -> ${report.redFlag}`);
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

// ---- Phase Checklists ----

export function useChecklistItems(phase?: Phase): PhaseChecklistItem[] {
  const items = useDatabase().checklistItems;
  const filtered = phase ? items.filter((i) => i.phase === phase) : items;
  return [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);
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
      dateCompleted: null,
      notes: null,
    };
    db.completions.push(completion);
  }
  completion.completed = !completion.completed;
  completion.dateCompleted = completion.completed ? now() : null;
  refreshDogProgress(dogId);
  notify();
  logEvent(
    'Checklist item toggled',
    `dog ${dogId}, item ${checklistItemId} -> ${completion.completed}`,
  );
}

// ---- Milestones ----

export function useMilestones(dogId: string): Milestone[] {
  return useDatabase().milestones.filter((m) => m.dogId === dogId);
}

export interface NewMilestoneInput {
  dogId: string;
  phase: Phase;
  title: string;
  notes: string | null;
  photo: string | null;
}

export function createMilestone(input: NewMilestoneInput): Milestone {
  const milestone: Milestone = {
    id: uid(),
    ...input,
    completed: false,
    dateCompleted: null,
    createdDate: now(),
    updatedDate: now(),
  };
  db.milestones.push(milestone);
  notify();
  logEvent('Milestone created', milestone.title);
  return milestone;
}

export function toggleMilestoneCompletion(id: string): void {
  const milestone = db.milestones.find((m) => m.id === id);
  if (!milestone) return;
  milestone.completed = !milestone.completed;
  milestone.dateCompleted = milestone.completed ? now() : null;
  milestone.updatedDate = now();
  notify();
}

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
import { loadDatabase, saveDatabase, type Database } from './db';
import { logError, logEvent } from '../lib/diagnostics';

let db: Database = loadDatabase();
const listeners = new Set<() => void>();

function notify(): boolean {
  // Store actions mutate nested arrays/objects in place for simplicity, but
  // useSyncExternalStore relies on reference equality to detect changes —
  // without this shallow clone, React can skip re-rendering after a mutation
  // and the UI won't reflect the change until something else forces a render.
  db = { ...db };
  const persisted = saveDatabase(db);
  if (!persisted) {
    logError(
      'Local storage save failed',
      'Browser storage is likely full. Try removing an old photo or report, then save again.',
    );
  }
  listeners.forEach((listener) => listener());
  return persisted;
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
  folder.parentFolderId = newParentId;
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
  const persisted = updateDog(id, { folderId: newFolderId });
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
  const dog = db.dogs.find((d) => d.id === input.dogId);
  if (dog) dog.currentPhase = input.phase;
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

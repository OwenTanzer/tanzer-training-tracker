import type {
  Dog,
  DogChecklistCompletion,
  Folder,
  Location,
  Milestone,
  PhaseChecklistItem,
  TrainingReport,
} from '../types';
import { buildDefaultChecklist } from './defaultChecklist';

export interface Database {
  folders: Folder[];
  dogs: Dog[];
  reports: TrainingReport[];
  locations: Location[];
  checklistItems: PhaseChecklistItem[];
  completions: DogChecklistCompletion[];
  milestones: Milestone[];
}

const STORAGE_KEY = 'abbys-dog-chej:db:v1';

function emptyDatabase(): Database {
  return {
    folders: [],
    dogs: [],
    reports: [],
    locations: [],
    checklistItems: buildDefaultChecklist(),
    completions: [],
    milestones: [],
  };
}

export function loadDatabase(): Database {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const db = emptyDatabase();
    saveDatabase(db);
    return db;
  }
  try {
    return JSON.parse(raw) as Database;
  } catch {
    const db = emptyDatabase();
    saveDatabase(db);
    return db;
  }
}

export function saveDatabase(db: Database): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

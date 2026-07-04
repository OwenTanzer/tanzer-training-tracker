export type Phase = 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Phase 4';

export const PHASES: Phase[] = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

export type GraduationStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Near Graduation'
  | 'Graduated';

export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdDate: string;
  updatedDate: string;
}

export interface Dog {
  id: string;
  name: string;
  profilePhoto: string | null;
  folderId: string;
  currentPhase: Phase;
  graduationProgress: number;
  graduationStatus: GraduationStatus;
  createdDate: string;
  updatedDate: string;
}

export interface TrainingReport {
  id: string;
  dogId: string;
  phase: Phase;
  redFlag: boolean;
  locationId: string | null;
  notes: string;
  picture: string | null;
  createdDate: string;
  updatedDate: string;
}

export interface Location {
  id: string;
  name: string;
  createdDate: string;
  lastUsedDate: string;
}

export interface PhaseChecklistItem {
  id: string;
  phase: Phase;
  title: string;
  description: string;
  requiredForGraduation: boolean;
  sortOrder: number;
  createdDate: string;
  updatedDate: string;
}

export interface DogChecklistCompletion {
  id: string;
  dogId: string;
  checklistItemId: string;
  completed: boolean;
  dateCompleted: string | null;
  notes: string | null;
}

export interface Milestone {
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

export type Phase = 'Phase 1' | 'Phase 2' | 'Phase 3' | 'Phase 4';

export const PHASES: Phase[] = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

export type GraduationStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Near Graduation'
  | 'Graduated';

export type DistractionSeverity = 'Absent' | 'Mild' | 'Moderate' | 'Severe';

export const DISTRACTION_SEVERITIES: DistractionSeverity[] = [
  'Absent',
  'Mild',
  'Moderate',
  'Severe',
];

// A manageable, shared-across-phases list of distraction types a trainer can
// tag on a training log — same spirit as skills/milestones (#36), but not
// phase-scoped since a distraction (traffic, other dogs, food) can come up in
// any phase.
export interface DistractionTemplate {
  id: string;
  title: string;
  sortOrder: number;
  createdDate: string;
  updatedDate: string;
}

export interface Folder {
  id: string;
  name: string;
  parentFolderId: string | null;
  sortOrder: number;
  createdDate: string;
  updatedDate: string;
}

export interface Dog {
  id: string;
  name: string;
  profilePhoto: string | null;
  folderId: string;
  sortOrder: number;
  currentPhase: Phase;
  graduationProgress: number;
  graduationStatus: GraduationStatus;
  released: boolean;
  releasedDate: string | null;
  // Distinct from a live graduationStatus of 'Graduated' reached by simply
  // completing everything that currently exists — this is the explicit,
  // deliberate "Mark Graduated" action (#31), and it freezes graduationProgress/
  // graduationStatus so later edits to the shared skill/milestone templates
  // never retroactively change what a graduated dog displays.
  graduated: boolean;
  graduatedDate: string | null;
  // Lets a trainer omit a specific dog (a pass-back, a health release, etc.)
  // from the "refined" success-rate calculation on Trainer History without
  // touching their actual record — the dog's own profile, progress, and
  // released/graduated status are completely unaffected by this flag.
  excludedFromStats: boolean;
  createdDate: string;
  updatedDate: string;
}

export interface DistractionObservation {
  distractionId: string;
  severity: DistractionSeverity;
}

export interface TrainingReport {
  id: string;
  dogId: string;
  phase: Phase;
  redFlag: boolean;
  locationId: string | null;
  notes: string;
  picture: string | null;
  skillIds: string[];
  milestoneIds: string[];
  distractions: DistractionObservation[];
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
  inProgress: boolean;
  dateCompleted: string | null;
  notes: string | null;
  flagged: boolean;
}

export interface MilestoneTemplate {
  id: string;
  phase: Phase;
  title: string;
  sortOrder: number;
  // Marks this milestone as the terminal evaluation whose result decides a
  // dog's outcome (e.g. Abby's "Advanced Final Blindfold") — at most one
  // milestone typically carries this per curriculum, but nothing enforces
  // that; it's the trainer's own curriculum to configure. A flagged
  // milestone gets an outcome picker (Placement Ready / Additional
  // Objectives / Fail) on the dog profile instead of a plain checkbox.
  isFinalOutcomeMilestone: boolean;
  createdDate: string;
  updatedDate: string;
}

export type FinalOutcome = 'Placement Ready' | 'Additional Objectives' | 'Fail';

export const FINAL_OUTCOMES: FinalOutcome[] = [
  'Placement Ready',
  'Additional Objectives',
  'Fail',
];

export interface DogMilestoneCompletion {
  id: string;
  dogId: string;
  milestoneTemplateId: string;
  completed: boolean;
  dateCompleted: string | null;
  notes: string | null;
  photo: string | null;
  // Only meaningful for a completion of a milestone flagged
  // isFinalOutcomeMilestone. 'Fail' auto-releases the dog; the other two
  // outcomes never have a side effect beyond recording the result and (for
  // Placement Ready) completing the milestone itself.
  outcome: FinalOutcome | null;
}

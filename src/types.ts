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

// One transfer relation between two instructors' dog records (#32/#34).
// linkId is shared by both sides of the same transfer — the source dog's
// passBackCopies entry and the receiving dog's passBackSource — so a future
// sync engine can match them exactly instead of inferring the pairing from
// instructorId/dogId/linkedDate, which breaks once either side is edited or
// a dog is transferred more than once. instructorName is denormalized since
// there is no cross-instructor read endpoint to look it up live.
export interface DogPassBackLink {
  linkId: string;
  instructorId: string;
  instructorName: string;
  dogId: string;
  linkedDate: string;
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
  // Present only on a receiving copy created by duplicating another
  // instructor's dog onto this account (#32) — points back to the origin.
  // Null for ordinary dogs and for the source side of a transfer.
  passBackSource: DogPassBackLink | null;
  // Forward audit trail on the *source* dog: one entry per instructor this
  // dog has been duplicated to. Also what a future sync engine reads to know
  // where to push updates so a transferred dog's copy stays in sync (#34).
  passBackCopies: DogPassBackLink[];
  createdDate: string;
  updatedDate: string;
}

export interface DistractionObservation {
  distractionId: string;
  severity: DistractionSeverity;
}

// Explicit, authoritative privacy state for a report (#34) — kept separate
// from redFlag so a future cross-instructor filter (auto-share on pass-back,
// red-flag privacy) has one canonical field to read instead of re-deriving
// visibility from redFlag at every call site. Currently kept in lockstep
// with redFlag wherever redFlag is written; a future manual override (e.g.
// "share this red-flagged report anyway") only has to change how this field
// gets set, not add a new concept to every reader.
export type ReportVisibility = 'shared' | 'private';

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
  // The instructor who wrote this report (#34). Null only for reports that
  // predate any instructor-id concept (pre-account, single-browser legacy
  // data) — every real account's reports backfill to that account's own id,
  // since before pass-back copies existed every report in an instructor's
  // blob was self-authored.
  authorInstructorId: string | null;
  visibility: ReportVisibility;
  // Domain date for the training session, kept separate from audit timestamps.
  // A YYYY-MM-DD string avoids timezone shifts.
  sessionDate: string;
  createdDate: string;
  updatedDate: string;
}

// A read-only, denormalized projection of another instructor's shared report
// onto a pass-back copy dog (#32/#34) — never a TrainingReport. The source
// report's skillIds/milestoneIds/distractions/locationId are foreign keys
// into the *source* instructor's own checklistItems/milestoneTemplates/
// distractionTemplates/locations, an id space this instructor's blob has no
// relationship to (curricula can diverge), so the server resolves them to
// plain text server-side, at the source, before they ever cross the
// boundary — the ids themselves never do. `id` is a synthetic
// `shared:${linkId}:${sourceReportId}` string, deliberately not a real
// TrainingReport id, so it can never be handed to updateReport/deleteReport/
// toggleReportRedFlag by accident.
export interface SharedReportView {
  id: string;
  dogId: string;
  sourceInstructorId: string;
  sourceDogId: string;
  sourceReportId: string;
  phase: Phase;
  locationLabel: string | null;
  notes: string;
  picture: string | null;
  skillLabels: string[];
  milestoneLabels: string[];
  distractionLabels: { title: string; severity: DistractionSeverity }[];
  authorInstructorName: string;
  sessionDate: string;
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
  // Only meaningful alongside isFinalOutcomeMilestone (#33): most milestones
  // are a one-time decision, overwritten in place if corrected — a plain
  // checkbox/select. A repeatable one (the final test itself, traffic
  // training) instead accumulates a MilestoneOutcomeAttempt each time it's
  // recorded, so a dog that fails once and passes on a retake keeps both in
  // its history instead of losing the failed attempt.
  repeatable: boolean;
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
  // Placement Ready) completing the milestone itself. Always mirrors the
  // *latest* MilestoneOutcomeAttempt for a repeatable milestone (#33) — this
  // is deliberately still the single field every other reader (graduation
  // progress, Trainer History's stats) uses, so "current outcome" behavior
  // is identical whether or not the milestone happens to be repeatable.
  outcome: FinalOutcome | null;
}

// One historical decision on a repeatable final-outcome milestone (#33) — an
// append-only event, never mutated or overwritten. Only ever created by
// recordMilestoneOutcomeAttempt (src/data/store.ts); a plain, non-repeatable
// milestone never produces any of these; DogMilestoneCompletion.outcome
// stays the single source of truth those readers use, mirrored to match
// whatever this ledger's latest row says.
export interface MilestoneOutcomeAttempt {
  id: string;
  dogId: string;
  milestoneTemplateId: string;
  outcome: FinalOutcome;
  attemptDate: string;
  // True only for the one-time row created when a milestone already had a
  // decided-but-unrepeated outcome at the moment it was flipped to
  // repeatable (see toggleMilestoneRepeatable) — the pre-ledger schema only
  // ever recorded a completion date for a Placement Ready outcome, so a
  // migrated Additional Objectives/Fail row has no real historical date and
  // this flag tells the UI to say so rather than presenting attemptDate as
  // fact.
  migratedFromLegacyCompletion: boolean;
  notes: string | null;
}

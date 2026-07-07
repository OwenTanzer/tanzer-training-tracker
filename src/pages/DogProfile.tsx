import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoveDialog } from '../components/MoveDialog';
import { PencilIcon, TrashIcon } from '../components/icons';
import { PhotoCropDialog } from '../components/PhotoCropDialog';
import { ProgressBar } from '../components/ProgressBar';
import { uploadPhoto } from '../lib/api';
import {
  deleteDog,
  deleteReport,
  markDogGraduated,
  moveDog,
  reactivateDog,
  releaseDog,
  removeDogGraduatedStatus,
  setMilestoneOutcome,
  toggleChecklistCompletion,
  toggleChecklistItemFlag,
  toggleDogExcludedFromStats,
  toggleDogMilestoneCompletion,
  toggleReportRedFlag,
  updateDog,
  updateReport,
  useChecklistItems,
  useDistractionTemplates,
  useDog,
  useDogCompletions,
  useDogMilestoneCompletions,
  useDogMilestoneSessionCounts,
  useDogSkillSessionCounts,
  useDogWorkedToday,
  useFolder,
  useLocations,
  useMilestoneTemplates,
  useReportsForDog,
} from '../data/store';
import {
  DISTRACTION_SEVERITIES,
  FINAL_OUTCOMES,
  PHASES,
  type DistractionSeverity,
  type DistractionTemplate,
  type FinalOutcome,
  type Location,
  type Phase,
  type TrainingReport,
} from '../types';

const OUTCOME_STYLES: Record<FinalOutcome, string> = {
  'Placement Ready': 'text-emerald-600 dark:text-emerald-400',
  'Additional Objectives': 'text-amber-600 dark:text-amber-400',
  Fail: 'text-red-500',
};

const OUTCOME_ICONS: Record<FinalOutcome, string> = {
  'Placement Ready': '🟢',
  'Additional Objectives': '🟡',
  Fail: '🔴',
};

function EditReportForm({
  report,
  locations,
  distractionTemplates,
  onCancel,
  onSaved,
}: {
  report: TrainingReport;
  locations: Location[];
  distractionTemplates: DistractionTemplate[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const skillsForPhase = useChecklistItems(report.phase);
  const milestonesForPhase = useMilestoneTemplates(report.phase);
  const [redFlag, setRedFlag] = useState(report.redFlag);
  const [locationId, setLocationId] = useState(report.locationId ?? '');
  const [notes, setNotes] = useState(report.notes);
  // Filtered against this phase's skills/milestones at init — a report saved
  // before phase was locked down (or otherwise corrupted) could carry ids
  // from a different phase than its own, which would never show up as a
  // checkbox here but would still round-trip back into storage on save
  // otherwise.
  const [skillIds, setSkillIds] = useState<string[]>(() =>
    report.skillIds.filter((id) => skillsForPhase.some((item) => item.id === id)),
  );
  const [milestoneIds, setMilestoneIds] = useState<string[]>(() =>
    report.milestoneIds.filter((id) => milestonesForPhase.some((m) => m.id === id)),
  );
  const [distractionSeverities, setDistractionSeverities] = useState<
    Record<string, DistractionSeverity | ''>
  >(() =>
    Object.fromEntries(report.distractions.map((d) => [d.distractionId, d.severity])),
  );
  const [error, setError] = useState<string | null>(null);

  function toggleSkill(id: string) {
    setSkillIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function toggleMilestone(id: string) {
    setMilestoneIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function setDistractionSeverity(distractionId: string, severity: DistractionSeverity | '') {
    setDistractionSeverities((prev) => ({ ...prev, [distractionId]: severity }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validSkillIds = skillIds.filter((id) => skillsForPhase.some((item) => item.id === id));
    const validMilestoneIds = milestoneIds.filter((id) =>
      milestonesForPhase.some((m) => m.id === id),
    );
    const distractions = Object.entries(distractionSeverities)
      .filter((entry): entry is [string, DistractionSeverity] => entry[1] !== '')
      .map(([distractionId, severity]) => ({ distractionId, severity }));
    const persisted = updateReport(report.id, {
      phase: report.phase,
      redFlag,
      locationId: locationId || null,
      notes,
      picture: report.picture,
      skillIds: validSkillIds,
      milestoneIds: validMilestoneIds,
      distractions,
    });
    if (!persisted) {
      setError(
        "This log didn't save — your browser's storage is likely full. Try removing an old photo or log, then save again.",
      );
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 text-sm">
      <p className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-gray-600 dark:text-gray-400">
        {report.phase}{' '}
        <span className="text-xs text-gray-400">— phase is locked to the log's original phase</span>
      </p>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-gray-500">Skills worked on</p>
        {skillsForPhase.map((item) => (
          <label key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={skillIds.includes(item.id)}
              onChange={() => toggleSkill(item.id)}
            />
            {item.title}
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-gray-500">Milestones worked on</p>
        {milestonesForPhase.map((m) => (
          <label key={m.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={milestoneIds.includes(m.id)}
              onChange={() => toggleMilestone(m.id)}
            />
            {m.title}
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-gray-500">Distractions encountered</p>
        {distractionTemplates.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2">
            <span>{d.title}</span>
            <select
              value={distractionSeverities[d.id] ?? ''}
              onChange={(e) =>
                setDistractionSeverity(d.id, e.target.value as DistractionSeverity | '')
              }
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            >
              <option value="">Not encountered</option>
              {DISTRACTION_SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={redFlag} onChange={(e) => setRedFlag(e.target.checked)} />
        🚩 Red flag this log
      </label>
      <select
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
      >
        <option value="">No location</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-sky-500 px-3 py-1 font-medium text-white hover:bg-sky-600"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DogProfile() {
  const { dogId } = useParams<{ dogId: string }>();
  const navigate = useNavigate();
  const dog = useDog(dogId);
  const folder = useFolder(dog?.folderId ?? null);
  const checklist = useChecklistItems(dog?.currentPhase);
  const allChecklistItems = useChecklistItems();
  const completions = useDogCompletions(dogId ?? '');
  const milestones = useMilestoneTemplates(dog?.currentPhase);
  const allMilestoneTemplates = useMilestoneTemplates();
  const milestoneCompletions = useDogMilestoneCompletions(dogId ?? '');
  const allReports = useReportsForDog(dogId ?? '');
  const workedToday = useDogWorkedToday(dogId ?? '');
  const locations = useLocations();
  const distractionTemplates = useDistractionTemplates();
  const skillSessionCounts = useDogSkillSessionCounts(dogId ?? '');
  const milestoneSessionCounts = useDogMilestoneSessionCounts(dogId ?? '');

  const [hideCompletedSkills, setHideCompletedSkills] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all');
  const [redFlagOnly, setRedFlagOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [renamingSelf, setRenamingSelf] = useState(false);
  const [selfName, setSelfName] = useState(dog?.name ?? '');
  const [moving, setMoving] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  const reports = useMemo(() => {
    return allReports.filter((r) => {
      if (phaseFilter !== 'all' && r.phase !== phaseFilter) return false;
      if (redFlagOnly && !r.redFlag) return false;
      if (search && !r.notes.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [allReports, phaseFilter, redFlagOnly, search]);

  const visibleChecklist = useMemo(() => {
    if (!hideCompletedSkills) return checklist;
    return checklist.filter((item) => {
      const completion = completions.find((c) => c.checklistItemId === item.id);
      // A flagged skill means "needs attention" — that outranks "hide
      // completed", so a flagged-and-completed skill stays visible.
      if (completion?.flagged) return true;
      return !completion?.completed;
    });
  }, [checklist, completions, hideCompletedSkills]);

  if (!dog) {
    return <p className="p-4 text-gray-500">Dog not found.</p>;
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setPendingPhotoFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    if (!dog) return;
    const { url } = await uploadPhoto(blob);
    setPendingPhotoFile(null);
    const persisted = updateDog(dog.id, { profilePhoto: url });
    if (!persisted) {
      setPhotoError(
        "Photo didn't save — your browser's storage is likely full. Try removing an old photo or log.",
      );
    }
  }

  function handleDeleteDog() {
    if (!dog) return;
    if (!confirm(`Delete ${dog.name}'s profile? This cannot be undone.`)) return;
    deleteDog(dog.id);
    navigate(folder ? `/folder/${folder.id}` : '/');
  }

  function handleRenameSelfSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = selfName.trim();
    if (dog && trimmed && trimmed !== dog.name) updateDog(dog.id, { name: trimmed });
    setRenamingSelf(false);
  }

  function handleMoveSelfSelect(destinationId: string | null) {
    if (dog && destinationId) moveDog(dog.id, destinationId);
    setMoving(false);
  }

  function handleRelease() {
    if (!dog) return;
    if (dog.graduated) {
      alert(`Remove ${dog.name}'s Graduated status before releasing them from training.`);
      return;
    }
    if (!confirm(`Mark ${dog.name} as released from training? Their record is kept, just marked inactive.`)) {
      return;
    }
    releaseDog(dog.id);
  }

  function handleReactivate() {
    if (!dog) return;
    if (!confirm(`Reactivate ${dog.name}? This removes the "released" marker.`)) return;
    reactivateDog(dog.id);
  }

  function handleMarkGraduated() {
    if (!dog) return;
    if (dog.released) {
      alert(`Reactivate ${dog.name} before marking them Graduated.`);
      return;
    }
    if (
      !confirm(
        `Mark ${dog.name} as Graduated? This checks off every current skill and milestone and freezes their progress at 100%, even if the shared skill/milestone list changes later.`,
      )
    ) {
      return;
    }
    markDogGraduated(dog.id);
  }

  function handleRemoveGraduatedStatus() {
    if (!dog) return;
    if (!confirm(`Remove ${dog.name}'s Graduated status? Their progress will recalculate live again.`)) {
      return;
    }
    removeDogGraduatedStatus(dog.id);
  }

  function handleDeleteReport(id: string) {
    if (!confirm('Delete this training log? This cannot be undone.')) return;
    deleteReport(id);
  }

  function handleMilestoneOutcomeChange(milestoneId: string, value: string) {
    if (!dog) return;
    const outcome = (value || null) as FinalOutcome | null;
    if (
      outcome === 'Fail' &&
      !confirm(
        `Mark ${dog.name} as Failed on this evaluation? This automatically releases them from training.`,
      )
    ) {
      return;
    }
    setMilestoneOutcome(dog.id, milestoneId, outcome);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Link
        to={folder ? `/folder/${folder.id}` : '/'}
        className="text-sm text-sky-500 hover:underline"
      >
        ← Back to {folder ? folder.name : 'Home'}
      </Link>

      <div className="flex items-start gap-4">
        <label className="h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-4xl">
          {dog.profilePhoto ? (
            <img
              src={dog.profilePhoto}
              alt={dog.name}
              className="h-full w-full object-cover"
            />
          ) : (
            '🐕'
          )}
          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </label>
        <div className="flex-1 space-y-2">
          {renamingSelf ? (
            <form onSubmit={handleRenameSelfSubmit}>
              <input
                autoFocus
                value={selfName}
                onChange={(e) => setSelfName(e.target.value)}
                onBlur={handleRenameSelfSubmit}
                className="text-2xl font-semibold bg-transparent border-b border-sky-400 focus:outline-none text-gray-900 dark:text-gray-100"
              />
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                {dog.name}
              </h1>
              <button
                title="Rename"
                onClick={() => {
                  setSelfName(dog.name);
                  setRenamingSelf(true);
                }}
                className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <PencilIcon />
              </button>
              {workedToday && (
                <span
                  title="A training log was added for this dog today"
                  className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                >
                  Worked today
                </span>
              )}
              {dog.excludedFromStats && (
                <span
                  title="This dog is omitted from Trainer History's refined success rate"
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                >
                  Excluded from stats
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-500">Phase:</label>
            <select
              value={dog.currentPhase}
              onChange={(e) =>
                updateDog(dog.id, { currentPhase: e.target.value as Phase })
              }
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <ProgressBar
            progress={dog.graduationProgress}
            status={dog.graduationStatus}
            released={dog.released}
          />
          {dog.released && dog.releasedDate && (
            <p className="text-xs text-red-500">
              Released on {new Date(dog.releasedDate).toLocaleDateString()}
            </p>
          )}
          {dog.graduated && dog.graduatedDate && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              🎓 Graduated on {new Date(dog.graduatedDate).toLocaleDateString()} — progress is frozen
            </p>
          )}
          {photoError && <p className="text-xs text-red-500">{photoError}</p>}
        </div>
      </div>
      {pendingPhotoFile && (
        <PhotoCropDialog
          file={pendingPhotoFile}
          onCancel={() => setPendingPhotoFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          to={`/dog/${dog.id}/report/new`}
          className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
        >
          + New Training Log
        </Link>
        <button
          onClick={() => setMoving(true)}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          📂 Move to Folder
        </button>
        {dog.released ? (
          <button
            onClick={handleReactivate}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            ↩️ Reactivate
          </button>
        ) : (
          <button
            onClick={handleRelease}
            disabled={dog.graduated}
            title={dog.graduated ? "Remove this dog's Graduated status first" : undefined}
            className={`rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950 ${
              dog.graduated ? 'opacity-40 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : ''
            }`}
          >
            Release from Training
          </button>
        )}
        {dog.graduated ? (
          <button
            onClick={handleRemoveGraduatedStatus}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Remove Graduated Status
          </button>
        ) : (
          <button
            onClick={handleMarkGraduated}
            disabled={dog.released}
            title={dog.released ? 'Reactivate this dog first' : undefined}
            className={`rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950 ${
              dog.released ? 'opacity-40 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent' : ''
            }`}
          >
            🎓 Mark Graduated
          </button>
        )}
        <button
          onClick={() => toggleDogExcludedFromStats(dog.id)}
          title={
            dog.excludedFromStats
              ? 'Include this dog in Trainer History success-rate stats again'
              : "Omit this dog (e.g. a pass-back, or released for health) from Trainer History's refined success rate"
          }
          className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
            dog.excludedFromStats
              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {dog.excludedFromStats ? '📊 Excluded from Stats' : '📊 Exclude from Stats'}
        </button>
        <button
          onClick={handleDeleteDog}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
        >
          Delete Profile
        </button>
      </div>
      {moving && (
        <MoveDialog
          title={`Move ${dog.name} to…`}
          allowRoot={false}
          onSelect={handleMoveSelfSelect}
          onClose={() => setMoving(false)}
        />
      )}

      <p className="text-sm">
        <Link to="/templates" className="text-sky-500 hover:underline">
          ⚙️ Manage training options
        </Link>{' '}
        <span className="text-gray-400">— changes apply to every dog</span>
      </p>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            {dog.currentPhase} Skills
          </h2>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={hideCompletedSkills}
              onChange={(e) => setHideCompletedSkills(e.target.checked)}
            />
            Hide completed skills
          </label>
        </div>
        <ul className="space-y-1">
          {visibleChecklist.map((item) => {
            const completion = completions.find((c) => c.checklistItemId === item.id);
            return (
              <li key={item.id} className="flex items-center gap-1">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={completion?.completed ?? false}
                    onChange={() => toggleChecklistCompletion(dog.id, item.id)}
                  />
                  <span
                    className={
                      completion?.completed
                        ? 'line-through text-gray-400'
                        : 'text-gray-800 dark:text-gray-200'
                    }
                  >
                    {item.title}
                  </span>
                  {!completion?.completed && completion?.inProgress && (
                    <span className="text-xs text-sky-500">● In progress</span>
                  )}
                  {(skillSessionCounts[item.id] ?? 0) > 0 && (
                    <span className="text-xs text-gray-400">
                      Worked {skillSessionCounts[item.id]}×
                    </span>
                  )}
                </label>
                <button
                  onClick={() => toggleChecklistItemFlag(dog.id, item.id)}
                  aria-pressed={completion?.flagged ?? false}
                  title={completion?.flagged ? 'Unflag this skill' : 'Flag this skill'}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs transition-all duration-150 active:scale-90 ${
                    completion?.flagged
                      ? 'bg-red-100 ring-1 ring-red-400 dark:bg-red-950'
                      : 'bg-gray-100 opacity-40 grayscale hover:opacity-70 dark:bg-gray-800'
                  }`}
                >
                  🚩
                </button>
              </li>
            );
          })}
          {checklist.length === 0 && (
            <p className="text-sm text-gray-400">
              No skills set up for this phase yet.{' '}
              <Link to="/templates" className="text-sky-500 hover:underline">
                Add some
              </Link>
              .
            </p>
          )}
          {checklist.length > 0 && visibleChecklist.length === 0 && (
            <p className="text-sm text-gray-400">All skills in this phase are complete.</p>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          {dog.currentPhase} Milestones
        </h2>
        <ul className="space-y-1">
          {milestones.map((m) => {
            const completion = milestoneCompletions.find((c) => c.milestoneTemplateId === m.id);
            if (m.isFinalOutcomeMilestone) {
              return (
                <li
                  key={m.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {m.title}
                    </span>
                    {(milestoneSessionCounts[m.id] ?? 0) > 0 && (
                      <span className="text-xs text-gray-400">
                        Worked {milestoneSessionCounts[m.id]}×
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <select
                      value={completion?.outcome ?? ''}
                      onChange={(e) => handleMilestoneOutcomeChange(m.id, e.target.value)}
                      className="rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
                    >
                      <option value="">No decision yet</option>
                      {FINAL_OUTCOMES.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {outcome}
                        </option>
                      ))}
                    </select>
                    {completion?.outcome && (
                      <span className={`text-xs font-medium ${OUTCOME_STYLES[completion.outcome]}`}>
                        {OUTCOME_ICONS[completion.outcome]} {completion.outcome}
                      </span>
                    )}
                  </div>
                </li>
              );
            }
            return (
              <li key={m.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={completion?.completed ?? false}
                    onChange={() => toggleDogMilestoneCompletion(dog.id, m.id)}
                  />
                  <span
                    className={
                      completion?.completed
                        ? 'line-through text-gray-400'
                        : 'text-gray-800 dark:text-gray-200'
                    }
                  >
                    {m.title}
                  </span>
                  {(milestoneSessionCounts[m.id] ?? 0) > 0 && (
                    <span className="text-xs text-gray-400">
                      Worked {milestoneSessionCounts[m.id]}×
                    </span>
                  )}
                </label>
              </li>
            );
          })}
          {milestones.length === 0 && (
            <p className="text-sm text-gray-400">
              No milestones set up for this phase yet.{' '}
              <Link to="/templates" className="text-sky-500 hover:underline">
                Add some
              </Link>
              .
            </p>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Log History
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value as Phase | 'all')}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
          >
            <option value="all">All Phases</option>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={redFlagOnly}
              onChange={(e) => setRedFlagOnly(e.target.checked)}
            />
            Red flags only
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 min-w-[150px] rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1"
          />
        </div>
        <ul className="space-y-2">
          {reports.map((r) => {
            const location = locations.find((l) => l.id === r.locationId);
            if (editingReportId === r.id) {
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-sky-300 dark:border-sky-700 p-3"
                >
                  <EditReportForm
                    report={r}
                    locations={locations}
                    distractionTemplates={distractionTemplates}
                    onCancel={() => setEditingReportId(null)}
                    onSaved={() => setEditingReportId(null)}
                  />
                </li>
              );
            }
            return (
              <li
                key={r.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {r.phase} · {new Date(r.createdDate).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleReportRedFlag(r.id)}
                      aria-pressed={r.redFlag}
                      title="Toggle red flag"
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-sm transition-all duration-150 active:scale-90 ${
                        r.redFlag
                          ? 'bg-red-100 ring-1 ring-red-400 dark:bg-red-950'
                          : 'bg-gray-100 opacity-40 grayscale hover:opacity-70 dark:bg-gray-800'
                      }`}
                    >
                      🚩
                    </button>
                    <button
                      onClick={() => setEditingReportId(r.id)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      title="Edit log"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => handleDeleteReport(r.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                      title="Delete log"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {location && (
                  <p className="text-xs text-gray-500">📍 {location.name}</p>
                )}
                {r.picture && (
                  <img
                    src={r.picture}
                    alt="Training log attachment"
                    className="h-24 w-24 rounded-md object-cover"
                  />
                )}
                <p className="text-sm text-gray-700 dark:text-gray-300">{r.notes}</p>
                {r.skillIds.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Skills worked on:{' '}
                    {r.skillIds
                      .map((id) => allChecklistItems.find((i) => i.id === id)?.title)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                {r.milestoneIds.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Milestones worked on:{' '}
                    {r.milestoneIds
                      .map((id) => allMilestoneTemplates.find((m) => m.id === id)?.title)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                {r.distractions.length > 0 && (
                  <p className="text-xs text-gray-500">
                    Distractions:{' '}
                    {r.distractions
                      .map((d) => {
                        const title = distractionTemplates.find(
                          (t) => t.id === d.distractionId,
                        )?.title;
                        return title ? `${title} (${d.severity})` : null;
                      })
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
              </li>
            );
          })}
          {reports.length === 0 && (
            <p className="text-sm text-gray-400">No training logs match these filters.</p>
          )}
        </ul>
      </section>
    </div>
  );
}

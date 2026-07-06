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
  moveDog,
  reactivateDog,
  releaseDog,
  toggleChecklistCompletion,
  toggleDogMilestoneCompletion,
  toggleReportRedFlag,
  updateDog,
  updateReport,
  useChecklistItems,
  useDog,
  useDogCompletions,
  useDogMilestoneCompletions,
  useFolder,
  useLocations,
  useMilestoneTemplates,
  useReportsForDog,
} from '../data/store';
import { PHASES, type Location, type Phase, type TrainingReport } from '../types';

function EditReportForm({
  report,
  locations,
  onCancel,
  onSaved,
}: {
  report: TrainingReport;
  locations: Location[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(report.phase);
  const [redFlag, setRedFlag] = useState(report.redFlag);
  const [locationId, setLocationId] = useState(report.locationId ?? '');
  const [notes, setNotes] = useState(report.notes);
  const [skillIds, setSkillIds] = useState<string[]>(report.skillIds);
  const [error, setError] = useState<string | null>(null);
  const skillsForPhase = useChecklistItems(phase);

  function handlePhaseChange(next: Phase) {
    setPhase(next);
    setSkillIds([]);
  }

  function toggleSkill(id: string) {
    setSkillIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const persisted = updateReport(report.id, {
      phase,
      redFlag,
      locationId: locationId || null,
      notes,
      picture: report.picture,
      skillIds,
    });
    if (!persisted) {
      setError(
        "This report didn't save — your browser's storage is likely full. Try removing an old photo or report, then save again.",
      );
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 text-sm">
      <select
        value={phase}
        onChange={(e) => handlePhaseChange(e.target.value as Phase)}
        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
      >
        {PHASES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <div className="space-y-1">
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
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={redFlag} onChange={(e) => setRedFlag(e.target.checked)} />
        🚩 Red flag this report
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
  const milestoneCompletions = useDogMilestoneCompletions(dogId ?? '');
  const allReports = useReportsForDog(dogId ?? '');
  const locations = useLocations();

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
        "Photo didn't save — your browser's storage is likely full. Try removing an old photo or report.",
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

  function handleDeleteReport(id: string) {
    if (!confirm('Delete this training report? This cannot be undone.')) return;
    deleteReport(id);
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
          + New Training Report
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
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          >
            Release from Training
          </button>
        )}
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
          ⚙️ Manage skills &amp; milestones
        </Link>{' '}
        <span className="text-gray-400">— changes apply to every dog</span>
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          {dog.currentPhase} Skills
        </h2>
        <ul className="space-y-1">
          {checklist.map((item) => {
            const completion = completions.find((c) => c.checklistItemId === item.id);
            return (
              <li key={item.id}>
                <label className="flex items-center gap-2 text-sm">
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
                </label>
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
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          {dog.currentPhase} Milestones
        </h2>
        <ul className="space-y-1">
          {milestones.map((m) => {
            const completion = milestoneCompletions.find((c) => c.milestoneTemplateId === m.id);
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
          Report History
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
                      className={r.redFlag ? 'text-red-500' : 'text-gray-300'}
                      title="Toggle red flag"
                    >
                      🚩
                    </button>
                    <button
                      onClick={() => setEditingReportId(r.id)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                      title="Edit report"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={() => handleDeleteReport(r.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                      title="Delete report"
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
                    alt="Training report attachment"
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
              </li>
            );
          })}
          {reports.length === 0 && (
            <p className="text-sm text-gray-400">No training reports match these filters.</p>
          )}
        </ul>
      </section>
    </div>
  );
}

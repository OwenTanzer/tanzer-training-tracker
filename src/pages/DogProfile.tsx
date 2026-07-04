import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoveDialog } from '../components/MoveDialog';
import { ProgressBar } from '../components/ProgressBar';
import { compressImageToDataUrl } from '../lib/compressImage';
import {
  createMilestone,
  deleteDog,
  moveDog,
  toggleChecklistCompletion,
  toggleMilestoneCompletion,
  toggleReportRedFlag,
  updateDog,
  useChecklistItems,
  useDog,
  useDogCompletions,
  useFolder,
  useLocations,
  useMilestones,
  useReportsForDog,
} from '../data/store';
import { PHASES, type Phase } from '../types';

export function DogProfile() {
  const { dogId } = useParams<{ dogId: string }>();
  const navigate = useNavigate();
  const dog = useDog(dogId);
  const folder = useFolder(dog?.folderId ?? null);
  const checklist = useChecklistItems(dog?.currentPhase);
  const completions = useDogCompletions(dogId ?? '');
  const milestones = useMilestones(dogId ?? '').filter(
    (m) => m.phase === dog?.currentPhase,
  );
  const allReports = useReportsForDog(dogId ?? '');
  const locations = useLocations();

  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all');
  const [redFlagOnly, setRedFlagOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [renamingSelf, setRenamingSelf] = useState(false);
  const [selfName, setSelfName] = useState(dog?.name ?? '');
  const [moving, setMoving] = useState(false);

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

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !dog) return;
    setPhotoError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      const persisted = updateDog(dog.id, { profilePhoto: dataUrl });
      if (!persisted) {
        setPhotoError(
          "Photo didn't save — your browser's storage is likely full. Try removing an old photo or report.",
        );
      }
    } catch {
      setPhotoError("Couldn't process that photo. Try a different one.");
    }
  }

  function handleAddMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!milestoneTitle.trim() || !dog) return;
    createMilestone({
      dogId: dog.id,
      phase: dog.currentPhase,
      title: milestoneTitle.trim(),
      notes: null,
      photo: null,
    });
    setMilestoneTitle('');
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
                ✏️
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
          <ProgressBar progress={dog.graduationProgress} status={dog.graduationStatus} />
          {photoError && <p className="text-xs text-red-500">{photoError}</p>}
        </div>
      </div>

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

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          {dog.currentPhase} Checklist
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
                </label>
              </li>
            );
          })}
          {checklist.length === 0 && (
            <p className="text-sm text-gray-400">No checklist items for this phase.</p>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          {dog.currentPhase} Milestones
        </h2>
        <ul className="space-y-1">
          {milestones.map((m) => (
            <li key={m.id}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.completed}
                  onChange={() => toggleMilestoneCompletion(m.id)}
                />
                <span
                  className={
                    m.completed ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'
                  }
                >
                  {m.title}
                </span>
              </label>
            </li>
          ))}
          {milestones.length === 0 && (
            <p className="text-sm text-gray-400">No milestones added for this phase yet.</p>
          )}
        </ul>
        <form onSubmit={handleAddMilestone} className="flex gap-2">
          <input
            value={milestoneTitle}
            onChange={(e) => setMilestoneTitle(e.target.value)}
            placeholder="New milestone"
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Add Milestone
          </button>
        </form>
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
            return (
              <li
                key={r.id}
                className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {r.phase} · {new Date(r.createdDate).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => toggleReportRedFlag(r.id)}
                    className={r.redFlag ? 'text-red-500' : 'text-gray-300'}
                    title="Toggle red flag"
                  >
                    🚩
                  </button>
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

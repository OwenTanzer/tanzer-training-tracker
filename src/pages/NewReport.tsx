import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { compressImageToDataUrl } from '../lib/compressImage';
import {
  createLocation,
  createReport,
  useChecklistItems,
  useDog,
  useLocations,
} from '../data/store';
import { PHASES, type Phase } from '../types';

export function NewReport() {
  const { dogId } = useParams<{ dogId: string }>();
  const navigate = useNavigate();
  const dog = useDog(dogId);
  const locations = useLocations();

  const [phase, setPhase] = useState<Phase>(dog?.currentPhase ?? 'Phase 1');
  const [redFlag, setRedFlag] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [notes, setNotes] = useState('');
  const [picture, setPicture] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const skillsForPhase = useChecklistItems(phase);

  if (!dog || !dogId) {
    return <p className="p-4 text-gray-500">Dog not found.</p>;
  }

  function handlePhaseChange(next: Phase) {
    setPhase(next);
    setSkillIds([]);
  }

  function toggleSkill(id: string) {
    setSkillIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  async function handlePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPictureError(null);
    try {
      setPicture(await compressImageToDataUrl(file));
    } catch {
      setPictureError("Couldn't process that photo. Try a different one.");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    let finalLocationId: string | null = locationId || null;
    if (!finalLocationId && newLocationName.trim()) {
      finalLocationId = createLocation(newLocationName.trim()).id;
    }
    const { persisted } = createReport({
      dogId: dogId!,
      phase,
      redFlag,
      locationId: finalLocationId,
      notes,
      picture,
      skillIds,
    });
    if (!persisted) {
      setSubmitError(
        "This report didn't save — your browser's storage is likely full. Try removing an old photo or report, then save again.",
      );
      return;
    }
    navigate(`/dog/${dogId}`);
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <Link to={`/dog/${dogId}`} className="text-sm text-sky-500 hover:underline">
        ← Back to {dog.name}
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        New Training Report for {dog.name}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phase
          </label>
          <select
            value={phase}
            onChange={(e) => handlePhaseChange(e.target.value as Phase)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Skills worked on
          </label>
          <div className="space-y-1">
            {skillsForPhase.map((item) => (
              <label key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={skillIds.includes(item.id)}
                  onChange={() => toggleSkill(item.id)}
                />
                {item.title}
              </label>
            ))}
            {skillsForPhase.length === 0 && (
              <p className="text-sm text-gray-400">No skills set up for {phase} yet.</p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={redFlag}
            onChange={(e) => setRedFlag(e.target.checked)}
          />
          🚩 Red flag this report
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Location
          </label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 mb-2"
          >
            <option value="">Select existing location…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="Or add a new location"
            disabled={!!locationId}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
            placeholder="Session behavior, progress, problems, breakthroughs, follow-up needs..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Picture
          </label>
          <input type="file" accept="image/*" onChange={handlePictureChange} />
          {picture && (
            <img src={picture} alt="Preview" className="mt-2 h-24 w-24 rounded-md object-cover" />
          )}
          {pictureError && <p className="mt-1 text-xs text-red-500">{pictureError}</p>}
        </div>

        {submitError && <p className="text-sm text-red-500">{submitError}</p>}

        <button
          type="submit"
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Save Report
        </button>
      </form>
    </div>
  );
}

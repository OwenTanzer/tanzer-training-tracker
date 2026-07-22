import { isFutureSessionDate, localSessionDate } from '../../shared/sessionDate';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PhaseGroupedPicker } from '../components/PhaseGroupedPicker';
import { ApiError, uploadPhoto } from '../lib/api';
import { compressImageToBlob } from '../lib/compressImage';
import {
  createLocation,
  createReport,
  useChecklistItems,
  useDistractionTemplates,
  useDog,
  useLocations,
  useMilestoneTemplates,
} from '../data/store';
import { DISTRACTION_SEVERITIES, type DistractionSeverity } from '../types';

export function NewReport() {
  const { dogId } = useParams<{ dogId: string }>();
  const navigate = useNavigate();
  const dog = useDog(dogId);
  const locations = useLocations();
  const distractionTemplates = useDistractionTemplates();

  const [redFlag, setRedFlag] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [notes, setNotes] = useState('');
  const [sessionDate, setSessionDate] = useState(localSessionDate);
  // The photo is only uploaded to R2 on submit, not on selection — uploading
  // eagerly would leave an orphaned object in R2 whenever the user picks a
  // photo and then abandons the form without saving.
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreviewUrl, setPicturePreviewUrl] = useState<string | null>(null);
  // Set once the current pictureFile has actually been uploaded, so a retry
  // after a failed report save (e.g. local storage full) reuses that R2
  // object instead of uploading a second copy of the same photo.
  const [uploadedPictureUrl, setUploadedPictureUrl] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [milestoneIds, setMilestoneIds] = useState<string[]>([]);
  // '' means "not encountered this session" and is left out of the saved
  // distractions array on submit — only rows the trainer actually set a
  // severity on get recorded.
  const [distractionSeverities, setDistractionSeverities] = useState<
    Record<string, DistractionSeverity | ''>
  >({});
  const skills = useChecklistItems();
  const milestones = useMilestoneTemplates();

  useEffect(() => {
    if (!pictureFile) return;
    const url = URL.createObjectURL(pictureFile);
    setPicturePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pictureFile]);

  if (!dog || !dogId) {
    return <p className="p-4 text-gray-500">Dog not found.</p>;
  }

  function toggleSkill(id: string) {
    setSkillIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function toggleMilestone(id: string) {
    setMilestoneIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function setDistractionSeverity(distractionId: string, severity: DistractionSeverity | '') {
    setDistractionSeverities((prev) => ({ ...prev, [distractionId]: severity }));
  }

  function handlePictureChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPictureError(null);
    setPictureFile(file);
    setUploadedPictureUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setPictureError(null);
    if (isFutureSessionDate(sessionDate)) {
      setSubmitError('Training logs cannot be dated in the future.');
      return;
    }
    setSaving(true);
    try {
      let picture: string | null = uploadedPictureUrl;
      if (pictureFile && !picture) {
        const blob = await compressImageToBlob(pictureFile);
        const uploaded = await uploadPhoto(blob);
        picture = uploaded.url;
        setUploadedPictureUrl(uploaded.url);
      }
      let finalLocationId: string | null = locationId || null;
      if (!finalLocationId && newLocationName.trim()) {
        finalLocationId = createLocation(newLocationName.trim()).id;
      }
      const distractions = Object.entries(distractionSeverities)
        .filter((entry): entry is [string, DistractionSeverity] => entry[1] !== '')
        .map(([distractionId, severity]) => ({ distractionId, severity }));
      const { persisted } = createReport({
        dogId: dogId!,
        phase: dog!.currentPhase,
        redFlag,
        locationId: finalLocationId,
        notes,
        picture,
        skillIds,
        milestoneIds,
        distractions,
        sessionDate,
      });
      if (!persisted) {
        setSubmitError(
          "This log didn't save — your browser's storage is likely full. Try removing an old photo or log, then save again.",
        );
        return;
      }
      navigate(`/dog/${dogId}`);
    } catch (err) {
      setPictureError(
        err instanceof ApiError ? err.message : "Couldn't upload that photo. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6">
      <Link to={`/dog/${dogId}`} className="text-sm text-sky-500 hover:underline">
        ← Back to {dog.name}
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        New Training Log for {dog.name}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="session-date"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Training date
          </label>
          <input
            id="session-date"
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            required
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2"
            max={localSessionDate()}
          />
          <p className="mt-1 text-xs text-gray-500">Defaults to today; select an earlier date for a historical log.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phase
          </label>
          <p className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-700 dark:text-gray-300">
            {dog.currentPhase}{' '}
            <span className="text-xs text-gray-400">
              — change {dog.name}'s phase from their profile
            </span>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Skills worked on
          </label>
          <PhaseGroupedPicker
            items={skills}
            selectedIds={skillIds}
            currentPhase={dog.currentPhase}
            itemKind="skills"
            onToggle={toggleSkill}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Milestones worked on
          </label>
          <PhaseGroupedPicker
            items={milestones}
            selectedIds={milestoneIds}
            currentPhase={dog.currentPhase}
            itemKind="milestones"
            onToggle={toggleMilestone}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Distractions encountered
          </label>
          <div className="space-y-1">
            {distractionTemplates.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700 dark:text-gray-300">{d.title}</span>
                <select
                  value={distractionSeverities[d.id] ?? ''}
                  onChange={(e) =>
                    setDistractionSeverity(d.id, e.target.value as DistractionSeverity | '')
                  }
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-sm"
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
            {distractionTemplates.length === 0 && (
              <p className="text-sm text-gray-400">
                No distraction templates set up yet.{' '}
                <Link to="/templates" className="text-sky-500 hover:underline">
                  Add some
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={redFlag}
            onChange={(e) => setRedFlag(e.target.checked)}
          />
          🚩 Red flag this log
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
          {picturePreviewUrl && (
            <img
              src={picturePreviewUrl}
              alt="Preview"
              className="mt-2 h-24 w-24 rounded-md object-cover"
            />
          )}
          {pictureError && <p className="mt-1 text-xs text-red-500">{pictureError}</p>}
        </div>

        {submitError && <p className="text-sm text-red-500">{submitError}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Log'}
        </button>
      </form>
    </div>
  );
}

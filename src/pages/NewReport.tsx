import { isFutureSessionDate, localSessionDate } from '../../shared/sessionDate';
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PhaseGroupedPicker } from '../components/PhaseGroupedPicker';
import { equal } from '../lib/sync';
import { ApiError, uploadPhoto } from '../lib/api';
import { compressImageToBlob } from '../lib/compressImage';
import { isDraftStale, discardVolatileDraft, retainPreparingDraft, loadNewLogDraft, restoreDraftPicture, saveNewLogDraft, clearNewLogDraft } from '../lib/newLogDraft';
import { downloadLogBackup, logBackup, readBackupPicture } from '../lib/logBackup';
import {
  createLocation,
  getStoreIdentity,
  getSyncState,
  useReportServerConfirmed,
  isReportServerConfirmed,
  createReport,
  useChecklistItems,
  useDistractionTemplates,
  useDog,
  useLocations,
  useMilestoneTemplates,
} from '../data/store';
import { DISTRACTION_SEVERITIES, type DistractionSeverity, type TrainingReport } from '../types';

export function NewReport() {
  const { dogId } = useParams<{ dogId: string }>();
  const owner = getStoreIdentity();
  return <NewReportForm key={`${owner.generation}:${owner.instructorId}:${dogId}`} />;
}

function NewReportForm() {
  const { dogId } = useParams<{ dogId: string }>();
  const navigate = useNavigate();
  const [draftOwner] = useState(() => getStoreIdentity());
  const [initial] = useState(() => {
    const loaded = loadNewLogDraft(draftOwner.instructorId, dogId);
    const draft = loaded.draft;
    const recorded = draft && getSyncState().blob.reports.find(r => r.id === draft.report.id);
    // A failed removeItem must not restore an already-confirmed submission
    // as the next new log. Keep any newer edits or unuploaded picture intact.
    const fields = (r: TrainingReport) => ({ ...r, createdDate: '', updatedDate: '' });
    if (!loaded.blocked && draft && recorded && !draft.newLocationName &&
        ((!draft.pictureFile && !loaded.selectedFile) || !!draft.report.picture) &&
        isReportServerConfirmed(recorded) && equal(fields(draft.report), fields(recorded))) {
      if (draftOwner.instructorId && dogId) clearNewLogDraft(draftOwner.instructorId, dogId);
      return { draft: null, blocked: false } as typeof loaded;
    }
    return loaded;
  });
  const [initialPicture] = useState(() => { try { return initial.selectedFile ?? restoreDraftPicture(initial.draft?.pictureFile ?? null); } catch { return null; } });
  const [staleDraft, setStaleDraft] = useState(initial.stale ?? false);
  const [confirmNewer, setConfirmNewer] = useState(false);
  const reportId = useRef(initial.draft?.report.id ?? crypto.randomUUID());
  const [createdDate] = useState(() => initial.draft?.report.createdDate ?? new Date().toISOString());
  const draftCommitted = useRef(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  const editVersion = useRef(0);
  const currentPicture = useRef(initialPicture);
  const [draftStatus, setDraftStatus] = useState<'empty' | 'writing' | 'local' | 'failed'>(initial.blocked || initial.memoryOnly ? 'failed' : initial.draft ? 'local' : 'empty');
  const [pictureRead, setPictureRead] = useState({ file: initial.selectedFile ? null : initialPicture, value: initial.draft?.pictureFile ?? null, failed: !!initial.draft?.pictureFile && !initialPicture });
  const createdLocationId = useRef<string | null>(null);
  const dog = useDog(dogId);
  const locations = useLocations();
  const distractionTemplates = useDistractionTemplates();

  const [redFlag, setRedFlag] = useState(initial.draft?.report.redFlag ?? false);
  const [locationId, setLocationId] = useState(initial.draft?.report.locationId ?? '');
  const [newLocationName, setNewLocationName] = useState(initial.draft?.newLocationName ?? '');
  const [notes, setNotes] = useState(initial.draft?.report.notes ?? '');
  const [sessionDate, setSessionDate] = useState(initial.draft?.report.sessionDate ?? localSessionDate());
  // The photo is only uploaded to R2 on submit, not on selection — uploading
  // eagerly would leave an orphaned object in R2 whenever the user picks a
  // photo and then abandons the form without saving.
  const [pictureFile, setPictureFile] = useState<File | null>(initialPicture);
  const [picturePreviewUrl, setPicturePreviewUrl] = useState<string | null>(null);
  // Set once the current pictureFile has actually been uploaded, so a retry
  // after a failed report save (e.g. local storage full) reuses that R2
  // object instead of uploading a second copy of the same photo.
  const [uploadedPictureUrl, setUploadedPictureUrl] = useState<string | null>(initial.draft?.report.picture ?? null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recoveryReport, setRecoveryReport] = useState<TrainingReport | null>(null);
  const serverConfirmed = useReportServerConfirmed(recoveryReport);
  const submittedVersion = useRef<number | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>(initial.draft?.report.skillIds ?? []);
  const [milestoneIds, setMilestoneIds] = useState<string[]>(initial.draft?.report.milestoneIds ?? []);
  // '' means "not encountered this session" and is left out of the saved
  // distractions array on submit — only rows the trainer actually set a
  // severity on get recorded.
  const [distractionSeverities, setDistractionSeverities] = useState<
    Record<string, DistractionSeverity | ''>
  >(Object.fromEntries((initial.draft?.report.distractions ?? []).map(d => [d.distractionId, d.severity])));
  const skills = useChecklistItems();
  const milestones = useMilestoneTemplates();

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (!pictureFile) { setPicturePreviewUrl(null); return; }
    const url = URL.createObjectURL(pictureFile);
    setPicturePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pictureFile]);

  useEffect(() => {
    if (pictureRead.file === pictureFile) return;
    let cancelled = false;
    if (!pictureFile) { setPictureRead({ file: null, value: null, failed: false }); return; }
    setDraftStatus('writing');
    void readBackupPicture(pictureFile).then(value => {
      if (!cancelled) setPictureRead({ file: pictureFile, value, failed: false });
    }, () => { if (!cancelled) setPictureRead({ file: pictureFile, value: null, failed: true }); });
    return () => { cancelled = true; };
  }, [pictureFile, pictureRead.file]);

  useLayoutEffect(() => {
    if (draftCommitted.current) return;
    const hasEntries = !!(notes || pictureFile || uploadedPictureUrl || skillIds.length || milestoneIds.length || redFlag || locationId || newLocationName || Object.values(distractionSeverities).some(Boolean) || initial.draft);
    if (!hasEntries || !dog || !dogId) return;
    if (initial.blocked || getStoreIdentity().generation !== draftOwner.generation || !draftOwner.instructorId) { setDraftStatus('failed'); return; }
    const recorded = getSyncState().blob.reports.find(r => r.id === reportId.current);
    const draft = {
      version: 1, savedAt: new Date().toISOString(), newLocationName,
      report: { id: reportId.current, dogId, authorInstructorId: draftOwner.instructorId,
        createdDate: recorded?.createdDate ?? createdDate, updatedDate: recorded?.updatedDate ?? initial.draft?.report.updatedDate ?? createdDate,
        phase: dog.currentPhase, notes, sessionDate, redFlag, visibility: redFlag ? 'private' : 'shared',
        locationId: locationId || createdLocationId.current, picture: uploadedPictureUrl, skillIds, milestoneIds,
        distractions: Object.entries(distractionSeverities).filter((entry): entry is [string, DistractionSeverity] => entry[1] !== '').map(([distractionId, severity]) => ({ distractionId, severity })),
      }, pictureFile: pictureRead.file === pictureFile ? pictureRead.value : null,
    } satisfies import('../lib/newLogDraft').NewLogDraft;
    if (isDraftStale(draftOwner.instructorId, dogId)) {
      retainPreparingDraft(draftOwner.instructorId, dogId, draft, pictureFile);
      setStaleDraft(true); setDraftStatus('failed'); return;
    }
    if (pictureRead.file !== pictureFile || pictureRead.failed) {
      retainPreparingDraft(draftOwner.instructorId, dogId, draft, pictureFile);
      setDraftStatus(pictureRead.failed ? 'failed' : 'writing'); return;
    }
    const stored = saveNewLogDraft(draftOwner.instructorId, dogId, draft);
    setDraftStatus(stored ? 'local' : 'failed');
  }, [notes, pictureFile, pictureRead, uploadedPictureUrl, skillIds, milestoneIds, redFlag, locationId, newLocationName, distractionSeverities, sessionDate, dog, dogId, draftOwner, initial, createdDate]);

  useEffect(() => {
    if (!serverConfirmed || !recoveryReport || !dogId || !active.current || submittedVersion.current !== editVersion.current) return;
    const owner = getStoreIdentity();
    if (owner.generation !== draftOwner.generation || owner.instructorId !== draftOwner.instructorId) return;
    draftCommitted.current = true;
    // The exact submitted record is confirmed by the server. Failed cleanup
    // of a device-only draft must not turn that success back into a failed save.
    if (draftOwner.instructorId) clearNewLogDraft(draftOwner.instructorId, dogId);
    navigate(`/dog/${dogId}`);
  }, [serverConfirmed, recoveryReport, dogId, draftOwner, navigate]);

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
    currentPicture.current = file;
    setPictureError(null);
    setPictureFile(file);
    setUploadedPictureUrl(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (initial.blocked) {
      setSubmitError('The existing draft could not be read. Keep this browser data and recover that draft before saving a new log.');
      return;
    }
    if (inFlight.current) return;
    if (staleDraft || (draftOwner.instructorId && isDraftStale(draftOwner.instructorId, dogId!))) { setStaleDraft(true); return; }
    setSubmitError(null);
    setPictureError(null);
    if (isFutureSessionDate(sessionDate)) {
      setSubmitError('Training logs cannot be dated in the future.');
      return;
    }
    inFlight.current = true;
    const startedVersion = editVersion.current;
    setSaving(true);
    try {
      let picture: string | null = uploadedPictureUrl;
      const owner = getStoreIdentity();
      if (pictureFile && !picture) {
        const blob = await compressImageToBlob(pictureFile);
        if (!active.current) return;
        const uploaded = await uploadPhoto(blob);
        if (!active.current) return;
        picture = uploaded.url;
        if (currentPicture.current === pictureFile) setUploadedPictureUrl(uploaded.url);
      }
      if (!active.current) return;
      if (getStoreIdentity().generation !== owner.generation) throw new Error('Account changed while preparing this log. Return to the original account before saving.');
      if (editVersion.current !== startedVersion) {
        setSubmitError('Your entries changed while the photo was uploading. Review your current entries and choose Save Log again. This attempt did not add a log.');
        return;
      }
      if (draftOwner.instructorId && isDraftStale(draftOwner.instructorId, dogId!)) { setStaleDraft(true); return; }
      let finalLocationId: string | null = locationId || createdLocationId.current;
      if (!finalLocationId && newLocationName.trim()) {
        finalLocationId = createLocation(newLocationName.trim()).id;
        createdLocationId.current = finalLocationId;
      }
      const distractions = Object.entries(distractionSeverities)
        .filter((entry): entry is [string, DistractionSeverity] => entry[1] !== '')
        .map(([distractionId, severity]) => ({ distractionId, severity }));
      const { report, persisted } = createReport({
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
      }, reportId.current);
      submittedVersion.current = editVersion.current;
      setRecoveryReport({ ...report });
      if (!persisted) {
        setSubmitError(
          "The device copy could not be stored. Waiting for server confirmation; keep this form open. Retry Save uses the same log.",
        );
        return;
      }
      draftCommitted.current = true;
      if (draftOwner.instructorId && !clearNewLogDraft(draftOwner.instructorId, dogId!)) {
        draftCommitted.current = false;
        setSubmitError('The log was queued, but its draft could not be cleared. Keep this form open and retry Save; the same log ID will be used.');
        return;
      }
      navigate(`/dog/${dogId}`);
    } catch (err) {
      if (!active.current) return;
      setPictureError(
        err instanceof ApiError ? err.message : "Couldn't upload that photo. Try again.",
      );
    } finally {
      inFlight.current = false;
      if (active.current) setSaving(false);
    }
  }

  async function handleBackup(includePicture = true) {

    setBackupBusy(true);
    setBackupMessage('');
    const owner = getStoreIdentity();
    try {
      if (owner.generation !== draftOwner.generation || !owner.instructorId) throw new Error('Account changed.');
      const finalLocationId = locationId || createdLocationId.current;
      // Capture current edits before reading the picture; do not stage or save them.
      const backup = logBackup({
        id: reportId.current, dogId: dogId!, authorInstructorId: owner.instructorId,
        createdDate, updatedDate: recoveryReport?.updatedDate ?? initial.draft?.report.updatedDate ?? createdDate,
        ...recoveryReport, phase: dog!.currentPhase, notes, sessionDate, redFlag,
        visibility: redFlag ? 'private' : 'shared', locationId: finalLocationId,
        picture: uploadedPictureUrl, skillIds, milestoneIds,
        distractions: Object.entries(distractionSeverities)
          .filter((entry): entry is [string, DistractionSeverity] => entry[1] !== '')
          .map(([distractionId, severity]) => ({ distractionId, severity })),
      }, {
        dog: { id: dog!.id, name: dog!.name },
        location: finalLocationId || newLocationName.trim() ? {
          id: finalLocationId,
          name: locations.find(l => l.id === finalLocationId)?.name ?? newLocationName.trim(),
        } : null,
        skills, milestones, distractions: distractionTemplates,
      }, null);
      if (pictureFile && includePicture) backup.pictureFile = await readBackupPicture(pictureFile);
      if (getStoreIdentity().generation !== owner.generation) throw new Error('Account changed.');
      const document = { ...backup, ...(pictureFile && !includePicture ? { omittedPicture: { name: pictureFile.name, type: pictureFile.type, size: pictureFile.size, reason: 'Entries-only backup. Download the selected picture separately.' } } : {}) };
      downloadLogBackup(document);
      setBackupMessage('Download requested. Check that the file is in Downloads and opens before relying on it. Cancelled or blocked downloads leave no backup. Download again after further edits.');
    } catch {
      setBackupMessage('Could not prepare the backup. Keep this form open and try downloading again. Your log has not been cleared.');
    } finally {
      setBackupBusy(false);
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

      <form onSubmit={handleSubmit} onChangeCapture={(event) => {
        const input = event.target;
        if (input instanceof HTMLInputElement && input.type === 'file' && !input.files?.length) return;
        editVersion.current += 1;
      }} className="space-y-4">
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
          {(pictureFile || uploadedPictureUrl) && <button type="button" className="block mt-2 rounded-md border px-3 py-2 text-sm" onClick={() => {
            editVersion.current += 1;
            currentPicture.current = null;
            setPictureFile(null);
            setUploadedPictureUrl(null);
            setPictureError(null);
          }}>Remove picture</button>}
          {picturePreviewUrl && (
            <img
              src={picturePreviewUrl}
              alt="Preview"
              className="mt-2 h-24 w-24 rounded-md object-cover"
            />
          )}
          {pictureError && <p className="mt-1 text-xs text-red-500">{pictureError}</p>}
        </div>

      {staleDraft && <section role="alert" className="space-y-2 rounded border border-amber-500 p-3 text-sm">
        <p>{initial.deviceDraftMissing ? 'Another tab cleared this device draft. A log may already have been saved; check the dog’s logs before creating another.' : 'Another tab changed this device draft. These are your earlier page entries; they have not replaced the newer device draft.'} Saving is paused. Keep this page open and download backups of these entries and picture before choosing.</p>
        <button type="button" className="rounded border px-3 py-2" onClick={() => setConfirmNewer(true)}>{initial.deviceDraftMissing ? 'Keep cleared draft' : 'Use newer device draft'}</button>
        {confirmNewer && <div className="space-y-2">
          <p>{initial.deviceDraftMissing ? 'Keep the draft cleared and leave these earlier page entries behind?' : 'Keep the newer device draft and leave these earlier page entries behind?'} Download their backups first if you need both. Then check the dog’s logs or reopen New Training Log to review what is on this device.</p>
          <button type="button" className="rounded border px-3 py-2" onClick={() => { if (draftOwner.instructorId) discardVolatileDraft(draftOwner.instructorId, dogId!); navigate(`/dog/${dogId}`); }}>{initial.deviceDraftMissing ? 'Confirm cleared draft' : 'Confirm newer draft'}</button>
          <button type="button" className="ml-2 rounded border px-3 py-2" onClick={() => setConfirmNewer(false)}>Cancel</button>
        </div>}
      </section>}
      {draftStatus !== 'empty' && <p role="status" className={`rounded-md border p-3 text-sm ${draftStatus === 'failed' ? 'border-amber-500' : 'border-gray-300'}`}>
        {draftStatus === 'local' ? 'Draft kept on this device only — not sent to the server. Reopen New Training Log for this dog to continue. Use Save Log when ready.' :
          draftStatus === 'writing' ? 'Preparing the picture. Latest entries and the selected picture are held only in this open page until preparation and device storage succeed. Keep this page open.' :
          'Latest edits are not stored on this device. Keep this page open and download a backup before leaving. An earlier device draft may still exist.'}
        {initial.draft && (initial.memoryOnly ? ' Recovered entries from this open page; check them and the picture before saving. Closing or reloading loses any edits still not stored.' : ' Restored a device draft; check its entries and picture before saving.')}
        {initial.blocked && ' An existing draft could not be read; it has not been overwritten.'}
      </p>}
        {serverConfirmed && submittedVersion.current !== editVersion.current && <p role="status" className="text-sm text-emerald-700">Your earlier submitted version was saved to the server. Save Log again to submit your latest edits.</p>}
        {submitError && !serverConfirmed && <p className="text-sm text-red-500">{submitError}</p>}
        {saving && <p role="status" className="text-sm">Preparing this log. If you change its entries, review them and Save Log again when this attempt finishes.</p>}
        {(recoveryReport || pictureError || draftStatus === 'failed' || draftStatus === 'writing') && <section aria-label="Log backup" className="space-y-2 rounded-md border border-amber-500 p-3 text-sm">
          <p>Keep this page open. You can download this log’s current entries and selected picture as a backup. This does not save or sync the log in the app.</p>
          <p>The file contains your notes. Keep it private; recovery from it needs review, not automatic import.</p>
          {pictureFile && <div className="space-y-2">
            <p>If picture preparation fails, preserve both parts separately. These downloads do not save or sync the log.</p>
            <button type="button" disabled={backupBusy} className="block rounded border px-3 py-2" onClick={() => void handleBackup(false)}>Download entries without picture</button>
            <button type="button" className="block rounded border px-3 py-2" onClick={() => {
              try { const url = URL.createObjectURL(pictureFile); const link = document.createElement('a'); link.href = url; link.download = pictureFile.name; document.body.appendChild(link); try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); } setBackupMessage('Picture download requested. Check that it opens; also download the entries. Nothing was saved or synced in the app.'); }
              catch { setBackupMessage('Could not download the picture. Keep this page open and retry.'); }
            }}>Download selected picture</button>
          </div>}
          <button type="button" disabled={backupBusy || saving} onClick={() => void handleBackup()} className="rounded-md border px-3 py-2 disabled:opacity-50">
            {backupBusy ? 'Preparing backup…' : 'Download this log backup'}
          </button>
          {backupMessage && <p role="status">{backupMessage}</p>}
        </section>}

        <button
          type="submit"
          disabled={saving || staleDraft || initial.blocked}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Log'}
        </button>
      </form>
    </div>
  );
}

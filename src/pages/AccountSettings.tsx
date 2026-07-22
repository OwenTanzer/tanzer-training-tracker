import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { localCalendarMonth } from '../../shared/trainerSince';
import { PhotoCropDialog } from '../components/PhotoCropDialog';
import { PencilIcon } from '../components/icons';
import { ApiError, uploadPhoto } from '../lib/api';
import { updateAccount, useSession } from '../lib/auth';

export function AccountSettings() {
  const session = useSession();
  const [renamingSelf, setRenamingSelf] = useState(false);
  const [selfName, setSelfName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [trainerSince, setTrainerSince] = useState('');
  const [savingTrainerSince, setSavingTrainerSince] = useState(false);
  const [trainerSinceError, setTrainerSinceError] = useState<string | null>(null);

  useEffect(() => {
    if (session) setTrainerSince(session.trainerSince);
  }, [session]);

  if (!session) return null;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setPendingPhotoFile(file);
  }

  async function handleCropConfirm(blob: Blob) {
    const { key } = await uploadPhoto(blob);
    setPendingPhotoFile(null);
    try {
      await updateAccount({ profilePhotoKey: key });
    } catch {
      setPhotoError("Couldn't save that photo. Check your connection and try again.");
    }
  }

  async function handleRenameSelfSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRenamingSelf(false);
    const trimmed = selfName.trim();
    if (!session || !trimmed || trimmed === session.name) return;
    setSavingName(true);
    setNameError(null);
    try {
      await updateAccount({ name: trimmed });
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : "Couldn't rename — try again.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleTrainerSinceSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !trainerSince || trainerSince === session.trainerSince) return;
    setSavingTrainerSince(true);
    setTrainerSinceError(null);
    try {
      await updateAccount({ trainerSince });
    } catch (err) {
      setTrainerSinceError(
        err instanceof ApiError ? err.message : "Couldn't save the trainer start date.",
      );
    } finally {
      setSavingTrainerSince(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <Link to="/" className="text-sm text-sky-500 hover:underline">
        ← Back to Home
      </Link>

      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Account Settings</h1>

      <div className="flex items-start gap-4">
        <label className="h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-4xl">
          {session.profilePhotoUrl ? (
            <img
              src={session.profilePhotoUrl}
              alt={session.name}
              className="h-full w-full object-cover"
            />
          ) : (
            '🧑‍🏫'
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
                className="w-full text-xl font-semibold bg-transparent border-b border-sky-400 focus:outline-none text-gray-900 dark:text-gray-100"
              />
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {session.name}
              </h2>
              <button
                title="Rename"
                onClick={() => {
                  setSelfName(session.name);
                  setRenamingSelf(true);
                }}
                className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <PencilIcon />
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400">This is the name you log in with.</p>
          {savingName && <p className="text-xs text-gray-400">Saving…</p>}
          {nameError && <p className="text-xs text-red-500">{nameError}</p>}
          {photoError && <p className="text-xs text-red-500">{photoError}</p>}
        </div>
      </div>

      <form
        onSubmit={handleTrainerSinceSubmit}
        className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700"
      >
        <div>
          <label
            htmlFor="trainer-since"
            className="block text-sm font-medium text-gray-900 dark:text-gray-100"
          >
            Trainer since
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Used for your profile tenure. This can be different from when the account was created.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            id="trainer-since"
            type="month"
            required
            max={localCalendarMonth()}
            value={trainerSince}
            onChange={(e) => setTrainerSince(e.target.value)}
            className="rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:text-gray-100"
          />
          <button
            type="submit"
            disabled={savingTrainerSince || trainerSince === session.trainerSince}
            className="rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingTrainerSince ? 'Saving...' : 'Save'}
          </button>
        </div>
        {trainerSinceError && <p className="text-xs text-red-500">{trainerSinceError}</p>}
      </form>

      {pendingPhotoFile && (
        <PhotoCropDialog
          file={pendingPhotoFile}
          onCancel={() => setPendingPhotoFile(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </div>
  );
}

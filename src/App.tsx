import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { LoadingScreen } from './components/LoadingScreen';
import { ThemeToggle } from './components/ThemeToggle';
import { logout, useSession } from './lib/auth';
import {
  declineLegacyImport,
  getImportableLegacyDatabase,
  hydrateFromServer,
  importLegacyDatabase,
  resetLocalStore,
  seedDefaultTemplatesIfEmpty,
  useHydrated,
  useLegacyImportAvailable,
  useSyncStatus,
} from './data/store';
import type { Database } from './data/db';
import { Diagnostics } from './pages/Diagnostics';
import { DogProfile } from './pages/DogProfile';
import { FolderView } from './pages/FolderView';
import { Login } from './pages/Login';
import { ManageTemplates } from './pages/ManageTemplates';
import { NewReport } from './pages/NewReport';
import { RedFlags } from './pages/RedFlags';

function App() {
  const [splashDone, setSplashDone] = useState(false);
  const session = useSession();
  const hydrated = useHydrated();
  const syncStatus = useSyncStatus();
  const legacyImportAvailable = useLegacyImportAvailable();
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [legacyImport, setLegacyImport] = useState<Database | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    if (session) return;
    resetLocalStore();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setHydrateError(null);
    hydrateFromServer(session.instructorId)
      .then(() => {
        // A cancelled effect is dead — it must not read, write, or query
        // store state at all, not just skip its own setState calls.
        // hydrateFromServer() can resolve normally even when it internally
        // no-oped on a stale generation, so this .then() can still fire for
        // an effect instance React has already cleaned up (concretely: every
        // login under StrictMode's double-invoke).
        if (cancelled) return;
        seedDefaultTemplatesIfEmpty();
        setLegacyImport(getImportableLegacyDatabase());
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHydrateError(err instanceof Error ? err.message : "Couldn't load your data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  function handleImportLegacy() {
    if (!legacyImport) return;
    setImporting(true);
    setImportError(null);
    importLegacyDatabase(legacyImport)
      .then(() => setLegacyImport(null))
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : "Couldn't import that data.");
      })
      .finally(() => setImporting(false));
  }

  // Dismissing is deliberately non-destructive — it only hides the prompt for
  // this app load. The legacy data stays available (a fresh login, or the
  // Diagnostics page, will offer it again) until it's actually imported or
  // explicitly declined below. A device that still holds the only copy of
  // someone's pre-account data shouldn't lose the obvious way back to it just
  // because they were busy, confused, or wanted to ask first.
  function handleDismissLegacyPrompt() {
    setLegacyImport(null);
  }

  // This is the one action that permanently gives up the import — gated
  // behind a confirm() so it can't be hit by the same casual tap as "Not now".
  function handlePermanentlyDeclineLegacy() {
    const confirmed = window.confirm(
      "Don't import this data? This can't be undone — this device won't offer to import it again.",
    );
    if (!confirmed) return;
    declineLegacyImport();
    setLegacyImport(null);
  }

  if (!splashDone) {
    return <LoadingScreen onFinish={() => setSplashDone(true)} />;
  }

  if (!session) {
    return <Login />;
  }

  if (hydrateError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-white dark:bg-gray-900">
        <p className="text-red-500">{hydrateError}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-sm text-gray-400">Loading your data…</p>
      </div>
    );
  }

  if (legacyImport) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-white dark:bg-gray-900">
        <p className="text-lg font-semibold">We found existing data on this device</p>
        <p className="max-w-sm text-sm text-gray-500">
          From before accounts existed: {legacyImport.folders.length} folder
          {legacyImport.folders.length === 1 ? '' : 's'}, {legacyImport.dogs.length} dog
          {legacyImport.dogs.length === 1 ? '' : 's'}, and {legacyImport.reports.length} training
          report{legacyImport.reports.length === 1 ? '' : 's'}. Import it into your account so it's
          saved to the server and available on your other devices?
        </p>
        {importError && <p className="text-sm text-red-500">{importError}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleDismissLegacyPrompt}
            disabled={importing}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm disabled:opacity-50"
          >
            Not now
          </button>
          <button
            onClick={handleImportLegacy}
            disabled={importing}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import my data'}
          </button>
        </div>
        <button
          onClick={handlePermanentlyDeclineLegacy}
          disabled={importing}
          className="text-xs text-gray-400 hover:underline disabled:opacity-50"
        >
          This isn't my data — don't ask again
        </button>
        <p className="max-w-sm text-xs text-gray-400">
          Not ready yet? You can pick this back up later from the Diagnostics page.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <Link to="/" className="font-semibold">
          🐕 Tanzer Training Tracker
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/templates" className="text-sm text-gray-500 hover:underline">
            ⚙️ Skills &amp; Milestones
          </Link>
          <Link to="/red-flags" className="text-sm text-red-500 hover:underline">
            🚩 Red Flags
          </Link>
          <Link to="/diagnostics" className="text-sm text-gray-500 hover:underline">
            🩺 Diagnostics
            {legacyImportAvailable && (
              <span
                title="There's data from before accounts existed you can still import"
                className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle"
              />
            )}
          </Link>
          {syncStatus === 'error' && (
            <span title="Some changes may not be saved to the server yet" className="text-xs text-amber-500">
              ⚠️ Not synced
            </span>
          )}
          {syncStatus === 'syncing' && <span className="text-xs text-gray-400">Syncing…</span>}
          <span className="text-sm text-gray-500">{session.name}</span>
          <button onClick={() => logout()} className="text-sm text-gray-500 hover:underline">
            Log out
          </button>
          <ThemeToggle />
        </div>
      </header>
      <Routes>
        <Route path="/" element={<FolderView />} />
        <Route path="/folder/:folderId" element={<FolderView />} />
        <Route path="/dog/:dogId" element={<DogProfile />} />
        <Route path="/dog/:dogId/report/new" element={<NewReport />} />
        <Route path="/red-flags" element={<RedFlags />} />
        <Route path="/diagnostics" element={<Diagnostics />} />
        <Route path="/templates" element={<ManageTemplates />} />
      </Routes>
    </div>
  );
}

export default App;

import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { LoadingScreen } from './components/LoadingScreen';
import { ThemeToggle } from './components/ThemeToggle';
import { logout, useSession } from './lib/auth';
import { hydrateFromServer, resetLocalStore, seedDefaultTemplatesIfEmpty, useHydrated, useSyncStatus } from './data/store';
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
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    if (session) return;
    resetLocalStore();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setHydrateError(null);
    hydrateFromServer(session.instructorId)
      .then(() => seedDefaultTemplatesIfEmpty())
      .catch((err: unknown) => {
        if (!cancelled) {
          setHydrateError(err instanceof Error ? err.message : "Couldn't load your data.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

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

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <header className="border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <Link to="/" className="font-semibold">
          🐕 Abby's Dog Notes
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

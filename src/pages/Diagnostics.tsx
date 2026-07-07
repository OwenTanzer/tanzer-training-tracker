import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clearLog, useDiagnosticLog } from '../lib/diagnostics';
import {
  declineLegacyImport,
  getImportableLegacyDatabase,
  importLegacyDatabase,
  useDatabaseCounts,
} from '../data/store';
import type { Database } from '../data/db';

function storageProbe(): string {
  try {
    const key = '__abbys-dog-chej-probe__';
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
    return 'available';
  } catch {
    return 'unavailable (private browsing or storage disabled)';
  }
}

export function Diagnostics() {
  const log = useDiagnosticLog();
  const counts = useDatabaseCounts();
  // Computed once per visit to this page (a fresh mount each time it's
  // navigated to), not tracked reactively — this is the persistent entry
  // point back to the legacy-data import for anyone who dismissed the
  // main prompt with "Not now" rather than actually importing or declining.
  const [legacy, setLegacy] = useState<Database | null>(() => getImportableLegacyDatabase());
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  function handleImportLegacy() {
    if (!legacy) return;
    setImporting(true);
    setImportError(null);
    importLegacyDatabase(legacy)
      .then(() => setLegacy(null))
      .catch((err: unknown) => {
        setImportError(err instanceof Error ? err.message : "Couldn't import that data.");
      })
      .finally(() => setImporting(false));
  }

  function handlePermanentlyDeclineLegacy() {
    const confirmed = window.confirm(
      "Don't import this data? This can't be undone — this device won't offer to import it again.",
    );
    if (!confirmed) return;
    declineLegacyImport();
    setLegacy(null);
  }

  function handleCopy() {
    const lines = [
      `commit: ${__APP_COMMIT_SHA__}`,
      `built: ${__APP_BUILD_TIME__}`,
      `base URL: ${import.meta.env.BASE_URL}`,
      `mode: ${import.meta.env.MODE}`,
      `location: ${window.location.href}`,
      `localStorage: ${storageProbe()}`,
      `data: ${JSON.stringify(counts)}`,
      '',
      'log:',
      ...log.map((e) => `[${e.time}] ${e.level.toUpperCase()} ${e.message}${e.detail ? ` — ${e.detail}` : ''}`),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Link to="/" className="text-sm text-sky-500 hover:underline">
        ← Back to Home
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        Diagnostics
      </h1>

      {legacy && (
        <section className="rounded-md border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Import data from before accounts existed
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This device has {legacy.folders.length} folder{legacy.folders.length === 1 ? '' : 's'},{' '}
            {legacy.dogs.length} dog{legacy.dogs.length === 1 ? '' : 's'}, and {legacy.reports.length}{' '}
            training log{legacy.reports.length === 1 ? '' : 's'} saved locally from before your
            account existed. Import it into your account so it's backed up and available on your
            other devices.
          </p>
          {importError && <p className="text-sm text-red-500">{importError}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleImportLegacy}
              disabled={importing}
              className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import my data'}
            </button>
            <button
              onClick={handlePermanentlyDeclineLegacy}
              disabled={importing}
              className="text-xs text-gray-400 hover:underline disabled:opacity-50"
            >
              This isn't my data — don't ask again
            </button>
          </div>
        </section>
      )}

      <section className="space-y-1 text-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Build
        </h2>
        <p>Commit: <code>{__APP_COMMIT_SHA__}</code></p>
        <p>Built: {__APP_BUILD_TIME__}</p>
        <p>Base URL: <code>{import.meta.env.BASE_URL}</code></p>
        <p>Mode: {import.meta.env.MODE}</p>
        <p>Location: {window.location.href}</p>
        <p>localStorage: {storageProbe()}</p>
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Data
        </h2>
        <p>
          Folders: {counts.folders} · Dogs: {counts.dogs} · Logs: {counts.reports} ·
          Locations: {counts.locations}
        </p>
        <p>
          Skills: {counts.checklistItems} · Completions: {counts.completions} · Milestone
          templates: {counts.milestoneTemplates} · Milestone completions:{' '}
          {counts.dogMilestoneCompletions} · Distraction templates: {counts.distractionTemplates}
        </p>
        <p>Stored data size: {counts.storageBytes.toLocaleString()} bytes</p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Event Log
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Copy diagnostics
            </button>
            <button
              onClick={clearLog}
              className="rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Clear log
            </button>
          </div>
        </div>
        <ul className="space-y-1 text-xs font-mono max-h-96 overflow-y-auto">
          {log.map((entry) => (
            <li
              key={entry.id}
              className={
                entry.level === 'error'
                  ? 'text-red-500'
                  : 'text-gray-600 dark:text-gray-300'
              }
            >
              [{new Date(entry.time).toLocaleTimeString()}] {entry.message}
              {entry.detail ? ` — ${entry.detail}` : ''}
            </li>
          ))}
          {log.length === 0 && <p className="text-gray-400">No events logged yet.</p>}
        </ul>
      </section>
    </div>
  );
}

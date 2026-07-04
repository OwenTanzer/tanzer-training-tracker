import { Link } from 'react-router-dom';
import { clearLog, useDiagnosticLog } from '../lib/diagnostics';
import { useDatabaseCounts } from '../data/store';

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
          Folders: {counts.folders} · Dogs: {counts.dogs} · Reports: {counts.reports} ·
          Locations: {counts.locations}
        </p>
        <p>
          Checklist items: {counts.checklistItems} · Completions: {counts.completions} ·
          Milestones: {counts.milestones}
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

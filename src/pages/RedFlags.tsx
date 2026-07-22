import { Link } from 'react-router-dom';
import { toggleReportRedFlag, useDog, useLocations, useRedFlaggedReports } from '../data/store';

function RedFlaggedReport({ reportId }: { reportId: string }) {
  const reports = useRedFlaggedReports();
  const report = reports.find((r) => r.id === reportId)!;
  const dog = useDog(report.dogId);
  const locations = useLocations();
  const location = locations.find((l) => l.id === report.locationId);

  return (
    <li className="rounded-lg border border-red-200 dark:border-red-900 p-3 space-y-1">
      <div className="flex items-center justify-between text-sm">
        <Link to={dog ? `/dog/${dog.id}` : '#'} className="font-medium text-sky-500 hover:underline">
          {dog?.name ?? 'Unknown dog'}
        </Link>
        <button
          onClick={() => toggleReportRedFlag(report.id)}
          title="Unflag"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-sm ring-1 ring-red-400 transition-all duration-150 active:scale-90 dark:bg-red-950"
        >
          🚩
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {report.phase} · {new Date(`${report.sessionDate}T12:00:00`).toLocaleDateString()}
        {location ? ` · 📍 ${location.name}` : ''}
      </p>
      {report.picture && (
        <img src={report.picture} alt="Log attachment" className="h-24 w-24 rounded-md object-cover" />
      )}
      <p className="text-sm text-gray-700 dark:text-gray-300">{report.notes}</p>
    </li>
  );
}

export function RedFlags() {
  const reports = useRedFlaggedReports();

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Link to="/" className="text-sm text-sky-500 hover:underline">
        ← Back to Home
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        🚩 Red-Flagged Logs
      </h1>
      {reports.length === 0 && (
        <p className="text-sm text-gray-400">No red-flagged logs yet.</p>
      )}
      <ul className="space-y-2">
        {reports.map((r) => (
          <RedFlaggedReport key={r.id} reportId={r.id} />
        ))}
      </ul>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useDogsInFolder,
  useFolder,
  usePinnedFolderId,
  useTrainerHistoryStats,
  type FinalOutcomeCounts,
  type SuccessRate,
} from '../data/store';
import { useSession } from '../lib/auth';

function StatTile({
  icon,
  label,
  value,
  onClick,
}: {
  icon: string;
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-xl">{icon}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500">{label}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-left hover:border-sky-400"
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">{content}</div>;
}

function formatLastWorked(dateIso: string | null): string {
  if (!dateIso) return 'Never worked';
  return `Last worked ${new Date(dateIso).toLocaleDateString()}`;
}

// "Trainer since" is a cosmetic touch, not a system-of-record fact, so a
// missing or unparsable date (e.g. a session persisted in localStorage
// before this field existed) just quietly omits the line rather than
// showing "Invalid Date" or crashing the page.
function formatTrainerSince(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function SuccessRateCard({ rate }: { rate: SuccessRate }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
        {rate.percent === null ? '—' : `${rate.percent}%`}
      </p>
      <p className="text-xs text-gray-500">
        {rate.graduated + rate.released === 0
          ? 'No graduated or released dogs yet'
          : `${rate.graduated} graduated · ${rate.released} released`}
      </p>
    </div>
  );
}

// Part-to-whole across 3 categories reads more precisely as a segmented bar
// than a pie — same status colors (emerald/amber/red) already used
// everywhere else in the app (ProgressBar, released markers, flags).
function FinalOutcomeBar({ counts }: { counts: FinalOutcomeCounts }) {
  if (counts.total === 0) {
    return (
      <p className="text-sm text-gray-400">No final outcome decisions recorded yet.</p>
    );
  }
  const segments: { label: string; count: number; color: string }[] = [
    { label: 'Placement Ready', count: counts.placementReady, color: 'bg-emerald-500' },
    { label: 'Additional Objectives', count: counts.additionalObjectives, color: 'bg-amber-400' },
    { label: 'Fail', count: counts.fail, color: 'bg-red-500' },
  ];
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.label}
              className={`h-full ${s.color}`}
              style={{ width: `${(s.count / counts.total) * 100}%` }}
              title={`${s.label}: ${s.count} (${Math.round((s.count / counts.total) * 100)}%)`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label}: {s.count} ({Math.round((s.count / counts.total) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

export function TrainerHistory() {
  const stats = useTrainerHistoryStats();
  const session = useSession();
  const [refinedRate, setRefinedRate] = useState(false);
  const [showGraduatedList, setShowGraduatedList] = useState(false);
  const pinnedFolderId = usePinnedFolderId();
  const pinnedFolder = useFolder(pinnedFolderId);
  const pinnedDogs = useDogsInFolder(pinnedFolderId ?? '');

  if (!session) return null;

  const trainerSince = formatTrainerSince(session.createdAt);
  const activeSuccessRate = refinedRate ? stats.successRateRefined : stats.successRateOverall;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-4xl">
            {session.profilePhotoUrl ? (
              <img
                src={session.profilePhotoUrl}
                alt={session.name}
                className="h-full w-full object-cover"
              />
            ) : (
              '🧑‍🏫'
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {session.name}
            </h1>
            {trainerSince && (
              <p className="text-sm text-gray-500">Trainer since {trainerSince}</p>
            )}
            <Link to="/account" className="text-xs text-sky-500 hover:underline">
              Edit profile
            </Link>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/red-flags"
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          >
            🚩 Red Flags
          </Link>
          <Link
            to="/folders"
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            📂 My Folders
          </Link>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        A look back at your training career — every dog you've handled on this account. Other
        instructors' data isn't included here.
      </p>

      {pinnedFolderId && pinnedFolder && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
              📌 {pinnedFolder.name}
            </h2>
            <Link
              to={`/folder/${pinnedFolder.id}`}
              className="text-xs text-sky-500 hover:underline"
            >
              Open folder
            </Link>
          </div>
          {pinnedDogs.length === 0 ? (
            <p className="text-sm text-gray-400">No dogs in this folder yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pinnedDogs.map((dog) => (
                <Link
                  key={dog.id}
                  to={`/dog/${dog.id}`}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 p-2 hover:border-sky-400"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg">
                    {dog.profilePhoto ? (
                      <img
                        src={dog.profilePhoto}
                        alt={dog.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      '🐕'
                    )}
                  </div>
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {dog.name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Your Dogs</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile icon="🐕" label="Total dogs handled" value={stats.totalDogs} />
          <StatTile icon="🐾" label="Active dogs" value={stats.activeDogs} />
          <StatTile
            icon="🎓"
            label="Graduated (tap for list)"
            value={stats.graduatedDogs}
            onClick={() => setShowGraduatedList((v) => !v)}
          />
          <StatTile icon="👋" label="Released" value={stats.releasedDogs} />
        </div>
        {showGraduatedList && (
          <ul className="space-y-1">
            {stats.graduatedDogsList.length === 0 && (
              <p className="text-sm text-gray-400">No graduated dogs yet.</p>
            )}
            {stats.graduatedDogsList.map((dog) => (
              <li key={dog.id}>
                <Link
                  to={`/dog/${dog.id}`}
                  className="flex items-center justify-between rounded-xl border border-emerald-200 dark:border-emerald-900 p-3 text-sm hover:border-emerald-400"
                >
                  <span className="font-medium text-gray-900 dark:text-gray-100">{dog.name}</span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    {dog.graduatedDate
                      ? `Graduated ${new Date(dog.graduatedDate).toLocaleDateString()}`
                      : 'Graduated'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Career Highlights
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile icon="📝" label="Training logs" value={stats.totalLogs} />
          <StatTile icon="📅" label="Logs this week" value={stats.logsThisWeek} />
          <StatTile icon="🗓️" label="Logs this month" value={stats.logsThisMonth} />
          <StatTile icon="🏁" label="Milestones completed" value={stats.milestonesCompleted} />
          <StatTile icon="⭐" label="Skills worked on (total)" value={stats.skillsWorkedOnTotal} />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Success Rate
          </h2>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setRefinedRate(false)}
              className={
                !refinedRate
                  ? 'rounded-md bg-sky-500 px-2 py-1 font-medium text-white'
                  : 'rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800'
              }
            >
              Overall
            </button>
            <button
              type="button"
              onClick={() => setRefinedRate(true)}
              title="Omits dogs marked Excluded from Stats (pass-backs, health releases, etc.)"
              className={
                refinedRate
                  ? 'rounded-md bg-sky-500 px-2 py-1 font-medium text-white'
                  : 'rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800'
              }
            >
              Refined
            </button>
          </div>
        </div>
        <SuccessRateCard rate={activeSuccessRate} />
        <p className="text-xs text-gray-400">
          Graduated ÷ (graduated + released). Dogs still in progress aren't counted either way.
          {refinedRate && ' Refined omits dogs marked "Excluded from Stats."'}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Final Evaluation Outcomes
        </h2>
        <FinalOutcomeBar counts={stats.finalOutcomeCounts} />
        <p className="text-xs text-gray-400">
          From the milestone flagged as the final outcome (e.g. Advanced Final Blindfold) in
          Manage Training Options.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Skills You've Worked Most
        </h2>
        {stats.mostWorkedSkills.length === 0 && (
          <p className="text-sm text-gray-400">No skills logged as worked on yet.</p>
        )}
        <ul className="space-y-1">
          {stats.mostWorkedSkills.map((s) => (
            <li
              key={s.checklistItemId}
              className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-sm"
            >
              <span className="text-gray-800 dark:text-gray-200">
                {s.title} <span className="text-xs text-gray-400">· {s.phase}</span>
              </span>
              <span className="text-xs text-gray-500">{s.count}×</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Recently Worked With
        </h2>
        {stats.recentlyWorkedDogs.length === 0 && (
          <p className="text-sm text-gray-400">No training logs yet.</p>
        )}
        <ul className="space-y-1">
          {stats.recentlyWorkedDogs.map(({ dog, lastWorkedDate }) => (
            <li key={dog.id}>
              <Link
                to={`/dog/${dog.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-sm hover:border-sky-400"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">{dog.name}</span>
                <span className="text-xs text-gray-500">{formatLastWorked(lastWorkedDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Could Use Some Attention
        </h2>
        {stats.dogsNotWorkedRecently.length === 0 && (
          <p className="text-sm text-gray-400">
            Every active dog has a training log from the last two weeks.
          </p>
        )}
        <ul className="space-y-1">
          {stats.dogsNotWorkedRecently.map(({ dog, lastWorkedDate }) => (
            <li key={dog.id}>
              <Link
                to={`/dog/${dog.id}`}
                className="flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-900 p-3 text-sm hover:border-amber-400"
              >
                <span className="font-medium text-gray-900 dark:text-gray-100">{dog.name}</span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {formatLastWorked(lastWorkedDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import { MilestoneOutcomeChart } from '../components/MilestoneOutcomeChart';
import { calendarDateAtLocalNoon } from '../../shared/sessionDate';
import { formatTrainerSince } from '../../shared/trainerSince';
import { useState, type ReactNode } from 'react';
import { DailyWorkBadge } from '../components/DailyWorkStatus';
import { dailyWorkSurfaceClass } from '../lib/dailyWork';
import { Link } from 'react-router-dom';
import {
  Dog as DogIcon,
  Flag,
  FolderOpen,
  GraduationCap,
  LogOut,
  PawPrint,
  Pin,
  User,
} from 'lucide-react';
import {
  useDogsInFolder,
  useFolder,
  usePinnedFolderId,
  useDailySessionCounts,
  useTrainerHistoryStats,
  type SuccessRate,
} from '../data/store';
import { useSession } from '../lib/auth';

function StatTile({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-gray-400 dark:text-gray-500">{icon}</p>
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
  return `Last worked ${calendarDateAtLocalNoon(dateIso).toLocaleDateString()}`;
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

export function TrainerHistory() {
  const stats = useTrainerHistoryStats();
  const session = useSession();
  const [refinedRate, setRefinedRate] = useState(true);
  const [dogList, setDogList] = useState<keyof typeof stats.dogLists | null>(null);
  const listLabels = { all: 'All dogs', active: 'Active dogs', graduated: 'Graduated dogs', released: 'Released dogs' };
  const toggleList = (list: keyof typeof stats.dogLists) => setDogList((current) => current === list ? null : list);
  const pinnedFolderId = usePinnedFolderId();
  const pinnedFolder = useFolder(pinnedFolderId);
  const pinnedDogs = useDogsInFolder(pinnedFolderId ?? '');

  const dailySessionCounts = useDailySessionCounts();
  if (!session) return null;

  const trainerSince = formatTrainerSince(session.trainerSince);
  const activeSuccessRate = refinedRate ? stats.successRateRefined : stats.successRateOverall;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500">
            {session.profilePhotoUrl ? (
              <img
                src={session.profilePhotoUrl}
                alt={session.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-9 w-9" />
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
        <div className="flex shrink-0 flex-col sm:flex-row gap-2">
          <Link
            to="/red-flags"
            className="flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          >
            <Flag className="h-4 w-4" /> Red Flags
          </Link>
          <Link
            to="/folders"
            className="flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            <FolderOpen className="h-4 w-4" /> My Folders
          </Link>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Your assigned dogs and what needs attention today. Other instructors' data isn't included
        here.
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Needs Attention
        </h2>
        {stats.dogsNeedingAttention.length === 0 && (
          <p className="text-sm text-gray-400">
            {pinnedFolderId ? 'Every currently assigned pinned dog was worked yesterday.' : 'Pin a folder to track which assigned dogs were not worked yesterday.'}
          </p>
        )}
        <ul className="space-y-1">
          {stats.dogsNeedingAttention.map(({ dog, lastWorkedDate }) => (
            <li key={dog.id}>
              <Link
                to={`/dog/${dog.id}`}
                className="flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-900 p-3 text-sm hover:border-amber-400"
              >
                <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                  {dog.name}
                  <DailyWorkBadge count={dailySessionCounts[dog.id] ?? 0} />
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {formatLastWorked(lastWorkedDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Recently Worked
        </h2>
        {stats.recentlyWorkedDogs.length === 0 && (
          <p className="text-sm text-gray-400">No recent logs for currently assigned dogs.</p>
        )}
        <ul className="space-y-1">
          {stats.recentlyWorkedDogs.map(({ dog, lastWorkedDate }) => (
            <li key={dog.id}>
              <Link
                to={`/dog/${dog.id}`}
                className={`flex items-center justify-between rounded-xl border p-3 text-sm hover:border-sky-400 ${dailyWorkSurfaceClass(dailySessionCounts[dog.id] ?? 0)}`}
              >
                <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                  {dog.name}
                  <DailyWorkBadge count={dailySessionCounts[dog.id] ?? 0} />
                </span>
                <span className="text-xs text-gray-500">{formatLastWorked(lastWorkedDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {pinnedFolderId && pinnedFolder && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-gray-500">
              <Pin className="h-3.5 w-3.5" /> {pinnedFolder.name}
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
                  className={`flex items-center gap-2 rounded-xl border p-2 hover:border-sky-400 ${dailyWorkSurfaceClass(dailySessionCounts[dog.id] ?? 0)}`}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500">
                    {dog.profilePhoto ? (
                      <img
                        src={dog.profilePhoto}
                        alt={dog.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <DogIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {dog.name}
                    </span>
                    <DailyWorkBadge count={dailySessionCounts[dog.id] ?? 0} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Your Dogs</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            icon={<DogIcon className="h-5 w-5" />}
            label="Total dogs handled"
            value={stats.totalDogs}
            onClick={() => toggleList('all')}
          />
          <StatTile icon={<PawPrint className="h-5 w-5" />} label="Active dogs" value={stats.activeDogs} onClick={() => toggleList('active')} />
          <StatTile
            icon={<GraduationCap className="h-5 w-5" />}
            label="Graduated (tap for list)"
            value={stats.graduatedDogs}
            onClick={() => toggleList('graduated')}
          />
          <StatTile icon={<LogOut className="h-5 w-5" />} label="Released" value={stats.releasedDogs} onClick={() => toggleList('released')} />
        </div>
        <p className="text-xs text-gray-500">Tap a category to see its dogs.</p>
        {dogList && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{listLabels[dogList]}</h3>
            {stats.dogLists[dogList].length === 0 && <p className="text-sm text-gray-400">No dogs in this category yet.</p>}
            <ul className="space-y-1">
              {stats.dogLists[dogList].map((dog) => (
                <li key={dog.id}>
                  <Link to={`/dog/${dog.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 p-3 text-sm hover:border-sky-400 dark:border-gray-700">
                    <span className="font-medium">{dog.name}</span>
                    <span className="text-xs text-gray-500">
                      {dog.graduated ? (dog.graduatedDate ? `Graduated ${calendarDateAtLocalNoon(dog.graduatedDate).toLocaleDateString()}` : 'Graduated') : dog.released ? 'Released' : dog.currentPhase}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Success Rate
          </h2>
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              onClick={() => setRefinedRate(true)}
              title="Omits dogs marked Excluded from Success Rate (pass-backs, health releases, etc.)"
              className={
                refinedRate
                  ? 'rounded-md bg-sky-500 px-2 py-1 font-medium text-white'
                  : 'rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800'
              }
            >
              Refined
            </button>
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
          </div>
        </div>
        <SuccessRateCard rate={activeSuccessRate} />
        <p className="text-xs text-gray-400">
          Graduated ÷ (graduated + released). Dogs still in progress aren't counted either way.
          {refinedRate && ' Refined omits dogs marked "Excluded from Success Rate."'}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Milestone Outcomes</h2>
        <p className="text-xs text-gray-500">Includes all your dogs, including dogs excluded from the refined success rate. Each evaluation is counted separately.</p>
        {stats.milestoneStats.length === 0 && <p className="text-sm text-gray-400">Enable outcome recording in <Link to="/templates" className="text-sky-500 hover:underline">Manage Training Options</Link> to see evaluation results here.</p>}
        {stats.milestoneStats.map((milestone) => <MilestoneOutcomeChart key={milestone.id} stats={milestone} />)}
      </section>
    </div>
  );
}

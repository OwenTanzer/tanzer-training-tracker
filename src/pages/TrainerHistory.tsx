import { Link } from 'react-router-dom';
import { useTrainerHistoryStats } from '../data/store';
import { useSession } from '../lib/auth';

function StatTile({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xl">{icon}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
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

export function TrainerHistory() {
  const stats = useTrainerHistoryStats();
  const session = useSession();

  if (!session) return null;

  const trainerSince = formatTrainerSince(session.createdAt);

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Link to="/" className="text-sm text-sky-500 hover:underline">
        ← Back to Home
      </Link>

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

      <p className="text-sm text-gray-500">
        A look back at your training career — every dog you've handled on this account. Other
        instructors' data isn't included here.
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Your Dogs</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile icon="🐕" label="Total dogs handled" value={stats.totalDogs} />
          <StatTile icon="🐾" label="Active dogs" value={stats.activeDogs} />
          <StatTile icon="🎓" label="Graduated" value={stats.graduatedDogs} />
          <StatTile icon="👋" label="Released" value={stats.releasedDogs} />
        </div>
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
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Success rate
        </h2>
        <p className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500">
          Coming soon — this depends on pass-back and configurable milestone outcome work that
          hasn't landed yet.
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

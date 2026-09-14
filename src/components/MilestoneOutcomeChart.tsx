import type { MilestoneStats } from '../lib/milestoneAnalytics';

const COLORS = ['#0284c7', '#d97706', '#7c3aed', '#dc2626', '#059669', '#db2777', '#4f46e5', '#64748b'];

export function MilestoneOutcomeChart({ stats }: { stats: MilestoneStats }) {
  let cumulative = 0;
  const slices = stats.outcomes.map((outcome, index) => {
    const start = cumulative;
    cumulative += stats.evaluated ? outcome.count / stats.evaluated * 100 : 0;
    // Keep arbitrary numbers of custom choices distinguishable.
    const color = index < COLORS.length ? COLORS[index] : `hsl(${index * 137.508 % 360} 60% 45%)`;
    return { ...outcome, color, start, end: cumulative };
  });
  return (
    <article className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div>
        <h3 className="font-medium">{stats.title}</h3>
        <p className="text-xs text-gray-500">{stats.phase}</p>
      </div>
      {stats.evaluated ? (
        <div className="flex flex-wrap items-center gap-4">
          <div aria-hidden="true" className="h-28 w-28 shrink-0 rounded-full"
            style={{ background: `conic-gradient(${slices.filter((slice) => slice.count).map((slice) => `${slice.color} ${slice.start}% ${slice.end}%`).join(', ')})` }} />
          <ul className="min-w-0 flex-1 space-y-1 text-sm" aria-label={`${stats.title} outcome counts`}>
            {slices.map((slice) => (
              <li key={slice.id} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
                <span className="break-words">{slice.label}: {slice.count} ({Math.round(slice.count / stats.evaluated * 100)}%)</span>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="text-sm text-gray-400">No outcomes recorded yet.</p>}
      <p className="text-xs text-gray-500">
        {stats.evaluated} evaluated · {stats.noOutcome} without a recorded outcome.
        Percentages use each dog's latest result for this milestone.
      </p>
      {stats.attempts > 0 && <p className="text-xs text-gray-500">{stats.attempts} recorded attempts, including retakes. View a dog's profile for attempt history.</p>}
    </article>
  );
}

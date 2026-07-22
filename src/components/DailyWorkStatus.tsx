import { dailyWorkLevel } from '../lib/dailyWork';

export function DailyWorkBadge({ count }: { count: number }) {
  const level = dailyWorkLevel(count);
  if (level === 'none') return null;

  return (
    <span
      title={`${count} training ${count === 1 ? 'session' : 'sessions'} dated today`}
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        level === 'multiple'
          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
      }`}
    >
      {level === 'multiple' ? `${count} sessions today` : 'Worked once today'}
    </span>
  );
}

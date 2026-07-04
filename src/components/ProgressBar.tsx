import type { GraduationStatus } from '../types';

const STATUS_COLORS: Record<GraduationStatus, string> = {
  'Not Started': 'bg-gray-300 dark:bg-gray-600',
  'In Progress': 'bg-amber-400',
  'Near Graduation': 'bg-sky-500',
  Graduated: 'bg-emerald-500',
};

export function ProgressBar({
  progress,
  status,
  released = false,
  compact = false,
}: {
  progress: number;
  status: GraduationStatus;
  released?: boolean;
  compact?: boolean;
}) {
  const label = released ? 'Released' : status;
  const barColor = released ? 'bg-red-500' : STATUS_COLORS[status];

  return (
    <div className={compact ? 'w-full' : 'w-full max-w-sm'}>
      <div className="flex items-center justify-between mb-1 text-xs text-gray-600 dark:text-gray-300">
        <span className={released ? 'font-medium text-red-600 dark:text-red-400' : ''}>
          {released && '● '}
          {label}
        </span>
        <span>{progress}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

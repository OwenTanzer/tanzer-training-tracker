import { Link } from 'react-router-dom';
import type { Dog } from '../types';
import { ProgressBar } from './ProgressBar';

export function DogCard({ dog }: { dog: Dog }) {
  return (
    <Link
      to={`/dog/${dog.id}`}
      className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-sky-400 hover:shadow-sm transition"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">
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
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium truncate text-gray-900 dark:text-gray-100">
            {dog.name}
          </p>
          <span className="text-xs text-gray-500 shrink-0">{dog.currentPhase}</span>
        </div>
        <ProgressBar
          progress={dog.graduationProgress}
          status={dog.graduationStatus}
          compact
        />
      </div>
    </Link>
  );
}

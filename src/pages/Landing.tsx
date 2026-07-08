import { useState } from 'react';
import { GuideDogIllustration, randomGuideDogCoat } from '../components/GuideDogIllustration';

export function Landing({ onContinue }: { onContinue: () => void }) {
  const [coat] = useState(randomGuideDogCoat);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 bg-white dark:bg-gray-900 p-6 text-center">
      <GuideDogIllustration coat={coat} className="h-32 w-44" />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          The Tanzer Training Tracker
        </h1>
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Track skills, milestones, and training reports for every dog in the program.
        </p>
      </div>
      <button
        onClick={onContinue}
        className="rounded-md bg-sky-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
      >
        Enter the Tracker
      </button>
    </div>
  );
}

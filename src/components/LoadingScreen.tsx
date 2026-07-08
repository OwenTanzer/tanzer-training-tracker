import { useEffect, useState } from 'react';
import { GuideDogIllustration, randomGuideDogCoat } from './GuideDogIllustration';

const DURATION_MS = 1800;

export function LoadingScreen({ onFinish }: { onFinish: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [coat] = useState(randomGuideDogCoat);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), DURATION_MS - 300);
    const doneTimer = setTimeout(onFinish, DURATION_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 flex flex-col items-center justify-center gap-6 bg-white dark:bg-gray-900 transition-opacity duration-300 ${
        fadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="relative h-24 w-64 overflow-hidden">
        <div className="absolute bottom-2 left-0 h-0.5 w-full bg-gray-300 dark:bg-gray-700" />
        <span className="absolute bottom-2 right-3 h-10 w-0.5 bg-gray-300 dark:bg-gray-700" />
        <GuideDogIllustration
          coat={coat}
          className="absolute bottom-2 h-10 w-14 animate-walk-to-curb"
        />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Tanzer Training Tracker</p>
    </div>
  );
}

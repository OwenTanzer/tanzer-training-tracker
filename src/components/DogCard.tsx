import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Dog } from '../types';
import { ProgressBar } from './ProgressBar';
import { deleteDog, moveDog, updateDog } from '../data/store';
import { MoveDialog } from './MoveDialog';

export function DogCard({ dog }: { dog: Dog }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(dog.name);
  const [moving, setMoving] = useState(false);

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== dog.name) updateDog(dog.id, { name: trimmed });
    setRenaming(false);
  }

  function handleDelete() {
    if (!confirm(`Delete ${dog.name}'s profile? This cannot be undone.`)) return;
    deleteDog(dog.id);
  }

  function handleMoveSelect(destinationId: string | null) {
    if (destinationId) moveDog(dog.id, destinationId);
    setMoving(false);
  }

  if (renaming) {
    return (
      <form
        onSubmit={handleRenameSubmit}
        className="flex items-center gap-3 rounded-lg border border-sky-400 p-3"
      >
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">
          {dog.profilePhoto ? (
            <img src={dog.profilePhoto} alt={dog.name} className="h-full w-full object-cover" />
          ) : (
            '🐕'
          )}
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRenameSubmit}
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-sm"
        />
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2 hover:border-sky-400 hover:shadow-sm transition">
      <Link to={`/dog/${dog.id}`} className="flex flex-1 items-center gap-3 min-w-0 px-1 py-1">
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
      <div className="flex shrink-0 gap-0.5">
        <button
          title="Rename"
          onClick={() => {
            setName(dog.name);
            setRenaming(true);
          }}
          className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          ✏️
        </button>
        <button
          title="Move"
          onClick={() => setMoving(true)}
          className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          📂
        </button>
        <button
          title="Delete"
          onClick={handleDelete}
          className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
        >
          🗑️
        </button>
      </div>
      {moving && (
        <MoveDialog
          title={`Move ${dog.name} to…`}
          allowRoot={false}
          onSelect={handleMoveSelect}
          onClose={() => setMoving(false)}
        />
      )}
    </div>
  );
}

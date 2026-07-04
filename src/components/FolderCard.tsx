import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Folder } from '../types';
import { deleteFolder, moveFolder, renameFolder } from '../data/store';
import { MoveDialog } from './MoveDialog';
import { MoveIcon, PencilIcon, TrashIcon } from './icons';
import { SwipeRow } from './SwipeRow';
import type { RowGesture } from './ReorderableList';

export function FolderCard({
  folder,
  gesture,
  isDragging,
  dragOffset,
}: {
  folder: Folder;
  gesture: RowGesture;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const [moving, setMoving] = useState(false);

  function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== folder.name) renameFolder(folder.id, trimmed);
    setRenaming(false);
  }

  function handleDelete() {
    if (!confirm(`Delete folder "${folder.name}"?`)) return;
    const result = deleteFolder(folder.id);
    if (!result.deleted) alert(result.reason);
  }

  function handleMoveSelect(destinationId: string | null) {
    const result = moveFolder(folder.id, destinationId);
    if (!result.moved) alert(result.reason);
    setMoving(false);
  }

  if (renaming) {
    return (
      <form
        onSubmit={handleRenameSubmit}
        className="flex items-center gap-3 rounded-lg border border-sky-400 p-3"
      >
        <span className="text-2xl">📁</span>
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
    <>
      <SwipeRow
        gesture={gesture}
        isDragging={isDragging}
        dragOffset={dragOffset}
        actions={
          <>
            <button
              title="Rename"
              onClick={() => {
                setName(folder.name);
                setRenaming(true);
              }}
              className="flex flex-1 items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <PencilIcon />
            </button>
            <button
              title="Move"
              onClick={() => setMoving(true)}
              className="flex flex-1 items-center justify-center bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <MoveIcon />
            </button>
            <button
              title="Delete"
              onClick={handleDelete}
              className="flex flex-1 items-center justify-center bg-red-500 text-white hover:bg-red-600"
            >
              <TrashIcon />
            </button>
          </>
        }
      >
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2 hover:border-sky-400 hover:shadow-sm transition">
          <Link
            to={`/folder/${folder.id}`}
            className="flex flex-1 items-center gap-3 min-w-0 px-1 py-1"
          >
            <span className="text-2xl">📁</span>
            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {folder.name}
            </span>
          </Link>
        </div>
      </SwipeRow>
      {moving && (
        <MoveDialog
          title={`Move "${folder.name}" to…`}
          excludeFolderSubtreeId={folder.id}
          onSelect={handleMoveSelect}
          onClose={() => setMoving(false)}
        />
      )}
    </>
  );
}

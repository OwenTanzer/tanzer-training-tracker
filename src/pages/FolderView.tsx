import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { DogCard } from '../components/DogCard';
import { FolderCard } from '../components/FolderCard';
import { MoveDialog } from '../components/MoveDialog';
import { MoveIcon, PencilIcon, TrashIcon } from '../components/icons';
import { ReorderableList } from '../components/ReorderableList';
import {
  createDog,
  createFolder,
  deleteFolder,
  moveFolder,
  renameFolder,
  reorderDogs,
  reorderFolders,
  setPinnedFolder,
  useChildFolders,
  useDogsInFolder,
  useFolder,
  useFolders,
  usePinnedFolderId,
} from '../data/store';
import type { Dog, Folder } from '../types';

export function FolderView() {
  const { folderId = null } = useParams<{ folderId?: string }>();
  const navigate = useNavigate();
  const folder = useFolder(folderId);
  const allFolders = useFolders();
  const childFolders = useChildFolders(folderId);
  const dogs = useDogsInFolder(folderId ?? '');
  const pinnedFolderId = usePinnedFolderId();
  const isPinned = !!folder && pinnedFolderId === folder.id;
  const [newFolderName, setNewFolderName] = useState('');
  const [newDogName, setNewDogName] = useState('');
  const [renamingSelf, setRenamingSelf] = useState(false);
  const [selfName, setSelfName] = useState(folder?.name ?? '');
  const [movingSelf, setMovingSelf] = useState(false);

  function handleAddFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolder(newFolderName.trim(), folderId);
    setNewFolderName('');
  }

  function handleAddDog(e: React.FormEvent) {
    e.preventDefault();
    if (!newDogName.trim() || !folderId) return;
    createDog(newDogName.trim(), folderId);
    setNewDogName('');
  }

  function handleRenameSelfSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = selfName.trim();
    if (folder && trimmed && trimmed !== folder.name) renameFolder(folder.id, trimmed);
    setRenamingSelf(false);
  }

  function handleMoveSelfSelect(destinationId: string | null) {
    if (!folder) return;
    const result = moveFolder(folder.id, destinationId);
    if (!result.moved) alert(result.reason);
    setMovingSelf(false);
  }

  function handleDeleteSelf() {
    if (!folder) return;
    if (!confirm(`Delete folder "${folder.name}"?`)) return;
    const result = deleteFolder(folder.id);
    if (!result.deleted) {
      alert(result.reason);
      return;
    }
    navigate(folder.parentFolderId ? `/folder/${folder.parentFolderId}` : '/folders');
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Breadcrumbs folder={folder} allFolders={allFolders} />

      {folder && renamingSelf ? (
        <form onSubmit={handleRenameSelfSubmit} className="flex items-center gap-2">
          <input
            autoFocus
            value={selfName}
            onChange={(e) => setSelfName(e.target.value)}
            onBlur={handleRenameSelfSubmit}
            className="text-2xl font-semibold bg-transparent border-b border-sky-400 focus:outline-none text-gray-900 dark:text-gray-100"
          />
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {folder ? folder.name : 'My Folders'}
          </h1>
          {folder && (
            <div className="flex gap-0.5">
              <button
                title={isPinned ? 'Unpin this folder from Trainer History' : 'Pin this folder to Trainer History'}
                onClick={() => setPinnedFolder(isPinned ? null : folder.id)}
                className={`rounded p-1.5 ${
                  isPinned
                    ? 'text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                📌
              </button>
              <button
                title="Rename this folder"
                onClick={() => {
                  setSelfName(folder.name);
                  setRenamingSelf(true);
                }}
                className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <PencilIcon />
              </button>
              <button
                title="Move this folder"
                onClick={() => setMovingSelf(true)}
                className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <MoveIcon />
              </button>
              <button
                title="Delete this folder"
                onClick={handleDeleteSelf}
                className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <TrashIcon />
              </button>
            </div>
          )}
        </div>
      )}
      {folder && movingSelf && (
        <MoveDialog
          title={`Move "${folder.name}" to…`}
          excludeFolderSubtreeId={folder.id}
          onSelect={handleMoveSelfSelect}
          onClose={() => setMovingSelf(false)}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Folders
        </h2>
        {childFolders.length === 0 && (
          <p className="text-sm text-gray-400">No subfolders yet.</p>
        )}
        <ReorderableList
          items={childFolders}
          getId={(f: Folder) => f.id}
          onReorder={(orderedIds) => reorderFolders(folderId, orderedIds)}
          className="grid gap-2 sm:grid-cols-2"
          renderItem={(f, gesture, isDragging, dragOffset) => (
            <FolderCard
              folder={f}
              gesture={gesture}
              isDragging={isDragging}
              dragOffset={dragOffset}
            />
          )}
        />
        <form onSubmit={handleAddFolder} className="flex gap-2 pt-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name"
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Add Folder
          </button>
        </form>
      </section>

      {folderId && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            Dogs
          </h2>
          {dogs.length === 0 && (
            <p className="text-sm text-gray-400">No dogs in this folder yet.</p>
          )}
          <ReorderableList
            items={dogs}
            getId={(dog: Dog) => dog.id}
            onReorder={(orderedIds) => folderId && reorderDogs(folderId, orderedIds)}
            className="grid gap-2 sm:grid-cols-2"
            renderItem={(dog, gesture, isDragging, dragOffset) => (
              <DogCard
                dog={dog}
                gesture={gesture}
                isDragging={isDragging}
                dragOffset={dragOffset}
              />
            )}
          />
          <form onSubmit={handleAddDog} className="flex gap-2 pt-2">
            <input
              value={newDogName}
              onChange={(e) => setNewDogName(e.target.value)}
              placeholder="New dog's name"
              className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
            >
              Add Dog
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

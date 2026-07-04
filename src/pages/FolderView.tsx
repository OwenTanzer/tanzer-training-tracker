import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { DogCard } from '../components/DogCard';
import { FolderCard } from '../components/FolderCard';
import {
  createDog,
  createFolder,
  useChildFolders,
  useDogsInFolder,
  useFolder,
  useFolders,
} from '../data/store';

export function FolderView() {
  const { folderId = null } = useParams<{ folderId?: string }>();
  const folder = useFolder(folderId);
  const allFolders = useFolders();
  const childFolders = useChildFolders(folderId);
  const dogs = useDogsInFolder(folderId ?? '');
  const [newFolderName, setNewFolderName] = useState('');
  const [newDogName, setNewDogName] = useState('');

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

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Breadcrumbs folder={folder} allFolders={allFolders} />

      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {folder ? folder.name : 'All Folders'}
      </h1>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Folders
        </h2>
        {childFolders.length === 0 && (
          <p className="text-sm text-gray-400">No subfolders yet.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {childFolders.map((f) => (
            <FolderCard key={f.id} folder={f} />
          ))}
        </div>
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
          <div className="grid gap-2 sm:grid-cols-2">
            {dogs.map((dog) => (
              <DogCard key={dog.id} dog={dog} />
            ))}
          </div>
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

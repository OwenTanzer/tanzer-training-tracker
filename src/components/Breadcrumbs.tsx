import { Link } from 'react-router-dom';
import type { Folder } from '../types';

export function Breadcrumbs({
  folder,
  allFolders,
}: {
  folder: Folder | undefined;
  allFolders: Folder[];
}) {
  const chain: Folder[] = [];
  let current = folder;
  while (current) {
    chain.unshift(current);
    current = allFolders.find((f) => f.id === current!.parentFolderId);
  }

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      <Link to="/folders" className="hover:text-sky-500">
        My Folders
      </Link>
      {chain.map((f) => (
        <span key={f.id} className="flex items-center gap-1">
          <span>/</span>
          <Link to={`/folder/${f.id}`} className="hover:text-sky-500">
            {f.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}

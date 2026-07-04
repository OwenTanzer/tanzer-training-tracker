import { Link } from 'react-router-dom';
import type { Folder } from '../types';

export function FolderCard({ folder }: { folder: Folder }) {
  return (
    <Link
      to={`/folder/${folder.id}`}
      className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:border-sky-400 hover:shadow-sm transition"
    >
      <span className="text-2xl">📁</span>
      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
        {folder.name}
      </span>
    </Link>
  );
}

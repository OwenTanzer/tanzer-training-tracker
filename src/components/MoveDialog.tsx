import { useFolders } from '../data/store';
import { flattenFolderTree } from '../lib/folderTree';

export function MoveDialog({
  title,
  excludeFolderSubtreeId,
  allowRoot = true,
  onSelect,
  onClose,
}: {
  title: string;
  excludeFolderSubtreeId?: string;
  allowRoot?: boolean;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const folders = useFolders();
  const tree = flattenFolderTree(folders, excludeFolderSubtreeId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <ul className="space-y-1">
          {allowRoot && (
            <li>
              <button
                onClick={() => onSelect(null)}
                className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-sky-50 dark:hover:bg-sky-950"
              >
                🏠 Home (top level)
              </button>
            </li>
          )}
          {tree.map(({ folder, depth }) => (
            <li key={folder.id}>
              <button
                onClick={() => onSelect(folder.id)}
                style={{ paddingLeft: `${8 + depth * 16}px` }}
                className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-sky-50 dark:hover:bg-sky-950"
              >
                📁 {folder.name}
              </button>
            </li>
          ))}
          {tree.length === 0 && !allowRoot && (
            <p className="px-2 py-1.5 text-sm text-gray-400">
              No other folders to move into yet.
            </p>
          )}
        </ul>
        <button
          onClick={onClose}
          className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

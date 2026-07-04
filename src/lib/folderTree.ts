import type { Folder } from '../types';

export interface FolderTreeNode {
  folder: Folder;
  depth: number;
}

export function flattenFolderTree(
  folders: Folder[],
  excludeSubtreeRootId?: string,
): FolderTreeNode[] {
  const excludedIds = new Set<string>();
  if (excludeSubtreeRootId) {
    const collect = (id: string) => {
      excludedIds.add(id);
      folders
        .filter((f) => f.parentFolderId === id)
        .forEach((f) => collect(f.id));
    };
    collect(excludeSubtreeRootId);
  }

  const result: FolderTreeNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    folders
      .filter((f) => f.parentFolderId === parentId && !excludedIds.has(f.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((f) => {
        result.push({ folder: f, depth });
        visit(f.id, depth + 1);
      });
  };
  visit(null, 0);
  return result;
}

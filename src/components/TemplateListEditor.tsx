import { useRef, useState } from 'react';
import { ReorderableList, type RowGesture } from './ReorderableList';

export interface TemplateListItem {
  id: string;
  title: string;
}

// A dedicated grab handle rather than the whole row: template rows already
// have visible, always-on rename/delete buttons (no swipe-to-reveal like
// FolderCard/DogCard), so there's no "tap vs. long-press vs. swipe"
// ambiguity to resolve — the handle can start a drag on the very first
// pointerdown. Mirrors SwipeRow's stable-callback trampoline so add/remove
// event listener always target the same function reference even though this
// component re-renders (via ReorderableList's drag state) mid-gesture.
function DragHandle({ gesture }: { gesture: RowGesture }) {
  const activePointerId = useRef<number | null>(null);

  function handlePointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointerId.current) return;
    e.preventDefault();
    gesture.updateDrag(e.clientX, e.clientY);
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerId !== activePointerId.current) return;
    gesture.endDrag();
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableUp);
    window.removeEventListener('pointercancel', stableUp);
    activePointerId.current = null;
  }

  const implRef = useRef({ move: handlePointerMove, up: handlePointerUp });
  implRef.current.move = handlePointerMove;
  implRef.current.up = handlePointerUp;
  const stableMove = useRef((e: PointerEvent) => implRef.current.move(e)).current;
  const stableUp = useRef((e: PointerEvent) => implRef.current.up(e)).current;

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    activePointerId.current = e.pointerId;
    gesture.startDrag(e.clientX, e.clientY);
    window.addEventListener('pointermove', stableMove, { passive: false });
    window.addEventListener('pointerup', stableUp);
    window.addEventListener('pointercancel', stableUp);
  }

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      title="Drag to reorder"
      className="cursor-grab select-none rounded px-1 py-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing dark:hover:bg-gray-800"
      style={{ touchAction: 'none' }}
    >
      ⠿
    </button>
  );
}

export function TemplateListEditor<T extends TemplateListItem>({
  label,
  addPlaceholder,
  items,
  onAdd,
  onRename,
  onDelete,
  onReorder,
  renderExtra,
}: {
  label: string;
  addPlaceholder: string;
  items: T[];
  onAdd: (title: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  // Optional per-row content rendered before the rename/delete buttons —
  // e.g. the "final outcome milestone" flag toggle, which only milestones
  // have. Skills/distractions simply don't pass this.
  renderExtra?: (item: T) => React.ReactNode;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewTitle('');
  }

  function startEditing(item: TemplateListItem) {
    setEditingId(item.id);
    setEditingTitle(item.title);
  }

  function commitEdit() {
    const trimmed = editingTitle.trim();
    if (editingId && trimmed) onRename(editingId, trimmed);
    setEditingId(null);
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">{label}</h2>
      <ReorderableList
        items={items}
        getId={(item) => item.id}
        onReorder={onReorder}
        className="flex flex-col gap-1"
        renderItem={(item, gesture, isDragging, dragOffset) => (
          <div
            className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2"
            style={
              isDragging
                ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }
                : undefined
            }
          >
            <DragHandle gesture={gesture} />
            {editingId === item.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitEdit();
                }}
                className="flex-1"
              >
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onBlur={commitEdit}
                  className="w-full rounded-md border border-sky-400 bg-transparent px-2 py-1 text-sm"
                />
              </form>
            ) : (
              <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">
                {item.title}
              </span>
            )}
            {renderExtra?.(item)}
            <button
              title="Rename"
              onClick={() => startEditing(item)}
              className="rounded p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              ✏️
            </button>
            <button
              title="Delete"
              onClick={() => {
                if (confirm(`Delete "${item.title}"? This removes it for every dog.`)) {
                  onDelete(item.id);
                }
              }}
              className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
            >
              🗑️
            </button>
          </div>
        )}
      />
      {items.length === 0 && (
        <p className="text-sm text-gray-400">Nothing here yet for this phase.</p>
      )}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={addPlaceholder}
          className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600"
        >
          Add
        </button>
      </form>
    </section>
  );
}

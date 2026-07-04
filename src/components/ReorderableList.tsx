import { useRef, useState } from 'react';

export interface RowGesture {
  startDrag: (clientX: number, clientY: number) => void;
  updateDrag: (clientX: number, clientY: number) => void;
  endDrag: () => void;
}

// Drives a long-press-and-drag reorder gesture for a list/grid of rows. Each
// row reports its own gesture recognition (long press vs. tap vs. swipe) back
// here via the RowGesture callbacks; this component only owns the cross-row
// bookkeeping a single row can't know on its own — everyone's on-screen
// position, and which slot the dragged row currently belongs in.
//
// The dragged row's actual DOM position is never moved mid-gesture — doing
// that while a pointer is mid-drag causes some browsers to fire a
// `pointercancel` (as if the interaction were being handed off to native
// scrolling), which would abort the drag after a single move. Instead,
// siblings are visually reordered via the CSS `order` property (works on
// flex and grid children alike) while the underlying array — and the
// dragged row's real DOM slot — stays put until drop, when the real order
// is committed in one shot via onReorder.
export function ReorderableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (orderedIds: string[]) => void;
  renderItem: (
    item: T,
    gesture: RowGesture,
    isDragging: boolean,
    dragOffset: { x: number; y: number },
  ) => React.ReactNode;
  className?: string;
}) {
  const baseOrder = items.map(getId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const dragStartPointer = useRef({ x: 0, y: 0 });
  const dragStartCenter = useRef({ x: 0, y: 0 });
  const dragStartRects = useRef(new Map<string, DOMRect>());
  const dragStartOrder = useRef<string[]>([]);

  function registerRow(id: string, el: HTMLDivElement | null) {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }

  function startDrag(id: string, clientX: number, clientY: number) {
    const rects = new Map<string, DOMRect>();
    baseOrder.forEach((rowId) => {
      const el = rowRefs.current.get(rowId);
      if (el) rects.set(rowId, el.getBoundingClientRect());
    });
    dragStartRects.current = rects;
    const myRect = rects.get(id);
    dragStartCenter.current = myRect
      ? { x: myRect.left + myRect.width / 2, y: myRect.top + myRect.height / 2 }
      : { x: clientX, y: clientY };
    dragStartPointer.current = { x: clientX, y: clientY };
    dragStartOrder.current = baseOrder;
    setDragId(id);
    setDragOffset({ x: 0, y: 0 });
    setHoverIndex(baseOrder.indexOf(id));
  }

  function updateDrag(id: string, clientX: number, clientY: number) {
    if (id !== dragId) return;
    const dx = clientX - dragStartPointer.current.x;
    const dy = clientY - dragStartPointer.current.y;
    setDragOffset({ x: dx, y: dy });

    const currentCenter = {
      x: dragStartCenter.current.x + dx,
      y: dragStartCenter.current.y + dy,
    };
    let closestId = id;
    let closestDist = Infinity;
    dragStartRects.current.forEach((rect, rowId) => {
      if (rowId === id) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = (cx - currentCenter.x) ** 2 + (cy - currentCenter.y) ** 2;
      if (dist < closestDist) {
        closestDist = dist;
        closestId = rowId;
      }
    });
    setHoverIndex(dragStartOrder.current.indexOf(closestId));
  }

  function endDrag(id: string) {
    if (id !== dragId) return;
    if (hoverIndex !== null) {
      const next = [...dragStartOrder.current];
      next.splice(next.indexOf(id), 1);
      next.splice(hoverIndex, 0, id);
      if (JSON.stringify(next) !== JSON.stringify(dragStartOrder.current)) {
        onReorder(next);
      }
    }
    setDragId(null);
    setDragOffset({ x: 0, y: 0 });
    setHoverIndex(null);
  }

  const itemById = new Map(items.map((item) => [getId(item), item]));

  let visualOrder = baseOrder;
  if (dragId && hoverIndex !== null) {
    const next = [...dragStartOrder.current];
    next.splice(next.indexOf(dragId), 1);
    next.splice(hoverIndex, 0, dragId);
    visualOrder = next;
  }
  const visualIndexById = new Map(visualOrder.map((id, index) => [id, index]));

  return (
    <div className={className}>
      {baseOrder.map((id) => {
        const item = itemById.get(id);
        if (!item) return null;
        const isDragging = id === dragId;
        return (
          <div
            key={id}
            ref={(el) => registerRow(id, el)}
            className={isDragging ? 'relative z-20' : 'relative'}
            style={{ order: visualIndexById.get(id) ?? 0 }}
          >
            {renderItem(
              item,
              {
                startDrag: (clientX, clientY) => startDrag(id, clientX, clientY),
                updateDrag: (clientX, clientY) => updateDrag(id, clientX, clientY),
                endDrag: () => endDrag(id),
              },
              isDragging,
              isDragging ? dragOffset : { x: 0, y: 0 },
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useRef, useState } from 'react';
import type { RowGesture } from './ReorderableList';

const REVEAL_WIDTH = 128;
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_THRESHOLD = 10;

type Mode = 'idle' | 'pending' | 'swipe' | 'reorder';

// A single row that supports three gestures without stepping on each other:
//  - a plain tap/click passes straight through to whatever's inside (a Link)
//  - a horizontal drag reveals action buttons parked behind the row (iOS-style
//    swipe actions), so rename/move/delete don't have to sit visible full-time
//  - a long press (no meaningful movement for LONG_PRESS_MS) hands off to the
//    parent ReorderableList to start a drag-to-reorder
// Which one wins is decided lazily: we wait for either a big-enough
// horizontal move (-> swipe) or the long-press timer (-> reorder); a tap that
// does neither just falls through as a normal click.
//
// Move/up tracking is done via window-level listeners rather than
// setPointerCapture: capturing the pointer on this row (an ancestor of the
// Link inside it) retargets the native click event to the capturing element
// too, and since click only bubbles up from its target rather than down into
// descendants, the Link's own click handler would never fire — breaking
// ordinary tap-to-navigate. Window listeners track the gesture just as
// reliably without touching capture.
//
// The listeners themselves need a stable function identity (so
// removeEventListener actually matches what was added), but must still see
// this render's `gesture` prop and latest refs — so each is a tiny stable
// trampoline (frozen once via useRef) that delegates to an implementation
// re-assigned fresh on every render.
export function SwipeRow({
  children,
  actions,
  gesture,
  isDragging,
  dragOffset,
}: {
  children: React.ReactNode;
  actions: React.ReactNode;
  gesture: RowGesture;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
}) {
  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  const modeRef = useRef<Mode>('idle');
  const startRef = useRef({ x: 0, y: 0 });
  const openRef = useRef(false);
  const dragXRef = useRef(0);
  const longPressTimer = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const activePointerId = useRef<number | null>(null);

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function finishSwipe() {
    setTransitioning(true);
    const shouldOpen = dragXRef.current < -REVEAL_WIDTH / 2;
    openRef.current = shouldOpen;
    setOpen(shouldOpen);
    setDragX(shouldOpen ? -REVEAL_WIDTH : 0);
  }

  function endGesture() {
    clearLongPress();
    if (modeRef.current === 'reorder') {
      gesture.endDrag();
    } else if (modeRef.current === 'swipe') {
      finishSwipe();
    }
    modeRef.current = 'idle';
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableUp);
    window.removeEventListener('pointercancel', stableUp);
    activePointerId.current = null;
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (e.pointerId !== activePointerId.current) return;
    if (modeRef.current === 'idle') return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (modeRef.current === 'reorder') {
      e.preventDefault();
      gesture.updateDrag(e.clientX, e.clientY);
      return;
    }

    if (modeRef.current === 'pending') {
      if (Math.abs(dy) > MOVE_CANCEL_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
        clearLongPress();
        modeRef.current = 'idle';
        return;
      }
      if (Math.abs(dx) > MOVE_CANCEL_THRESHOLD) {
        clearLongPress();
        modeRef.current = 'swipe';
        suppressClickRef.current = true;
      } else {
        return;
      }
    }

    e.preventDefault();
    const base = openRef.current ? -REVEAL_WIDTH : 0;
    const next = Math.min(0, Math.max(-REVEAL_WIDTH, base + dx));
    dragXRef.current = next;
    setDragX(next);
  }

  function onWindowPointerUp(e: PointerEvent) {
    if (e.pointerId !== activePointerId.current) return;
    endGesture();
  }

  // Frozen once; always delegates to this render's onWindowPointerMove/Up so
  // add/removeEventListener keep matching the same function reference.
  const implRef = useRef({ move: onWindowPointerMove, up: onWindowPointerUp });
  implRef.current.move = onWindowPointerMove;
  implRef.current.up = onWindowPointerUp;
  const stableMove = useRef((e: PointerEvent) => implRef.current.move(e)).current;
  const stableUp = useRef((e: PointerEvent) => implRef.current.up(e)).current;

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    modeRef.current = 'pending';
    activePointerId.current = e.pointerId;
    setTransitioning(false);
    window.addEventListener('pointermove', stableMove, { passive: false });
    window.addEventListener('pointerup', stableUp);
    window.addEventListener('pointercancel', stableUp);
    const { clientX, clientY } = e;
    longPressTimer.current = window.setTimeout(() => {
      if (modeRef.current !== 'pending') return;
      modeRef.current = 'reorder';
      suppressClickRef.current = true;
      openRef.current = false;
      setOpen(false);
      gesture.startDrag(clientX, clientY);
    }, LONG_PRESS_MS);
  }

  function handleClickCapture(e: React.MouseEvent) {
    // Any gesture that actually engaged (swipe or reorder) must swallow the
    // click that follows pointerup, or the Link underneath would navigate
    // right after a drag.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // A tap while actions are revealed just closes them again, rather than
    // following the link/button underneath.
    if (open) {
      e.preventDefault();
      e.stopPropagation();
      setTransitioning(true);
      openRef.current = false;
      setOpen(false);
      dragXRef.current = 0;
      setDragX(0);
    }
  }

  const translateX = open ? -REVEAL_WIDTH : dragX;

  return (
    <div
      className="relative overflow-hidden rounded-lg"
      style={
        isDragging
          ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }
          : undefined
      }
    >
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: REVEAL_WIDTH }}
      >
        {actions}
      </div>
      <div
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
        onContextMenu={(e) => e.preventDefault()}
        // Links are natively draggable in every browser; a press-hold-then-
        // move gesture on one can otherwise be interpreted as the start of a
        // native HTML5 drag, which fires a real `dragstart` and cancels our
        // pointer sequence mid-gesture (breaking reorder after one move).
        onDragStart={(e) => e.preventDefault()}
        className="relative select-none bg-white dark:bg-gray-900"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: transitioning ? 'transform 200ms ease' : 'none',
          touchAction: 'pan-y',
          WebkitTouchCallout: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

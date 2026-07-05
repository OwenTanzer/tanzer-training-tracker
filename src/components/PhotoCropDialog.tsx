import { useEffect, useRef, useState } from 'react';

const VIEWPORT_SIZE = 240;
const OUTPUT_SIZE = 480;
const OUTPUT_QUALITY = 0.85;
const MAX_ZOOM_MULTIPLIER = 3;

export function PhotoCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void>;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [minScale, setMinScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(
    null,
  );

  // Created and revoked together in one effect (rather than a lazy useState
  // initializer) so React's dev-mode double-invoke of effects can't revoke a
  // URL that outlives it — the effect re-running just creates a fresh one.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clampOffset(next: { x: number; y: number }, currentScale: number, dims = natural) {
    if (!dims) return next;
    const displayedW = dims.width * currentScale;
    const displayedH = dims.height * currentScale;
    const maxX = Math.max(0, (displayedW - VIEWPORT_SIZE) / 2);
    const maxY = Math.max(0, (displayedH - VIEWPORT_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const dims = { width: img.naturalWidth, height: img.naturalHeight };
    const fitScale = VIEWPORT_SIZE / Math.min(dims.width, dims.height);
    setNatural(dims);
    setMinScale(fitScale);
    setScale(fitScale);
    setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(
      clampOffset(
        { x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy },
        scale,
      ),
    );
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  function handleZoomChange(next: number) {
    setScale(next);
    setOffset((prev) => clampOffset(prev, next));
  }

  function handleConfirm() {
    if (!natural || !objectUrl) return;
    const sx = natural.width / 2 - (VIEWPORT_SIZE / 2 + offset.x) / scale;
    const sy = natural.height / 2 - (VIEWPORT_SIZE / 2 + offset.y) / scale;
    const sSize = VIEWPORT_SIZE / scale;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setSaveError("Couldn't process that photo. Try a different one.");
            return;
          }
          setSaving(true);
          setSaveError(null);
          onConfirm(blob)
            .catch(() => {
              setSaveError("Couldn't save that photo. Check your connection and try again.");
            })
            .finally(() => setSaving(false));
        },
        'image/jpeg',
        OUTPUT_QUALITY,
      );
    };
    img.src = objectUrl;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">
          Frame the profile photo
        </h2>
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            width: VIEWPORT_SIZE,
            height: VIEWPORT_SIZE,
            touchAction: 'none',
          }}
          className="relative mx-auto overflow-hidden rounded-full border-2 border-sky-400 bg-gray-100 dark:bg-gray-800 cursor-grab active:cursor-grabbing select-none"
        >
          {objectUrl && (
            <img
              src={objectUrl}
              alt="Crop preview"
              draggable={false}
              onLoad={handleImageLoad}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: natural ? natural.width * scale : undefined,
                height: natural ? natural.height * scale : undefined,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                maxWidth: 'none',
              }}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">🔍</span>
          <input
            type="range"
            min={minScale}
            max={minScale * MAX_ZOOM_MULTIPLIER}
            step={minScale / 100}
            value={scale}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-gray-400 text-center">Drag to reposition, use the slider to zoom</p>
        {saveError && <p className="text-xs text-red-500 text-center">{saveError}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!natural || saving}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

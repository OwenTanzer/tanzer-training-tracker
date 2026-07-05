function loadAndDrawToCanvas(
  file: File,
  maxDimension: number,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(objectUrl);

      if (!ctx) {
        reject(new Error('Canvas is not supported in this browser'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read that image file'));
    };

    img.src = objectUrl;
  });
}

// Legacy locally-stored photos are embedded as base64 data: URLs; fetch()
// supports data: URLs directly, so this is all conversion to a Blob needs.
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function compressImageToBlob(
  file: File,
  maxDimension = 1024,
  quality = 0.8,
): Promise<Blob> {
  const canvas = await loadAndDrawToCanvas(file, maxDimension);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not encode that image'));
      },
      'image/jpeg',
      quality,
    );
  });
}

// Achica la foto en el navegador antes de subirla: una foto de celular (4–8 MB)
// queda en unos cientos de KB y el servidor no necesita librerías de imágenes.
const MAX_SIDE = 1600;
const QUALITY = 0.85;

export class ImageReadError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

export async function shrinkImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // imageOrientation: respeta la rotación de las fotos del celular (EXIF).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageReadError('No pudimos leer esa foto. Usa una imagen JPG, PNG o WebP.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageReadError('Tu navegador no pudo procesar la foto.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // WebP pesa menos; los navegadores que no lo generan devuelven PNG, entonces se usa JPG.
  const webp = await toBlob(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpg = await toBlob(canvas, 'image/jpeg');
  if (!jpg) throw new ImageReadError('Tu navegador no pudo procesar la foto.');
  return jpg;
}

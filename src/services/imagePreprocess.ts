/**
 * Client-side scan-file preparation: validation + downscaling of large photos
 * before they are sent to the OCR server (faster OCR, smaller uploads).
 *
 * Downscaling needs a DOM (canvas/Image); in non-browser environments the
 * file is passed through untouched so the pure helpers stay unit-testable.
 */

export const MAX_OCR_IMAGE_DIMENSION = 2500; // px (longest side)
export const MAX_OCR_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_OCR_UPLOAD_MB = Math.round(MAX_OCR_UPLOAD_BYTES / (1024 * 1024));
export const DOWNSCALE_AFTER_BYTES = 1.5 * 1024 * 1024;

export type ScanFileCheck = { ok: true } | { ok: false; reason: string };

/** Fast client-side validation — mirrors the server's rules. */
export function isSupportedScanFile(file: File): ScanFileCheck {
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isImage && !isPdf) {
    return { ok: false, reason: 'Format non supporté — envoyez une image (PNG/JPEG/WebP) ou un PDF.' };
  }
  if (file.size > MAX_OCR_UPLOAD_BYTES) {
    return { ok: false, reason: `Fichier trop volumineux (${(file.size / 1e6).toFixed(1)} Mo > ${MAX_OCR_UPLOAD_MB} Mo).` };
  }
  return { ok: true };
}

/** Large photos are worth downscaling before OCR. */
export function shouldDownscale(file: File): boolean {
  return file.type.startsWith('image/') && file.size > DOWNSCALE_AFTER_BYTES;
}

export function toJpgName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base || 'scan'}.jpg`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Downscale (and re-encode as JPEG) photos that are too heavy for fast OCR.
 * Returns the original file when nothing needs to change.
 */
export async function prepareScanFile(file: File): Promise<File> {
  if (!shouldDownscale(file)) return file;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) return file;
    const scale = Math.min(1, MAX_OCR_IMAGE_DIMENSION / longest);
    if (scale >= 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, 0.85);
    return blob ? new File([blob], toJpgName(file.name), { type: 'image/jpeg' }) : file;
  } catch {
    return file; // never block the scan on preprocessing issues
  } finally {
    URL.revokeObjectURL(url);
  }
}

import { describe, expect, it } from 'vitest';
import {
  DOWNSCALE_AFTER_BYTES,
  MAX_OCR_UPLOAD_MB,
  isSupportedScanFile,
  shouldDownscale,
  toJpgName,
} from '../services/imagePreprocess';

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('isSupportedScanFile', () => {
  it('accepts images and PDFs within the size limit', () => {
    expect(isSupportedScanFile(makeFile('facture.png', 'image/png', 100))).toEqual({ ok: true });
    expect(isSupportedScanFile(makeFile('facture.jpg', 'image/jpeg', 100))).toEqual({ ok: true });
    expect(isSupportedScanFile(makeFile('facture.pdf', 'application/pdf', 100))).toEqual({ ok: true });
    expect(isSupportedScanFile(makeFile('facture.PDF', 'application/octet-stream', 100))).toEqual({ ok: true });
  });

  it('rejects unsupported formats', () => {
    const check = isSupportedScanFile(makeFile('doc.txt', 'text/plain', 100));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/Format non supporté/);
  });

  it('rejects oversized files', () => {
    const check = isSupportedScanFile(makeFile('big.png', 'image/png', MAX_OCR_UPLOAD_MB * 1024 * 1024 + 1));
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toMatch(/trop volumineux/);
  });
});

describe('shouldDownscale / toJpgName', () => {
  it('downscales only heavy images', () => {
    expect(shouldDownscale(makeFile('photo.png', 'image/png', DOWNSCALE_AFTER_BYTES + 1))).toBe(true);
    expect(shouldDownscale(makeFile('photo.png', 'image/png', 100))).toBe(false);
    expect(shouldDownscale(makeFile('doc.pdf', 'application/pdf', DOWNSCALE_AFTER_BYTES + 1))).toBe(false);
  });

  it('rewrites the name with a .jpg extension', () => {
    expect(toJpgName('photo.png')).toBe('photo.jpg');
    expect(toJpgName('facture 2026.PNG')).toBe('facture 2026.jpg');
    expect(toJpgName('sans-ext')).toBe('sans-ext.jpg');
  });
});

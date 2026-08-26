import { afterEach, describe, expect, it, vi } from 'vitest';
import { OcrApiError, checkOcrHealth, extractInvoice } from '../services/ocrService';

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkOcrHealth', () => {
  it('returns the health payload when the server answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ status: 'ok', engine: 'paddleocr', cpu: true }));
    vi.stubGlobal('fetch', fetchMock);

    const health = await checkOcrHealth();
    expect(health.status).toBe('ok');
    expect(health.engine).toBe('paddleocr');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/health'), expect.anything());
  });

  it('rejects when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(checkOcrHealth(500)).rejects.toThrow('Failed to fetch');
  });

  it('rejects on a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })));
    await expect(checkOcrHealth(500)).rejects.toBeInstanceOf(OcrApiError);
  });
});

describe('extractInvoice', () => {
  const file = new File(['fake-png-bytes'], 'facture.png', { type: 'image/png' });

  it('posts the file as multipart and returns the extraction', async () => {
    const payload = { engine: 'paddleocr', fields: { invoiceNumber: { value: 'INV-1', confidence: 0.9 } } };
    const fetchMock = vi.fn().mockResolvedValue(okJson(payload));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractInvoice(file);
    expect(result.fields.invoiceNumber?.value).toBe('INV-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/ocr/extract'); // single /ocr segment (base + /extract)
    expect(String(url)).not.toContain('/ocr/ocr'); // regression: never double the /ocr segment
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('maps an API error to OcrApiError with the server detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'Fichier trop volumineux.' }), { status: 413 }),
      ),
    );
    await expect(extractInvoice(file)).rejects.toMatchObject({
      name: 'OcrApiError',
      status: 413,
      message: 'Fichier trop volumineux.',
    });
  });

  it('falls back to the HTTP status when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    await expect(extractInvoice(file)).rejects.toMatchObject({ status: 500, message: 'HTTP 500' });
  });
});

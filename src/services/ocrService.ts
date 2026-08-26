/**
 * Client for the BRABO OCR server (`ocr-server/` — FastAPI + PaddleOCR).
 *
 * The base URL comes from `VITE_OCR_API_URL` (absolute URL, or a same-origin
 * path such as `/api/ocr` when the reverse proxy forwards it). Defaults to the
 * local development server.
 */

export interface OcrField<T = unknown> {
  value: T | null;
  confidence: number;
}

export interface OcrFields {
  supplierName?: OcrField<string>;
  supplierVat?: OcrField<string>;
  supplierBce?: OcrField<string>;
  invoiceNumber?: OcrField<string>;
  invoiceDate?: OcrField<string>;
  dueDate?: OcrField<string>;
  paymentTermsDays?: OcrField<number>;
  iban?: OcrField<string>;
  structuredCommunication?: OcrField<string>;
  totalExclVat?: OcrField<number>;
  vatRate?: OcrField<number>;
  vatAmount?: OcrField<number>;
  totalInclVat?: OcrField<number>;
}

export interface OcrSuggestion {
  pcmnAccount: string | null;
  category: string | null;
  label: string | null;
  deductibilityRate: number | null;
  deductibleVatRate: number | null;
  isInvestment: boolean;
  description: string | null;
}

export interface OcrExtractResult {
  engine: string;
  engineVersion: string;
  processedAt: string;
  pages: number;
  confidence: number;
  rawText: string;
  fields: OcrFields;
  suggestion: OcrSuggestion;
  warnings: string[];
}

export interface OcrHealth {
  status: 'ok' | 'error';
  engine?: string;
  engineVersion?: string;
  lang?: string;
  cpu?: boolean;
  device?: string;
  error?: string;
}

export const DEFAULT_OCR_API_URL = 'http://localhost:8000';

/**
 * Resolution order:
 *   1. VITE_OCR_API_URL — explicit override (e.g. `http://localhost:8000`
 *      for a local OCR server, or a same-origin path `/api/ocr`).
 *   2. VITE_API_URL/VITE_API_TOKEN — the real backend is configured:
 *      route through the Express API (`/api/ocr/*`, shared token auth, which
 *      proxies to the internal OCR microservice).
 *   3. Local development default (no backend configured).
 */
function resolveOcrUrl(): string {
  const explicit = (import.meta.env.VITE_OCR_API_URL as string | undefined)?.trim();
  if (explicit) return explicit;

  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const apiToken = (import.meta.env.VITE_API_TOKEN as string | undefined)?.trim();
  if (apiUrl || apiToken) {
    const base = (apiUrl || 'https://api.brabo.clixite-prod.cloud').replace(/\/+$/, '');
    return `${base}/api/ocr`;
  }
  return DEFAULT_OCR_API_URL;
}

export const OCR_API_URL: string = resolveOcrUrl();

/** Shared token for the Express API — required when routing through `/api/ocr`. */
const OCR_API_TOKEN: string = (import.meta.env.VITE_API_TOKEN as string | undefined)?.trim() || '';

function authHeaders(): Record<string, string> | undefined {
  return OCR_API_TOKEN ? { 'X-BRABO-Token': OCR_API_TOKEN } : undefined;
}

function endpoint(path: string): string {
  const base = OCR_API_URL.replace(/\/+$/, '');
  return `${base}${path}`;
}

export class OcrApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OcrApiError';
    this.status = status;
  }
}

/** Lightweight health probe — fails fast when the OCR server is unreachable. */
export async function checkOcrHealth(timeoutMs = 4000): Promise<OcrHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint('/health'), { signal: controller.signal, headers: authHeaders() });
    if (!resp.ok) throw new OcrApiError(resp.status, `HTTP ${resp.status}`);
    return (await resp.json()) as OcrHealth;
  } finally {
    clearTimeout(timer);
  }
}

/** OCR + structured extraction of one document (image or PDF). */
export async function extractInvoice(
  file: File,
  timeoutMs = 180_000,
  externalSignal?: AbortSignal,
): Promise<OcrExtractResult> {
  const form = new FormData();
  form.append('file', file, file.name);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);
  try {
    const resp = await fetch(endpoint('/extract'), {
      method: 'POST',
      body: form,
      signal: controller.signal,
      headers: authHeaders(),
    });
    if (!resp.ok) {
      let detail = `HTTP ${resp.status}`;
      try {
        const body = (await resp.json()) as { detail?: unknown };
        if (body?.detail) detail = String(body.detail);
      } catch {
        /* non-JSON error body — keep the HTTP status */
      }
      throw new OcrApiError(resp.status, detail);
    }
    return (await resp.json()) as OcrExtractResult;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

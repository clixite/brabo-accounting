/**
 * BRABO — API client (real PostgreSQL backend on the VPS).
 *
 * Hybrid strategy: the API is the durable store when reachable; otherwise the
 * app degrades gracefully to the local per-tenant store. Configure with:
 *   VITE_API_URL   (default: https://api.brabo.clixite-prod.cloud)
 *   VITE_API_TOKEN (shared bearer token — set in .env / Vercel env)
 */
import type { CompanyProfile, Invoice, PurchaseExpense, BankTransaction } from '../types/accounting';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'https://api.brabo.clixite-prod.cloud';
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string) || '';

export interface LedgerPayload {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  transactions: BankTransaction[];
}

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-BRABO-Token': API_TOKEN,
  };
}

/** True when the backend is configured (token set) and reachable. */
export function isApiConfigured(): boolean {
  return API_TOKEN.length > 0;
}

/** Fetches the full ledger for a tenant (by BCE digits) from the API. */
export async function apiFetchLedger(bceDigits: string): Promise<LedgerPayload | null> {
  if (!isApiConfigured()) return null;
  try {
    const res = await fetch(`${API_URL}/api/ledger/${bceDigits}`, { headers: headers() });
    if (!res.ok) return null;
    return (await res.json()) as LedgerPayload;
  } catch {
    return null;
  }
}

/** Writes the full ledger (write-through) to the API. Returns true on success. */
export async function apiSaveLedger(bceDigits: string, ledger: LedgerPayload): Promise<boolean> {
  if (!isApiConfigured()) return false;
  try {
    const res = await fetch(`${API_URL}/api/ledger/${bceDigits}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(ledger),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pings the backend health endpoint (used for the sync indicator). */
export async function apiHealth(): Promise<boolean> {
  if (!isApiConfigured()) return false;
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

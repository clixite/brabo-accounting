/**
 * BRABO — API client (real PostgreSQL backend on the VPS).
 *
 * Hybrid strategy: the API is the durable store when reachable; otherwise the
 * app degrades gracefully to the local per-tenant store. Configure with:
 *   VITE_API_URL   (default: https://api.brabo.clixite-prod.cloud)
 *   VITE_API_TOKEN (shared bearer token — set in .env / Vercel env)
 *
 * Identity: once a user registers/logs in, a real JWT (HS256, 8h) is stored
 * and sent as `Authorization: Bearer` on every call. Without a JWT the legacy
 * shared token (X-BRABO-Token) is used so demo mode keeps working.
 */
import type { CompanyProfile, Invoice, PurchaseExpense, BankTransaction } from '../types/accounting';

const API_URL = (import.meta.env.VITE_API_URL as string) || 'https://api.brabo.clixite-prod.cloud';
const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string) || '';

const JWT_KEY = 'brabo.jwt.v1';

export interface LedgerPayload {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  transactions: BankTransaction[];
}

export interface AuthResponse {
  token: string;
  userId: string;
  tenantId: string | null;
  role: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  company: { name?: string; bceNumber: string; vatNumber?: string };
}

/** Stores the JWT for the signed-in user. */
export function storeJwt(token: string): void {
  try {
    globalThis.localStorage?.setItem(JWT_KEY, token);
  } catch {
    /* storage unavailable — session-only auth */
  }
}

/** Returns the stored JWT, or null when signed in with the shared token only. */
export function getJwt(): string | null {
  try {
    return globalThis.localStorage?.getItem(JWT_KEY) || null;
  } catch {
    return null;
  }
}

export function clearJwt(): void {
  try {
    globalThis.localStorage?.removeItem(JWT_KEY);
  } catch {
    /* noop */
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const jwt = getJwt();
  if (jwt) h['Authorization'] = `Bearer ${jwt}`;
  else h['X-BRABO-Token'] = API_TOKEN;
  return h;
}

/** True when the backend is configured (token or JWT) and reachable. */
export function isApiConfigured(): boolean {
  return API_TOKEN.length > 0 || getJwt() !== null;
}

/** Registers a new user + company on the backend and stores the JWT. */
export async function apiRegister(payload: RegisterPayload): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthResponse;
    storeJwt(data.token);
    return data;
  } catch {
    return null;
  }
}

/** Logs in with email/password and stores the JWT. */
export async function apiLogin(email: string, password: string): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthResponse;
    storeJwt(data.token);
    return data;
  } catch {
    return null;
  }
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

export interface ViesLiveResult {
  isValid: boolean | null;
  name: string | null;
  address: string | null;
  countryCode: string;
  vatNumber: string;
  requestDate?: string;
  error?: string;
}

/** Real intra-EU VAT validation (European Commission SOAP) via the backend. */
export async function apiValidateVies(
  countryCode: string,
  vatNumber: string,
  timeoutMs = 20_000,
): Promise<ViesLiveResult> {
  if (!isApiConfigured()) throw new Error('API non configurée');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/api/vies/validate`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ countryCode, vatNumber }),
      signal: controller.signal,
    });
    const body = (await res.json()) as Partial<ViesLiveResult> & { error?: string };
    if (!res.ok) throw new Error(body.error || `VIES HTTP ${res.status}`);
    return {
      isValid: body.isValid ?? null,
      name: body.name ?? null,
      address: body.address ?? null,
      countryCode: body.countryCode || countryCode.toUpperCase(),
      vatNumber: body.vatNumber || vatNumber,
      requestDate: body.requestDate,
      error: body.error,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Create/update a counterparty (client) enriched from VIES/KBO. */
export async function apiSaveClient(
  tenantBce: string,
  client: Record<string, unknown>,
): Promise<{ client?: unknown } | null> {
  if (!isApiConfigured()) return null;
  try {
    const res = await fetch(`${API_URL}/api/clients`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ tenantId: tenantBce, client }),
    });
    return res.ok ? ((await res.json()) as { client?: unknown }) : null;
  } catch {
    return null;
  }
}

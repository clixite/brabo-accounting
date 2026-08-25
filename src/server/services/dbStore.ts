/**
 * BRABO — Belgian Accounting Platform
 * Multi-tenant persistent repository layer.
 *
 * Responsibilities:
 *  1. Persistence — in-memory maps, mirrored to IndexedDB (preferred) or
 *     localStorage (fallback), with a graceful no-op adapter for SSR/tests.
 *  2. Tenant isolation — every tenant-scoped read/write is filtered by
 *     `ctx.tenantId`; a mismatch raises `CROSS_TENANT_ACCESS` and is audited.
 *  3. RBAC — the role → permission matrix from `db.ts` gates every operation,
 *     with per-membership grants/denies (deny wins).
 *  4. Audit — every create/update/delete of a financial record appends an
 *     append-only `AuditLog` entry whose SHA-256 hash chains to its predecessor.
 */

import {
  DbError,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_RANK,
} from '../types/db';
import type {
  AuditAction,
  AuditChainVerification,
  AuditEntity,
  AuditLog,
  AuditLogRepository,
  BankStatement,
  BankTransaction,
  BankTransactionRepository,
  CreateInput,
  DatabaseStore,
  ExpenseReceipt,
  FieldDiff,
  FiduciaryConnection,
  ID,
  Invoice,
  InvoiceRepository,
  ISODate,
  JsonValue,
  ListOptions,
  ManagedFields,
  Membership,
  Page,
  PaymentLog,
  Permission,
  PeppolMetadata,
  PurchaseExpense,
  PurchaseExpenseRepository,
  ReconciliationMethod,
  Repository,
  RequestContext,
  Role,
  Session,
  Sha256Hex,
  TenantId,
  Tenant,
  TenantScoped,
  UpdateInput,
  User,
  UserId,
} from '../types/db';

/* -------------------------------------------------------------------------- */
/* Constants & small utilities                                                */
/* -------------------------------------------------------------------------- */

/** Genesis link of every tenant audit chain. */
export const GENESIS_HASH: Sha256Hex = '0'.repeat(64);

const STORAGE_KEY = 'brabo.db.v1';
const DB_NAME = 'brabo';
const DB_VERSION = 1;
const OBJECT_STORE = 'kv';

/** Rounds to 2 decimals, avoiding binary float drift on money. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** RFC 4122 v4 identifier; falls back to a PRNG when `crypto` is unavailable. */
export function createId(prefix?: string): string {
  const cryptoRef: Crypto | undefined = globalThis.crypto;
  let uuid: string;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    uuid = cryptoRef.randomUUID();
  } else if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } else {
    uuid = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/** Extracts the 12 significant digits of a Belgian OGM, or `undefined`. */
export function normalizeOgm(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.length === 12 ? digits : undefined;
}

/** Structural clone that never shares references with the caller. */
function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  const structured = (globalThis as { structuredClone?: <V>(v: V) => V }).structuredClone;
  if (typeof structured === 'function') {
    try {
      return structured(value);
    } catch {
      /* fall through to JSON clone for non-cloneable graphs */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deterministic JSON: keys sorted recursively so hashes are reproducible. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * SHA-256 → lowercase hex.
 * Uses Web Crypto (`crypto.subtle`) when available — required in production —
 * and falls back to a compact pure-TS implementation for non-secure contexts
 * (plain `http://` origins expose no `crypto.subtle`).
 */
export async function sha256Hex(input: string): Promise<Sha256Hex> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(input);
}

/** Pure-TypeScript SHA-256 (FIPS 180-4) used only when `crypto.subtle` is absent. */
function sha256Fallback(message: string): Sha256Hex {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bytes = Array.from(new TextEncoder().encode(message));
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 64-bit big-endian length (high word is 0 for realistic payload sizes).
  const high = Math.floor(bitLength / 0x100000000);
  bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
  bytes.push((bitLength >>> 24) & 0xff, (bitLength >>> 16) & 0xff, (bitLength >>> 8) & 0xff, bitLength & 0xff);

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = H;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/* -------------------------------------------------------------------------- */
/* RBAC helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Effective permissions for a role, optionally refined by a membership. */
export function permissionsFor(role: Role, membership?: Membership | null): Set<Permission> {
  const effective = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  if (membership) {
    for (const granted of membership.extraPermissions) effective.add(granted);
    // Deny always wins over grant.
    for (const denied of membership.deniedPermissions) effective.delete(denied);
  }
  return effective;
}

/** Non-throwing permission probe. */
export function can(ctx: RequestContext, permission: Permission, membership?: Membership | null): boolean {
  if (ctx.userId === 'system') return true;
  return permissionsFor(ctx.role, membership).has(permission);
}

/** Throwing permission assertion used by the repositories. */
export function assertPermission(
  ctx: RequestContext,
  permission: Permission,
  membership?: Membership | null,
): void {
  if (!can(ctx, permission, membership)) {
    throw new DbError('FORBIDDEN', `Role ${ctx.role} lacks permission "${permission}".`, {
      role: ctx.role,
      permission,
      userId: ctx.userId,
    });
  }
}

/** `true` when the role ranks at or above `minimum`. */
export function hasRoleAtLeast(role: Role, minimum: Role): boolean {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}

/** Guards a row against cross-tenant access; throws when the tenant differs. */
export function assertTenant(ctx: RequestContext, row: { tenantId: TenantId }): void {
  if (row.tenantId !== ctx.tenantId) {
    throw new DbError('CROSS_TENANT_ACCESS', 'Cross-tenant access denied.', {
      expected: ctx.tenantId,
      actual: row.tenantId,
    });
  }
}

/** Computes a field-level diff between two snapshots. */
export function computeDiff(before: unknown, after: unknown): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const beforeObj = (before ?? {}) as Record<string, unknown>;
  const afterObj = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  for (const key of keys) {
    if (key === 'updatedAt') continue;
    const a = beforeObj[key];
    const b = afterObj[key];
    if (stableStringify(a) !== stableStringify(b)) {
      diffs.push({
        field: key,
        before: (a ?? null) as JsonValue,
        after: (b ?? null) as JsonValue,
      });
    }
  }
  return diffs;
}

/* -------------------------------------------------------------------------- */
/* Persistence adapters                                                       */
/* -------------------------------------------------------------------------- */

/** Serializable snapshot of the whole database. */
export interface PersistedState {
  version: number;
  savedAt: string;
  tenants: Tenant[];
  users: User[];
  memberships: Membership[];
  invoices: Invoice[];
  expenses: PurchaseExpense[];
  receipts: ExpenseReceipt[];
  statements: BankStatement[];
  transactions: BankTransaction[];
  fiduciaries: FiduciaryConnection[];
  sessions: Session[];
  auditLogs: AuditLog[];
}

export interface PersistenceAdapter {
  readonly name: string;
  load(): Promise<PersistedState | null>;
  save(state: PersistedState): Promise<void>;
  clear(): Promise<void>;
}

/** Volatile adapter — used in tests and whenever no browser storage exists. */
export class MemoryAdapter implements PersistenceAdapter {
  readonly name = 'memory';
  private snapshot: PersistedState | null = null;

  async load(): Promise<PersistedState | null> {
    return this.snapshot ? clone(this.snapshot) : null;
  }

  async save(state: PersistedState): Promise<void> {
    this.snapshot = clone(state);
  }

  async clear(): Promise<void> {
    this.snapshot = null;
  }
}

/** `localStorage` adapter — simple, synchronous, ~5 MB budget. */
export class LocalStorageAdapter implements PersistenceAdapter {
  readonly name = 'localStorage';
  private readonly key: string;

  constructor(key: string = STORAGE_KEY) {
    this.key = key;
  }

  static isAvailable(): boolean {
    try {
      const probe = '__brabo_probe__';
      globalThis.localStorage?.setItem(probe, '1');
      globalThis.localStorage?.removeItem(probe);
      return typeof globalThis.localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  async load(): Promise<PersistedState | null> {
    const raw = globalThis.localStorage?.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PersistedState;
    } catch {
      return null;
    }
  }

  async save(state: PersistedState): Promise<void> {
    globalThis.localStorage?.setItem(this.key, JSON.stringify(state));
  }

  async clear(): Promise<void> {
    globalThis.localStorage?.removeItem(this.key);
  }
}

/** IndexedDB adapter — preferred: far larger quota, async, survives reloads. */
export class IndexedDbAdapter implements PersistenceAdapter {
  readonly name = 'indexedDB';
  private readonly key: string;

  constructor(key: string = STORAGE_KEY) {
    this.key = key;
  }

  static isAvailable(): boolean {
    return typeof globalThis.indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OBJECT_STORE)) {
          db.createObjectStore(OBJECT_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });
  }

  async load(): Promise<PersistedState | null> {
    const db = await this.open();
    try {
      return await new Promise<PersistedState | null>((resolve, reject) => {
        const tx = db.transaction(OBJECT_STORE, 'readonly');
        const request = tx.objectStore(OBJECT_STORE).get(this.key);
        request.onsuccess = () => resolve((request.result as PersistedState | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
      });
    } finally {
      db.close();
    }
  }

  async save(state: PersistedState): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(OBJECT_STORE, 'readwrite');
        tx.objectStore(OBJECT_STORE).put(clone(state), this.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
      });
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(OBJECT_STORE, 'readwrite');
        tx.objectStore(OBJECT_STORE).delete(this.key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
      });
    } finally {
      db.close();
    }
  }
}

/** Picks IndexedDB → localStorage → memory, in that order. */
export function detectAdapter(): PersistenceAdapter {
  if (IndexedDbAdapter.isAvailable()) return new IndexedDbAdapter();
  if (LocalStorageAdapter.isAvailable()) return new LocalStorageAdapter();
  return new MemoryAdapter();
}

/* -------------------------------------------------------------------------- */
/* Audit logger with SHA-256 hash chaining                                    */
/* -------------------------------------------------------------------------- */

/** Payload hashed for an audit entry — order is part of the contract. */
interface AuditHashPayload {
  previousHash: Sha256Hex;
  sequence: number;
  tenantId: TenantId;
  timestamp: string;
  actorUserId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: ID;
  before: JsonValue | null;
  after: JsonValue | null;
}

/** Recomputes the canonical digest of an audit entry. */
export async function computeAuditHash(payload: AuditHashPayload): Promise<Sha256Hex> {
  return sha256Hex(stableStringify(payload));
}

/**
 * Append-only audit log. Each tenant owns an independent chain:
 * `hash_n = SHA256(hash_{n-1} ‖ sequence ‖ timestamp ‖ actor ‖ action ‖ entity ‖ before ‖ after)`.
 * Mutating any historical row invalidates every later hash, which
 * `verifyChain()` detects and localises.
 */
export class AuditLogger implements AuditLogRepository {
  private readonly logs: AuditLog[] = [];
  /** Chain head per tenant, kept hot to avoid rescanning on every append. */
  private readonly heads = new Map<TenantId, { hash: Sha256Hex; sequence: number }>();
  private readonly onChange: () => void;
  /** Serialises appends so concurrent writers cannot interleave hashes. */
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(onChange: () => void = () => {}) {
    this.onChange = onChange;
  }

  /** Rebuilds in-memory chain heads after loading persisted logs. */
  hydrate(logs: AuditLog[]): void {
    this.logs.length = 0;
    this.heads.clear();
    for (const log of logs) {
      this.logs.push(log);
      const head = this.heads.get(log.tenantId);
      if (!head || log.sequence > head.sequence) {
        this.heads.set(log.tenantId, { hash: log.hash, sequence: log.sequence });
      }
    }
  }

  snapshot(): AuditLog[] {
    return clone(this.logs);
  }

  async latestHash(tenantId: TenantId): Promise<Sha256Hex> {
    return this.heads.get(tenantId)?.hash ?? GENESIS_HASH;
  }

  async append(
    ctx: RequestContext,
    entry: Omit<
      AuditLog,
      'id' | 'tenantId' | 'sequence' | 'timestamp' | 'previousHash' | 'hash' | 'hashAlgorithm' | 'diff'
    > & { diff?: FieldDiff[] },
  ): Promise<AuditLog> {
    // Chain appends through a promise queue: hashing is async, so two
    // concurrent callers would otherwise read the same head and fork the chain.
    const task = this.writeQueue.then(() => this.appendUnsafe(ctx, entry));
    this.writeQueue = task.catch(() => undefined);
    return task;
  }

  private async appendUnsafe(
    ctx: RequestContext,
    entry: Omit<
      AuditLog,
      'id' | 'tenantId' | 'sequence' | 'timestamp' | 'previousHash' | 'hash' | 'hashAlgorithm' | 'diff'
    > & { diff?: FieldDiff[] },
  ): Promise<AuditLog> {
    const tenantId = ctx.tenantId;
    const head = this.heads.get(tenantId);
    const previousHash = head?.hash ?? GENESIS_HASH;
    const sequence = (head?.sequence ?? 0) + 1;
    const timestamp = nowIso();
    const before = (entry.before ?? null) as JsonValue | null;
    const after = (entry.after ?? null) as JsonValue | null;

    const hash = await computeAuditHash({
      previousHash,
      sequence,
      tenantId,
      timestamp,
      actorUserId: String(entry.actorUserId ?? ctx.userId),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before,
      after,
    });

    const log: AuditLog = {
      id: createId('audit'),
      tenantId,
      sequence,
      timestamp,
      actorUserId: entry.actorUserId ?? ctx.userId,
      actorEmail: entry.actorEmail ?? ctx.email,
      actorRole: entry.actorRole ?? ctx.role,
      actorIp: entry.actorIp ?? ctx.ipAddress,
      userAgent: entry.userAgent ?? ctx.userAgent,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel,
      before,
      after,
      diff: entry.diff ?? computeDiff(before, after),
      previousHash,
      hash,
      hashAlgorithm: 'SHA-256',
      reason: entry.reason,
      correlationId: entry.correlationId ?? ctx.correlationId,
    };

    this.logs.push(log);
    this.heads.set(tenantId, { hash, sequence });
    this.onChange();
    return clone(log);
  }

  async list(ctx: RequestContext, options: ListOptions<AuditLog> = {}): Promise<Page<AuditLog>> {
    assertPermission(ctx, PERMISSIONS.AUDIT_READ);
    const rows = this.logs
      .filter((log) => log.tenantId === ctx.tenantId)
      .sort((a, b) => b.sequence - a.sequence);
    return paginate(clone(rows), options);
  }

  async listForEntity(ctx: RequestContext, entity: AuditEntity, entityId: ID): Promise<AuditLog[]> {
    assertPermission(ctx, PERMISSIONS.AUDIT_READ);
    return clone(
      this.logs
        .filter((l) => l.tenantId === ctx.tenantId && l.entity === entity && l.entityId === entityId)
        .sort((a, b) => a.sequence - b.sequence),
    );
  }

  /** Recomputes every hash in the tenant chain and reports the first break. */
  async verifyChain(ctx: RequestContext): Promise<AuditChainVerification> {
    assertPermission(ctx, PERMISSIONS.AUDIT_READ);
    const chain = this.logs
      .filter((l) => l.tenantId === ctx.tenantId)
      .sort((a, b) => a.sequence - b.sequence);

    const broken: AuditChainVerification['brokenAt'] = [];
    let expectedPrevious: Sha256Hex = GENESIS_HASH;
    let expectedSequence = 1;

    for (const log of chain) {
      if (log.sequence !== expectedSequence) {
        broken.push({
          id: log.id,
          sequence: log.sequence,
          expectedHash: log.hash,
          actualHash: log.hash,
          reason: 'sequence_gap',
        });
      }
      if (log.previousHash !== expectedPrevious) {
        broken.push({
          id: log.id,
          sequence: log.sequence,
          expectedHash: expectedPrevious,
          actualHash: log.previousHash,
          reason: 'broken_link',
        });
      }

      const recomputed = await computeAuditHash({
        previousHash: log.previousHash,
        sequence: log.sequence,
        tenantId: log.tenantId,
        timestamp: log.timestamp,
        actorUserId: String(log.actorUserId),
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        before: log.before,
        after: log.after,
      });

      if (recomputed !== log.hash) {
        broken.push({
          id: log.id,
          sequence: log.sequence,
          expectedHash: recomputed,
          actualHash: log.hash,
          reason: 'hash_mismatch',
        });
      }

      expectedPrevious = log.hash;
      expectedSequence = log.sequence + 1;
    }

    return {
      valid: broken.length === 0,
      entriesChecked: chain.length,
      brokenAt: broken,
      verifiedAt: nowIso(),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Generic tenant-isolated repository                                         */
/* -------------------------------------------------------------------------- */

function paginate<T>(rows: T[], options: ListOptions<T> = {}): Page<T> {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, Math.min(options.limit ?? 100, 1000));

  let sorted = rows;
  if (options.sortBy) {
    const key = options.sortBy;
    const dir = options.sortDir === 'desc' ? -1 : 1;
    sorted = [...rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      return (av < bv ? -1 : 1) * dir;
    });
  }

  const items = sorted.slice(offset, offset + limit);
  return { items, total: sorted.length, offset, limit, hasMore: offset + items.length < sorted.length };
}

/** Permission triple guarding one repository. */
export interface RepositoryPermissions {
  read: Permission;
  write: Permission;
  delete: Permission;
}

/**
 * In-memory, tenant-isolated repository. Every mutation:
 *  - checks RBAC,
 *  - refuses cross-tenant ids,
 *  - refuses writes to locked (closed) accounting periods,
 *  - appends a hash-chained audit entry,
 *  - triggers persistence.
 */
export class InMemoryRepository<T extends TenantScoped> implements Repository<T> {
  protected readonly rows = new Map<ID, T>();
  protected readonly entity: AuditEntity;
  protected readonly permissions: RepositoryPermissions;
  protected readonly audit: AuditLogger;
  protected readonly onChange: () => void;
  /** Produces a human-readable label for the audit trail. */
  protected readonly labelOf: (row: T) => string | undefined;

  constructor(
    entity: AuditEntity,
    permissions: RepositoryPermissions,
    audit: AuditLogger,
    onChange: () => void = () => {},
    labelOf: (row: T) => string | undefined = () => undefined,
  ) {
    this.entity = entity;
    this.permissions = permissions;
    this.audit = audit;
    this.onChange = onChange;
    this.labelOf = labelOf;
  }

  /** Replaces the contents from a persisted snapshot. */
  hydrate(rows: T[]): void {
    this.rows.clear();
    for (const row of rows) this.rows.set(row.id, row);
    this.afterHydrate();
  }

  /** Hook for subclasses to rebuild their secondary indexes. */
  protected afterHydrate(): void {}

  snapshot(): T[] {
    return clone(Array.from(this.rows.values()));
  }

  /** Internal, unguarded read used by subclasses; still tenant-filtered. */
  protected rawScoped(tenantId: TenantId, includeDeleted = false): T[] {
    return Array.from(this.rows.values()).filter(
      (row) => row.tenantId === tenantId && (includeDeleted || !row.deletedAt),
    );
  }

  async findById(ctx: RequestContext, id: ID): Promise<T | null> {
    assertPermission(ctx, this.permissions.read);
    const row = this.rows.get(id);
    if (!row) return null;
    // Tenant isolation: a foreign id is reported as "not found" to avoid leaking existence.
    if (row.tenantId !== ctx.tenantId) return null;
    if (row.deletedAt) return null;
    return clone(row);
  }

  async list(ctx: RequestContext, options: ListOptions<T> = {}): Promise<Page<T>> {
    assertPermission(ctx, this.permissions.read);
    const rows = this.rawScoped(ctx.tenantId, options.includeDeleted);
    return paginate(clone(rows), options);
  }

  async find(
    ctx: RequestContext,
    predicate: (row: T) => boolean,
    options: ListOptions<T> = {},
  ): Promise<Page<T>> {
    assertPermission(ctx, this.permissions.read);
    const rows = this.rawScoped(ctx.tenantId, options.includeDeleted).filter(predicate);
    return paginate(clone(rows), options);
  }

  async count(ctx: RequestContext, predicate?: (row: T) => boolean): Promise<number> {
    assertPermission(ctx, this.permissions.read);
    const rows = this.rawScoped(ctx.tenantId);
    return predicate ? rows.filter(predicate).length : rows.length;
  }

  async create(ctx: RequestContext, input: CreateInput<T>): Promise<T> {
    assertPermission(ctx, this.permissions.write);
    const timestamp = nowIso();
    const id = (input as { id?: ID }).id ?? createId(this.entity.toLowerCase());

    if (this.rows.has(id)) {
      throw new DbError('CONFLICT', `${this.entity} ${id} already exists.`, { id });
    }

    const row = {
      ...(clone(input) as object),
      id,
      tenantId: ctx.tenantId,
      createdAt: timestamp,
      updatedAt: timestamp,
    } as T;

    this.rows.set(id, row);
    await this.audit.append(ctx, {
      actorUserId: ctx.userId,
      action: 'CREATE',
      entity: this.entity,
      entityId: id,
      entityLabel: this.labelOf(row),
      before: null,
      after: toJson(row),
    });
    this.onChange();
    return clone(row);
  }

  async update(ctx: RequestContext, id: ID, patch: UpdateInput<T>, reason?: string): Promise<T> {
    assertPermission(ctx, this.permissions.write);
    const existing = this.rows.get(id);
    if (!existing) throw new DbError('NOT_FOUND', `${this.entity} ${id} not found.`, { id });
    assertTenant(ctx, existing);
    this.assertNotLocked(ctx, existing);

    const before = clone(existing);
    // Managed fields can never be overwritten by a caller patch.
    const sanitized = { ...(clone(patch) as Record<string, unknown>) };
    for (const managed of ['id', 'tenantId', 'createdAt', 'updatedAt', 'deletedAt'] satisfies ManagedFields[]) {
      delete sanitized[managed];
    }

    const updated = { ...existing, ...sanitized, updatedAt: nowIso() } as T;
    this.rows.set(id, updated);

    await this.audit.append(ctx, {
      actorUserId: ctx.userId,
      action: 'UPDATE',
      entity: this.entity,
      entityId: id,
      entityLabel: this.labelOf(updated),
      before: toJson(before),
      after: toJson(updated),
      reason,
    });
    this.onChange();
    return clone(updated);
  }

  /** Soft-delete — financial records must survive for the legal retention period. */
  async remove(ctx: RequestContext, id: ID, reason?: string): Promise<T> {
    assertPermission(ctx, this.permissions.delete);
    const existing = this.rows.get(id);
    if (!existing) throw new DbError('NOT_FOUND', `${this.entity} ${id} not found.`, { id });
    assertTenant(ctx, existing);
    this.assertNotLocked(ctx, existing);

    const before = clone(existing);
    const timestamp = nowIso();
    const deleted = { ...existing, deletedAt: timestamp, updatedAt: timestamp } as T;
    this.rows.set(id, deleted);

    await this.audit.append(ctx, {
      actorUserId: ctx.userId,
      action: 'SOFT_DELETE',
      entity: this.entity,
      entityId: id,
      entityLabel: this.labelOf(deleted),
      before: toJson(before),
      after: toJson(deleted),
      reason,
    });
    this.onChange();
    return clone(deleted);
  }

  /** Blocks mutations on rows belonging to a closed accounting period. */
  protected assertNotLocked(ctx: RequestContext, row: T): void {
    const locked = (row as { isLocked?: boolean }).isLocked === true;
    if (locked && ctx.userId !== 'system') {
      throw new DbError('PERIOD_LOCKED', `${this.entity} ${row.id} belongs to a closed period.`, {
        id: row.id,
      });
    }
  }
}

/** Narrows an entity to the `JsonValue` shape the audit log stores. */
function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

/* -------------------------------------------------------------------------- */
/* Specialised repositories                                                   */
/* -------------------------------------------------------------------------- */

/** Invoices, with an OGM index powering O(1) bank reconciliation. */
export class InvoiceStore extends InMemoryRepository<Invoice> implements InvoiceRepository {
  /** `ogmDigits → invoiceId`, scoped by tenant through the stored row. */
  private readonly ogmIndex = new Map<string, ID>();

  constructor(audit: AuditLogger, onChange: () => void) {
    super(
      'Invoice',
      { read: PERMISSIONS.INVOICE_READ, write: PERMISSIONS.INVOICE_WRITE, delete: PERMISSIONS.INVOICE_DELETE },
      audit,
      onChange,
      (row) => row.invoiceNumber,
    );
  }

  protected override afterHydrate(): void {
    this.ogmIndex.clear();
    for (const invoice of this.rows.values()) {
      this.indexOgm(invoice);
    }
  }

  private indexOgm(invoice: Invoice): void {
    const digits = invoice.ogmDigits || normalizeOgm(invoice.structuredCommunication);
    if (digits) this.ogmIndex.set(`${invoice.tenantId}:${digits}`, invoice.id);
  }

  override async create(ctx: RequestContext, input: CreateInput<Invoice>): Promise<Invoice> {
    const created = await super.create(ctx, input);
    this.indexOgm(created);
    return created;
  }

  override async update(
    ctx: RequestContext,
    id: ID,
    patch: UpdateInput<Invoice>,
    reason?: string,
  ): Promise<Invoice> {
    const updated = await super.update(ctx, id, patch, reason);
    this.indexOgm(updated);
    return updated;
  }

  async findByNumber(ctx: RequestContext, invoiceNumber: string): Promise<Invoice | null> {
    assertPermission(ctx, PERMISSIONS.INVOICE_READ);
    const found = this.rawScoped(ctx.tenantId).find((i) => i.invoiceNumber === invoiceNumber);
    return found ? clone(found) : null;
  }

  async findByOgm(ctx: RequestContext, ogmDigits: string): Promise<Invoice | null> {
    assertPermission(ctx, PERMISSIONS.INVOICE_READ);
    const digits = normalizeOgm(ogmDigits) ?? ogmDigits;
    const id = this.ogmIndex.get(`${ctx.tenantId}:${digits}`);
    if (!id) return null;
    return this.findById(ctx, id);
  }

  async listOverdue(ctx: RequestContext, asOf: ISODate = nowIso().slice(0, 10)): Promise<Invoice[]> {
    assertPermission(ctx, PERMISSIONS.INVOICE_READ);
    return clone(
      this.rawScoped(ctx.tenantId).filter(
        (i) => i.status !== 'paid' && i.status !== 'cancelled' && i.amountDue > 0 && i.dueDate < asOf,
      ),
    );
  }

  /** Gap-free sequential numbering, mandatory for Belgian VAT compliance. */
  async nextInvoiceNumber(ctx: RequestContext, series: string, fiscalYear: number): Promise<string> {
    assertPermission(ctx, PERMISSIONS.INVOICE_READ);
    const peers = this.rawScoped(ctx.tenantId, true).filter(
      (i) => i.series === series && i.fiscalYear === fiscalYear,
    );
    const maxSeq = peers.reduce((max, i) => Math.max(max, i.sequenceNumber), 0);
    return `${fiscalYear}-${String(maxSeq + 1).padStart(4, '0')}`;
  }

  async registerPayment(
    ctx: RequestContext,
    invoiceId: ID,
    payment: Omit<PaymentLog, ManagedFields | 'invoiceId' | 'remainingBalance' | 'isPartial'>,
  ): Promise<Invoice> {
    assertPermission(ctx, PERMISSIONS.INVOICE_WRITE);
    const invoice = this.rows.get(invoiceId);
    if (!invoice) throw new DbError('NOT_FOUND', `Invoice ${invoiceId} not found.`, { invoiceId });
    assertTenant(ctx, invoice);

    const amountPaid = round2(invoice.amountPaid + payment.amount);
    const remaining = round2(invoice.totalInclVat - amountPaid);
    const timestamp = nowIso();

    const log: PaymentLog = {
      ...payment,
      id: createId('pay'),
      tenantId: ctx.tenantId,
      invoiceId,
      isPartial: remaining > 0.005,
      remainingBalance: remaining > 0 ? remaining : 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.update(
      ctx,
      invoiceId,
      {
        amountPaid,
        amountDue: remaining > 0 ? remaining : 0,
        status: remaining <= 0.005 ? 'paid' : invoice.status,
        paidAt: remaining <= 0.005 ? timestamp : invoice.paidAt,
        paymentLogs: [...invoice.paymentLogs, log],
      } as UpdateInput<Invoice>,
      'Payment registered',
    );
  }

  async recordPeppolTransmission(
    ctx: RequestContext,
    invoiceId: ID,
    peppol: PeppolMetadata,
  ): Promise<Invoice> {
    assertPermission(ctx, PERMISSIONS.INVOICE_SEND_PEPPOL);
    const updated = await this.update(
      ctx,
      invoiceId,
      {
        peppol,
        status: peppol.status === 'ACCEPTED' ? 'peppol_delivered' : 'sent',
        sentAt: peppol.sentAt ?? nowIso(),
      } as UpdateInput<Invoice>,
      'Peppol transmission',
    );
    await this.audit.append(ctx, {
      actorUserId: ctx.userId,
      action: 'PEPPOL_SEND',
      entity: 'Invoice',
      entityId: invoiceId,
      entityLabel: updated.invoiceNumber,
      before: null,
      after: toJson(peppol),
    });
    return updated;
  }
}

/** Purchase expenses with OGM index and receipt attachment. */
export class ExpenseStore extends InMemoryRepository<PurchaseExpense> implements PurchaseExpenseRepository {
  private readonly ogmIndex = new Map<string, ID>();

  constructor(audit: AuditLogger, onChange: () => void) {
    super(
      'PurchaseExpense',
      { read: PERMISSIONS.EXPENSE_READ, write: PERMISSIONS.EXPENSE_WRITE, delete: PERMISSIONS.EXPENSE_DELETE },
      audit,
      onChange,
      (row) => `${row.supplierName} ${row.invoiceNumber}`,
    );
  }

  protected override afterHydrate(): void {
    this.ogmIndex.clear();
    for (const expense of this.rows.values()) this.indexOgm(expense);
  }

  private indexOgm(expense: PurchaseExpense): void {
    const digits = expense.ogmDigits || normalizeOgm(expense.structuredCommunication);
    if (digits) this.ogmIndex.set(`${expense.tenantId}:${digits}`, expense.id);
  }

  override async create(ctx: RequestContext, input: CreateInput<PurchaseExpense>): Promise<PurchaseExpense> {
    const created = await super.create(ctx, input);
    this.indexOgm(created);
    return created;
  }

  override async update(
    ctx: RequestContext,
    id: ID,
    patch: UpdateInput<PurchaseExpense>,
    reason?: string,
  ): Promise<PurchaseExpense> {
    const updated = await super.update(ctx, id, patch, reason);
    this.indexOgm(updated);
    return updated;
  }

  async findByOgm(ctx: RequestContext, ogmDigits: string): Promise<PurchaseExpense | null> {
    assertPermission(ctx, PERMISSIONS.EXPENSE_READ);
    const digits = normalizeOgm(ogmDigits) ?? ogmDigits;
    const id = this.ogmIndex.get(`${ctx.tenantId}:${digits}`);
    return id ? this.findById(ctx, id) : null;
  }

  async listByVatPeriod(ctx: RequestContext, vatPeriod: string): Promise<PurchaseExpense[]> {
    assertPermission(ctx, PERMISSIONS.EXPENSE_READ);
    return clone(this.rawScoped(ctx.tenantId).filter((e) => e.vatPeriod === vatPeriod));
  }

  async approve(ctx: RequestContext, expenseId: ID, reason?: string): Promise<PurchaseExpense> {
    assertPermission(ctx, PERMISSIONS.EXPENSE_APPROVE);
    const updated = await this.update(
      ctx,
      expenseId,
      {
        status: 'approved',
        approvedByUserId: ctx.userId === 'system' ? undefined : ctx.userId,
        approvedAt: nowIso(),
      } as UpdateInput<PurchaseExpense>,
      reason ?? 'Expense approved',
    );
    await this.audit.append(ctx, {
      actorUserId: ctx.userId,
      action: 'APPROVE',
      entity: 'PurchaseExpense',
      entityId: expenseId,
      entityLabel: `${updated.supplierName} ${updated.invoiceNumber}`,
      before: null,
      after: toJson({ status: updated.status }),
      reason,
    });
    return updated;
  }

  async attachReceipt(
    ctx: RequestContext,
    expenseId: ID,
    receipt: CreateInput<ExpenseReceipt>,
  ): Promise<PurchaseExpense> {
    assertPermission(ctx, PERMISSIONS.EXPENSE_WRITE);
    const expense = this.rows.get(expenseId);
    if (!expense) throw new DbError('NOT_FOUND', `Expense ${expenseId} not found.`, { expenseId });
    assertTenant(ctx, expense);

    const timestamp = nowIso();
    const stored: ExpenseReceipt = {
      ...(clone(receipt) as Omit<ExpenseReceipt, ManagedFields>),
      id: (receipt as { id?: ID }).id ?? createId('receipt'),
      tenantId: ctx.tenantId,
      expenseId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.update(
      ctx,
      expenseId,
      {
        receipts: [...expense.receipts, stored],
        ocr: stored.ocr ?? expense.ocr,
      } as UpdateInput<PurchaseExpense>,
      'Receipt attached',
    );
  }
}

/** Bank transactions with OGM-first automatic reconciliation. */
export class BankTransactionStore
  extends InMemoryRepository<BankTransaction>
  implements BankTransactionRepository
{
  private readonly ogmIndex = new Map<string, Set<ID>>();
  private readonly invoices: InvoiceStore;
  private readonly expenses: ExpenseStore;

  constructor(audit: AuditLogger, onChange: () => void, invoices: InvoiceStore, expenses: ExpenseStore) {
    super(
      'BankTransaction',
      { read: PERMISSIONS.BANK_READ, write: PERMISSIONS.BANK_WRITE, delete: PERMISSIONS.BANK_WRITE },
      audit,
      onChange,
      (row) => `${row.statementNumber}/${row.sequenceNumber}`,
    );
    this.invoices = invoices;
    this.expenses = expenses;
  }

  protected override afterHydrate(): void {
    this.ogmIndex.clear();
    for (const tx of this.rows.values()) this.indexOgm(tx);
  }

  private indexOgm(tx: BankTransaction): void {
    const digits = tx.ogmDigits || normalizeOgm(tx.structuredCommunication);
    if (!digits) return;
    const key = `${tx.tenantId}:${digits}`;
    const bucket = this.ogmIndex.get(key) ?? new Set<ID>();
    bucket.add(tx.id);
    this.ogmIndex.set(key, bucket);
  }

  override async create(ctx: RequestContext, input: CreateInput<BankTransaction>): Promise<BankTransaction> {
    const created = await super.create(ctx, input);
    this.indexOgm(created);
    return created;
  }

  async findByOgm(ctx: RequestContext, ogmDigits: string): Promise<BankTransaction[]> {
    assertPermission(ctx, PERMISSIONS.BANK_READ);
    const digits = normalizeOgm(ogmDigits) ?? ogmDigits;
    const ids = this.ogmIndex.get(`${ctx.tenantId}:${digits}`);
    if (!ids) return [];
    const out: BankTransaction[] = [];
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row && row.tenantId === ctx.tenantId && !row.deletedAt) out.push(clone(row));
    }
    return out;
  }

  async listUnreconciled(ctx: RequestContext): Promise<BankTransaction[]> {
    assertPermission(ctx, PERMISSIONS.BANK_READ);
    return clone(this.rawScoped(ctx.tenantId).filter((t) => !t.reconciled));
  }

  async reconcile(
    ctx: RequestContext,
    transactionId: ID,
    target: { invoiceId?: ID; expenseId?: ID },
    method: ReconciliationMethod,
    confidence = 1,
  ): Promise<BankTransaction> {
    assertPermission(ctx, PERMISSIONS.BANK_RECONCILE);
    const updated = await this.update(
      ctx,
      transactionId,
      {
        matchedInvoiceId: target.invoiceId,
        matchedExpenseId: target.expenseId,
        reconciled: true,
        reconciliationMethod: method,
        reconciliationConfidence: confidence,
        reconciledByUserId: ctx.userId === 'system' ? undefined : ctx.userId,
        reconciledAt: nowIso(),
      } as UpdateInput<BankTransaction>,
      `Reconciled via ${method}`,
    );

    await this.audit.append(ctx, {
      actorUserId: ctx.userId,
      action: 'RECONCILE',
      entity: 'BankTransaction',
      entityId: transactionId,
      entityLabel: `${updated.statementNumber}/${updated.sequenceNumber}`,
      before: null,
      after: toJson({ ...target, method, confidence }),
    });
    return updated;
  }

  /**
   * OGM-first auto-matching: a structured communication is a modulo-97 checked
   * exact key, so an OGM hit is booked automatically. Amount/IBAN heuristics
   * only produce suggestions flagged for human review.
   */
  async autoReconcile(ctx: RequestContext): Promise<{ matched: number; reviewed: number }> {
    assertPermission(ctx, PERMISSIONS.BANK_RECONCILE);
    let matched = 0;
    let reviewed = 0;

    for (const tx of this.rawScoped(ctx.tenantId)) {
      if (tx.reconciled) continue;
      const digits = tx.ogmDigits || normalizeOgm(tx.structuredCommunication);

      if (digits) {
        if (tx.direction === 'credit') {
          const invoice = await this.invoices.findByOgm(ctx, digits);
          if (invoice) {
            await this.reconcile(ctx, tx.id, { invoiceId: invoice.id }, 'OGM_EXACT', 1);
            await this.invoices.registerPayment(ctx, invoice.id, {
              paidAt: nowIso(),
              valueDate: tx.valutaDate,
              amount: Math.abs(tx.amount),
              currency: 'EUR',
              method: 'bank_transfer',
              structuredCommunication: tx.structuredCommunication,
              counterpartyIban: tx.counterpartyIban,
              counterpartyName: tx.counterpartyName,
              bankTransactionId: tx.id,
              recordedByUserId: ctx.userId === 'system' ? 'system' : ctx.userId,
            });
            matched += 1;
            continue;
          }
        } else {
          const expense = await this.expenses.findByOgm(ctx, digits);
          if (expense) {
            await this.reconcile(ctx, tx.id, { expenseId: expense.id }, 'OGM_EXACT', 1);
            matched += 1;
            continue;
          }
        }
      }

      // Fallback heuristic: exact amount + fuzzy counterparty name → suggestion only.
      const candidates = await this.invoices.find(
        ctx,
        (inv) =>
          inv.status !== 'paid' &&
          inv.status !== 'cancelled' &&
          Math.abs(inv.amountDue - Math.abs(tx.amount)) < 0.01,
        { limit: 5 },
      );
      if (candidates.items.length === 1) {
        const candidate = candidates.items[0];
        const nameMatch = candidate.client.name
          .toLowerCase()
          .includes(tx.counterpartyName.toLowerCase().slice(0, 6));
        await this.update(
          ctx,
          tx.id,
          {
            matchedInvoiceId: candidate.id,
            reconciliationMethod: nameMatch ? 'AMOUNT_NAME_MATCH' : 'ML_SUGGESTION',
            reconciliationConfidence: nameMatch ? 0.8 : 0.5,
          } as UpdateInput<BankTransaction>,
          'Auto-match suggestion (pending review)',
        );
        reviewed += 1;
      }
    }

    return { matched, reviewed };
  }
}

/* -------------------------------------------------------------------------- */
/* Root store                                                                 */
/* -------------------------------------------------------------------------- */

/** Full multi-tenant database. Instantiate once and share (see `dbStore`). */
export class BraboDbStore implements DatabaseStore {
  private readonly adapter: PersistenceAdapter;
  private readonly tenantRows = new Map<TenantId, Tenant>();
  private readonly userRows = new Map<UserId, User>();
  private readonly membershipRows = new Map<ID, Membership>();
  private readonly sessionRows = new Map<ID, Session>();

  private readonly auditLogger: AuditLogger;
  private initialized = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistInFlight: Promise<void> = Promise.resolve();

  readonly invoices: InvoiceStore;
  readonly expenses: ExpenseStore;
  readonly transactions: BankTransactionStore;
  readonly receipts: InMemoryRepository<ExpenseReceipt>;
  readonly statements: InMemoryRepository<BankStatement>;
  readonly fiduciaries: InMemoryRepository<FiduciaryConnection>;

  constructor(adapter: PersistenceAdapter = detectAdapter()) {
    this.adapter = adapter;
    const schedule = () => this.schedulePersist();

    this.auditLogger = new AuditLogger(schedule);
    this.invoices = new InvoiceStore(this.auditLogger, schedule);
    this.expenses = new ExpenseStore(this.auditLogger, schedule);
    this.transactions = new BankTransactionStore(this.auditLogger, schedule, this.invoices, this.expenses);
    this.receipts = new InMemoryRepository<ExpenseReceipt>(
      'ExpenseReceipt',
      { read: PERMISSIONS.EXPENSE_READ, write: PERMISSIONS.EXPENSE_WRITE, delete: PERMISSIONS.EXPENSE_DELETE },
      this.auditLogger,
      schedule,
      (row) => row.fileName,
    );
    this.statements = new InMemoryRepository<BankStatement>(
      'BankStatement',
      { read: PERMISSIONS.BANK_READ, write: PERMISSIONS.BANK_WRITE, delete: PERMISSIONS.BANK_WRITE },
      this.auditLogger,
      schedule,
      (row) => `${row.accountIban} #${row.statementNumber}`,
    );
    this.fiduciaries = new InMemoryRepository<FiduciaryConnection>(
      'FiduciaryConnection',
      {
        read: PERMISSIONS.FIDUCIARY_READ,
        write: PERMISSIONS.FIDUCIARY_MANAGE,
        delete: PERMISSIONS.FIDUCIARY_MANAGE,
      },
      this.auditLogger,
      schedule,
      (row) => row.firmName,
    );
  }

  get audit(): AuditLogger {
    return this.auditLogger;
  }

  /* ---------------------------- lifecycle ------------------------------- */

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const state = await this.adapter.load();
    if (!state) return;

    this.tenantRows.clear();
    for (const t of state.tenants ?? []) this.tenantRows.set(t.id, t);
    this.userRows.clear();
    for (const u of state.users ?? []) this.userRows.set(u.id, u);
    this.membershipRows.clear();
    for (const m of state.memberships ?? []) this.membershipRows.set(m.id, m);
    this.sessionRows.clear();
    for (const s of state.sessions ?? []) this.sessionRows.set(s.id, s);

    this.invoices.hydrate(state.invoices ?? []);
    this.expenses.hydrate(state.expenses ?? []);
    this.receipts.hydrate(state.receipts ?? []);
    this.statements.hydrate(state.statements ?? []);
    this.transactions.hydrate(state.transactions ?? []);
    this.fiduciaries.hydrate(state.fiduciaries ?? []);
    this.auditLogger.hydrate(state.auditLogs ?? []);
  }

  private toPersistedState(): PersistedState {
    return {
      version: DB_VERSION,
      savedAt: nowIso(),
      tenants: Array.from(this.tenantRows.values()),
      users: Array.from(this.userRows.values()),
      memberships: Array.from(this.membershipRows.values()),
      invoices: this.invoices.snapshot(),
      expenses: this.expenses.snapshot(),
      receipts: this.receipts.snapshot(),
      statements: this.statements.snapshot(),
      transactions: this.transactions.snapshot(),
      fiduciaries: this.fiduciaries.snapshot(),
      sessions: Array.from(this.sessionRows.values()),
      auditLogs: this.auditLogger.snapshot(),
    };
  }

  /** Debounced write-behind so bursts of mutations cost one serialization. */
  private schedulePersist(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistInFlight = this.adapter.save(this.toPersistedState()).catch(() => undefined);
    }, 150);
  }

  async flush(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persistInFlight;
    await this.adapter.save(this.toPersistedState());
  }

  async reset(): Promise<void> {
    this.tenantRows.clear();
    this.userRows.clear();
    this.membershipRows.clear();
    this.sessionRows.clear();
    this.invoices.hydrate([]);
    this.expenses.hydrate([]);
    this.receipts.hydrate([]);
    this.statements.hydrate([]);
    this.transactions.hydrate([]);
    this.fiduciaries.hydrate([]);
    this.auditLogger.hydrate([]);
    await this.adapter.clear();
  }

  /* ------------------------------ RBAC ---------------------------------- */

  /**
   * Builds a verified `RequestContext`. This is the only sanctioned way to
   * obtain one: it proves the user really holds an active membership in the
   * tenant, so downstream repositories can trust `ctx.role`.
   */
  async createContext(
    userId: UserId,
    tenantId: TenantId,
    extra: { correlationId?: string; ipAddress?: string; userAgent?: string } = {},
  ): Promise<RequestContext> {
    const membership = await this.memberships.findFor(userId, tenantId);
    if (!membership || membership.status !== 'active') {
      throw new DbError('FORBIDDEN', 'No active membership for this tenant.', { userId, tenantId });
    }
    if (membership.expiresAt && membership.expiresAt < nowIso()) {
      throw new DbError('FORBIDDEN', 'Membership mandate has expired.', { userId, tenantId });
    }
    const user = this.userRows.get(userId);
    return {
      userId,
      tenantId,
      role: membership.role,
      email: user?.email,
      correlationId: extra.correlationId ?? createId('corr'),
      ipAddress: extra.ipAddress,
      userAgent: extra.userAgent,
    };
  }

  /** Elevated context for background jobs; bypasses RBAC by design. */
  systemContext(tenantId: TenantId): RequestContext {
    return { userId: 'system', tenantId, role: 'OWNER', correlationId: createId('sys') };
  }

  /** Resolves the effective permission set of a user inside a tenant. */
  async effectivePermissions(userId: UserId, tenantId: TenantId): Promise<Set<Permission>> {
    const membership = await this.memberships.findFor(userId, tenantId);
    if (!membership || membership.status !== 'active') return new Set<Permission>();
    return permissionsFor(membership.role, membership);
  }

  /* ----------------------------- tenants -------------------------------- */

  readonly tenants: DatabaseStore['tenants'] = {
    findById: async (id) => {
      const row = this.tenantRows.get(id);
      return row ? clone(row) : null;
    },
    findByBce: async (bceDigits) => {
      const digits = bceDigits.replace(/[^0-9]/g, '').padStart(10, '0');
      const found = Array.from(this.tenantRows.values()).find((t) => t.bceDigits === digits);
      return found ? clone(found) : null;
    },
    listForUser: async (userId) => {
      const tenantIds = Array.from(this.membershipRows.values())
        .filter((m) => m.userId === userId && m.status === 'active')
        .map((m) => m.tenantId);
      return clone(
        tenantIds
          .map((id) => this.tenantRows.get(id))
          .filter((t): t is Tenant => Boolean(t) && !t?.deletedAt),
      );
    },
    create: async (input, actorUserId) => {
      const digits = input.bceDigits.replace(/[^0-9]/g, '').padStart(10, '0');
      const duplicate = Array.from(this.tenantRows.values()).find((t) => t.bceDigits === digits);
      if (duplicate) {
        throw new DbError('CONFLICT', `A tenant already exists for BCE ${digits}.`, { bceDigits: digits });
      }

      const timestamp = nowIso();
      const id = input.id ?? createId('tenant');
      const tenant: Tenant = {
        ...(clone(input) as Omit<Tenant, ManagedFields>),
        id,
        bceDigits: digits,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.tenantRows.set(id, tenant);

      await this.auditLogger.append(
        { userId: actorUserId, tenantId: id, role: 'OWNER' },
        {
          actorUserId,
          action: 'CREATE',
          entity: 'Tenant',
          entityId: id,
          entityLabel: tenant.name,
          before: null,
          after: toJson(tenant),
        },
      );
      this.schedulePersist();
      return clone(tenant);
    },
    update: async (ctx, patch, reason) => {
      assertPermission(ctx, PERMISSIONS.TENANT_UPDATE);
      const existing = this.tenantRows.get(ctx.tenantId);
      if (!existing) throw new DbError('NOT_FOUND', `Tenant ${ctx.tenantId} not found.`);

      const before = clone(existing);
      const sanitized = { ...(clone(patch) as Record<string, unknown>) };
      delete sanitized.id;
      delete sanitized.createdAt;
      delete sanitized.updatedAt;
      delete sanitized.deletedAt;

      const updated: Tenant = { ...existing, ...sanitized, updatedAt: nowIso() } as Tenant;
      this.tenantRows.set(ctx.tenantId, updated);

      await this.auditLogger.append(ctx, {
        actorUserId: ctx.userId,
        action: 'UPDATE',
        entity: 'Tenant',
        entityId: ctx.tenantId,
        entityLabel: updated.name,
        before: toJson(before),
        after: toJson(updated),
        reason,
      });
      this.schedulePersist();
      return clone(updated);
    },
  };

  /* ------------------------------ users --------------------------------- */

  readonly users: DatabaseStore['users'] = {
    findById: async (id) => {
      const row = this.userRows.get(id);
      return row ? stripSecrets(clone(row)) : null;
    },
    findByEmail: async (email) => {
      const normalized = email.trim().toLowerCase();
      const found = Array.from(this.userRows.values()).find((u) => u.email.toLowerCase() === normalized);
      return found ? stripSecrets(clone(found)) : null;
    },
    findByItsmeSub: async (sub) => {
      const found = Array.from(this.userRows.values()).find((u) => u.itsme?.sub === sub);
      return found ? stripSecrets(clone(found)) : null;
    },
    create: async (input) => {
      const normalized = input.email.trim().toLowerCase();
      if (Array.from(this.userRows.values()).some((u) => u.email.toLowerCase() === normalized)) {
        throw new DbError('CONFLICT', `User ${normalized} already exists.`, { email: normalized });
      }
      const timestamp = nowIso();
      const id = input.id ?? createId('user');
      const user: User = {
        ...(clone(input) as Omit<User, ManagedFields>),
        id,
        email: normalized,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.userRows.set(id, user);
      this.schedulePersist();
      return stripSecrets(clone(user));
    },
    update: async (id, patch) => {
      const existing = this.userRows.get(id);
      if (!existing) throw new DbError('NOT_FOUND', `User ${id} not found.`, { id });
      const sanitized = { ...(clone(patch) as Record<string, unknown>) };
      delete sanitized.id;
      delete sanitized.createdAt;
      const updated: User = { ...existing, ...sanitized, updatedAt: nowIso() } as User;
      this.userRows.set(id, updated);
      this.schedulePersist();
      return stripSecrets(clone(updated));
    },
  };

  /** Internal accessor returning the row *with* secrets (auth service only). */
  getUserWithSecrets(id: UserId): User | null {
    const row = this.userRows.get(id);
    return row ? clone(row) : null;
  }

  /* --------------------------- memberships ------------------------------ */

  readonly memberships: DatabaseStore['memberships'] = {
    findById: async (id) => {
      const row = this.membershipRows.get(id);
      return row ? clone(row) : null;
    },
    listForUser: async (userId) =>
      clone(Array.from(this.membershipRows.values()).filter((m) => m.userId === userId && !m.deletedAt)),
    listForTenant: async (ctx) => {
      assertPermission(ctx, PERMISSIONS.MEMBER_READ);
      return clone(
        Array.from(this.membershipRows.values()).filter((m) => m.tenantId === ctx.tenantId && !m.deletedAt),
      );
    },
    findFor: async (userId, tenantId) => {
      const found = Array.from(this.membershipRows.values()).find(
        (m) => m.userId === userId && m.tenantId === tenantId && !m.deletedAt,
      );
      return found ? clone(found) : null;
    },
    create: async (ctx, input) => {
      assertPermission(ctx, PERMISSIONS.MEMBER_MANAGE);
      const existing = Array.from(this.membershipRows.values()).find(
        (m) => m.userId === input.userId && m.tenantId === ctx.tenantId && !m.deletedAt,
      );
      if (existing) {
        throw new DbError('CONFLICT', 'Membership already exists for this user and tenant.', {
          userId: input.userId,
        });
      }

      const timestamp = nowIso();
      const id = (input as { id?: ID }).id ?? createId('member');
      const membership: Membership = {
        ...(clone(input) as Omit<Membership, ManagedFields>),
        id,
        tenantId: ctx.tenantId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.membershipRows.set(id, membership);

      await this.auditLogger.append(ctx, {
        actorUserId: ctx.userId,
        action: 'PERMISSION_CHANGE',
        entity: 'Membership',
        entityId: id,
        entityLabel: `${membership.userId} → ${membership.role}`,
        before: null,
        after: toJson(membership),
      });
      this.schedulePersist();
      return clone(membership);
    },
    update: async (ctx, id, patch) => {
      assertPermission(ctx, PERMISSIONS.MEMBER_MANAGE);
      const existing = this.membershipRows.get(id);
      if (!existing) throw new DbError('NOT_FOUND', `Membership ${id} not found.`, { id });
      assertTenant(ctx, existing);

      const before = clone(existing);
      const sanitized = { ...(clone(patch) as Record<string, unknown>) };
      delete sanitized.id;
      delete sanitized.tenantId;
      delete sanitized.createdAt;

      const updated: Membership = { ...existing, ...sanitized, updatedAt: nowIso() } as Membership;
      this.membershipRows.set(id, updated);

      await this.auditLogger.append(ctx, {
        actorUserId: ctx.userId,
        action: 'PERMISSION_CHANGE',
        entity: 'Membership',
        entityId: id,
        before: toJson(before),
        after: toJson(updated),
      });
      this.schedulePersist();
      return clone(updated);
    },
    revoke: async (ctx, id, reason) => {
      assertPermission(ctx, PERMISSIONS.MEMBER_MANAGE);
      const existing = this.membershipRows.get(id);
      if (!existing) throw new DbError('NOT_FOUND', `Membership ${id} not found.`, { id });
      assertTenant(ctx, existing);

      const before = clone(existing);
      const timestamp = nowIso();
      const updated: Membership = {
        ...existing,
        status: 'revoked',
        revokedAt: timestamp,
        updatedAt: timestamp,
      };
      this.membershipRows.set(id, updated);

      await this.auditLogger.append(ctx, {
        actorUserId: ctx.userId,
        action: 'PERMISSION_CHANGE',
        entity: 'Membership',
        entityId: id,
        before: toJson(before),
        after: toJson(updated),
        reason: reason ?? 'Membership revoked',
      });
      this.schedulePersist();
      return clone(updated);
    },
    setSelfDeclaration: async (ctx, id, grant, reason) => {
      assertPermission(ctx, PERMISSIONS.MEMBER_GRANT_DECLARATION);
      const existing = this.membershipRows.get(id);
      if (!existing) throw new DbError('NOT_FOUND', `Membership ${id} not found.`, { id });
      assertTenant(ctx, existing);

      const before = clone(existing);
      const currentlyDenied = existing.deniedPermissions.includes(PERMISSIONS.VAT_SUBMIT);
      let deniedPermissions = [...existing.deniedPermissions];
      // "Grant" removes the denial (the client regains vat:submit); "revoke"
      // reinstates it (the firm keeps the filing right). Deny wins over grants.
      if (grant && currentlyDenied) {
        deniedPermissions = deniedPermissions.filter((p) => p !== PERMISSIONS.VAT_SUBMIT);
      } else if (!grant && !currentlyDenied) {
        deniedPermissions.push(PERMISSIONS.VAT_SUBMIT);
      }

      const updated: Membership = { ...existing, deniedPermissions, updatedAt: nowIso() };
      this.membershipRows.set(id, updated);

      await this.auditLogger.append(ctx, {
        actorUserId: ctx.userId,
        action: 'PERMISSION_CHANGE',
        entity: 'Membership',
        entityId: id,
        entityLabel: `${updated.userId} → ${updated.role}`,
        before: toJson(before),
        after: toJson(updated),
        reason: reason ?? `Self-declaration ${grant ? 'granted' : 'revoked'}`,
      });
      this.schedulePersist();
      return clone(updated);
    },
  };

  /* ----------------------------- sessions ------------------------------- */

  readonly sessions: DatabaseStore['sessions'] = {
    findById: async (id) => {
      const row = this.sessionRows.get(id);
      return row ? clone(row) : null;
    },
    listForUser: async (userId) =>
      clone(Array.from(this.sessionRows.values()).filter((s) => s.userId === userId && !s.revokedAt)),
    create: async (input) => {
      const timestamp = nowIso();
      const id = input.id ?? createId('session');
      const session: Session = {
        ...(clone(input) as Omit<Session, ManagedFields>),
        id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.sessionRows.set(id, session);
      this.schedulePersist();
      return clone(session);
    },
    revoke: async (id) => {
      const existing = this.sessionRows.get(id);
      if (!existing) return;
      this.sessionRows.set(id, { ...existing, revokedAt: nowIso(), updatedAt: nowIso() });
      this.schedulePersist();
    },
  };
}

/** Removes credentials before a user record leaves the repository. */
function stripSecrets(user: User): User {
  const copy = { ...user };
  delete copy.passwordHash;
  return copy;
}

/* -------------------------------------------------------------------------- */
/* Shared singleton                                                           */
/* -------------------------------------------------------------------------- */

/** Process-wide store used by the application layer. */
export const dbStore = new BraboDbStore();

/** Convenience initializer; safe to call repeatedly. */
export async function initDbStore(): Promise<BraboDbStore> {
  await dbStore.init();
  return dbStore;
}

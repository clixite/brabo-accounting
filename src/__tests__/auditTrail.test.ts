import { beforeAll, describe, expect, it } from 'vitest';
import { dbStore, sha256Hex } from '../server/services/dbStore';
import { DEMO_USERS, seedDemoData } from '../server/services/demoBootstrap';

describe('Audit trail integrity (hash-chained SHA-256)', () => {
  beforeAll(async () => {
    await dbStore.reset();
    await seedDemoData();
  });

  it('verifies an intact chain for a seeded tenant', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const bois = tenants.find((t) => t.bceDigits === '0821567891')!;
    const ctx = await dbStore.createContext(accountant!.id, bois.id);

    const verification = await dbStore.audit.verifyChain(ctx);
    expect(verification.valid).toBe(true);
    expect(verification.entriesChecked).toBeGreaterThan(0);
    expect(verification.brokenAt).toEqual([]);
  });

  it('keeps the chain valid after a write-through ledger sync', async () => {
    const owner = await dbStore.users.findByEmail(DEMO_USERS.ownerBois);
    const tenants = await dbStore.tenants.listForUser(owner!.id);
    const bois = tenants.find((t) => t.bceDigits === '0821567891')!;
    const ctx = await dbStore.createContext(owner!.id, bois.id);

    // A mutation (soft-delete an existing invoice) must stay chain-consistent.
    const invoices = await dbStore.invoices.list(ctx, { limit: 1000 });
    if (invoices.items.length > 0) {
      await dbStore.invoices.remove(ctx, invoices.items[0].id, 'Audit test mutation');
    }
    const verification = await dbStore.audit.verifyChain(ctx);
    expect(verification.valid).toBe(true);
  });

  it('produces deterministic 64-hex SHA-256 digests (tamper-evidence basis)', async () => {
    const a = await sha256Hex('hello');
    const b = await sha256Hex('hello');
    const c = await sha256Hex('world');

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

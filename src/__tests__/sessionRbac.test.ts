import { beforeAll, describe, expect, it } from 'vitest';
import { dbStore } from '../server/services/dbStore';
import { DEMO_USERS, seedDemoData } from '../server/services/demoBootstrap';
import { PERMISSIONS, ROLES } from '../server/types/db';

/**
 * Security & separation contract for the client ↔ cabinet model.
 * Exercises the production multi-tenant store directly: tenant isolation,
 * role-based access, the self-filing grant, and the append-only audit chain.
 */

beforeAll(async () => {
  await dbStore.reset();
  await seedDemoData();
});

describe('Multi-tenant security (client ↔ cabinet separation)', () => {
  it('provisions three client tenants and one ITAA accountant', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    expect(accountant).not.toBeNull();
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    expect(tenants.length).toBe(3);
  });

  it('grants the accountant read access to every client tenant', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    let tenantsWithLedger = 0;
    for (const tenant of tenants) {
      const ctx = await dbStore.createContext(accountant!.id, tenant.id);
      const invoices = await dbStore.invoices.list(ctx, { limit: 1000 });
      expect(invoices.items.every((i) => i.tenantId === tenant.id)).toBe(true);
      if (invoices.items.length > 0) tenantsWithLedger += 1;
    }
    // Brabo is the live client workspace (no demo seed); Bois + Logistics are seeded.
    expect(tenantsWithLedger).toBe(2);
  });

  it('blocks a client owner from entering another tenant (cross-tenant isolation)', async () => {
    const owner = await dbStore.users.findByEmail(DEMO_USERS.ownerBrabo);
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;
    const other = tenants.find((t) => t.bceDigits !== '0789456175')!;

    // The Brabo gérant has no membership in `other`: context creation is refused.
    await expect(dbStore.createContext(owner!.id, other.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    // A foreign invoice id is reported as "not found" — existence never leaks.
    const otherCtx = await dbStore.createContext(accountant!.id, other.id);
    const foreignInvoices = await dbStore.invoices.list(otherCtx, { limit: 1000 });
    const foreignId = foreignInvoices.items[0].id;

    const ownerCtx = await dbStore.createContext(owner!.id, brabo.id);
    const leaked = await dbStore.invoices.findById(ownerCtx, foreignId);
    expect(leaked).toBeNull();
  });

  it('denies self-declaration by default, then grants and revokes it', async () => {
    const owner = await dbStore.users.findByEmail(DEMO_USERS.ownerBrabo);
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;

    const before = await dbStore.effectivePermissions(owner!.id, brabo.id);
    expect(before.has(PERMISSIONS.VAT_SUBMIT)).toBe(false);

    const ctx = await dbStore.createContext(accountant!.id, brabo.id);
    const members = await dbStore.memberships.listForTenant(ctx);
    const ownerMembership = members.find((m) => m.role === ROLES.OWNER)!;

    await dbStore.memberships.setSelfDeclaration(ctx, ownerMembership.id, true);
    const granted = await dbStore.effectivePermissions(owner!.id, brabo.id);
    expect(granted.has(PERMISSIONS.VAT_SUBMIT)).toBe(true);

    await dbStore.memberships.setSelfDeclaration(ctx, ownerMembership.id, false);
    const revoked = await dbStore.effectivePermissions(owner!.id, brabo.id);
    expect(revoked.has(PERMISSIONS.VAT_SUBMIT)).toBe(false);
  });

  it('requires the grant permission to toggle self-declaration', async () => {
    // An AUDITOR (read-only) must not be able to change a client's filing right.
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;

    const ctx = await dbStore.createContext(accountant!.id, brabo.id);
    const members = await dbStore.memberships.listForTenant(ctx);
    const ownerMembership = members.find((m) => m.role === ROLES.OWNER)!;

    // A forged low-privilege context (AUDITOR) must be rejected by the store.
    const auditorCtx = { ...ctx, role: ROLES.AUDITOR };
    await expect(
      dbStore.memberships.setSelfDeclaration(auditorCtx, ownerMembership.id, true),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('keeps the audit chain intact after all mutations', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;
    const ctx = await dbStore.createContext(accountant!.id, brabo.id);
    const verification = await dbStore.audit.verifyChain(ctx);
    expect(verification.valid).toBe(true);
    expect(verification.entriesChecked).toBeGreaterThan(0);
  });
});

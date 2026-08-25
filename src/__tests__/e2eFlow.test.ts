import { beforeAll, describe, expect, it } from 'vitest';
import { dbStore } from '../server/services/dbStore';
import { DEMO_USERS, seedDemoData } from '../server/services/demoBootstrap';
import {
  loadTenantLedger,
  replaceTenantLedger,
  tenantToCompanyProfile,
} from '../services/tenantWorkspace';
import { calculateVatGrids, generateIntervatVatDeclarationXml } from '../utils/belgianAccounting';
import { ROLES } from '../server/types/db';
import {
  INITIAL_BANK_TRANSACTIONS,
  INITIAL_COMPANY_PROFILE,
  INITIAL_INVOICES,
  INITIAL_PURCHASES,
} from '../data/mockBelgianData';

/**
 * End-to-end acceptance test: the whole client ↔ cabinet journey, from the
 * client's first sync to the accountant's declaration — the objective in one
 * runnable scenario.
 */
describe('End-to-end client ↔ cabinet journey', () => {
  let ownerId: string;
  let accountantId: string;
  let braboId: string;

  beforeAll(async () => {
    await dbStore.reset();
    await seedDemoData();

    const owner = await dbStore.users.findByEmail(DEMO_USERS.ownerBrabo);
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    ownerId = owner!.id;
    accountantId = accountant!.id;

    const tenants = await dbStore.tenants.listForUser(accountantId);
    braboId = tenants.find((t) => t.bceDigits === '0789456175')!.id;
  });

  it('starts empty for the live client workspace (no demo seed)', async () => {
    const ledger = await loadTenantLedger(braboId, ownerId);
    expect(ledger).toBeNull();
  });

  it('lets the client write-through their workspace to the per-tenant store', async () => {
    const result = await replaceTenantLedger(braboId, ownerId, {
      company: INITIAL_COMPANY_PROFILE,
      invoices: INITIAL_INVOICES,
      purchases: INITIAL_PURCHASES,
      transactions: INITIAL_BANK_TRANSACTIONS,
    });
    expect(result.invoices).toBe(INITIAL_INVOICES.length);
  });

  it('lets the cabinet read exactly what the client encoded', async () => {
    const ledger = await loadTenantLedger(braboId, accountantId);
    expect(ledger).not.toBeNull();
    expect(ledger!.invoices.length).toBe(INITIAL_INVOICES.length);
    expect(ledger!.purchases.length).toBe(INITIAL_PURCHASES.length);
  });

  it('lets the accountant grant the client self-declaration', async () => {
    const ctx = await dbStore.createContext(accountantId, braboId);
    const members = await dbStore.memberships.listForTenant(ctx);
    const ownerMembership = members.find((m) => m.role === ROLES.OWNER)!;
    await dbStore.memberships.setSelfDeclaration(ctx, ownerMembership.id, true);

    const perms = await dbStore.effectivePermissions(ownerId, braboId);
    expect(perms.has('vat:submit')).toBe(true);
  });

  it('lets the accountant file the VAT return from the client data', async () => {
    const ledger = await loadTenantLedger(braboId, accountantId);
    const tenant = await dbStore.tenants.findById(braboId);
    const company = tenantToCompanyProfile(tenant!);

    const grids = calculateVatGrids(ledger!.invoices, ledger!.purchases, '2026-Q1');
    const xml = generateIntervatVatDeclarationXml(company, grids);

    expect(xml).toContain('VATDeclarationConsignment');
    expect(xml).toContain('0789456175'); // declarant VAT
    expect(xml).toContain('<Period>2026-Q1</Period>');
  });

  it('keeps the audit chain intact across the whole journey', async () => {
    const ctx = await dbStore.createContext(accountantId, braboId);
    const verification = await dbStore.audit.verifyChain(ctx);
    expect(verification.valid).toBe(true);
    expect(verification.entriesChecked).toBeGreaterThan(0);
  });
});

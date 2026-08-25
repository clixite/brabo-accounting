import { beforeAll, describe, expect, it } from 'vitest';
import {
  clientExpenseToDb,
  clientInvoiceToDb,
  clientTransactionToDb,
  dbExpenseToClient,
  dbInvoiceToClient,
  dbTransactionToClient,
  loadTenantLedger,
  replaceTenantLedger,
  tenantToCompanyProfile,
} from '../services/tenantWorkspace';
import { dbStore } from '../server/services/dbStore';
import { DEMO_USERS, seedDemoData } from '../server/services/demoBootstrap';
import {
  INITIAL_BANK_TRANSACTIONS,
  INITIAL_INVOICES,
  INITIAL_PURCHASES,
} from '../data/mockBelgianData';
import type { Invoice as DbInvoice } from '../server/types/db';

const NOW = new Date().toISOString();

function toDbInvoice(input: ReturnType<typeof clientInvoiceToDb>, tenantId: string): DbInvoice {
  return {
    ...input,
    id: input.id ?? 'inv-x',
    tenantId,
    createdAt: NOW,
    updatedAt: NOW,
  } as DbInvoice;
}

describe('Tenant workspace bridge — round-trip', () => {
  it('preserves invoice fields across client → db → client', () => {
    const source = INITIAL_INVOICES[0];
    const db = clientInvoiceToDb(source, 'tenant-1', 'user-1');
    const back = dbInvoiceToClient(toDbInvoice(db, 'tenant-1'));

    expect(back.invoiceNumber).toBe(source.invoiceNumber);
    expect(back.client.name).toBe(source.client.name);
    expect(back.client.bceNumber).toBe(source.client.bceNumber);
    expect(back.subtotalExclVat).toBeCloseTo(source.subtotalExclVat, 2);
    expect(back.totalVatAmount).toBeCloseTo(source.totalVatAmount, 2);
    expect(back.totalInclVat).toBeCloseTo(source.totalInclVat, 2);
    expect(back.lines.length).toBe(source.lines.length);
    expect(back.structuredCommunication).toBe(source.structuredCommunication);
    expect(back.status).toBe(source.status);
  });

  it('preserves expense fields across client → db → client', () => {
    const source = INITIAL_PURCHASES[0];
    const db = clientExpenseToDb(source, 'user-1');
    const back = dbExpenseToClient({
      ...db,
      id: db.id ?? 'exp-x',
      tenantId: 'tenant-1',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    expect(back.supplierName).toBe(source.supplierName);
    expect(back.pcmnAccount).toBe(source.pcmnAccount);
    expect(back.amountExclVat).toBeCloseTo(source.amountExclVat, 2);
    expect(back.deductibleVat).toBeCloseTo(source.deductibleVat, 2);
    expect(back.deductibilityRate).toBe(source.deductibilityRate);
  });

  it('preserves transaction fields across client → db → client', () => {
    const source = INITIAL_BANK_TRANSACTIONS[0];
    const db = clientTransactionToDb(source);
    const back = dbTransactionToClient({
      ...db,
      id: db.id ?? 'tx-x',
      tenantId: 'tenant-1',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    expect(back.counterpartyName).toBe(source.counterpartyName);
    expect(back.amount).toBeCloseTo(source.amount, 2);
    expect(back.reconciled).toBe(source.reconciled);
  });
});

describe('Tenant workspace bridge — ledger sync', () => {
  beforeAll(async () => {
    await dbStore.reset();
    await seedDemoData();
  });

  it('returns null for an empty tenant (Brabo has no demo ledger)', async () => {
    const owner = await dbStore.users.findByEmail(DEMO_USERS.ownerBrabo);
    const tenants = await dbStore.tenants.listForUser(owner!.id);
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;
    const ledger = await loadTenantLedger(brabo.id, owner!.id);
    expect(ledger).toBeNull();
  });

  it('loads the demo ledger for a seeded tenant (Bois)', async () => {
    const owner = await dbStore.users.findByEmail(DEMO_USERS.ownerBois);
    const tenants = await dbStore.tenants.listForUser(owner!.id);
    const bois = tenants.find((t) => t.bceDigits === '0821567891')!;
    const ledger = await loadTenantLedger(bois.id, owner!.id);
    expect(ledger).not.toBeNull();
    expect(ledger!.invoices.length).toBe(2);
    expect(ledger!.invoices.every((i) => i.client.name.length > 0)).toBe(true);
  });

  it('maps a tenant onto a client company profile (for declarations)', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const bois = tenants.find((t) => t.bceDigits === '0821567891')!;
    const company = tenantToCompanyProfile(bois);
    expect(company.name).toBe('Atelier Bois & Design');
    expect(company.vatNumber).toBe('BE0821567891');
    expect(company.city).toBe('Namur');
    expect(company.vatRegime).toBe('quarterly');
  });

  it('replaces a tenant ledger so the cabinet sees the client data', async () => {
    const owner = await dbStore.users.findByEmail(DEMO_USERS.ownerBrabo);
    const tenants = await dbStore.tenants.listForUser(owner!.id);
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;

    const result = await replaceTenantLedger(brabo.id, owner!.id, {
      company: { name: 'Brabo' } as never,
      invoices: INITIAL_INVOICES.slice(0, 2),
      purchases: INITIAL_PURCHASES.slice(0, 2),
      transactions: INITIAL_BANK_TRANSACTIONS.slice(0, 2),
    });

    expect(result.invoices).toBe(2);
    expect(result.expenses).toBe(2);
    expect(result.transactions).toBe(2);

    const ctx = await dbStore.createContext(owner!.id, brabo.id);
    const invoices = await dbStore.invoices.list(ctx, { limit: 1000 });
    expect(invoices.items.length).toBe(2);
    expect(invoices.items[0].invoiceNumber).toBe(INITIAL_INVOICES[0].invoiceNumber);
  });
});

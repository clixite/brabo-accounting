/**
 * BRABO — tenant workspace bridge.
 *
 * Unifies the client workspace (which manipulates the lightweight domain
 * types in `types/accounting.ts`) with the multi-tenant store (which persists
 * the production-shaped types in `server/types/db.ts`). The client works with
 * friendly types; every mutation is written through to the per-tenant ledger
 * so the cabinet portal sees exactly what the client encoded.
 */

import { dbStore, normalizeOgm } from '../server/services/dbStore';
import type {
  BankTransaction as DbBankTransaction,
  Invoice as DbInvoice,
  InvoiceLineRecord,
  PartySnapshot,
  PurchaseExpense as DbPurchaseExpense,
  Tenant,
  VatBreakdownEntry,
} from '../server/types/db';
import type {
  BankTransaction,
  BelgianVatRate,
  BelgianVatRegime,
  CompanyProfile,
  DocumentType,
  Invoice,
  InvoiceLine,
  PurchaseExpense,
} from '../types/accounting';

export interface WorkspaceSnapshot {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  transactions: BankTransaction[];
}

/** Ledger data read back from the store (company identity is not persisted here). */
export interface TenantLedger {
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  transactions: BankTransaction[];
}

/** Maps a store tenant onto the client `CompanyProfile` (for declaration payloads). */
export function tenantToCompanyProfile(tenant: Tenant): CompanyProfile {
  const legalForms: CompanyProfile['legalForm'][] = ['SRL', 'BV', 'SA', 'NV', 'SC', 'CV', 'Indépendant', 'Eenmanszaak'];
  const legalForm = legalForms.includes(tenant.legalForm as CompanyProfile['legalForm'])
    ? (tenant.legalForm as CompanyProfile['legalForm'])
    : 'SRL';

  const vatRegime: CompanyProfile['vatRegime'] =
    tenant.vatRegime === 'monthly'
      ? 'monthly'
      : tenant.vatRegime === 'franchise_art56bis'
        ? 'franchise_art56bis'
        : 'quarterly';

  return {
    name: tenant.name,
    legalForm,
    bceNumber: tenant.bceNumber,
    vatNumber: tenant.vatNumber ?? '',
    rpmCity: tenant.rpmCity,
    street: tenant.registeredAddress.street,
    number: tenant.registeredAddress.number,
    box: tenant.registeredAddress.box,
    postalCode: tenant.registeredAddress.postalCode,
    city: tenant.registeredAddress.city,
    country: tenant.registeredAddress.country,
    iban: tenant.bankAccounts[0]?.iban ?? '',
    bic: tenant.bankAccounts[0]?.bic ?? '',
    bankName: tenant.bankAccounts[0]?.bankName ?? '',
    peppolEndpointId: tenant.peppolEndpointId ?? '',
    email: tenant.email,
    phone: tenant.phone ?? '',
    website: tenant.website ?? '',
    vatRegime,
    naceBelCode: tenant.naceBelActivities[0]?.code ?? '',
    fiduciaryName: '',
    fiduciaryItaaNumber: '',
    fiduciaryEmail: '',
  };
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function seriesFor(type: DocumentType): string {
  return type === 'credit_note' ? 'CN' : type === 'quote' ? 'QUO' : 'INV';
}

function sequenceFromNumber(invoiceNumber: string): number {
  const match = /(\d+)\s*$/.exec(invoiceNumber);
  return match ? parseInt(match[1], 10) : 0;
}

function fiscalYearOf(date: string): number {
  return parseInt((date || '').slice(0, 4), 10) || 2026;
}

function taxCategoryFor(regime: BelgianVatRegime, rate: BelgianVatRate): VatBreakdownEntry['taxCategoryCode'] {
  switch (regime) {
    case 'cocontractant_art20':
      return 'AE';
    case 'intracommunity_art39bis':
    case 'intracommunity_service_art21':
      return 'K';
    case 'export_art39':
      return 'G';
    case 'exempt_art44':
    case 'small_business_art56bis':
      return 'E';
    case 'zero_0':
      return 'Z';
    default:
      return rate === 0 ? 'Z' : 'S';
  }
}

/* -------------------------------------------------------------------------- */
/* Client → DB (write direction)                                              */
/* -------------------------------------------------------------------------- */

export function clientInvoiceToDb(
  inv: Invoice,
  tenantId: string,
  userId: string,
): Omit<DbInvoice, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: string } {
  const now = new Date().toISOString();
  const isPaid = inv.status === 'paid';

  const client: PartySnapshot = {
    clientId: inv.client.id,
    name: inv.client.name,
    bceNumber: inv.client.bceNumber,
    vatNumber: inv.client.vatNumber,
    peppolEndpointId: inv.client.peppolEndpointId,
    isPeppolEnabled: inv.client.isPeppolEnabled,
    address: {
      street: inv.client.street,
      number: inv.client.number,
      box: inv.client.box,
      postalCode: inv.client.postalCode,
      city: inv.client.city,
      countryCode: 'BE',
      country: inv.client.country,
    },
    email: inv.client.email,
    phone: inv.client.phone,
    iban: inv.client.iban,
    bic: inv.client.bic,
  };

  const lines: InvoiceLineRecord[] = inv.lines.map((line, index) => ({
    id: line.id,
    tenantId,
    createdAt: now,
    updatedAt: now,
    invoiceId: inv.id,
    lineNumber: index + 1,
    description: line.description,
    pcmnAccount: line.pcmnAccount,
    quantity: line.quantity,
    unitCode: 'C62',
    unitPrice: line.unitPrice,
    discountPercent: 0,
    vatRate: line.vatRate,
    vatRegime: line.vatRegime,
    totalExclVat: line.totalExclVat,
    vatAmount: line.vatAmount,
    totalInclVat: line.totalInclVat,
  }));

  const vatBreakdown: VatBreakdownEntry[] = inv.vatBreakdown.map((b) => ({
    rate: b.rate,
    regime: b.regime,
    taxCategoryCode: taxCategoryFor(b.regime, b.rate),
    baseAmount: b.baseAmount,
    vatAmount: b.vatAmount,
  }));

  return {
    id: inv.id,
    type: inv.type,
    invoiceNumber: inv.invoiceNumber,
    series: seriesFor(inv.type),
    sequenceNumber: sequenceFromNumber(inv.invoiceNumber),
    fiscalYear: fiscalYearOf(inv.date),
    referenceQuoteId: inv.referenceQuoteId,
    issueDate: inv.date,
    dueDate: inv.dueDate,
    paymentTermsDays: inv.paymentTermsDays,
    client,
    lines,
    subtotalExclVat: inv.subtotalExclVat,
    discountTotal: 0,
    vatBreakdown,
    totalVatAmount: inv.totalVatAmount,
    totalInclVat: inv.totalInclVat,
    amountPaid: isPaid ? inv.totalInclVat : 0,
    amountDue: isPaid ? 0 : inv.totalInclVat,
    currency: 'EUR',
    structuredCommunication: inv.structuredCommunication,
    ogmDigits: normalizeOgm(inv.structuredCommunication) ?? '',
    status: inv.status,
    paymentLogs: [],
    remindersSent: 0,
    createdByUserId: userId,
    isLocked: false,
    notes: inv.notes,
  };
}

export function clientExpenseToDb(
  exp: PurchaseExpense,
  userId: string,
): Omit<DbPurchaseExpense, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: string } {
  return {
    id: exp.id,
    supplierName: exp.supplierName,
    supplierBce: exp.supplierBce,
    supplierVatNumber: exp.supplierBce ? `BE${exp.supplierBce.replace(/[^0-9]/g, '').padStart(10, '0')}` : undefined,
    supplierIban: exp.supplierIban,
    invoiceNumber: exp.invoiceNumber,
    invoiceDate: exp.date,
    dueDate: exp.dueDate,
    fiscalYear: fiscalYearOf(exp.date),
    vatPeriod: '2026-Q1',
    category: exp.category,
    pcmnAccount: exp.pcmnAccount,
    description: exp.description,
    amountExclVat: exp.amountExclVat,
    vatRate: exp.vatRate,
    vatRegime: exp.vatRate === 0 ? 'zero_0' : 'standard_21',
    vatAmount: exp.vatAmount,
    amountInclVat: exp.amountInclVat,
    currency: 'EUR',
    deductibilityRate: exp.deductibilityRate,
    deductibleVatRate: exp.deductibleVatRate,
    deductibleAmount: exp.deductibleAmount,
    nonDeductibleAmount: exp.nonDeductibleAmount,
    deductibleVat: exp.deductibleVat,
    nonDeductibleVat: exp.nonDeductibleVat,
    structuredCommunication: exp.structuredCommunication,
    ogmDigits: normalizeOgm(exp.structuredCommunication),
    status: exp.status,
    amountPaid: exp.status === 'paid' ? exp.amountInclVat : 0,
    amountDue: exp.status === 'paid' ? 0 : exp.amountInclVat,
    paymentLogs: [],
    receipts: [],
    isInvestment: false,
    isReverseCharge: false,
    createdByUserId: userId,
    isLocked: false,
  };
}

export function clientTransactionToDb(
  tx: BankTransaction,
): Omit<DbBankTransaction, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: string } {
  return {
    id: tx.id,
    statementId: `stmt-${tx.statementNumber || '001'}`,
    bankAccountId: 'bank-primary',
    statementNumber: tx.statementNumber || '001',
    sequenceNumber: 1,
    detailNumber: 1,
    executionDate: tx.date,
    valutaDate: tx.valutaDate || tx.date,
    amount: tx.amount,
    currency: 'EUR',
    direction: tx.amount >= 0 ? 'credit' : 'debit',
    counterpartyName: tx.counterpartyName,
    counterpartyIban: tx.counterpartyIban,
    counterpartyBic: tx.counterpartyBic,
    communication: tx.communication,
    isStructured: tx.isStructured,
    structuredCommunication: tx.structuredCommunication,
    ogmDigits: normalizeOgm(tx.structuredCommunication),
    matchedInvoiceId: tx.matchedInvoiceId,
    matchedExpenseId: tx.matchedExpenseId,
    reconciled: tx.reconciled,
    reconciliationMethod: tx.reconciliationMethod,
    isLocked: false,
  };
}

/* -------------------------------------------------------------------------- */
/* DB → Client (read direction)                                               */
/* -------------------------------------------------------------------------- */

export function dbInvoiceToClient(inv: DbInvoice): Invoice {
  const client = inv.client;
  return {
    id: inv.id,
    type: inv.type,
    invoiceNumber: inv.invoiceNumber,
    referenceQuoteId: inv.referenceQuoteId,
    date: inv.issueDate,
    dueDate: inv.dueDate,
    client: {
      id: client.clientId ?? inv.id + '-client',
      name: client.name,
      bceNumber: client.bceNumber,
      vatNumber: client.vatNumber,
      peppolEndpointId: client.peppolEndpointId ?? '',
      isPeppolEnabled: client.isPeppolEnabled,
      street: client.address.street,
      number: client.address.number,
      box: client.address.box,
      postalCode: client.address.postalCode,
      city: client.address.city,
      country: client.address.country,
      email: client.email,
      phone: client.phone,
      iban: client.iban,
      bic: client.bic,
    },
    lines: inv.lines.map((l): InvoiceLine => ({
      id: l.id,
      description: l.description,
      pcmnAccount: l.pcmnAccount,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      vatRate: l.vatRate,
      vatRegime: l.vatRegime,
      totalExclVat: l.totalExclVat,
      vatAmount: l.vatAmount,
      totalInclVat: l.totalInclVat,
    })),
    subtotalExclVat: inv.subtotalExclVat,
    vatBreakdown: inv.vatBreakdown.map((b) => ({
      rate: b.rate,
      regime: b.regime,
      baseAmount: b.baseAmount,
      vatAmount: b.vatAmount,
    })),
    totalVatAmount: inv.totalVatAmount,
    totalInclVat: inv.totalInclVat,
    structuredCommunication: inv.structuredCommunication,
    status: inv.status,
    paymentTermsDays: inv.paymentTermsDays,
    createdAt: inv.createdAt,
    paidAt: inv.paidAt,
  };
}

export function dbExpenseToClient(exp: DbPurchaseExpense): PurchaseExpense {
  return {
    id: exp.id,
    supplierName: exp.supplierName,
    supplierBce: exp.supplierBce,
    supplierIban: exp.supplierIban,
    invoiceNumber: exp.invoiceNumber,
    date: exp.invoiceDate,
    dueDate: exp.dueDate,
    category: exp.category,
    pcmnAccount: exp.pcmnAccount,
    description: exp.description,
    amountExclVat: exp.amountExclVat,
    vatRate: exp.vatRate,
    vatAmount: exp.vatAmount,
    amountInclVat: exp.amountInclVat,
    deductibilityRate: exp.deductibilityRate,
    deductibleVatRate: exp.deductibleVatRate,
    deductibleAmount: exp.deductibleAmount,
    nonDeductibleAmount: exp.nonDeductibleAmount,
    deductibleVat: exp.deductibleVat,
    nonDeductibleVat: exp.nonDeductibleVat,
    structuredCommunication: exp.structuredCommunication,
    status: exp.status,
  };
}

export function dbTransactionToClient(tx: DbBankTransaction): BankTransaction {
  return {
    id: tx.id,
    statementNumber: tx.statementNumber,
    date: tx.executionDate,
    valutaDate: tx.valutaDate,
    amount: tx.amount,
    currency: 'EUR',
    counterpartyName: tx.counterpartyName,
    counterpartyIban: tx.counterpartyIban,
    counterpartyBic: tx.counterpartyBic,
    communication: tx.communication,
    isStructured: tx.isStructured,
    structuredCommunication: tx.structuredCommunication,
    matchedInvoiceId: tx.matchedInvoiceId,
    matchedExpenseId: tx.matchedExpenseId,
    reconciled: tx.reconciled,
    reconciliationMethod: tx.reconciliationMethod as BankTransaction['reconciliationMethod'],
  };
}

/* -------------------------------------------------------------------------- */
/* Ledger replacement (write-through sync)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Replaces a tenant's whole ledger with the client workspace snapshot. Uses
 * soft-delete + create so the append-only audit trail stays intact and the
 * cabinet portal always reflects the latest client-side state.
 */
export async function replaceTenantLedger(
  tenantId: string,
  userId: string,
  snapshot: WorkspaceSnapshot,
): Promise<{ invoices: number; expenses: number; transactions: number }> {
  const ctx = await dbStore.createContext(userId, tenantId);

  const [existingInvoices, existingExpenses, existingTransactions] = await Promise.all([
    dbStore.invoices.list(ctx, { limit: 2000 }),
    dbStore.expenses.list(ctx, { limit: 2000 }),
    dbStore.transactions.list(ctx, { limit: 2000 }),
  ]);

  for (const inv of existingInvoices.items) {
    await dbStore.invoices.remove(ctx, inv.id, 'Workspace sync');
  }
  for (const exp of existingExpenses.items) {
    await dbStore.expenses.remove(ctx, exp.id, 'Workspace sync');
  }
  for (const tx of existingTransactions.items) {
    await dbStore.transactions.remove(ctx, tx.id, 'Workspace sync');
  }

  for (const inv of snapshot.invoices) {
    await dbStore.invoices.create(ctx, clientInvoiceToDb(inv, tenantId, userId));
  }
  for (const exp of snapshot.purchases) {
    await dbStore.expenses.create(ctx, clientExpenseToDb(exp, userId));
  }
  for (const tx of snapshot.transactions) {
    await dbStore.transactions.create(ctx, clientTransactionToDb(tx));
  }

  await dbStore.flush();

  return {
    invoices: snapshot.invoices.length,
    expenses: snapshot.purchases.length,
    transactions: snapshot.transactions.length,
  };
}

/**
 * Loads a tenant's ledger back into the client workspace (db → client types).
 * Returns `null` when the tenant has no ledger yet (caller falls back to its
 * local seed and then writes through).
 */
export async function loadTenantLedger(tenantId: string, userId: string): Promise<TenantLedger | null> {
  const ctx = await dbStore.createContext(userId, tenantId);
  const [invoices, expenses, transactions] = await Promise.all([
    dbStore.invoices.list(ctx, { limit: 2000 }),
    dbStore.expenses.list(ctx, { limit: 2000 }),
    dbStore.transactions.list(ctx, { limit: 2000 }),
  ]);

  if (invoices.items.length === 0 && expenses.items.length === 0 && transactions.items.length === 0) {
    return null;
  }

  return {
    invoices: invoices.items.map(dbInvoiceToClient),
    purchases: expenses.items.map(dbExpenseToClient),
    transactions: transactions.items.map(dbTransactionToClient),
  };
}

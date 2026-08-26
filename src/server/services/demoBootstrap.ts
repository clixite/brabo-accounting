/**
 * BRABO — Belgian Accounting Platform
 * Demo bootstrap: provisions a realistic multi-tenant dataset so the
 * client ↔ cabinet separation can be exercised end-to-end in the browser.
 *
 * What is seeded (idempotent — re-runs are no-ops when already present):
 *   - 3 client tenants (Belgian SMEs).
 *   - 4 users: one gérant per client + one ITAA expert-comptable.
 *   - Memberships: each gérant is OWNER of their own tenant; the accountant
 *     is ACCOUNTANT_ITAA on all three (the firm "pilots" its clients).
 *   - 1 FiduciaryConnection mandate (Brabo ↔ Fiduciaire Flagey).
 *   - A few invoices + expenses per tenant so the firm portal shows real KPIs.
 *
 * The demo data is deliberately distinct from the legacy `mockBelgianData.ts`
 * (which feeds the single-company client workspace). This file seeds the
 * production multi-tenant store used by the auth/session layer.
 */

import { dbStore, createId, normalizeOgm } from './dbStore';
import {
  FIRM_ROLES,
  LEGAL_FORMS,
  PLATFORM_ROLES,
  RPM_CITIES,
  ROLES,
  VAT_REGIMES,
} from '../types/db';
import type {
  FiduciaryConnection,
  Invoice,
  InvoiceLineRecord,
  PaymentLog,
  Plan,
  PostalAddress,
  PurchaseExpense,
  Tenant,
  User,
  VatBreakdownEntry,
} from '../types/db';
import { generateOGM } from '../../utils/belgianAccounting';

export const DEMO_USERS = {
  accountant: 'expert@fiduciaire-flagey.be',
  ownerBrabo: 'gerant@brabo-solutions.be',
  ownerBois: 'gerant@atelierbois-design.be',
  ownerLogistics: 'gerant@antwerplogistics.be',
  platformAdmin: 'admin@brabo.app',
  /** Non-admin member of the fiduciaire (SENIOR). */
  firmMember: 'senior@fiduciaire-flagey.be',
  /** Employee of the Brabo tenant (EMPLOYEE). */
  employeeBrabo: 'employe@brabo-solutions.be',
} as const;

/** Demo firm slug — matches the seeded `Fiduciaire Flagey`. */
export const DEMO_FIRM_SLUG = 'flagey';

interface SeedClientTenant {
  key: 'brabo' | 'bois' | 'logistics';
  name: string;
  legalForm: Tenant['legalForm'];
  bceDigits: string;
  vatNumber: string;
  city: string;
  postalCode: string;
  vatRegime: Tenant['vatRegime'];
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  /** [supplier, category, pcmn, amountExclVat, vatRate, deductibleVatRate] */
  expenses: [string, string, string, number, 21 | 12 | 6 | 0, number][];
  /** [clientName, pcmn, amountExclVat, vatRate, status] */
  invoices: [string, string, number, 21 | 12 | 6 | 0, Invoice['status']][];
}

const CLIENTS: SeedClientTenant[] = [
  {
    key: 'brabo',
    name: 'Brabo Digital Solutions',
    legalForm: LEGAL_FORMS.SRL,
    bceDigits: '0789456175',
    vatNumber: 'BE0789456175',
    city: 'Bruxelles',
    postalCode: '1050',
    vatRegime: VAT_REGIMES.QUARTERLY,
    ownerEmail: DEMO_USERS.ownerBrabo,
    ownerFirstName: 'Nicolas',
    ownerLastName: 'Simon',
    expenses: [
      ['Proximus SA', 'Télécom', '616100', 240.0, 21, 100],
      ['D\'Ieteren Lease SA', 'Leasing véhicule', '614100', 820.0, 21, 50],
    ],
    invoices: [
      ['Odoo Belgium SA', '705000', 4750.0, 21, 'paid'],
      ['Antwerp Logistics Hub BV', '705000', 2200.0, 21, 'sent'],
    ],
  },
  {
    key: 'bois',
    name: 'Atelier Bois & Design',
    legalForm: LEGAL_FORMS.SRL,
    bceDigits: '0821567891',
    vatNumber: 'BE0821567891',
    city: 'Namur',
    postalCode: '5000',
    vatRegime: VAT_REGIMES.QUARTERLY,
    ownerEmail: DEMO_USERS.ownerBois,
    ownerFirstName: 'Sophie',
    ownerLastName: 'Lambert',
    expenses: [
      ['Scierie Ardenne SA', 'Bois brut', '600000', 3150.0, 21, 100],
      ['Electrabel SA', 'Électricité atelier', '610100', 460.0, 21, 100],
    ],
    invoices: [
      ['Colruyt Group NV', '700000', 6200.0, 21, 'paid'],
      ['Cabinet Médical Louise', '700000', 1850.0, 6, 'overdue'],
    ],
  },
  {
    key: 'logistics',
    name: 'Antwerp Logistics Hub',
    legalForm: LEGAL_FORMS.BV,
    bceDigits: '0698321456',
    vatNumber: 'BE0698321456',
    city: 'Antwerpen',
    postalCode: '2030',
    vatRegime: VAT_REGIMES.MONTHLY,
    ownerEmail: DEMO_USERS.ownerLogistics,
    ownerFirstName: 'Jan',
    ownerLastName: 'Peeters',
    expenses: [
      ['Katoen Natie NV', 'Entreposage', '610300', 5400.0, 21, 100],
      ['TotalEnergies BE', 'Carburant flotte', '616300', 2100.0, 21, 50],
    ],
    invoices: [
      ['Brabo Digital Solutions', '705000', 8900.0, 21, 'paid'],
      ['Atelier Bois & Design', '705000', 3300.0, 21, 'sent'],
    ],
  },
];

/** Maps the demo legal-form / regime strings onto a 10-digit BCE number. */
function bceDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/** Builds a minimal PostalAddress value object. */
function address(city: string, postalCode: string): PostalAddress {
  return {
    street: 'Rue de la Gare',
    number: '1',
    postalCode,
    city,
    countryCode: 'BE',
    country: 'Belgique',
  };
}

/** Builds one invoice line in the production InvoiceLineRecord shape. */
function line(
  index: number,
  description: string,
  pcmnAccount: string,
  amountExclVat: number,
  vatRate: 21 | 12 | 6 | 0,
  invoiceId: string,
  tenantId: string,
  now: string,
): InvoiceLineRecord {
  const vatAmount = Math.round(amountExclVat * vatRate) / 100;
  return {
    id: createId('line'),
    tenantId,
    createdAt: now,
    updatedAt: now,
    invoiceId,
    lineNumber: index + 1,
    description,
    pcmnAccount,
    quantity: 1,
    unitCode: 'C62',
    unitPrice: amountExclVat,
    discountPercent: 0,
    vatRate,
    vatRegime: vatRate === 0 ? 'zero_0' : 'standard_21',
    totalExclVat: amountExclVat,
    vatAmount,
    totalInclVat: Math.round((amountExclVat + vatAmount) * 100) / 100,
  };
}

/** Builds a VAT breakdown entry for a single-rate invoice. */
function vatEntry(
  amountExclVat: number,
  vatRate: 21 | 12 | 6 | 0,
  vatAmount: number,
): VatBreakdownEntry {
  return {
    rate: vatRate,
    regime: vatRate === 0 ? 'zero_0' : 'standard_21',
    taxCategoryCode: vatRate === 0 ? 'Z' : 'S',
    baseAmount: amountExclVat,
    vatAmount,
  };
}

/** Seeds one invoice through the repository so RBAC + audit + indexes run. */
async function seedInvoice(
  tenantId: string,
  seq: number,
  spec: SeedClientTenant['invoices'][number],
): Promise<void> {
  const [clientName, pcmnAccount, amountExclVat, vatRate, status] = spec;
  const now = new Date().toISOString();
  const invoiceId = createId('inv');
  const vatAmount = Math.round(amountExclVat * vatRate) / 100;
  const totalInclVat = Math.round((amountExclVat + vatAmount) * 100) / 100;
  const ogm = generateOGM(`2026${String(seq).padStart(4, '0')}`);
  const clientBce = clientName.includes('Brabo')
    ? '0789456175'
    : clientName.includes('Bois')
      ? '0821567891'
      : clientName.includes('Colruyt')
        ? '0400378485'
        : clientName.includes('Cabinet')
          ? '0845123987'
          : '0698321456';

  const isPaid = status === 'paid';
  const paymentLogs: PaymentLog[] = isPaid
    ? [
        {
          id: createId('pay'),
          tenantId,
          createdAt: now,
          updatedAt: now,
          invoiceId,
          paidAt: now,
          valueDate: now.slice(0, 10),
          amount: totalInclVat,
          currency: 'EUR',
          method: 'bank_transfer',
          structuredCommunication: ogm,
          counterpartyName: clientName,
          isPartial: false,
          remainingBalance: 0,
          recordedByUserId: 'system',
        },
      ]
    : [];

  const input: Omit<Invoice, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'> = {
    type: 'invoice',
    invoiceNumber: `2026-${String(seq).padStart(4, '0')}`,
    series: 'INV',
    sequenceNumber: seq,
    fiscalYear: 2026,
    issueDate: '2026-02-10',
    dueDate: '2026-03-12',
    paymentTermsDays: 30,
    client: {
      name: clientName,
      bceNumber: clientBce,
      vatNumber: `BE${clientBce}`,
      peppolEndpointId: `0208:${clientBce}`,
      isPeppolEnabled: true,
      address: address('Bruxelles', '1000'),
      email: 'billing@client.be',
    },
    lines: [line(0, `Prestations — ${clientName}`, pcmnAccount, amountExclVat, vatRate, invoiceId, tenantId, now)],
    subtotalExclVat: amountExclVat,
    discountTotal: 0,
    vatBreakdown: [vatEntry(amountExclVat, vatRate, vatAmount)],
    totalVatAmount: vatAmount,
    totalInclVat,
    amountPaid: isPaid ? totalInclVat : 0,
    amountDue: isPaid ? 0 : totalInclVat,
    currency: 'EUR',
    structuredCommunication: ogm,
    ogmDigits: normalizeOgm(ogm) ?? '',
    status,
    paymentLogs,
    remindersSent: 0,
    createdByUserId: 'system',
    isLocked: false,
  };

  const ctx = dbStore.systemContext(tenantId);
  await dbStore.invoices.create(ctx, { ...input, id: invoiceId });
}

/** Seeds one purchase expense through the repository. */
async function seedExpense(
  tenantId: string,
  spec: SeedClientTenant['expenses'][number],
): Promise<void> {
  const [supplierName, category, pcmnAccount, amountExclVat, vatRate, deductibleVatRate] = spec;
  const vatAmount = Math.round(amountExclVat * vatRate) / 100;
  const amountInclVat = Math.round((amountExclVat + vatAmount) * 100) / 100;
  const deductibleVat = Math.round(vatAmount * deductibleVatRate) / 100;
  const nonDeductibleVat = Math.round((vatAmount - deductibleVat) * 100) / 100;
  const deductibleAmount = amountExclVat;
  const nonDeductibleAmount = 0;

  const input: Omit<PurchaseExpense, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'> = {
    supplierName,
    supplierBce: 'BE 0202.239.951',
    supplierVatNumber: 'BE0202239951',
    invoiceNumber: `F-${supplierName.replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase()}-${amountExclVat}`,
    invoiceDate: '2026-02-05',
    dueDate: '2026-03-05',
    fiscalYear: 2026,
    vatPeriod: '2026-Q1',
    category,
    pcmnAccount,
    description: `${category} — ${supplierName}`,
    amountExclVat,
    vatRate,
    vatRegime: vatRate === 0 ? 'zero_0' : 'standard_21',
    vatAmount,
    amountInclVat,
    currency: 'EUR',
    deductibilityRate: deductibleVatRate === 50 ? 75 : 100,
    deductibleVatRate,
    deductibleAmount,
    nonDeductibleAmount,
    deductibleVat,
    nonDeductibleVat,
    status: 'approved',
    amountPaid: 0,
    amountDue: amountInclVat,
    paymentLogs: [],
    receipts: [],
    isInvestment: false,
    isReverseCharge: false,
    createdByUserId: 'system',
    isLocked: false,
  };

  const ctx = dbStore.systemContext(tenantId);
  await dbStore.expenses.create(ctx, input);
}

/** Builds a full Tenant value object for one demo client. */
function buildTenant(spec: SeedClientTenant): Omit<Tenant, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    name: spec.name,
    legalForm: spec.legalForm,
    bceNumber: spec.bceDigits,
    bceDigits: bceDigits(spec.bceDigits),
    vatNumber: spec.vatNumber,
    vatNumberVerified: true,
    rpmCity: spec.city === 'Antwerpen' ? RPM_CITIES.ANTWERPEN : spec.city === 'Namur' ? RPM_CITIES.NAMUR : RPM_CITIES.BRUXELLES,
    registeredAddress: address(spec.city, spec.postalCode),
    vatRegime: spec.vatRegime,
    vatPrepaymentRequired: spec.vatRegime === VAT_REGIMES.QUARTERLY,
    naceBelActivities: [{ code: '62010', label: 'Programmation informatique', isPrimary: true }],
    bankAccounts: [
      {
        id: createId('bank'),
        label: 'Compte principal',
        iban: 'BE68 0012 3456 7890',
        bic: 'GEBABEBB',
        bankName: 'BNP Paribas Fortis',
        currency: 'EUR',
        isPrimary: true,
        pcmnAccount: '550000',
        codaEnabled: true,
        openingBalance: 0,
        currentBalance: 25000,
      },
    ],
    peppolEndpointId: `0208:${spec.bceDigits}`,
    peppolEnabled: true,
    fiscalYearStart: '01-01',
    fiscalYearEnd: '12-31',
    email: `compta@${spec.key}.be`,
    locale: spec.city === 'Antwerpen' ? 'nl-BE' : 'fr-BE',
    status: 'active',
    settings: {},
  };
}

/** Builds a User value object (no password hash — demo identity only). */
function buildUser(
  email: string,
  firstName: string,
  lastName: string,
  itaaMemberNumber?: string,
): Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    email,
    emailVerified: true,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    locale: 'fr-BE',
    authProvider: 'password',
    itaaMemberNumber,
    mfaEnabled: false,
    status: 'active',
  };
}

/** Builds a FiduciaryConnection mandate (Brabo ↔ Fiduciaire Flagey). */
function buildFiduciary(now: string): Omit<FiduciaryConnection, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  return {
    firmName: 'Fiduciaire Flagey & Associés',
    itaaFirmNumber: '11.234.567',
    firmBceNumber: 'BE 0470.123.456',
    itaaQuality: 'expert_comptable_certifie',
    contactName: 'Marie Flagey',
    contactItaaNumber: '11.234.567',
    contactEmail: DEMO_USERS.accountant,
    engagementLetterReference: 'LM-2026-001',
    engagementLetterSignedAt: '2026-01-10',
    mandateStartDate: '2026-01-01',
    status: 'active',
    scopes: [
      'invoices:read',
      'invoices:write',
      'expenses:read',
      'expenses:write',
      'bank:read',
      'bank:reconcile',
      'vat:prepare',
      'vat:submit',
      'annual_accounts:file',
      'documents:read',
      'documents:write',
      'audit:read',
    ],
    linkedMembershipIds: [],
    sharedFolders: [
      {
        id: createId('folder'),
        name: 'Pièces comptables 2026',
        path: '/2026/Q1',
        provider: 'internal',
        writeAccess: 'both',
        documentCount: 0,
        totalSizeBytes: 0,
        retentionYears: 10,
        createdAt: now,
      },
    ],
    autoExportEnabled: true,
    exportFormat: 'winbooks',
    exportFrequency: 'monthly',
    handlesVatFiling: true,
    handlesAnnualAccounts: true,
    handlesPayroll: false,
    approvedByUserId: 'system',
    approvedAt: now,
  };
}

/** Commercial plans (SaaS tiers) sold to firms. Idempotent by slug. */
const PLAN_SPECS: Omit<Plan, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[] = [
  {
    slug: 'starter',
    name: 'Starter',
    priceMonthlyEur: 0,
    pricePerDossierEur: 25,
    maxDossiers: 10,
    maxUsers: 2,
    features: ['10 dossiers', 'Espace client', 'Facturation & TVA', 'Support email'],
    isActive: true,
  },
  {
    slug: 'pro',
    name: 'Pro',
    priceMonthlyEur: 149,
    pricePerDossierEur: 18,
    maxDossiers: 100,
    maxUsers: 10,
    features: ['100 dossiers', 'Peppol & eBox', 'Workflow & clôture', 'White-label', 'Signature QES', 'Support prioritaire'],
    isActive: true,
  },
  {
    slug: 'scale',
    name: 'Scale',
    priceMonthlyEur: 399,
    pricePerDossierEur: 12,
    maxDossiers: null,
    maxUsers: 50,
    features: ['Dossiers illimités', 'API publique', 'BI & consolidation', 'SSO/MFA avancé', 'Account manager'],
    isActive: true,
  },
];

/**
 * Seeds the 3-tier SaaS platform layer (plans, platform admin, demo firm) and
 * backlinks existing demo tenants to the firm. Idempotent: safe on every boot.
 */
export async function seedPlatformData(): Promise<{ firmId: string }> {
  await dbStore.init();

  // Plans.
  for (const spec of PLAN_SPECS) {
    const existing = await dbStore.platform.findPlanBySlug(spec.slug);
    if (!existing) await dbStore.platform.createPlan(spec, 'system');
  }

  // Platform admin user + platform-admin row.
  let admin = await dbStore.users.findByEmail(DEMO_USERS.platformAdmin);
  if (!admin) {
    admin = await dbStore.users.create(
      buildUser(DEMO_USERS.platformAdmin, 'Platform', 'Owner'),
    );
  }
  const existingAdmin = await dbStore.platform.findPlatformAdminForUser(admin.id);
  if (!existingAdmin) {
    await dbStore.platform.createPlatformAdmin(
      { userId: admin.id, role: PLATFORM_ROLES.PLATFORM_OWNER, status: 'active' },
      'system',
    );
  }

  // Demo firm.
  let firm = await dbStore.platform.findFirmBySlug(DEMO_FIRM_SLUG);
  if (!firm) {
    const proPlan = await dbStore.platform.findPlanBySlug('pro');
    firm = await dbStore.platform.createFirm(
      {
        name: 'Fiduciaire Flagey & Associés',
        itaaFirmNumber: '11.234.567',
        bceDigits: '0470123456',
        vatNumber: 'BE0470123456',
        address: address('Bruxelles', '1050'),
        brand: {
          slug: DEMO_FIRM_SLUG,
          primaryColor: '#0ea5e9',
          emailFooter: 'Fiduciaire Flagey & Associés — Expert-comptable ITAA',
        },
        status: 'active',
        planId: proPlan?.id,
        createdByPlatformAdminId: admin.id,
      },
      'system',
    );
  }

  // Subscription for the demo firm.
  const subs = await dbStore.platform.listFirmSubscriptions(firm.id);
  if (subs.length === 0) {
    const proPlan = await dbStore.platform.findPlanBySlug('pro');
    await dbStore.platform.createFirmSubscription(
      {
        firmId: firm.id,
        planId: proPlan?.id ?? '',
        status: 'active',
        dossierCount: 3,
        overageDossiers: 0,
      },
      'system',
    );
  }

  // Backlink existing demo tenants to the firm (covers a previously-seeded DB).
  const tenantBces = ['0789456175', '0821567891', '0698321456'];
  for (const bce of tenantBces) {
    const tenant = await dbStore.tenants.findByBce(bce);
    if (tenant && !tenant.firmId) {
      await dbStore.tenants.update(
        dbStore.systemContext(tenant.id),
        { firmId: firm.id },
        'Rattachement à la firme démo',
      );
    }
  }

  await dbStore.flush();
  return { firmId: firm.id };
}

/** Binds the demo accountant to the firm as FIRM_ADMIN (idempotent). */
async function linkAccountantToFirm(firmId: string): Promise<void> {
  const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
  if (!accountant) return;
  const memberships = await dbStore.platform.listFirmMemberships(firmId);
  if (!memberships.some((m) => m.userId === accountant.id)) {
    await dbStore.platform.createFirmMembership(
      {
        firmId,
        userId: accountant.id,
        role: FIRM_ROLES.FIRM_ADMIN,
        status: 'active',
        extraPermissions: [],
        deniedPermissions: [],
      },
      'system',
    );
    await dbStore.flush();
  }
}

/**
 * Seeds the two additional SaaS profiles so all four are reachable end-to-end:
 *   - firm collaborator (SENIOR) → non-admin member of the fiduciaire,
 *   - client employee (EMPLOYEE) → limited member of the Brabo tenant.
 * Idempotent: safe on every boot.
 */
async function seedProfileIdentities(firmId: string): Promise<void> {
  // Firm collaborator (SENIOR).
  let senior = await dbStore.users.findByEmail(DEMO_USERS.firmMember);
  if (!senior) {
    senior = await dbStore.users.create(
      buildUser(DEMO_USERS.firmMember, 'Luc', 'Dubois', '11.234.568'),
    );
  }
  const firmMemberships = await dbStore.platform.listFirmMemberships(firmId);
  if (!firmMemberships.some((m) => m.userId === senior!.id && m.role === FIRM_ROLES.SENIOR)) {
    await dbStore.platform.createFirmMembership(
      {
        firmId,
        userId: senior!.id,
        role: FIRM_ROLES.SENIOR,
        status: 'active',
        extraPermissions: [],
        deniedPermissions: [],
      },
      'system',
    );
  }

  // The senior also holds ACCOUNTANT_ITAA memberships on each dossier — this is
  // what the tenant repository uses to scope the firm portal reads.
  const tenantBces = ['0789456175', '0821567891', '0698321456'];
  for (const bce of tenantBces) {
    const tenant = await dbStore.tenants.findByBce(bce);
    if (!tenant) continue;
    const existing = await dbStore.memberships.findFor(senior!.id, tenant.id);
    if (!existing) {
      await dbStore.memberships.create(dbStore.systemContext(tenant.id), {
        userId: senior!.id,
        role: ROLES.ACCOUNTANT_ITAA,
        status: 'active',
        extraPermissions: [],
        deniedPermissions: [],
        invitedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
      });
    }
  }

  // Client employee (EMPLOYEE) on the Brabo tenant.
  let employee = await dbStore.users.findByEmail(DEMO_USERS.employeeBrabo);
  if (!employee) {
    employee = await dbStore.users.create(
      buildUser(DEMO_USERS.employeeBrabo, 'Emma', 'Vandenberghe'),
    );
  }
  const braboTenant = await dbStore.tenants.findByBce('0789456175');
  if (braboTenant) {
    const existing = await dbStore.memberships.findFor(employee!.id, braboTenant.id);
    if (!existing) {
      await dbStore.memberships.create(dbStore.systemContext(braboTenant.id), {
        userId: employee!.id,
        role: ROLES.EMPLOYEE,
        status: 'active',
        extraPermissions: [],
        deniedPermissions: [],
        invitedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
      });
    }
  }
}

/** Seeds the whole demo dataset. Idempotent. */
export async function seedDemoData(): Promise<void> {
  await dbStore.init();
  const { firmId } = await seedPlatformData();
  if (await dbStore.users.findByEmail(DEMO_USERS.accountant)) {
    await linkAccountantToFirm(firmId);
    await seedProfileIdentities(firmId);
    await dbStore.flush();
    return;
  }

  // 1. Provision users.
  const ownerBrabo = await dbStore.users.create(buildUser(DEMO_USERS.ownerBrabo, 'Nicolas', 'Simon'));
  const ownerBois = await dbStore.users.create(buildUser(DEMO_USERS.ownerBois, 'Sophie', 'Lambert'));
  const ownerLogistics = await dbStore.users.create(buildUser(DEMO_USERS.ownerLogistics, 'Jan', 'Peeters'));
  const accountant = await dbStore.users.create(
    buildUser(DEMO_USERS.accountant, 'Marie', 'Flagey', '11.234.567'),
  );

  const ownerByKey: Record<string, User> = {
    brabo: ownerBrabo,
    bois: ownerBois,
    logistics: ownerLogistics,
  };

  // 2. Provision tenants + OWNER/ACCOUNTANT memberships + financial rows.
  const tenantIds: Record<string, string> = {};
  for (const spec of CLIENTS) {
    const tenant = await dbStore.tenants.create(
      { ...buildTenant(spec), firmId },
      ownerByKey[spec.key].id,
    );
    tenantIds[spec.key] = tenant.id;

    const ownerCtx = dbStore.systemContext(tenant.id);
    await dbStore.memberships.create(ownerCtx, {
      userId: ownerByKey[spec.key].id,
      role: ROLES.OWNER,
      status: 'active',
      extraPermissions: [],
      // The firm initially holds the VAT filing right; the client cannot
      // self-declare until the accountant grants it back (removes the denial).
      deniedPermissions: ['vat:submit'],
      invitedAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
    });

    await dbStore.memberships.create(ownerCtx, {
      userId: accountant.id,
      role: ROLES.ACCOUNTANT_ITAA,
      status: 'active',
      extraPermissions: [],
      deniedPermissions: [],
      invitedAt: new Date().toISOString(),
      acceptedAt: new Date().toISOString(),
    });

    // The Brabo tenant has a live client workspace: its ledger is seeded by the
    // client's own write-through (tenantWorkspace), not by this demo bootstrap —
    // so the cabinet portal reflects exactly what the client encodes.
    if (spec.key !== 'brabo') {
      let seq = 1;
      for (const inv of spec.invoices) {
        await seedInvoice(tenant.id, seq, inv);
        seq += 1;
      }
      for (const exp of spec.expenses) {
        await seedExpense(tenant.id, exp);
      }
    }
  }

  // 3. Fiduciary mandate for Brabo.
  await dbStore.fiduciaries.create(dbStore.systemContext(tenantIds.brabo), {
    ...buildFiduciary(new Date().toISOString()),
  });

  // 4. Bind the demo accountant to the firm as FIRM_ADMIN.
  await linkAccountantToFirm(firmId);

  // 5. Seed the two additional SaaS profiles (firm collaborator + client employee).
  await seedProfileIdentities(firmId);

  await dbStore.flush();
}

/** Convenience: resolves a demo user by their known email. */
export async function resolveDemoUser(email: string): Promise<User | null> {
  await dbStore.init();
  return dbStore.users.findByEmail(email);
}

/** True when the demo accountant is already provisioned. */
export async function isDemoSeeded(): Promise<boolean> {
  await dbStore.init();
  const existing = await dbStore.users.findByEmail(DEMO_USERS.accountant);
  return Boolean(existing);
}

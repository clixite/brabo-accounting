/**
 * ============================================================================
 * BRABO — FIDUCIARY BRIDGE ENGINE
 * ============================================================================
 * Comprehensive ERP / accounting-software export & synchronisation layer
 * connecting BRABO to the Belgian fiduciary software landscape:
 *
 *   1. Sage BOB 50 / BOB Expert ...... ASCII fixed/delimited (FicAch, FicVen,
 *                                      FicCli, FicFou)
 *   2. WinBooks Classic / on Web ..... XML, WBF and legacy ASCII imports
 *   3. Horus Office / Horus Cloud .... Native XML data-exchange bridge
 *                                      (Horus Software — creator of Falco)
 *   4. Exact Online Belgium .......... CSV + XML general-ledger import
 *   5. Octopus & Yuki Belgium ........ UBL 2.1 e-fff Belgian standard bundle
 *                                      with metadata index (efff manifest)
 *
 * Every generator is fed from a single canonical intermediate representation:
 * the `LedgerJournalEntry` — a strict Belgian double-entry accounting entry
 * built according to the PCMN (Plan Comptable Minimum Normalisé / MAR).
 *
 * Every exported package is verified: Sum(Debits) === Sum(Credits), both per
 * entry and across the whole batch, before any file is emitted.
 *
 * @module services/fiduciaryBridge
 */

import type {
  Invoice,
  InvoiceLine,
  PurchaseExpense,
  CompanyProfile,
  ClientParty,
  BelgianVatRate,
  BelgianVatRegime,
} from '../types/accounting';

/* ==========================================================================
 * SECTION 1 — PUBLIC TYPES
 * ========================================================================== */

/** Supported fiduciary / ERP target platforms. */
export type FiduciaryFormat =
  | 'sage_bob50'
  | 'winbooks'
  | 'horus'
  | 'exact_online'
  | 'octopus'
  | 'yuki'
  | 'full_bundle';

/** Belgian standard journal (daybook) codes. */
export type BelgianJournalCode = 'VEN' | 'ACH' | 'BQ1' | 'CAI' | 'OD' | 'NCV' | 'NCA';

/** Side of a double-entry booking line. */
export type LedgerSide = 'D' | 'C';

/** MIME hints used when materialising a file in the browser. */
export type FiduciaryMimeType =
  | 'text/plain;charset=windows-1252'
  | 'text/plain;charset=utf-8'
  | 'text/csv;charset=utf-8'
  | 'application/xml;charset=utf-8'
  | 'application/json;charset=utf-8';

/**
 * One leg of a double-entry booking.
 * Exactly one of `debit` / `credit` carries a non-zero amount.
 */
export interface LedgerLine {
  /** PCMN / MAR general-ledger account, e.g. "400000", "700000", "451000". */
  account: string;
  /** Human-readable account label (French, fiduciary-facing). */
  accountLabel: string;
  /** Booking side, redundant with debit/credit but explicit for exporters. */
  side: LedgerSide;
  /** Debit amount in EUR (0 when the line is a credit). */
  debit: number;
  /** Credit amount in EUR (0 when the line is a debit). */
  credit: number;
  /** Free-text booking comment shown in the fiduciary's daybook. */
  comment: string;
  /** VAT base amount attached to this line, when it is a VAT-bearing line. */
  vatBase?: number;
  /** VAT rate applied (Belgian legal rates only). */
  vatRate?: BelgianVatRate;
  /** Belgian VAT regime driving the grid mapping. */
  vatRegime?: BelgianVatRegime;
  /** Software-specific VAT code, resolved per target (e.g. WinBooks "211"). */
  vatCode?: string;
  /** Analytic / cost-centre code when the fiduciary uses analytical accounting. */
  analyticCode?: string;
}

/** A complete, balanced Belgian accounting entry (one document). */
export interface LedgerJournalEntry {
  /** Stable identifier, derived from the source document. */
  id: string;
  /** Daybook this entry belongs to. */
  journal: BelgianJournalCode;
  /** Sequential entry number inside the daybook (1-based). */
  entryNumber: number;
  /** Booking date (YYYY-MM-DD). */
  date: string;
  /** Document / invoice due date (YYYY-MM-DD). */
  dueDate: string;
  /** Accounting period as YYYYMM (BOB & WinBooks "PERIOD" field). */
  period: string;
  /** Fiscal year (bookyear). */
  fiscalYear: number;
  /** Source document number, e.g. "2026-0042". */
  documentNumber: string;
  /** Counterparty subsidiary account: 400000-range client or 440000-range supplier. */
  thirdPartyAccount: string;
  /** Counterparty legal name. */
  thirdPartyName: string;
  /** Counterparty Belgian VAT number (BE0123456789), when known. */
  thirdPartyVat: string;
  /** Belgian structured communication (OGM / VCS), when present. */
  structuredCommunication?: string;
  /** Booking legs — always balanced. */
  lines: LedgerLine[];
  /** Total document amount, VAT included. */
  totalInclVat: number;
  /** Total document amount, VAT excluded. */
  totalExclVat: number;
  /** Total VAT amount of the document. */
  totalVat: number;
  /** `true` when the source document is a credit note (sign-reversed). */
  isCreditNote: boolean;
  /** Currency — Belgian fiduciary exports are EUR-only in this engine. */
  currency: 'EUR';
}

/** Result of the double-entry balancing audit. */
export interface LedgerBalanceReport {
  /** `true` when every entry and the global batch balance to the cent. */
  isBalanced: boolean;
  /** Sum of all debit legs across the batch (rounded to 2 decimals). */
  totalDebits: number;
  /** Sum of all credit legs across the batch (rounded to 2 decimals). */
  totalCredits: number;
  /** totalDebits − totalCredits (0 when balanced). */
  difference: number;
  /** Number of entries audited. */
  entryCount: number;
  /** Number of individual booking legs audited. */
  lineCount: number;
  /** Per-entry failures, empty when the batch is sound. */
  unbalancedEntries: {
    id: string;
    journal: BelgianJournalCode;
    documentNumber: string;
    debits: number;
    credits: number;
    difference: number;
  }[];
  /** Blocking anomalies (unbalanced entries, invalid accounts, …). */
  errors: string[];
  /** Non-blocking observations (missing OGM, unknown VAT regime, …). */
  warnings: string[];
}

/** A single generated file inside an export package. */
export interface FiduciaryFile {
  /** File name as it must appear in the fiduciary's import folder. */
  filename: string;
  /** Full file body. */
  content: string;
  /** MIME type used when building the download Blob. */
  mimeType: FiduciaryMimeType;
  /** Target character encoding expected by the receiving software. */
  encoding: 'utf-8' | 'windows-1252';
  /** Short human description shown in the BRABO export UI. */
  description: string;
  /** Number of logical records (entries/lines) contained in this file. */
  recordCount: number;
}

/** A complete, verified export package ready for download. */
export interface FiduciaryExportPackage {
  /** Target platform this package was generated for. */
  format: FiduciaryFormat;
  /** Marketing / UI label of the target platform. */
  formatLabel: string;
  /** Suggested archive base name (without extension). */
  archiveName: string;
  /** Generation timestamp (ISO 8601). */
  generatedAt: string;
  /** Files composing the package. */
  files: FiduciaryFile[];
  /** Double-entry audit for the underlying ledger. */
  balanceReport: LedgerBalanceReport;
  /** Canonical ledger the files were rendered from. */
  ledger: LedgerJournalEntry[];
  /** Aggregate counters for the export summary panel. */
  statistics: {
    salesEntries: number;
    purchaseEntries: number;
    customerRecords: number;
    supplierRecords: number;
    totalSalesExclVat: number;
    totalPurchasesExclVat: number;
    totalVatCollected: number;
    totalVatDeductible: number;
  };
  /** `true` when the package passed every validation and may be transmitted. */
  isValid: boolean;
}

/** Options accepted by {@link exportFiduciaryPackage}. */
export interface FiduciaryExportOptions {
  /** Fiscal year to stamp on the export. Defaults to the current year. */
  fiscalYear?: number;
  /** Restrict the export to a period prefix, e.g. "2026-03" or "2026-Q1". */
  periodFilter?: string;
  /** Emit customer/supplier master-data files alongside the movements. */
  includeMasterData?: boolean;
  /** Throw instead of returning an invalid package when the ledger is unbalanced. */
  strictBalancing?: boolean;
  /** Override the sales daybook code (default "VEN"). */
  salesJournalCode?: BelgianJournalCode;
  /** Override the purchase daybook code (default "ACH"). */
  purchaseJournalCode?: BelgianJournalCode;
  /** Override the financial daybook code (default "BQ1"). */
  financialJournalCode?: BelgianJournalCode;
}

/* ==========================================================================
 * SECTION 2 — BELGIAN ACCOUNTING CONSTANTS
 * ========================================================================== */

/** PCMN root accounts used by the bridge. */
export const PCMN_ACCOUNTS = {
  /** Clients — comptes de tiers débiteurs (classe 40). */
  CUSTOMERS_ROOT: '400000',
  /** Fournisseurs — comptes de tiers créditeurs (classe 44). */
  SUPPLIERS_ROOT: '440000',
  /** TVA due sur ventes (TVA à payer). */
  VAT_PAYABLE: '451000',
  /** TVA déductible sur achats (TVA à récupérer). */
  VAT_DEDUCTIBLE: '411000',
  /** TVA due au titre du report de perception (cocontractant / intracom). */
  VAT_REVERSE_CHARGE_PAYABLE: '451500',
  /** TVA déductible au titre du report de perception. */
  VAT_REVERSE_CHARGE_DEDUCTIBLE: '411500',
  /** Ventes de marchandises par défaut. */
  DEFAULT_SALES: '700000',
  /** Achats / services et biens divers par défaut. */
  DEFAULT_PURCHASE: '600000',
  /** Charges non déductibles / dépenses non admises (DNA). */
  NON_DEDUCTIBLE_EXPENSE: '640000',
  /** Compte financier — banque. */
  BANK: '550000',
} as const;

/** Belgian standard daybook codes with their fiduciary-facing labels. */
export const BELGIAN_JOURNALS: Record<BelgianJournalCode, { label: string; type: string }> = {
  VEN: { label: 'Journal des ventes', type: 'SALES' },
  ACH: { label: 'Journal des achats', type: 'PURCHASE' },
  BQ1: { label: 'Journal financier — Banque', type: 'FINANCIAL' },
  CAI: { label: 'Journal de caisse', type: 'CASH' },
  OD: { label: 'Opérations diverses', type: 'MISC' },
  NCV: { label: 'Notes de crédit sur ventes', type: 'SALES_CN' },
  NCA: { label: 'Notes de crédit sur achats', type: 'PURCHASE_CN' },
};

/**
 * WinBooks VAT codes (official import table).
 *  - 211 : Ventes soumises au taux normal 21 %
 *  - 212 : Ventes soumises aux taux réduits 6/12 %
 *  - 001 : Achats — biens et services, TVA déductible
 *  - 000 : Hors champ / exonéré
 *  - 411 : Cocontractant art. 20 AR n°1 (report de perception)
 *  - 461 : Livraisons intracommunautaires art. 39bis
 */
export const WINBOOKS_VAT_CODES = {
  SALES_21: '211',
  SALES_REDUCED: '212',
  SALES_ZERO: '000',
  SALES_COCONTRACTANT: '411',
  SALES_INTRACOM_GOODS: '461',
  SALES_INTRACOM_SERVICES: '441',
  SALES_EXPORT: '471',
  SALES_EXEMPT: '000',
  PURCHASE_GOODS_SERVICES: '001',
  PURCHASE_INVESTMENT: '003',
  PURCHASE_INTRACOM: '081',
  PURCHASE_NON_DEDUCTIBLE: '000',
} as const;

/** Sage BOB 50 VAT ("Régime TVA") codes used in FicVen / FicAch. */
export const BOB_VAT_CODES = {
  SALES_21: 'V21',
  SALES_12: 'V12',
  SALES_6: 'V06',
  SALES_0: 'V00',
  SALES_COCONTRACTANT: 'VCC',
  SALES_INTRACOM: 'VIC',
  SALES_EXPORT: 'VEX',
  PURCHASE_21: 'A21',
  PURCHASE_12: 'A12',
  PURCHASE_6: 'A06',
  PURCHASE_0: 'A00',
  PURCHASE_INVESTMENT: 'AIN',
} as const;

/** Exact Online Belgium VAT code table (Belgian localisation). */
export const EXACT_ONLINE_VAT_CODES = {
  SALES_21: '1',
  SALES_12: '2',
  SALES_6: '3',
  SALES_0: '4',
  SALES_COCONTRACTANT: '9',
  SALES_INTRACOM_GOODS: '46',
  SALES_INTRACOM_SERVICES: '44',
  SALES_EXPORT: '47',
  PURCHASE_21: '11',
  PURCHASE_12: '12',
  PURCHASE_6: '13',
  PURCHASE_0: '14',
} as const;

/** UBL 2.1 tax category identifiers (UNCL5305) used by the e-fff bundle. */
const UBL_TAX_CATEGORY: Record<BelgianVatRegime, string> = {
  standard_21: 'S',
  reduced_12: 'S',
  reduced_6: 'S',
  zero_0: 'Z',
  cocontractant_art20: 'AE',
  intracommunity_art39bis: 'K',
  intracommunity_service_art21: 'K',
  export_art39: 'G',
  exempt_art44: 'E',
  small_business_art56bis: 'E',
};

/** Legal exemption wording required on Belgian invoices per regime. */
const VAT_EXEMPTION_REASON: Record<BelgianVatRegime, string> = {
  standard_21: '',
  reduced_12: '',
  reduced_6: '',
  zero_0: '',
  cocontractant_art20: 'Autoliquidation — Report de perception, art. 20 AR n°1',
  intracommunity_art39bis: 'Livraison intracommunautaire exonérée — art. 39bis CTVA',
  intracommunity_service_art21: 'Prestation de services intracommunautaire — art. 21 §2 CTVA',
  export_art39: 'Exportation hors UE exonérée — art. 39 CTVA',
  exempt_art44: 'Exonération — art. 44 CTVA',
  small_business_art56bis: 'Régime de la franchise — art. 56bis CTVA (TVA non applicable)',
};

/* ==========================================================================
 * SECTION 3 — LOW-LEVEL FORMATTING HELPERS
 * ========================================================================== */

/** Rounds to 2 decimals using half-up semantics, immune to float drift. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Renders a number with a fixed 2-decimal point separator. */
function amount2(value: number): string {
  return round2(value).toFixed(2);
}

/** Renders an amount with a comma decimal separator (BOB / Exact BE locale). */
function amountComma(value: number): string {
  return amount2(value).replace('.', ',');
}

/** Strips every non-digit character (BCE / VAT / OGM normalisation). */
function digitsOnly(value: string | undefined | null): string {
  return (value ?? '').replace(/[^0-9]/g, '');
}

/** Normalises a Belgian VAT number to the canonical `BE0123456789` form. */
function normalizeVat(raw: string | undefined | null): string {
  const digits = digitsOnly(raw);
  if (digits.length === 0) return '';
  return `BE${digits.padStart(10, '0').slice(-10)}`;
}

/** Returns the bare 12-digit OGM payload, or an empty string. */
function ogmDigits(raw: string | undefined | null): string {
  const digits = digitsOnly(raw);
  return digits.length === 12 ? digits : '';
}

/** Converts `YYYY-MM-DD` to `DDMMYYYY` (Sage BOB ASCII date field). */
function dateDDMMYYYY(iso: string): string {
  const [y = '', m = '', d = ''] = (iso ?? '').split('-');
  return `${d.padStart(2, '0')}${m.padStart(2, '0')}${y.padStart(4, '0')}`;
}

/** Converts `YYYY-MM-DD` to `DD/MM/YYYY` (Exact Online Belgium CSV). */
function dateSlashed(iso: string): string {
  const [y = '', m = '', d = ''] = (iso ?? '').split('-');
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.padStart(4, '0')}`;
}

/** Converts `YYYY-MM-DD` to `YYYYMMDD` (WinBooks / Horus compact date). */
function dateCompact(iso: string): string {
  return digitsOnly(iso).padEnd(8, '0').slice(0, 8);
}

/** Derives the `YYYYMM` accounting period from an ISO date. */
function periodFromDate(iso: string): string {
  return dateCompact(iso).slice(0, 6);
}

/** Extracts the fiscal year from an ISO date. */
function yearFromDate(iso: string, fallback: number): number {
  const year = parseInt((iso ?? '').slice(0, 4), 10);
  return Number.isFinite(year) && year > 1990 ? year : fallback;
}

/**
 * Pads / truncates a value to an exact width — mandatory for fixed-length
 * ASCII layouts (Sage BOB, WinBooks legacy).
 */
function fixed(value: string | number, width: number, align: 'left' | 'right' = 'left'): string {
  const raw = String(value ?? '');
  const clipped = raw.length > width ? raw.slice(0, width) : raw;
  return align === 'left' ? clipped.padEnd(width, ' ') : clipped.padStart(width, ' ');
}

/**
 * Sanitises a value for legacy ASCII imports: removes diacritics, control
 * characters and the field separator itself (BOB/WinBooks are 8-bit tools).
 */
function asciiSafe(value: string | undefined | null, separator = ';'): string {
  if (!value) return '';
  const deaccented = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return deaccented.replace(new RegExp(escapedSeparator, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

/** Escapes a CSV field per RFC 4180 (quotes doubled, field quoted if needed). */
function csvField(value: string | number | undefined | null): string {
  const raw = String(value ?? '');
  if (/[",;\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** Escapes the five XML predefined entities. */
function escapeXml(value: string | number | undefined | null): string {
  const raw = String(value ?? '');
  return raw.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/** Joins lines with CRLF — required by every legacy Belgian ASCII importer. */
function crlf(lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

/* ==========================================================================
 * SECTION 4 — THIRD-PARTY (TIERS) ACCOUNT ALLOCATION
 * ========================================================================== */

/** Master-data record for a customer subsidiary account (classe 40). */
export interface CustomerMasterRecord {
  account: string;
  name: string;
  vatNumber: string;
  bceNumber: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  email: string;
  phone: string;
  iban: string;
  bic: string;
  language: 'F' | 'N' | 'E';
  paymentTermsDays: number;
  centralAccount: string;
}

/** Master-data record for a supplier subsidiary account (classe 44). */
export interface SupplierMasterRecord {
  account: string;
  name: string;
  vatNumber: string;
  bceNumber: string;
  iban: string;
  countryCode: string;
  language: 'F' | 'N' | 'E';
  centralAccount: string;
  defaultExpenseAccount: string;
}

/**
 * Deterministically allocates subsidiary accounts in the 400000 / 440000
 * ranges. Belgian fiduciary software expects a stable, gap-tolerant numbering,
 * so the allocation is keyed on the counterparty's BCE (falling back to the
 * normalised name) and is therefore reproducible across exports.
 */
class ThirdPartyLedger {
  private readonly customers = new Map<string, CustomerMasterRecord>();
  private readonly suppliers = new Map<string, SupplierMasterRecord>();
  private customerCursor = 0;
  private supplierCursor = 0;

  private static key(primary: string, fallback: string): string {
    const digits = digitsOnly(primary);
    if (digits.length >= 9) return digits.padStart(10, '0').slice(-10);
    return (fallback || 'UNKNOWN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'UNKNOWN';
  }

  /** Registers a client and returns its 400000-range subsidiary account. */
  registerCustomer(client: ClientParty): CustomerMasterRecord {
    const key = ThirdPartyLedger.key(client.bceNumber, client.name);
    const existing = this.customers.get(key);
    if (existing) return existing;

    this.customerCursor += 1;
    const account = `4000${String(this.customerCursor).padStart(2, '0')}`;

    const record: CustomerMasterRecord = {
      account,
      name: client.name,
      vatNumber: normalizeVat(client.vatNumber || client.bceNumber),
      bceNumber: digitsOnly(client.bceNumber),
      street: `${client.street ?? ''} ${client.number ?? ''}${client.box ? ' bte ' + client.box : ''}`.trim(),
      postalCode: client.postalCode ?? '',
      city: client.city ?? '',
      countryCode: resolveCountryCode(client.country),
      email: client.email ?? '',
      phone: client.phone ?? '',
      iban: (client.iban ?? '').replace(/\s/g, ''),
      bic: client.bic ?? '',
      language: 'F',
      paymentTermsDays: 30,
      centralAccount: PCMN_ACCOUNTS.CUSTOMERS_ROOT,
    };

    this.customers.set(key, record);
    return record;
  }

  /** Registers a supplier and returns its 440000-range subsidiary account. */
  registerSupplier(expense: PurchaseExpense): SupplierMasterRecord {
    const key = ThirdPartyLedger.key(expense.supplierBce, expense.supplierName);
    const existing = this.suppliers.get(key);
    if (existing) return existing;

    this.supplierCursor += 1;
    const account = `4400${String(this.supplierCursor).padStart(2, '0')}`;

    const record: SupplierMasterRecord = {
      account,
      name: expense.supplierName,
      vatNumber: normalizeVat(expense.supplierBce),
      bceNumber: digitsOnly(expense.supplierBce),
      iban: (expense.supplierIban ?? '').replace(/\s/g, ''),
      countryCode: 'BE',
      language: 'F',
      centralAccount: PCMN_ACCOUNTS.SUPPLIERS_ROOT,
      defaultExpenseAccount: expense.pcmnAccount || PCMN_ACCOUNTS.DEFAULT_PURCHASE,
    };

    this.suppliers.set(key, record);
    return record;
  }

  allCustomers(): CustomerMasterRecord[] {
    return Array.from(this.customers.values());
  }

  allSuppliers(): SupplierMasterRecord[] {
    return Array.from(this.suppliers.values());
  }
}

/** Maps a free-text country label to its ISO 3166-1 alpha-2 code. */
function resolveCountryCode(country: string | undefined | null): string {
  const raw = (country ?? '').trim();
  if (!raw) return 'BE';
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const table: Record<string, string> = {
    belgique: 'BE', belgie: 'BE', belgium: 'BE', belgien: 'BE',
    france: 'FR',
    'pays-bas': 'NL', nederland: 'NL', netherlands: 'NL', 'pays bas': 'NL',
    allemagne: 'DE', duitsland: 'DE', germany: 'DE', deutschland: 'DE',
    luxembourg: 'LU', luxemburg: 'LU',
    espagne: 'ES', spain: 'ES',
    italie: 'IT', italy: 'IT',
  };
  return table[normalized] ?? 'BE';
}

/* ==========================================================================
 * SECTION 5 — VAT CODE RESOLUTION PER TARGET PLATFORM
 * ========================================================================== */

/** Resolves the WinBooks VAT code for a sales line. */
function winbooksSalesVatCode(regime: BelgianVatRegime, rate: BelgianVatRate): string {
  switch (regime) {
    case 'standard_21': return WINBOOKS_VAT_CODES.SALES_21;
    case 'reduced_12':
    case 'reduced_6': return WINBOOKS_VAT_CODES.SALES_REDUCED;
    case 'cocontractant_art20': return WINBOOKS_VAT_CODES.SALES_COCONTRACTANT;
    case 'intracommunity_art39bis': return WINBOOKS_VAT_CODES.SALES_INTRACOM_GOODS;
    case 'intracommunity_service_art21': return WINBOOKS_VAT_CODES.SALES_INTRACOM_SERVICES;
    case 'export_art39': return WINBOOKS_VAT_CODES.SALES_EXPORT;
    case 'exempt_art44':
    case 'small_business_art56bis': return WINBOOKS_VAT_CODES.SALES_EXEMPT;
    case 'zero_0': return rate === 0 ? WINBOOKS_VAT_CODES.SALES_ZERO : WINBOOKS_VAT_CODES.SALES_21;
    default: return WINBOOKS_VAT_CODES.SALES_21;
  }
}

/** Resolves the WinBooks VAT code for a purchase line. */
function winbooksPurchaseVatCode(expense: PurchaseExpense): string {
  if (expense.pcmnAccount.startsWith('2')) return WINBOOKS_VAT_CODES.PURCHASE_INVESTMENT;
  if (expense.vatRate === 0) return WINBOOKS_VAT_CODES.PURCHASE_NON_DEDUCTIBLE;
  return WINBOOKS_VAT_CODES.PURCHASE_GOODS_SERVICES;
}

/** Resolves the Sage BOB 50 VAT regime code for a sales line. */
function bobSalesVatCode(regime: BelgianVatRegime, rate: BelgianVatRate): string {
  switch (regime) {
    case 'standard_21': return BOB_VAT_CODES.SALES_21;
    case 'reduced_12': return BOB_VAT_CODES.SALES_12;
    case 'reduced_6': return BOB_VAT_CODES.SALES_6;
    case 'cocontractant_art20': return BOB_VAT_CODES.SALES_COCONTRACTANT;
    case 'intracommunity_art39bis':
    case 'intracommunity_service_art21': return BOB_VAT_CODES.SALES_INTRACOM;
    case 'export_art39': return BOB_VAT_CODES.SALES_EXPORT;
    case 'zero_0':
    case 'exempt_art44':
    case 'small_business_art56bis': return BOB_VAT_CODES.SALES_0;
    default: return rate === 21 ? BOB_VAT_CODES.SALES_21 : BOB_VAT_CODES.SALES_0;
  }
}

/** Resolves the Exact Online Belgium VAT code for a sales line. */
function exactSalesVatCode(regime: BelgianVatRegime, rate: BelgianVatRate): string {
  switch (regime) {
    case 'standard_21': return EXACT_ONLINE_VAT_CODES.SALES_21;
    case 'reduced_12': return EXACT_ONLINE_VAT_CODES.SALES_12;
    case 'reduced_6': return EXACT_ONLINE_VAT_CODES.SALES_6;
    case 'cocontractant_art20': return EXACT_ONLINE_VAT_CODES.SALES_COCONTRACTANT;
    case 'intracommunity_art39bis': return EXACT_ONLINE_VAT_CODES.SALES_INTRACOM_GOODS;
    case 'intracommunity_service_art21': return EXACT_ONLINE_VAT_CODES.SALES_INTRACOM_SERVICES;
    case 'export_art39': return EXACT_ONLINE_VAT_CODES.SALES_EXPORT;
    default: return rate === 21 ? EXACT_ONLINE_VAT_CODES.SALES_21 : EXACT_ONLINE_VAT_CODES.SALES_0;
  }
}

/** Resolves the Exact Online Belgium VAT code for a purchase line. */
function exactPurchaseVatCode(rate: BelgianVatRate): string {
  switch (rate) {
    case 21: return EXACT_ONLINE_VAT_CODES.PURCHASE_21;
    case 12: return EXACT_ONLINE_VAT_CODES.PURCHASE_12;
    case 6: return EXACT_ONLINE_VAT_CODES.PURCHASE_6;
    default: return EXACT_ONLINE_VAT_CODES.PURCHASE_0;
  }
}

/**
 * Maps a Belgian VAT regime to its official VAT-return grid (grille/rooster),
 * as required by WinBooks, BOB and Horus for automatic declaration build-up.
 */
export function resolveVatGridForRegime(regime: BelgianVatRegime): string {
  switch (regime) {
    case 'standard_21': return '03';
    case 'reduced_12': return '02';
    case 'reduced_6': return '01';
    case 'zero_0': return '00';
    case 'cocontractant_art20': return '45';
    case 'intracommunity_art39bis': return '46';
    case 'intracommunity_service_art21': return '44';
    case 'export_art39':
    case 'exempt_art44':
    case 'small_business_art56bis': return '47';
    default: return '03';
  }
}

/** `true` when the regime shifts VAT liability to the customer. */
export function isReverseCharge(regime: BelgianVatRegime): boolean {
  return (
    regime === 'cocontractant_art20' ||
    regime === 'intracommunity_art39bis' ||
    regime === 'intracommunity_service_art21'
  );
}

/* ==========================================================================
 * SECTION 6 — CANONICAL LEDGER CONSTRUCTION (BELGIAN DOUBLE ENTRY)
 * ========================================================================== */

/** Creates a debit leg. */
function debitLine(
  account: string,
  accountLabel: string,
  value: number,
  comment: string,
  extra: Partial<LedgerLine> = {},
): LedgerLine {
  const signed = round2(value);
  // A negative debit is expressed as a credit to keep every leg non-negative.
  if (signed < 0) {
    return { account, accountLabel, side: 'C', debit: 0, credit: round2(-signed), comment, ...extra };
  }
  return { account, accountLabel, side: 'D', debit: signed, credit: 0, comment, ...extra };
}

/** Creates a credit leg. */
function creditLine(
  account: string,
  accountLabel: string,
  value: number,
  comment: string,
  extra: Partial<LedgerLine> = {},
): LedgerLine {
  const signed = round2(value);
  if (signed < 0) {
    return { account, accountLabel, side: 'D', debit: round2(-signed), credit: 0, comment, ...extra };
  }
  return { account, accountLabel, side: 'C', debit: 0, credit: signed, comment, ...extra };
}

/**
 * Builds the sales-daybook entry for one invoice or credit note.
 *
 * Belgian double-entry schema (facture de vente) :
 *   D 400000 Client .................. Total TVAC
 *     C 700000 Ventes ................ Base HTVA (par ligne / par compte PCMN)
 *     C 451000 TVA due ............... Montant TVA
 *
 * Credit notes reverse every leg (the caller flags `isCreditNote`).
 */
function buildSalesEntry(
  invoice: Invoice,
  customer: CustomerMasterRecord,
  entryNumber: number,
  journal: BelgianJournalCode,
  fiscalYear: number,
): LedgerJournalEntry {
  const sign = invoice.type === 'credit_note' ? -1 : 1;
  const lines: LedgerLine[] = [];
  const comment = `${invoice.type === 'credit_note' ? 'NC' : 'FV'} ${invoice.invoiceNumber} — ${asciiSafe(invoice.client.name)}`;

  // 1. Debit the customer subsidiary account for the full VAT-inclusive amount.
  lines.push(
    debitLine(
      customer.account,
      `Client — ${invoice.client.name}`,
      sign * invoice.totalInclVat,
      comment,
      { analyticCode: undefined },
    ),
  );

  // 2. Credit each revenue account, grouped by PCMN account + VAT regime.
  const revenueBuckets = new Map<string, { base: number; line: InvoiceLine }>();
  for (const line of invoice.lines) {
    const account = line.pcmnAccount || PCMN_ACCOUNTS.DEFAULT_SALES;
    const key = `${account}|${line.vatRegime}|${line.vatRate}`;
    const bucket = revenueBuckets.get(key);
    if (bucket) {
      bucket.base += line.totalExclVat;
    } else {
      revenueBuckets.set(key, { base: line.totalExclVat, line });
    }
  }

  for (const [key, bucket] of revenueBuckets) {
    const account = key.split('|')[0] ?? PCMN_ACCOUNTS.DEFAULT_SALES;
    lines.push(
      creditLine(account, `Ventes — compte ${account}`, sign * bucket.base, comment, {
        vatBase: round2(sign * bucket.base),
        vatRate: bucket.line.vatRate,
        vatRegime: bucket.line.vatRegime,
        vatCode: winbooksSalesVatCode(bucket.line.vatRegime, bucket.line.vatRate),
      }),
    );
  }

  // 3. Credit the VAT-payable account (skipped for reverse-charge-only invoices).
  if (round2(invoice.totalVatAmount) !== 0) {
    lines.push(
      creditLine(
        PCMN_ACCOUNTS.VAT_PAYABLE,
        'TVA due — opérations à la sortie',
        sign * invoice.totalVatAmount,
        `TVA ${comment}`,
        { vatBase: round2(sign * invoice.subtotalExclVat) },
      ),
    );
  }

  return {
    id: `SALE-${invoice.id}`,
    journal,
    entryNumber,
    date: invoice.date,
    dueDate: invoice.dueDate,
    period: periodFromDate(invoice.date),
    fiscalYear: yearFromDate(invoice.date, fiscalYear),
    documentNumber: invoice.invoiceNumber,
    thirdPartyAccount: customer.account,
    thirdPartyName: invoice.client.name,
    thirdPartyVat: customer.vatNumber,
    structuredCommunication: ogmDigits(invoice.structuredCommunication) || undefined,
    lines,
    totalInclVat: round2(sign * invoice.totalInclVat),
    totalExclVat: round2(sign * invoice.subtotalExclVat),
    totalVat: round2(sign * invoice.totalVatAmount),
    isCreditNote: invoice.type === 'credit_note',
    currency: 'EUR',
  };
}

/**
 * Builds the purchase-daybook entry for one expense.
 *
 * Belgian double-entry schema (facture d'achat) :
 *   D 6xxxxx Charge ......................... Base HTVA
 *   D 411000 TVA déductible ................. Part TVA récupérable
 *   D 6xxxxx Charge (TVA non déductible) .... Part TVA non récupérable
 *     C 440000 Fournisseur .................. Total TVAC
 *
 * Non-deductible VAT (e.g. 50 % on restaurant, 50 % on car fuel) is Belgian
 * law: it is *not* booked on 411000 but capitalised into the expense account,
 * which is exactly what a fiduciary expects to receive.
 */
function buildPurchaseEntry(
  expense: PurchaseExpense,
  supplier: SupplierMasterRecord,
  entryNumber: number,
  journal: BelgianJournalCode,
  fiscalYear: number,
): LedgerJournalEntry {
  const lines: LedgerLine[] = [];
  const comment = `FA ${expense.invoiceNumber} — ${asciiSafe(expense.supplierName)}`;
  const expenseAccount = expense.pcmnAccount || PCMN_ACCOUNTS.DEFAULT_PURCHASE;

  const deductibleVat = round2(expense.deductibleVat);
  const nonDeductibleVat = round2(expense.nonDeductibleVat);

  // 1. Debit the expense / asset account for the VAT-excluded base.
  lines.push(
    debitLine(expenseAccount, `Charge — compte ${expenseAccount}`, expense.amountExclVat, comment, {
      vatBase: round2(expense.amountExclVat),
      vatRate: expense.vatRate,
      vatCode: winbooksPurchaseVatCode(expense),
      analyticCode: expense.category ? asciiSafe(expense.category).slice(0, 10).toUpperCase() : undefined,
    }),
  );

  // 2. Debit the deductible portion of the input VAT.
  if (deductibleVat !== 0) {
    lines.push(
      debitLine(
        PCMN_ACCOUNTS.VAT_DEDUCTIBLE,
        'TVA déductible sur achats',
        deductibleVat,
        `TVA déd. ${comment}`,
        { vatBase: round2(expense.amountExclVat), vatRate: expense.vatRate },
      ),
    );
  }

  // 3. Capitalise the non-deductible VAT into the expense account (DNA).
  if (nonDeductibleVat !== 0) {
    lines.push(
      debitLine(
        expenseAccount,
        `TVA non déductible — compte ${expenseAccount}`,
        nonDeductibleVat,
        `TVA non déd. (${expense.deductibleVatRate}%) ${comment}`,
      ),
    );
  }

  // 4. Credit the supplier subsidiary account for the total payable.
  lines.push(
    creditLine(
      supplier.account,
      `Fournisseur — ${expense.supplierName}`,
      expense.amountInclVat,
      comment,
    ),
  );

  return {
    id: `PURCHASE-${expense.id}`,
    journal,
    entryNumber,
    date: expense.date,
    dueDate: expense.dueDate,
    period: periodFromDate(expense.date),
    fiscalYear: yearFromDate(expense.date, fiscalYear),
    documentNumber: expense.invoiceNumber,
    thirdPartyAccount: supplier.account,
    thirdPartyName: expense.supplierName,
    thirdPartyVat: supplier.vatNumber,
    structuredCommunication: ogmDigits(expense.structuredCommunication) || undefined,
    lines,
    totalInclVat: round2(expense.amountInclVat),
    totalExclVat: round2(expense.amountExclVat),
    totalVat: round2(expense.vatAmount),
    isCreditNote: false,
    currency: 'EUR',
  };
}

/** Internal aggregate produced by {@link buildLedger}. */
interface BuiltLedger {
  entries: LedgerJournalEntry[];
  customers: CustomerMasterRecord[];
  suppliers: SupplierMasterRecord[];
  salesEntries: LedgerJournalEntry[];
  purchaseEntries: LedgerJournalEntry[];
}

/** `true` when the document falls inside the requested period filter. */
function matchesPeriod(isoDate: string, filter: string | undefined): boolean {
  if (!filter) return true;
  const date = isoDate ?? '';
  const quarterMatch = /^(\d{4})-Q([1-4])$/i.exec(filter);
  if (quarterMatch) {
    const [, yearStr = '', quarterStr = ''] = quarterMatch;
    const month = parseInt(date.slice(5, 7), 10);
    if (date.slice(0, 4) !== yearStr || !Number.isFinite(month)) return false;
    const quarter = Math.ceil(month / 3);
    return quarter === parseInt(quarterStr, 10);
  }
  return date.startsWith(filter);
}

/**
 * Converts BRABO business documents into the canonical Belgian ledger.
 * Cancelled invoices and quotes are excluded — they carry no accounting value.
 */
export function buildLedger(
  invoices: Invoice[],
  purchases: PurchaseExpense[],
  options: FiduciaryExportOptions = {},
): BuiltLedger {
  const fiscalYear = options.fiscalYear ?? new Date().getFullYear();
  const salesJournal = options.salesJournalCode ?? 'VEN';
  const purchaseJournal = options.purchaseJournalCode ?? 'ACH';
  const thirdParties = new ThirdPartyLedger();

  const salesEntries: LedgerJournalEntry[] = [];
  const purchaseEntries: LedgerJournalEntry[] = [];

  const eligibleInvoices = invoices
    .filter((inv) => inv.type !== 'quote' && inv.status !== 'cancelled')
    .filter((inv) => matchesPeriod(inv.date, options.periodFilter))
    .slice()
    .sort((a, b) => (a.date === b.date ? a.invoiceNumber.localeCompare(b.invoiceNumber) : a.date.localeCompare(b.date)));

  eligibleInvoices.forEach((invoice, index) => {
    const customer = thirdParties.registerCustomer(invoice.client);
    salesEntries.push(buildSalesEntry(invoice, customer, index + 1, salesJournal, fiscalYear));
  });

  const eligiblePurchases = purchases
    .filter((exp) => matchesPeriod(exp.date, options.periodFilter))
    .slice()
    .sort((a, b) => (a.date === b.date ? a.invoiceNumber.localeCompare(b.invoiceNumber) : a.date.localeCompare(b.date)));

  eligiblePurchases.forEach((expense, index) => {
    const supplier = thirdParties.registerSupplier(expense);
    purchaseEntries.push(buildPurchaseEntry(expense, supplier, index + 1, purchaseJournal, fiscalYear));
  });

  return {
    entries: [...salesEntries, ...purchaseEntries],
    customers: thirdParties.allCustomers(),
    suppliers: thirdParties.allSuppliers(),
    salesEntries,
    purchaseEntries,
  };
}

/* ==========================================================================
 * SECTION 7 — DOUBLE-ENTRY BALANCING VERIFICATION
 * ========================================================================== */

/** Tolerance in EUR — Belgian bookkeeping balances to the cent. */
const BALANCE_TOLERANCE = 0.005;

/**
 * Verifies Belgian double-entry integrity over a ledger batch.
 *
 * Asserts, for every entry **and** for the batch as a whole:
 *   Σ Debits === Σ Credits
 *
 * Additionally audits structural soundness expected by fiduciary importers:
 *  - each leg carries an amount on exactly one side;
 *  - no negative amounts survive in the exported legs;
 *  - PCMN accounts are numeric and at least 3 digits;
 *  - every entry references a third-party (tiers) account;
 *  - sales entries expose an OGM (warning only — not legally mandatory).
 */
export function verifyLedgerBalance(entries: LedgerJournalEntry[]): LedgerBalanceReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unbalancedEntries: LedgerBalanceReport['unbalancedEntries'] = [];

  let totalDebits = 0;
  let totalCredits = 0;
  let lineCount = 0;

  for (const entry of entries) {
    let entryDebits = 0;
    let entryCredits = 0;

    if (entry.lines.length === 0) {
      errors.push(`[${entry.journal}/${entry.documentNumber}] Écriture sans ligne comptable.`);
    }

    for (const line of entry.lines) {
      lineCount += 1;

      if (line.debit < 0 || line.credit < 0) {
        errors.push(
          `[${entry.journal}/${entry.documentNumber}] Compte ${line.account} : montant négatif interdit (D ${line.debit} / C ${line.credit}).`,
        );
      }
      if (line.debit > 0 && line.credit > 0) {
        errors.push(
          `[${entry.journal}/${entry.documentNumber}] Compte ${line.account} : une ligne ne peut être simultanément au débit et au crédit.`,
        );
      }
      if (line.debit === 0 && line.credit === 0) {
        warnings.push(
          `[${entry.journal}/${entry.documentNumber}] Compte ${line.account} : ligne à montant nul ignorée par la fiduciaire.`,
        );
      }
      if (!/^\d{3,10}$/.test(line.account)) {
        errors.push(
          `[${entry.journal}/${entry.documentNumber}] Compte PCMN invalide « ${line.account} » (numérique, 3 à 10 chiffres attendus).`,
        );
      }
      if ((line.side === 'D') !== line.debit > 0 && (line.debit > 0 || line.credit > 0)) {
        errors.push(
          `[${entry.journal}/${entry.documentNumber}] Compte ${line.account} : le sens « ${line.side} » ne correspond pas aux montants.`,
        );
      }

      entryDebits += line.debit;
      entryCredits += line.credit;
    }

    entryDebits = round2(entryDebits);
    entryCredits = round2(entryCredits);
    const entryDifference = round2(entryDebits - entryCredits);

    if (Math.abs(entryDifference) > BALANCE_TOLERANCE) {
      unbalancedEntries.push({
        id: entry.id,
        journal: entry.journal,
        documentNumber: entry.documentNumber,
        debits: entryDebits,
        credits: entryCredits,
        difference: entryDifference,
      });
      errors.push(
        `[${entry.journal}/${entry.documentNumber}] Écriture déséquilibrée : débits ${amount2(entryDebits)} € ≠ crédits ${amount2(entryCredits)} € (écart ${amount2(entryDifference)} €).`,
      );
    }

    if (!entry.thirdPartyAccount) {
      errors.push(`[${entry.journal}/${entry.documentNumber}] Compte de tiers manquant.`);
    }
    if (entry.journal === 'VEN' && !entry.structuredCommunication) {
      warnings.push(
        `[${entry.journal}/${entry.documentNumber}] Communication structurée (OGM) absente — rapprochement bancaire automatique dégradé.`,
      );
    }
    if (!entry.thirdPartyVat) {
      warnings.push(
        `[${entry.journal}/${entry.documentNumber}] Numéro de TVA du tiers absent — contrôle du listing annuel impossible.`,
      );
    }

    totalDebits += entryDebits;
    totalCredits += entryCredits;
  }

  totalDebits = round2(totalDebits);
  totalCredits = round2(totalCredits);
  const difference = round2(totalDebits - totalCredits);

  if (Math.abs(difference) > BALANCE_TOLERANCE) {
    errors.push(
      `Balance générale déséquilibrée : total débits ${amount2(totalDebits)} € ≠ total crédits ${amount2(totalCredits)} € (écart ${amount2(difference)} €).`,
    );
  }

  return {
    isBalanced: Math.abs(difference) <= BALANCE_TOLERANCE && unbalancedEntries.length === 0,
    totalDebits,
    totalCredits,
    difference,
    entryCount: entries.length,
    lineCount,
    unbalancedEntries,
    errors,
    warnings,
  };
}

/**
 * Hard assertion wrapper — throws when the ledger violates Belgian
 * double-entry rules. Use before transmitting an export to a fiduciary.
 *
 * @throws {Error} when Sum(Debits) !== Sum(Credits) or a structural error exists.
 */
export function assertLedgerBalanced(entries: LedgerJournalEntry[]): LedgerBalanceReport {
  const report = verifyLedgerBalance(entries);
  if (!report.isBalanced || report.errors.length > 0) {
    throw new Error(
      `BRABO — Contrôle de la partie double échoué : ${report.errors.length} erreur(s). ` +
        `Débits ${amount2(report.totalDebits)} € / Crédits ${amount2(report.totalCredits)} € ` +
        `(écart ${amount2(report.difference)} €).\n- ${report.errors.join('\n- ')}`,
    );
  }
  return report;
}

/* ==========================================================================
 * SECTION 8 — GENERATOR 1 : SAGE BOB 50 / BOB EXPERT (ASCII)
 * ========================================================================== */

/**
 * Sage BOB 50 ASCII import uses four semicolon-delimited files placed in the
 * dossier's import folder. Field order follows the "Importation de données
 * ASCII" specification of BOB 50 / BOB Expert.
 */

/** Generates `FicVen.txt` — sales daybook movements. */
export function generateBobFicVen(
  entries: LedgerJournalEntry[],
  company: CompanyProfile,
): FiduciaryFile {
  const rows: string[] = [];
  // Header comment lines are tolerated by BOB when prefixed with '#'.
  rows.push(`#BOB50;FICVEN;${digitsOnly(company.bceNumber)};${dateDDMMYYYY(new Date().toISOString().slice(0, 10))};BRABO`);
  rows.push(
    '#DBK;DOCNUM;DOCDATE;DUEDATE;PERIOD;BOOKYEAR;CACCOUNT;CNAME;CVAT;ACCOUNT;VATCODE;VATBASE;VATAMOUNT;DEBIT;CREDIT;AMOUNTVAT;COMMENT;COMMSTRUCT',
  );

  for (const entry of entries) {
    for (const line of entry.lines) {
      rows.push(
        [
          fixed(entry.journal, 3),
          asciiSafe(entry.documentNumber).slice(0, 15),
          dateDDMMYYYY(entry.date),
          dateDDMMYYYY(entry.dueDate),
          entry.period,
          String(entry.fiscalYear),
          entry.thirdPartyAccount,
          asciiSafe(entry.thirdPartyName).slice(0, 40),
          entry.thirdPartyVat,
          line.account,
          line.vatRegime ? bobSalesVatCode(line.vatRegime, line.vatRate ?? 21) : '',
          line.vatBase !== undefined ? amountComma(line.vatBase) : '',
          line.vatRate !== undefined ? String(line.vatRate) : '',
          amountComma(line.debit),
          amountComma(line.credit),
          amountComma(entry.totalVat),
          asciiSafe(line.comment).slice(0, 40),
          entry.structuredCommunication ?? '',
        ].join(';'),
      );
    }
  }

  return {
    filename: 'FicVen.txt',
    content: crlf(rows),
    mimeType: 'text/plain;charset=windows-1252',
    encoding: 'windows-1252',
    description: 'Sage BOB 50 — Journal des ventes (mouvements ASCII)',
    recordCount: entries.reduce((acc, e) => acc + e.lines.length, 0),
  };
}

/** Generates `FicAch.txt` — purchase daybook movements. */
export function generateBobFicAch(
  entries: LedgerJournalEntry[],
  company: CompanyProfile,
): FiduciaryFile {
  const rows: string[] = [];
  rows.push(`#BOB50;FICACH;${digitsOnly(company.bceNumber)};${dateDDMMYYYY(new Date().toISOString().slice(0, 10))};BRABO`);
  rows.push(
    '#DBK;DOCNUM;DOCDATE;DUEDATE;PERIOD;BOOKYEAR;SACCOUNT;SNAME;SVAT;ACCOUNT;VATCODE;VATBASE;VATRATE;DEBIT;CREDIT;DEDUCT;COMMENT;COMMSTRUCT',
  );

  for (const entry of entries) {
    for (const line of entry.lines) {
      rows.push(
        [
          fixed(entry.journal, 3),
          asciiSafe(entry.documentNumber).slice(0, 15),
          dateDDMMYYYY(entry.date),
          dateDDMMYYYY(entry.dueDate),
          entry.period,
          String(entry.fiscalYear),
          entry.thirdPartyAccount,
          asciiSafe(entry.thirdPartyName).slice(0, 40),
          entry.thirdPartyVat,
          line.account,
          line.vatCode ?? '',
          line.vatBase !== undefined ? amountComma(line.vatBase) : '',
          line.vatRate !== undefined ? String(line.vatRate) : '',
          amountComma(line.debit),
          amountComma(line.credit),
          line.account === PCMN_ACCOUNTS.VAT_DEDUCTIBLE ? '100' : '',
          asciiSafe(line.comment).slice(0, 40),
          entry.structuredCommunication ?? '',
        ].join(';'),
      );
    }
  }

  return {
    filename: 'FicAch.txt',
    content: crlf(rows),
    mimeType: 'text/plain;charset=windows-1252',
    encoding: 'windows-1252',
    description: 'Sage BOB 50 — Journal des achats (mouvements ASCII)',
    recordCount: entries.reduce((acc, e) => acc + e.lines.length, 0),
  };
}

/** Generates `FicCli.txt` — customer master data (fichier signalétique clients). */
export function generateBobFicCli(customers: CustomerMasterRecord[]): FiduciaryFile {
  const rows: string[] = [];
  rows.push('#BOB50;FICCLI;SIGNALETIQUE CLIENTS;BRABO');
  rows.push('#CACCOUNT;CNAME;ADDRESS;ZIPCODE;CITY;COUNTRY;VATNUMBER;LANG;IBAN;BIC;EMAIL;PHONE;PAYDELAY;CENTRAL');

  for (const c of customers) {
    rows.push(
      [
        c.account,
        asciiSafe(c.name).slice(0, 40),
        asciiSafe(c.street).slice(0, 40),
        asciiSafe(c.postalCode).slice(0, 10),
        asciiSafe(c.city).slice(0, 30),
        c.countryCode,
        c.vatNumber,
        c.language,
        c.iban,
        c.bic,
        asciiSafe(c.email).slice(0, 50),
        asciiSafe(c.phone).slice(0, 20),
        String(c.paymentTermsDays),
        c.centralAccount,
      ].join(';'),
    );
  }

  return {
    filename: 'FicCli.txt',
    content: crlf(rows),
    mimeType: 'text/plain;charset=windows-1252',
    encoding: 'windows-1252',
    description: 'Sage BOB 50 — Signalétique clients (comptes 400000)',
    recordCount: customers.length,
  };
}

/** Generates `FicFou.txt` — supplier master data (fichier signalétique fournisseurs). */
export function generateBobFicFou(suppliers: SupplierMasterRecord[]): FiduciaryFile {
  const rows: string[] = [];
  rows.push('#BOB50;FICFOU;SIGNALETIQUE FOURNISSEURS;BRABO');
  rows.push('#SACCOUNT;SNAME;VATNUMBER;COUNTRY;LANG;IBAN;CENTRAL;DEFAULTACCOUNT');

  for (const s of suppliers) {
    rows.push(
      [
        s.account,
        asciiSafe(s.name).slice(0, 40),
        s.vatNumber,
        s.countryCode,
        s.language,
        s.iban,
        s.centralAccount,
        s.defaultExpenseAccount,
      ].join(';'),
    );
  }

  return {
    filename: 'FicFou.txt',
    content: crlf(rows),
    mimeType: 'text/plain;charset=windows-1252',
    encoding: 'windows-1252',
    description: 'Sage BOB 50 — Signalétique fournisseurs (comptes 440000)',
    recordCount: suppliers.length,
  };
}

/** Builds the complete Sage BOB 50 / Expert ASCII file set. */
export function generateSageBob50Package(
  ledger: BuiltLedger,
  company: CompanyProfile,
  includeMasterData: boolean,
): FiduciaryFile[] {
  const files: FiduciaryFile[] = [
    generateBobFicVen(ledger.salesEntries, company),
    generateBobFicAch(ledger.purchaseEntries, company),
  ];
  if (includeMasterData) {
    files.push(generateBobFicCli(ledger.customers));
    files.push(generateBobFicFou(ledger.suppliers));
  }
  return files;
}

/* ==========================================================================
 * SECTION 9 — GENERATOR 2 : WINBOOKS (XML / WBF / ASCII)
 * ========================================================================== */

/**
 * WinBooks accepts three interchange shapes. BRABO emits all three so the
 * fiduciary can pick whichever its WinBooks Classic / on Web dossier expects:
 *   - `*.xml`  : modern structured import (WinBooks on Web);
 *   - `*.wbf`  : WinBooks Financial exchange descriptor;
 *   - `ACT.txt`/`ANT.txt` : legacy ASCII (table ACT = mouvements, ANT = tiers).
 */

/** Generates the WinBooks structured XML import. */
export function generateWinbooksXml(
  ledger: BuiltLedger,
  company: CompanyProfile,
  fiscalYear: number,
): FiduciaryFile {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<WinBooksImport xmlns="http://www.winbooks.be/schemas/import/v2" Version="2.0" Producer="BRABO Belgian Accounting Platform">');
  parts.push('  <Dossier>');
  parts.push(`    <Name>${escapeXml(company.name)}</Name>`);
  parts.push(`    <VatNumber>${escapeXml(normalizeVat(company.vatNumber || company.bceNumber))}</VatNumber>`);
  parts.push(`    <EnterpriseNumber>${escapeXml(digitsOnly(company.bceNumber))}</EnterpriseNumber>`);
  parts.push(`    <BookYear>${fiscalYear}</BookYear>`);
  parts.push('    <Currency>EUR</Currency>');
  parts.push(`    <ExportDate>${new Date().toISOString()}</ExportDate>`);
  parts.push('  </Dossier>');

  // --- Journal definitions -------------------------------------------------
  parts.push('  <Journals>');
  for (const code of ['VEN', 'ACH', 'BQ1'] as BelgianJournalCode[]) {
    const journal = BELGIAN_JOURNALS[code];
    parts.push(
      `    <Journal Code="${code}" Type="${journal.type}"><Label>${escapeXml(journal.label)}</Label></Journal>`,
    );
  }
  parts.push('  </Journals>');

  // --- Customer master data (400000) --------------------------------------
  parts.push('  <Customers CentralAccount="400000">');
  for (const c of ledger.customers) {
    parts.push('    <Customer>');
    parts.push(`      <Number>${escapeXml(c.account)}</Number>`);
    parts.push(`      <Name1>${escapeXml(c.name)}</Name1>`);
    parts.push(`      <VatNumber>${escapeXml(c.vatNumber)}</VatNumber>`);
    parts.push(`      <Address1>${escapeXml(c.street)}</Address1>`);
    parts.push(`      <ZipCode>${escapeXml(c.postalCode)}</ZipCode>`);
    parts.push(`      <City>${escapeXml(c.city)}</City>`);
    parts.push(`      <CountryCode>${escapeXml(c.countryCode)}</CountryCode>`);
    parts.push(`      <Language>${escapeXml(c.language)}</Language>`);
    parts.push(`      <Email>${escapeXml(c.email)}</Email>`);
    parts.push(`      <Iban>${escapeXml(c.iban)}</Iban>`);
    parts.push(`      <CentralAccount>${escapeXml(c.centralAccount)}</CentralAccount>`);
    parts.push('    </Customer>');
  }
  parts.push('  </Customers>');

  // --- Supplier master data (440000) --------------------------------------
  parts.push('  <Suppliers CentralAccount="440000">');
  for (const s of ledger.suppliers) {
    parts.push('    <Supplier>');
    parts.push(`      <Number>${escapeXml(s.account)}</Number>`);
    parts.push(`      <Name1>${escapeXml(s.name)}</Name1>`);
    parts.push(`      <VatNumber>${escapeXml(s.vatNumber)}</VatNumber>`);
    parts.push(`      <CountryCode>${escapeXml(s.countryCode)}</CountryCode>`);
    parts.push(`      <Iban>${escapeXml(s.iban)}</Iban>`);
    parts.push(`      <CentralAccount>${escapeXml(s.centralAccount)}</CentralAccount>`);
    parts.push(`      <DefaultAccount>${escapeXml(s.defaultExpenseAccount)}</DefaultAccount>`);
    parts.push('    </Supplier>');
  }
  parts.push('  </Suppliers>');

  // --- Accounting movements ------------------------------------------------
  parts.push('  <Entries>');
  for (const entry of ledger.entries) {
    parts.push(`    <Entry DocType="${entry.journal === 'VEN' ? '1' : '2'}" Journal="${entry.journal}">`);
    parts.push(`      <DocNumber>${escapeXml(entry.documentNumber)}</DocNumber>`);
    parts.push(`      <DocOrder>${entry.entryNumber}</DocOrder>`);
    parts.push(`      <DateDoc>${dateCompact(entry.date)}</DateDoc>`);
    parts.push(`      <DateDue>${dateCompact(entry.dueDate)}</DateDue>`);
    parts.push(`      <Period>${escapeXml(entry.period.slice(4, 6))}</Period>`);
    parts.push(`      <BookYear>${entry.fiscalYear}</BookYear>`);
    parts.push(`      <ThirdPartyNumber>${escapeXml(entry.thirdPartyAccount)}</ThirdPartyNumber>`);
    parts.push(`      <ThirdPartyName>${escapeXml(entry.thirdPartyName)}</ThirdPartyName>`);
    parts.push(`      <ThirdPartyVat>${escapeXml(entry.thirdPartyVat)}</ThirdPartyVat>`);
    if (entry.structuredCommunication) {
      // WinBooks OGM tag — enables automatic CODA reconciliation.
      parts.push(`      <CommunicationType>101</CommunicationType>`);
      parts.push(`      <Communication>${escapeXml(entry.structuredCommunication)}</Communication>`);
      parts.push(`      <OGM>${escapeXml(formatOgmDisplay(entry.structuredCommunication))}</OGM>`);
    }
    parts.push(`      <AmountInclVat>${amount2(entry.totalInclVat)}</AmountInclVat>`);
    parts.push(`      <AmountExclVat>${amount2(entry.totalExclVat)}</AmountExclVat>`);
    parts.push(`      <VatAmount>${amount2(entry.totalVat)}</VatAmount>`);
    parts.push('      <Lines>');
    for (const line of entry.lines) {
      parts.push('        <Line>');
      parts.push(`          <Account>${escapeXml(line.account)}</Account>`);
      parts.push(`          <AccountLabel>${escapeXml(line.accountLabel)}</AccountLabel>`);
      parts.push(`          <Side>${line.side}</Side>`);
      parts.push(`          <AmountEur>${amount2(line.side === 'D' ? line.debit : -line.credit)}</AmountEur>`);
      parts.push(`          <Debit>${amount2(line.debit)}</Debit>`);
      parts.push(`          <Credit>${amount2(line.credit)}</Credit>`);
      if (line.vatCode) parts.push(`          <VatCode>${escapeXml(line.vatCode)}</VatCode>`);
      if (line.vatBase !== undefined) parts.push(`          <VatBase>${amount2(line.vatBase)}</VatBase>`);
      if (line.vatRegime) parts.push(`          <VatGrid>${escapeXml(resolveVatGridForRegime(line.vatRegime))}</VatGrid>`);
      if (line.analyticCode) parts.push(`          <AnalyticCode>${escapeXml(line.analyticCode)}</AnalyticCode>`);
      parts.push(`          <Comment>${escapeXml(line.comment)}</Comment>`);
      parts.push('        </Line>');
    }
    parts.push('      </Lines>');
    parts.push('    </Entry>');
  }
  parts.push('  </Entries>');

  const control = verifyLedgerBalance(ledger.entries);
  parts.push('  <ControlTotals>');
  parts.push(`    <EntryCount>${control.entryCount}</EntryCount>`);
  parts.push(`    <LineCount>${control.lineCount}</LineCount>`);
  parts.push(`    <TotalDebit>${amount2(control.totalDebits)}</TotalDebit>`);
  parts.push(`    <TotalCredit>${amount2(control.totalCredits)}</TotalCredit>`);
  parts.push(`    <Balanced>${control.isBalanced ? 'true' : 'false'}</Balanced>`);
  parts.push('  </ControlTotals>');
  parts.push('</WinBooksImport>');

  return {
    filename: `WINBOOKS_IMPORT_${digitsOnly(company.bceNumber)}_${fiscalYear}.xml`,
    content: parts.join('\n'),
    mimeType: 'application/xml;charset=utf-8',
    encoding: 'utf-8',
    description: 'WinBooks on Web — Import XML structuré (journaux VEN/ACH/BQ1)',
    recordCount: ledger.entries.length,
  };
}

/** Formats a 12-digit OGM payload as `+++123/4567/89012+++`. */
function formatOgmDisplay(raw: string): string {
  const d = digitsOnly(raw).padStart(12, '0').slice(-12);
  return `+++${d.slice(0, 3)}/${d.slice(3, 7)}/${d.slice(7, 12)}+++`;
}

/** Generates the WinBooks legacy ASCII movement table (`ACT.txt`). */
export function generateWinbooksAsciiAct(ledger: BuiltLedger): FiduciaryFile {
  const rows: string[] = [];
  // WinBooks ACT layout: one record per booking leg.
  rows.push(
    '#DOCTYPE;DBKCODE;DBKTYPE;DOCNUMBER;DOCORDER;OPCODE;ACCOUNTGL;ACCOUNTRP;BOOKYEAR;PERIOD;DATE;DATEDOC;DUEDATE;COMMENT;COMMLEVEL;AMOUNTEUR;VATBASE;VATCODE;CURRAMOUNT;CURRCODE;MATCHNO;OLDDATE;ISMATCHED;ISLOCKED;ISIMPORTED;ISPOSITIVE;ISTEMP;MEMOTYPE;ISDOC;DOCSTATUS;VATTAX;COMMTEXT',
  );

  for (const entry of ledger.entries) {
    const docType = entry.journal === 'VEN' ? '1' : entry.journal === 'ACH' ? '2' : '3';
    const dbkType = entry.journal === 'VEN' ? 'S' : entry.journal === 'ACH' ? 'A' : 'F';

    entry.lines.forEach((line, index) => {
      // Signed amount convention: debit positive, credit negative.
      const signedAmount = round2(line.debit - line.credit);
      const isThirdParty = line.account === entry.thirdPartyAccount;

      rows.push(
        [
          docType,
          entry.journal,
          dbkType,
          asciiSafe(entry.documentNumber).slice(0, 15),
          String(index + 1),
          isThirdParty ? '1' : '3', // 1 = ligne tiers, 3 = ligne d'imputation
          isThirdParty ? '' : line.account,
          isThirdParty ? line.account : '',
          String(entry.fiscalYear),
          entry.period.slice(4, 6),
          dateCompact(entry.date),
          dateCompact(entry.date),
          dateCompact(entry.dueDate),
          asciiSafe(line.comment).slice(0, 40),
          '0',
          amount2(signedAmount),
          line.vatBase !== undefined ? amount2(line.vatBase) : '0.00',
          line.vatCode ?? '',
          amount2(signedAmount),
          'EUR',
          '',
          '',
          'F',
          'F',
          'T',
          signedAmount >= 0 ? 'T' : 'F',
          'F',
          '0',
          'T',
          '0',
          line.vatRegime ? resolveVatGridForRegime(line.vatRegime) : '',
          entry.structuredCommunication ? formatOgmDisplay(entry.structuredCommunication) : '',
        ].join(';'),
      );
    });
  }

  return {
    filename: 'ACT.txt',
    content: crlf(rows),
    mimeType: 'text/plain;charset=windows-1252',
    encoding: 'windows-1252',
    description: 'WinBooks Classic — Table ACT (mouvements comptables ASCII)',
    recordCount: ledger.entries.reduce((acc, e) => acc + e.lines.length, 0),
  };
}

/** Generates the WinBooks legacy ASCII third-party table (`ANT.txt`). */
export function generateWinbooksAsciiAnt(ledger: BuiltLedger): FiduciaryFile {
  const rows: string[] = [];
  rows.push('#NUMBER;TYPE;NAME1;NAME2;ADRESS1;ZIPCODE;CITY;COUNTRY;VATNUMBER;LANG;CENTRAL;PAYDELAY;IBAN;BIC');

  for (const c of ledger.customers) {
    rows.push(
      [
        c.account, '1', asciiSafe(c.name).slice(0, 40), '', asciiSafe(c.street).slice(0, 40),
        c.postalCode, asciiSafe(c.city).slice(0, 30), c.countryCode, c.vatNumber, c.language,
        c.centralAccount, String(c.paymentTermsDays), c.iban, c.bic,
      ].join(';'),
    );
  }
  for (const s of ledger.suppliers) {
    rows.push(
      [
        s.account, '2', asciiSafe(s.name).slice(0, 40), '', '', '', '', s.countryCode,
        s.vatNumber, s.language, s.centralAccount, '30', s.iban, '',
      ].join(';'),
    );
  }

  return {
    filename: 'ANT.txt',
    content: crlf(rows),
    mimeType: 'text/plain;charset=windows-1252',
    encoding: 'windows-1252',
    description: 'WinBooks Classic — Table ANT (clients 400000 / fournisseurs 440000)',
    recordCount: ledger.customers.length + ledger.suppliers.length,
  };
}

/** Generates the WinBooks `.wbf` exchange descriptor. */
export function generateWinbooksWbf(
  ledger: BuiltLedger,
  company: CompanyProfile,
  fiscalYear: number,
): FiduciaryFile {
  const control = verifyLedgerBalance(ledger.entries);
  const rows: string[] = [];
  rows.push('[WINBOOKS FINANCIAL EXCHANGE]');
  rows.push('Version=2.0');
  rows.push('Producer=BRABO Belgian Accounting Platform');
  rows.push(`Created=${new Date().toISOString()}`);
  rows.push('');
  rows.push('[DOSSIER]');
  rows.push(`Name=${asciiSafe(company.name)}`);
  rows.push(`VatNumber=${normalizeVat(company.vatNumber || company.bceNumber)}`);
  rows.push(`Enterprise=${digitsOnly(company.bceNumber)}`);
  rows.push(`BookYear=${fiscalYear}`);
  rows.push('Currency=EUR');
  rows.push('');
  rows.push('[JOURNALS]');
  rows.push('VEN=Journal des ventes|SALES|400000');
  rows.push('ACH=Journal des achats|PURCHASE|440000');
  rows.push('BQ1=Journal financier banque|FINANCIAL|550000');
  rows.push('');
  rows.push('[VATCODES]');
  rows.push('211=Ventes taux normal 21%|21.00|03');
  rows.push('212=Ventes taux reduit 6/12%|6.00|01');
  rows.push('001=Achats biens et services deductibles|21.00|82');
  rows.push('003=Achats biens d investissement|21.00|83');
  rows.push('411=Cocontractant art.20 AR1|0.00|45');
  rows.push('461=Livraisons intracommunautaires art.39bis|0.00|46');
  rows.push('000=Hors champ / exonere|0.00|47');
  rows.push('');
  rows.push('[FILES]');
  rows.push('ACT=ACT.txt');
  rows.push('ANT=ANT.txt');
  rows.push('');
  rows.push('[CONTROL]');
  rows.push(`Entries=${control.entryCount}`);
  rows.push(`Lines=${control.lineCount}`);
  rows.push(`TotalDebit=${amount2(control.totalDebits)}`);
  rows.push(`TotalCredit=${amount2(control.totalCredits)}`);
  rows.push(`Balanced=${control.isBalanced ? 'YES' : 'NO'}`);

  return {
    filename: `${digitsOnly(company.bceNumber)}_${fiscalYear}.wbf`,
    content: crlf(rows),
    mimeType: 'text/plain;charset=windows-1252',
    encoding: 'windows-1252',
    description: 'WinBooks — Descripteur d\'échange WBF (dossier, journaux, codes TVA)',
    recordCount: 1,
  };
}

/** Builds the complete WinBooks package (XML + WBF + legacy ASCII). */
export function generateWinbooksPackage(
  ledger: BuiltLedger,
  company: CompanyProfile,
  fiscalYear: number,
): FiduciaryFile[] {
  return [
    generateWinbooksXml(ledger, company, fiscalYear),
    generateWinbooksWbf(ledger, company, fiscalYear),
    generateWinbooksAsciiAct(ledger),
    generateWinbooksAsciiAnt(ledger),
  ];
}

/* ==========================================================================
 * SECTION 10 — GENERATOR 3 : HORUS OFFICE / HORUS CLOUD (NATIVE XML BRIDGE)
 * ========================================================================== */

/**
 * Horus Software (Namur) — publisher of Horus Office, Horus Cloud and Falco —
 * exposes a native XML data-exchange envelope. The bridge below mirrors that
 * envelope: a `<HorusExchange>` root carrying a dossier identification block,
 * a chart-of-accounts delta, third parties and balanced journal entries.
 */
export function generateHorusXml(
  ledger: BuiltLedger,
  company: CompanyProfile,
  fiscalYear: number,
): FiduciaryFile {
  const control = verifyLedgerBalance(ledger.entries);
  const now = new Date().toISOString();

  // Collect the distinct PCMN accounts actually used, for the CoA delta.
  const usedAccounts = new Map<string, string>();
  for (const entry of ledger.entries) {
    for (const line of entry.lines) {
      if (!usedAccounts.has(line.account)) usedAccounts.set(line.account, line.accountLabel);
    }
  }

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<HorusExchange xmlns="http://www.horus.be/schemas/exchange/1.0"');
  parts.push('               SchemaVersion="1.0"');
  parts.push('               Product="HorusOffice|HorusCloud"');
  parts.push('               Origin="BRABO">');

  parts.push('  <Header>');
  parts.push(`    <MessageId>BRABO-HORUS-${digitsOnly(company.bceNumber)}-${dateCompact(now.slice(0, 10))}</MessageId>`);
  parts.push(`    <CreationDateTime>${now}</CreationDateTime>`);
  parts.push('    <SenderApplication>BRABO Belgian Accounting Platform</SenderApplication>');
  parts.push('    <ExchangeType>ACCOUNTING_ENTRIES</ExchangeType>');
  parts.push('    <CountryCode>BE</CountryCode>');
  parts.push('    <ChartOfAccounts>PCMN_MAR</ChartOfAccounts>');
  parts.push('  </Header>');

  parts.push('  <Dossier>');
  parts.push(`    <DossierName>${escapeXml(company.name)}</DossierName>`);
  parts.push(`    <LegalForm>${escapeXml(company.legalForm)}</LegalForm>`);
  parts.push(`    <EnterpriseNumber>${escapeXml(digitsOnly(company.bceNumber))}</EnterpriseNumber>`);
  parts.push(`    <VatNumber>${escapeXml(normalizeVat(company.vatNumber || company.bceNumber))}</VatNumber>`);
  parts.push(`    <RpmCity>${escapeXml(company.rpmCity)}</RpmCity>`);
  parts.push(`    <NaceBelCode>${escapeXml(company.naceBelCode)}</NaceBelCode>`);
  parts.push(`    <VatRegime>${escapeXml(company.vatRegime)}</VatRegime>`);
  parts.push(`    <BookYear Start="${fiscalYear}0101" End="${fiscalYear}1231">${fiscalYear}</BookYear>`);
  parts.push('    <Address>');
  parts.push(`      <Street>${escapeXml(`${company.street} ${company.number}`.trim())}</Street>`);
  parts.push(`      <PostalCode>${escapeXml(company.postalCode)}</PostalCode>`);
  parts.push(`      <City>${escapeXml(company.city)}</City>`);
  parts.push(`      <CountryCode>${escapeXml(resolveCountryCode(company.country))}</CountryCode>`);
  parts.push('    </Address>');
  parts.push('    <Fiduciary>');
  parts.push(`      <Name>${escapeXml(company.fiduciaryName)}</Name>`);
  parts.push(`      <ItaaNumber>${escapeXml(company.fiduciaryItaaNumber)}</ItaaNumber>`);
  parts.push(`      <Email>${escapeXml(company.fiduciaryEmail)}</Email>`);
  parts.push('    </Fiduciary>');
  parts.push('  </Dossier>');

  parts.push('  <ChartOfAccountsDelta>');
  for (const [account, label] of Array.from(usedAccounts.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    parts.push(
      `    <Account Number="${escapeXml(account)}" Class="${escapeXml(account.charAt(0))}" Type="${horusAccountType(account)}"><Label lang="FR">${escapeXml(label)}</Label></Account>`,
    );
  }
  parts.push('  </ChartOfAccountsDelta>');

  parts.push('  <ThirdParties>');
  for (const c of ledger.customers) {
    parts.push(`    <ThirdParty Type="CUSTOMER" Number="${escapeXml(c.account)}" Central="${escapeXml(c.centralAccount)}">`);
    parts.push(`      <Name>${escapeXml(c.name)}</Name>`);
    parts.push(`      <VatNumber>${escapeXml(c.vatNumber)}</VatNumber>`);
    parts.push(`      <EnterpriseNumber>${escapeXml(c.bceNumber)}</EnterpriseNumber>`);
    parts.push(`      <Street>${escapeXml(c.street)}</Street>`);
    parts.push(`      <PostalCode>${escapeXml(c.postalCode)}</PostalCode>`);
    parts.push(`      <City>${escapeXml(c.city)}</City>`);
    parts.push(`      <CountryCode>${escapeXml(c.countryCode)}</CountryCode>`);
    parts.push(`      <Email>${escapeXml(c.email)}</Email>`);
    parts.push(`      <Iban>${escapeXml(c.iban)}</Iban>`);
    parts.push('    </ThirdParty>');
  }
  for (const s of ledger.suppliers) {
    parts.push(`    <ThirdParty Type="SUPPLIER" Number="${escapeXml(s.account)}" Central="${escapeXml(s.centralAccount)}">`);
    parts.push(`      <Name>${escapeXml(s.name)}</Name>`);
    parts.push(`      <VatNumber>${escapeXml(s.vatNumber)}</VatNumber>`);
    parts.push(`      <EnterpriseNumber>${escapeXml(s.bceNumber)}</EnterpriseNumber>`);
    parts.push(`      <CountryCode>${escapeXml(s.countryCode)}</CountryCode>`);
    parts.push(`      <Iban>${escapeXml(s.iban)}</Iban>`);
    parts.push(`      <DefaultAccount>${escapeXml(s.defaultExpenseAccount)}</DefaultAccount>`);
    parts.push('    </ThirdParty>');
  }
  parts.push('  </ThirdParties>');

  parts.push('  <JournalEntries>');
  for (const entry of ledger.entries) {
    const entryDebit = round2(entry.lines.reduce((a, l) => a + l.debit, 0));
    const entryCredit = round2(entry.lines.reduce((a, l) => a + l.credit, 0));
    parts.push(
      `    <JournalEntry Journal="${escapeXml(entry.journal)}" Sequence="${entry.entryNumber}" BookYear="${entry.fiscalYear}" Period="${escapeXml(entry.period)}">`,
    );
    parts.push(`      <DocumentNumber>${escapeXml(entry.documentNumber)}</DocumentNumber>`);
    parts.push(`      <DocumentDate>${dateCompact(entry.date)}</DocumentDate>`);
    parts.push(`      <DueDate>${dateCompact(entry.dueDate)}</DueDate>`);
    parts.push(`      <DocumentType>${entry.isCreditNote ? 'CREDIT_NOTE' : entry.journal === 'VEN' ? 'SALES_INVOICE' : 'PURCHASE_INVOICE'}</DocumentType>`);
    parts.push(`      <ThirdPartyNumber>${escapeXml(entry.thirdPartyAccount)}</ThirdPartyNumber>`);
    parts.push(`      <ThirdPartyVat>${escapeXml(entry.thirdPartyVat)}</ThirdPartyVat>`);
    if (entry.structuredCommunication) {
      parts.push(`      <StructuredCommunication Type="BBA">${escapeXml(entry.structuredCommunication)}</StructuredCommunication>`);
    }
    parts.push(`      <Currency>${entry.currency}</Currency>`);
    parts.push('      <Bookings>');
    for (const line of entry.lines) {
      parts.push(
        `        <Booking Account="${escapeXml(line.account)}" Side="${line.side}" Debit="${amount2(line.debit)}" Credit="${amount2(line.credit)}"` +
          (line.vatCode ? ` VatCode="${escapeXml(line.vatCode)}"` : '') +
          (line.vatRegime ? ` VatGrid="${escapeXml(resolveVatGridForRegime(line.vatRegime))}"` : '') +
          (line.vatBase !== undefined ? ` VatBase="${amount2(line.vatBase)}"` : '') +
          (line.analyticCode ? ` Analytic="${escapeXml(line.analyticCode)}"` : '') +
          `><Description>${escapeXml(line.comment)}</Description></Booking>`,
      );
    }
    parts.push('      </Bookings>');
    parts.push(
      `      <EntryTotals Debit="${amount2(entryDebit)}" Credit="${amount2(entryCredit)}" Balanced="${Math.abs(entryDebit - entryCredit) <= BALANCE_TOLERANCE ? 'true' : 'false'}" />`,
    );
    parts.push('    </JournalEntry>');
  }
  parts.push('  </JournalEntries>');

  parts.push('  <Totals>');
  parts.push(`    <EntryCount>${control.entryCount}</EntryCount>`);
  parts.push(`    <BookingCount>${control.lineCount}</BookingCount>`);
  parts.push(`    <TotalDebit>${amount2(control.totalDebits)}</TotalDebit>`);
  parts.push(`    <TotalCredit>${amount2(control.totalCredits)}</TotalCredit>`);
  parts.push(`    <Difference>${amount2(control.difference)}</Difference>`);
  parts.push(`    <DoubleEntryValid>${control.isBalanced ? 'true' : 'false'}</DoubleEntryValid>`);
  parts.push('  </Totals>');
  parts.push('</HorusExchange>');

  return {
    filename: `HORUS_BRIDGE_${digitsOnly(company.bceNumber)}_${fiscalYear}.xml`,
    content: parts.join('\n'),
    mimeType: 'application/xml;charset=utf-8',
    encoding: 'utf-8',
    description: 'Horus Office / Horus Cloud — Bridge XML natif (API d\'échange Horus Software)',
    recordCount: ledger.entries.length,
  };
}

/** Classifies a PCMN account into the Horus account-type taxonomy. */
function horusAccountType(account: string): string {
  const cls = account.charAt(0);
  switch (cls) {
    case '1': return 'EQUITY';
    case '2': return 'FIXED_ASSET';
    case '3': return 'STOCK';
    case '4': return account.startsWith('40') ? 'RECEIVABLE' : account.startsWith('44') ? 'PAYABLE' : 'VAT';
    case '5': return 'FINANCIAL';
    case '6': return 'EXPENSE';
    case '7': return 'REVENUE';
    default: return 'OTHER';
  }
}

/* ==========================================================================
 * SECTION 11 — GENERATOR 4 : EXACT ONLINE BELGIUM (CSV & XML)
 * ========================================================================== */

/**
 * Exact Online Belgium ingests general-ledger transactions either through the
 * "Import transactions" CSV template or through the XML (Exact Globe/XML
 * Topics) envelope. Both use the Belgian PCMN chart of accounts.
 */

/** Generates the Exact Online Belgium general-ledger CSV. */
export function generateExactOnlineCsv(
  ledger: BuiltLedger,
  company: CompanyProfile,
): FiduciaryFile {
  const header = [
    'JournalCode', 'JournalDescription', 'EntryNumber', 'EntryDate', 'DueDate',
    'FinancialPeriod', 'FinancialYear', 'GLAccountCode', 'GLAccountDescription',
    'AccountCode', 'AccountName', 'AccountVATNumber', 'Description',
    'DebitAmount', 'CreditAmount', 'AmountDC', 'Currency',
    'VATCode', 'VATBaseAmount', 'VATPercentage', 'VATReturnBox',
    'YourRef', 'PaymentReference', 'CostCenter',
  ];

  const rows: string[] = [header.map(csvField).join(';')];

  for (const entry of ledger.entries) {
    for (const line of entry.lines) {
      const isSales = entry.journal === 'VEN';
      const vatCode =
        line.vatRegime !== undefined && isSales
          ? exactSalesVatCode(line.vatRegime, line.vatRate ?? 21)
          : line.vatRate !== undefined && !isSales
            ? exactPurchaseVatCode(line.vatRate)
            : '';

      rows.push(
        [
          entry.journal,
          BELGIAN_JOURNALS[entry.journal].label,
          entry.entryNumber,
          dateSlashed(entry.date),
          dateSlashed(entry.dueDate),
          entry.period.slice(4, 6),
          entry.fiscalYear,
          line.account,
          line.accountLabel,
          entry.thirdPartyAccount,
          entry.thirdPartyName,
          entry.thirdPartyVat,
          line.comment,
          amount2(line.debit),
          amount2(line.credit),
          amount2(line.debit - line.credit),
          'EUR',
          vatCode,
          line.vatBase !== undefined ? amount2(line.vatBase) : '',
          line.vatRate !== undefined ? String(line.vatRate) : '',
          line.vatRegime ? resolveVatGridForRegime(line.vatRegime) : '',
          entry.documentNumber,
          entry.structuredCommunication ? formatOgmDisplay(entry.structuredCommunication) : '',
          line.analyticCode ?? '',
        ]
          .map(csvField)
          .join(';'),
      );
    }
  }

  return {
    filename: `EXACT_ONLINE_BE_GLTRANSACTIONS_${digitsOnly(company.bceNumber)}.csv`,
    content: '\uFEFF' + crlf(rows),
    mimeType: 'text/csv;charset=utf-8',
    encoding: 'utf-8',
    description: 'Exact Online Belgium — Import CSV des transactions du grand livre',
    recordCount: ledger.entries.reduce((acc, e) => acc + e.lines.length, 0),
  };
}

/** Generates the Exact Online Belgium XML topic envelope. */
export function generateExactOnlineXml(
  ledger: BuiltLedger,
  company: CompanyProfile,
  fiscalYear: number,
): FiduciaryFile {
  const control = verifyLedgerBalance(ledger.entries);
  const parts: string[] = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<eExact xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="eExact-XML.xsd">');
  parts.push('  <Company>');
  parts.push(`    <Code>${escapeXml(digitsOnly(company.bceNumber))}</Code>`);
  parts.push(`    <Name>${escapeXml(company.name)}</Name>`);
  parts.push(`    <VATNumber>${escapeXml(normalizeVat(company.vatNumber || company.bceNumber))}</VATNumber>`);
  parts.push('    <Country>BE</Country>');
  parts.push('  </Company>');

  // --- Accounts (relations) -------------------------------------------------
  parts.push('  <Accounts>');
  for (const c of ledger.customers) {
    parts.push(`    <Account code="${escapeXml(c.account)}" status="A" type="C">`);
    parts.push(`      <Name>${escapeXml(c.name)}</Name>`);
    parts.push(`      <VATNumber>${escapeXml(c.vatNumber)}</VATNumber>`);
    parts.push('      <Addresses>');
    parts.push('        <Address type="V">');
    parts.push(`          <AddressLine1>${escapeXml(c.street)}</AddressLine1>`);
    parts.push(`          <City>${escapeXml(c.city)}</City>`);
    parts.push(`          <Postcode>${escapeXml(c.postalCode)}</Postcode>`);
    parts.push(`          <Country code="${escapeXml(c.countryCode)}" />`);
    parts.push('        </Address>');
    parts.push('      </Addresses>');
    parts.push('    </Account>');
  }
  for (const s of ledger.suppliers) {
    parts.push(`    <Account code="${escapeXml(s.account)}" status="A" type="S">`);
    parts.push(`      <Name>${escapeXml(s.name)}</Name>`);
    parts.push(`      <VATNumber>${escapeXml(s.vatNumber)}</VATNumber>`);
    parts.push(`      <Country code="${escapeXml(s.countryCode)}" />`);
    parts.push('    </Account>');
  }
  parts.push('  </Accounts>');

  // --- GL entries ----------------------------------------------------------
  parts.push('  <GLEntries>');
  for (const entry of ledger.entries) {
    parts.push(`    <GLEntry type="${entry.journal === 'VEN' ? '20' : '21'}">`);
    parts.push(`      <Journal code="${escapeXml(entry.journal)}"><Description>${escapeXml(BELGIAN_JOURNALS[entry.journal].label)}</Description></Journal>`);
    parts.push(`      <EntryNumber>${entry.entryNumber}</EntryNumber>`);
    parts.push(`      <Date>${escapeXml(entry.date)}</Date>`);
    parts.push(`      <FinYear number="${entry.fiscalYear}" />`);
    parts.push(`      <FinPeriod number="${escapeXml(entry.period.slice(4, 6))}" />`);
    parts.push(`      <YourRef>${escapeXml(entry.documentNumber)}</YourRef>`);
    if (entry.structuredCommunication) {
      parts.push(`      <PaymentReference>${escapeXml(formatOgmDisplay(entry.structuredCommunication))}</PaymentReference>`);
    }
    parts.push('      <GLTransactions>');
    for (const line of entry.lines) {
      const isSales = entry.journal === 'VEN';
      const vatCode =
        line.vatRegime !== undefined && isSales
          ? exactSalesVatCode(line.vatRegime, line.vatRate ?? 21)
          : line.vatRate !== undefined && !isSales
            ? exactPurchaseVatCode(line.vatRate)
            : '';
      parts.push('        <GLTransaction>');
      parts.push(`          <GLAccount code="${escapeXml(line.account)}"><Description>${escapeXml(line.accountLabel)}</Description></GLAccount>`);
      parts.push(`          <Account code="${escapeXml(entry.thirdPartyAccount)}" />`);
      parts.push(`          <Description>${escapeXml(line.comment)}</Description>`);
      parts.push(`          <Debit>${amount2(line.debit)}</Debit>`);
      parts.push(`          <Credit>${amount2(line.credit)}</Credit>`);
      parts.push(`          <Amount><Currency code="EUR" /><Value>${amount2(line.debit - line.credit)}</Value></Amount>`);
      if (vatCode) {
        parts.push(`          <VAT code="${escapeXml(vatCode)}">`);
        parts.push(`            <Percentage>${line.vatRate ?? 0}</Percentage>`);
        if (line.vatBase !== undefined) parts.push(`            <BaseAmount>${amount2(line.vatBase)}</BaseAmount>`);
        if (line.vatRegime) parts.push(`            <ReturnBox>${escapeXml(resolveVatGridForRegime(line.vatRegime))}</ReturnBox>`);
        parts.push('          </VAT>');
      }
      parts.push('        </GLTransaction>');
    }
    parts.push('      </GLTransactions>');
    parts.push('    </GLEntry>');
  }
  parts.push('  </GLEntries>');

  parts.push('  <Totals>');
  parts.push(`    <TotalDebit>${amount2(control.totalDebits)}</TotalDebit>`);
  parts.push(`    <TotalCredit>${amount2(control.totalCredits)}</TotalCredit>`);
  parts.push(`    <Balanced>${control.isBalanced ? '1' : '0'}</Balanced>`);
  parts.push('  </Totals>');
  parts.push('</eExact>');

  return {
    filename: `EXACT_ONLINE_BE_${digitsOnly(company.bceNumber)}_${fiscalYear}.xml`,
    content: parts.join('\n'),
    mimeType: 'application/xml;charset=utf-8',
    encoding: 'utf-8',
    description: 'Exact Online Belgium — Enveloppe XML eExact (GLEntries + relations)',
    recordCount: ledger.entries.length,
  };
}

/** Generates the Exact Online Belgian chart-of-accounts (PCMN) companion CSV. */
export function generateExactChartOfAccountsCsv(ledger: BuiltLedger): FiduciaryFile {
  const used = new Map<string, string>();
  for (const entry of ledger.entries) {
    for (const line of entry.lines) {
      if (!used.has(line.account)) used.set(line.account, line.accountLabel);
    }
  }

  const rows: string[] = ['GLAccountCode;Description;BalanceSide;BalanceType;Category;Country'];
  for (const [code, label] of Array.from(used.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const cls = code.charAt(0);
    const isBalanceSheet = ['1', '2', '3', '4', '5'].includes(cls);
    const side = cls === '6' || cls === '4' ? 'D' : 'C';
    rows.push(
      [code, label, side, isBalanceSheet ? 'B' : 'W', horusAccountType(code), 'BE'].map(csvField).join(';'),
    );
  }

  return {
    filename: 'EXACT_ONLINE_BE_CHART_OF_ACCOUNTS.csv',
    content: '\uFEFF' + crlf(rows),
    mimeType: 'text/csv;charset=utf-8',
    encoding: 'utf-8',
    description: 'Exact Online Belgium — Plan comptable belge PCMN utilisé par l\'export',
    recordCount: used.size,
  };
}

/** Builds the complete Exact Online Belgium package. */
export function generateExactOnlinePackage(
  ledger: BuiltLedger,
  company: CompanyProfile,
  fiscalYear: number,
): FiduciaryFile[] {
  return [
    generateExactOnlineCsv(ledger, company),
    generateExactOnlineXml(ledger, company, fiscalYear),
    generateExactChartOfAccountsCsv(ledger),
  ];
}

/* ==========================================================================
 * SECTION 12 — GENERATOR 5 : OCTOPUS & YUKI (UBL 2.1 e-fff BUNDLE)
 * ========================================================================== */

/**
 * Octopus and Yuki Belgium both consume the Belgian **e-fff** standard: a set
 * of UBL 2.1 invoice documents accompanied by an index file describing the
 * bundle. BRABO emits one UBL document per sales invoice plus an `efff-index`
 * manifest (XML) and a machine-readable JSON metadata index.
 */

/** Generates a single UBL 2.1 e-fff sales invoice document. */
export function generateEfffUblInvoice(invoice: Invoice, company: CompanyProfile): FiduciaryFile {
  const isCreditNote = invoice.type === 'credit_note';
  const root = isCreditNote ? 'CreditNote' : 'Invoice';
  const typeCode = isCreditNote ? '381' : '380';
  const lineTag = isCreditNote ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyTag = isCreditNote ? 'CreditedQuantity' : 'InvoicedQuantity';

  const companyVat = normalizeVat(company.vatNumber || company.bceNumber);
  const clientVat = normalizeVat(invoice.client.vatNumber || invoice.client.bceNumber);

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(`<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2"`);
  parts.push('  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"');
  parts.push('  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">');
  parts.push('  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
  parts.push('  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>');
  parts.push('  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>');
  parts.push(`  <cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>`);
  parts.push(`  <cbc:IssueDate>${escapeXml(invoice.date)}</cbc:IssueDate>`);
  parts.push(`  <cbc:DueDate>${escapeXml(invoice.dueDate)}</cbc:DueDate>`);
  parts.push(`  <cbc:${isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${typeCode}</cbc:${isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>`);
  parts.push('  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>');
  parts.push(`  <cbc:BuyerReference>${escapeXml(invoice.client.id || invoice.client.name)}</cbc:BuyerReference>`);

  // Supplier
  parts.push('  <cac:AccountingSupplierParty><cac:Party>');
  parts.push(`    <cbc:EndpointID schemeID="0208">${escapeXml(digitsOnly(company.bceNumber))}</cbc:EndpointID>`);
  parts.push(`    <cac:PartyName><cbc:Name>${escapeXml(company.name)}</cbc:Name></cac:PartyName>`);
  parts.push('    <cac:PostalAddress>');
  parts.push(`      <cbc:StreetName>${escapeXml(`${company.street} ${company.number}`.trim())}</cbc:StreetName>`);
  parts.push(`      <cbc:CityName>${escapeXml(company.city)}</cbc:CityName>`);
  parts.push(`      <cbc:PostalZone>${escapeXml(company.postalCode)}</cbc:PostalZone>`);
  parts.push(`      <cac:Country><cbc:IdentificationCode>${escapeXml(resolveCountryCode(company.country))}</cbc:IdentificationCode></cac:Country>`);
  parts.push('    </cac:PostalAddress>');
  parts.push(`    <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(companyVat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`);
  parts.push(`    <cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(`${company.name} ${company.legalForm}`)}</cbc:RegistrationName><cbc:CompanyID schemeID="0208">${escapeXml(digitsOnly(company.bceNumber))}</cbc:CompanyID></cac:PartyLegalEntity>`);
  parts.push('  </cac:Party></cac:AccountingSupplierParty>');

  // Customer
  parts.push('  <cac:AccountingCustomerParty><cac:Party>');
  parts.push(`    <cbc:EndpointID schemeID="0208">${escapeXml(digitsOnly(invoice.client.bceNumber))}</cbc:EndpointID>`);
  parts.push(`    <cac:PartyName><cbc:Name>${escapeXml(invoice.client.name)}</cbc:Name></cac:PartyName>`);
  parts.push('    <cac:PostalAddress>');
  parts.push(`      <cbc:StreetName>${escapeXml(`${invoice.client.street} ${invoice.client.number}`.trim())}</cbc:StreetName>`);
  parts.push(`      <cbc:CityName>${escapeXml(invoice.client.city)}</cbc:CityName>`);
  parts.push(`      <cbc:PostalZone>${escapeXml(invoice.client.postalCode)}</cbc:PostalZone>`);
  parts.push(`      <cac:Country><cbc:IdentificationCode>${escapeXml(resolveCountryCode(invoice.client.country))}</cbc:IdentificationCode></cac:Country>`);
  parts.push('    </cac:PostalAddress>');
  parts.push(`    <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(clientVat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`);
  parts.push(`    <cac:PartyLegalEntity><cbc:RegistrationName>${escapeXml(invoice.client.name)}</cbc:RegistrationName><cbc:CompanyID schemeID="0208">${escapeXml(digitsOnly(invoice.client.bceNumber))}</cbc:CompanyID></cac:PartyLegalEntity>`);
  parts.push('  </cac:Party></cac:AccountingCustomerParty>');

  // Payment means with Belgian OGM
  parts.push('  <cac:PaymentMeans>');
  parts.push('    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>');
  parts.push(`    <cbc:PaymentID>${escapeXml(invoice.structuredCommunication)}</cbc:PaymentID>`);
  parts.push(`    <cac:PayeeFinancialAccount><cbc:ID>${escapeXml(company.iban.replace(/\s/g, ''))}</cbc:ID><cac:FinancialInstitutionBranch><cbc:ID>${escapeXml(company.bic)}</cbc:ID></cac:FinancialInstitutionBranch></cac:PayeeFinancialAccount>`);
  parts.push('  </cac:PaymentMeans>');

  // Tax total, one subtotal per rate/regime pair
  parts.push(`  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${amount2(invoice.totalVatAmount)}</cbc:TaxAmount>`);
  for (const bucket of invoice.vatBreakdown) {
    const category = UBL_TAX_CATEGORY[bucket.regime] ?? 'S';
    const reason = VAT_EXEMPTION_REASON[bucket.regime];
    parts.push('    <cac:TaxSubtotal>');
    parts.push(`      <cbc:TaxableAmount currencyID="EUR">${amount2(bucket.baseAmount)}</cbc:TaxableAmount>`);
    parts.push(`      <cbc:TaxAmount currencyID="EUR">${amount2(bucket.vatAmount)}</cbc:TaxAmount>`);
    parts.push('      <cac:TaxCategory>');
    parts.push(`        <cbc:ID>${escapeXml(category)}</cbc:ID>`);
    parts.push(`        <cbc:Percent>${bucket.rate}</cbc:Percent>`);
    if (reason) parts.push(`        <cbc:TaxExemptionReason>${escapeXml(reason)}</cbc:TaxExemptionReason>`);
    parts.push('        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
    parts.push('      </cac:TaxCategory>');
    parts.push('    </cac:TaxSubtotal>');
  }
  parts.push('  </cac:TaxTotal>');

  parts.push('  <cac:LegalMonetaryTotal>');
  parts.push(`    <cbc:LineExtensionAmount currencyID="EUR">${amount2(invoice.subtotalExclVat)}</cbc:LineExtensionAmount>`);
  parts.push(`    <cbc:TaxExclusiveAmount currencyID="EUR">${amount2(invoice.subtotalExclVat)}</cbc:TaxExclusiveAmount>`);
  parts.push(`    <cbc:TaxInclusiveAmount currencyID="EUR">${amount2(invoice.totalInclVat)}</cbc:TaxInclusiveAmount>`);
  parts.push(`    <cbc:PayableAmount currencyID="EUR">${amount2(invoice.totalInclVat)}</cbc:PayableAmount>`);
  parts.push('  </cac:LegalMonetaryTotal>');

  invoice.lines.forEach((line, index) => {
    const category = UBL_TAX_CATEGORY[line.vatRegime] ?? 'S';
    const reason = VAT_EXEMPTION_REASON[line.vatRegime];
    parts.push(`  <cac:${lineTag}>`);
    parts.push(`    <cbc:ID>${index + 1}</cbc:ID>`);
    parts.push(`    <cbc:${qtyTag} unitCode="C62">${line.quantity}</cbc:${qtyTag}>`);
    parts.push(`    <cbc:LineExtensionAmount currencyID="EUR">${amount2(line.totalExclVat)}</cbc:LineExtensionAmount>`);
    parts.push('    <cac:Item>');
    parts.push(`      <cbc:Description>${escapeXml(line.description)}</cbc:Description>`);
    parts.push(`      <cbc:Name>${escapeXml(line.description.slice(0, 50))}</cbc:Name>`);
    parts.push('      <cac:ClassifiedTaxCategory>');
    parts.push(`        <cbc:ID>${escapeXml(category)}</cbc:ID>`);
    parts.push(`        <cbc:Percent>${line.vatRate}</cbc:Percent>`);
    if (reason) parts.push(`        <cbc:TaxExemptionReason>${escapeXml(reason)}</cbc:TaxExemptionReason>`);
    parts.push('        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>');
    parts.push('      </cac:ClassifiedTaxCategory>');
    // e-fff extension: carry the PCMN imputation so Octopus/Yuki pre-book it.
    parts.push(`      <cac:AdditionalItemProperty><cbc:Name>PCMN</cbc:Name><cbc:Value>${escapeXml(line.pcmnAccount)}</cbc:Value></cac:AdditionalItemProperty>`);
    parts.push('    </cac:Item>');
    parts.push(`    <cac:Price><cbc:PriceAmount currencyID="EUR">${amount2(line.unitPrice)}</cbc:PriceAmount></cac:Price>`);
    parts.push(`  </cac:${lineTag}>`);
  });

  parts.push(`</${root}>`);

  const safeNumber = invoice.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '_');
  return {
    filename: `efff/${isCreditNote ? 'CN' : 'INV'}_${safeNumber}.xml`,
    content: parts.join('\n'),
    mimeType: 'application/xml;charset=utf-8',
    encoding: 'utf-8',
    description: `UBL 2.1 e-fff — ${isCreditNote ? 'Note de crédit' : 'Facture'} ${invoice.invoiceNumber}`,
    recordCount: invoice.lines.length,
  };
}

/** Metadata describing one document inside the e-fff bundle. */
export interface EfffIndexEntry {
  filename: string;
  documentType: 'INVOICE' | 'CREDIT_NOTE';
  documentNumber: string;
  issueDate: string;
  dueDate: string;
  supplierVat: string;
  customerVat: string;
  customerName: string;
  totalExclVat: number;
  totalVat: number;
  totalInclVat: number;
  currency: 'EUR';
  structuredCommunication: string;
  ledgerAccount: string;
  sha256Surrogate: string;
}

/**
 * Deterministic non-cryptographic digest (FNV-1a 32-bit, rendered as 64 hex
 * chars) used as a bundle integrity surrogate. The browser build stays free of
 * async WebCrypto so the manifest can be produced synchronously.
 */
function integrityDigest(content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < content.length; i += 1) {
    const c = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  const block = (seed: number, salt: number): string =>
    (Math.imul(seed ^ salt, 0xc2b2ae35) >>> 0).toString(16).padStart(8, '0');
  return [
    block(h1, 1), block(h2, 2), block(h1 ^ h2, 3), block(h1 + h2, 4),
    block(h1, 5), block(h2, 6), block(h1 ^ h2, 7), block(h1 + h2, 8),
  ].join('');
}

/** Builds the Octopus / Yuki e-fff bundle: UBL documents + metadata index. */
export function generateEfffBundle(
  invoices: Invoice[],
  company: CompanyProfile,
  ledger: BuiltLedger,
  target: 'octopus' | 'yuki',
  options: FiduciaryExportOptions = {},
): FiduciaryFile[] {
  const eligible = invoices
    .filter((inv) => inv.type !== 'quote' && inv.status !== 'cancelled')
    .filter((inv) => matchesPeriod(inv.date, options.periodFilter));

  const files: FiduciaryFile[] = [];
  const indexEntries: EfffIndexEntry[] = [];

  const accountByDocument = new Map<string, string>();
  for (const entry of ledger.salesEntries) {
    accountByDocument.set(entry.documentNumber, entry.thirdPartyAccount);
  }

  for (const invoice of eligible) {
    const ublFile = generateEfffUblInvoice(invoice, company);
    files.push(ublFile);
    indexEntries.push({
      filename: ublFile.filename,
      documentType: invoice.type === 'credit_note' ? 'CREDIT_NOTE' : 'INVOICE',
      documentNumber: invoice.invoiceNumber,
      issueDate: invoice.date,
      dueDate: invoice.dueDate,
      supplierVat: normalizeVat(company.vatNumber || company.bceNumber),
      customerVat: normalizeVat(invoice.client.vatNumber || invoice.client.bceNumber),
      customerName: invoice.client.name,
      totalExclVat: round2(invoice.subtotalExclVat),
      totalVat: round2(invoice.totalVatAmount),
      totalInclVat: round2(invoice.totalInclVat),
      currency: 'EUR',
      structuredCommunication: formatOgmDisplay(ogmDigits(invoice.structuredCommunication) || '0'.repeat(12)),
      ledgerAccount: accountByDocument.get(invoice.invoiceNumber) ?? PCMN_ACCOUNTS.CUSTOMERS_ROOT,
      sha256Surrogate: integrityDigest(ublFile.content),
    });
  }

  const totalExcl = round2(indexEntries.reduce((a, e) => a + e.totalExclVat, 0));
  const totalVat = round2(indexEntries.reduce((a, e) => a + e.totalVat, 0));
  const totalIncl = round2(indexEntries.reduce((a, e) => a + e.totalInclVat, 0));

  // --- XML manifest (e-fff index) ------------------------------------------
  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<EfffBundleIndex xmlns="http://www.e-fff.be/schemas/bundle/1.0" Version="2.1"');
  xml.push(`                 Target="${target.toUpperCase()}" Producer="BRABO">`);
  xml.push('  <Sender>');
  xml.push(`    <Name>${escapeXml(company.name)}</Name>`);
  xml.push(`    <VatNumber>${escapeXml(normalizeVat(company.vatNumber || company.bceNumber))}</VatNumber>`);
  xml.push(`    <EnterpriseNumber>${escapeXml(digitsOnly(company.bceNumber))}</EnterpriseNumber>`);
  xml.push(`    <PeppolEndpoint>${escapeXml(company.peppolEndpointId)}</PeppolEndpoint>`);
  xml.push('  </Sender>');
  xml.push('  <Recipient>');
  xml.push(`    <FiduciaryName>${escapeXml(company.fiduciaryName)}</FiduciaryName>`);
  xml.push(`    <ItaaNumber>${escapeXml(company.fiduciaryItaaNumber)}</ItaaNumber>`);
  xml.push(`    <Email>${escapeXml(company.fiduciaryEmail)}</Email>`);
  xml.push(`    <Platform>${escapeXml(target === 'octopus' ? 'Octopus Accounting' : 'Yuki Belgium')}</Platform>`);
  xml.push('  </Recipient>');
  xml.push(`  <GeneratedAt>${new Date().toISOString()}</GeneratedAt>`);
  xml.push('  <Documents>');
  for (const e of indexEntries) {
    xml.push(`    <Document Type="${e.documentType}" File="${escapeXml(e.filename)}">`);
    xml.push(`      <Number>${escapeXml(e.documentNumber)}</Number>`);
    xml.push(`      <IssueDate>${escapeXml(e.issueDate)}</IssueDate>`);
    xml.push(`      <DueDate>${escapeXml(e.dueDate)}</DueDate>`);
    xml.push(`      <CustomerName>${escapeXml(e.customerName)}</CustomerName>`);
    xml.push(`      <CustomerVat>${escapeXml(e.customerVat)}</CustomerVat>`);
    xml.push(`      <LedgerAccount>${escapeXml(e.ledgerAccount)}</LedgerAccount>`);
    xml.push(`      <StructuredCommunication>${escapeXml(e.structuredCommunication)}</StructuredCommunication>`);
    xml.push(`      <TotalExclVat currency="EUR">${amount2(e.totalExclVat)}</TotalExclVat>`);
    xml.push(`      <TotalVat currency="EUR">${amount2(e.totalVat)}</TotalVat>`);
    xml.push(`      <TotalInclVat currency="EUR">${amount2(e.totalInclVat)}</TotalInclVat>`);
    xml.push(`      <Integrity algorithm="FNV1A-EXT">${escapeXml(e.sha256Surrogate)}</Integrity>`);
    xml.push('    </Document>');
  }
  xml.push('  </Documents>');
  xml.push('  <BundleTotals>');
  xml.push(`    <DocumentCount>${indexEntries.length}</DocumentCount>`);
  xml.push(`    <TotalExclVat>${amount2(totalExcl)}</TotalExclVat>`);
  xml.push(`    <TotalVat>${amount2(totalVat)}</TotalVat>`);
  xml.push(`    <TotalInclVat>${amount2(totalIncl)}</TotalInclVat>`);
  xml.push('  </BundleTotals>');
  xml.push('</EfffBundleIndex>');

  files.push({
    filename: 'efff-index.xml',
    content: xml.join('\n'),
    mimeType: 'application/xml;charset=utf-8',
    encoding: 'utf-8',
    description: `e-fff — Index de bundle UBL 2.1 (${target === 'octopus' ? 'Octopus' : 'Yuki'})`,
    recordCount: indexEntries.length,
  });

  // --- JSON metadata index (machine-readable companion) --------------------
  files.push({
    filename: 'efff-metadata.json',
    content: JSON.stringify(
      {
        schema: 'brabo.efff.bundle.v1',
        target,
        producer: 'BRABO Belgian Accounting Platform',
        generatedAt: new Date().toISOString(),
        sender: {
          name: company.name,
          vatNumber: normalizeVat(company.vatNumber || company.bceNumber),
          enterpriseNumber: digitsOnly(company.bceNumber),
          peppolEndpointId: company.peppolEndpointId,
          iban: company.iban.replace(/\s/g, ''),
        },
        fiduciary: {
          name: company.fiduciaryName,
          itaaNumber: company.fiduciaryItaaNumber,
          email: company.fiduciaryEmail,
        },
        documents: indexEntries,
        totals: {
          documentCount: indexEntries.length,
          totalExclVat: totalExcl,
          totalVat: totalVat,
          totalInclVat: totalIncl,
        },
      },
      null,
      2,
    ),
    mimeType: 'application/json;charset=utf-8',
    encoding: 'utf-8',
    description: 'e-fff — Index de métadonnées JSON du bundle',
    recordCount: indexEntries.length,
  });

  return files;
}

/* ==========================================================================
 * SECTION 13 — AUDIT TRAIL & BALANCE REPORT FILE
 * ========================================================================== */

/** Renders the human-readable double-entry control report shipped with every package. */
export function generateBalanceControlReport(
  report: LedgerBalanceReport,
  ledger: BuiltLedger,
  company: CompanyProfile,
  format: FiduciaryFormat,
): FiduciaryFile {
  const rows: string[] = [];
  rows.push('================================================================================');
  rows.push('  BRABO — RAPPORT DE CONTROLE DE LA PARTIE DOUBLE (COMPTABILITE BELGE)');
  rows.push('================================================================================');
  rows.push(`Dossier            : ${asciiSafe(company.name)} (${asciiSafe(company.legalForm)})`);
  rows.push(`BCE / TVA          : ${company.bceNumber} / ${normalizeVat(company.vatNumber || company.bceNumber)}`);
  rows.push(`Fiduciaire         : ${asciiSafe(company.fiduciaryName)} — ITAA ${company.fiduciaryItaaNumber}`);
  rows.push(`Format d'export    : ${format}`);
  rows.push(`Genere le          : ${new Date().toISOString()}`);
  rows.push('');
  rows.push('--- SYNTHESE -------------------------------------------------------------------');
  rows.push(`Ecritures          : ${report.entryCount}`);
  rows.push(`Lignes comptables  : ${report.lineCount}`);
  rows.push(`Clients (400000)   : ${ledger.customers.length}`);
  rows.push(`Fournisseurs(440000): ${ledger.suppliers.length}`);
  rows.push('');
  rows.push('--- BALANCE GENERALE -----------------------------------------------------------');
  rows.push(`Total DEBITS       : ${amount2(report.totalDebits).padStart(16)} EUR`);
  rows.push(`Total CREDITS      : ${amount2(report.totalCredits).padStart(16)} EUR`);
  rows.push(`Ecart              : ${amount2(report.difference).padStart(16)} EUR`);
  rows.push(`Resultat           : ${report.isBalanced ? 'EQUILIBRE — Sum(Debits) === Sum(Credits)' : 'DESEQUILIBRE — EXPORT NON CONFORME'}`);
  rows.push('');

  rows.push('--- DETAIL PAR JOURNAL ---------------------------------------------------------');
  const byJournal = new Map<string, { debit: number; credit: number; count: number }>();
  for (const entry of ledger.entries) {
    const agg = byJournal.get(entry.journal) ?? { debit: 0, credit: 0, count: 0 };
    for (const line of entry.lines) {
      agg.debit += line.debit;
      agg.credit += line.credit;
    }
    agg.count += 1;
    byJournal.set(entry.journal, agg);
  }
  rows.push(`${fixed('JOURNAL', 10)}${fixed('ECRITURES', 12, 'right')}${fixed('DEBIT', 18, 'right')}${fixed('CREDIT', 18, 'right')}${fixed('ECART', 14, 'right')}`);
  for (const [journal, agg] of byJournal) {
    rows.push(
      `${fixed(journal, 10)}${fixed(agg.count, 12, 'right')}${fixed(amount2(agg.debit), 18, 'right')}${fixed(amount2(agg.credit), 18, 'right')}${fixed(amount2(agg.debit - agg.credit), 14, 'right')}`,
    );
  }
  rows.push('');

  rows.push('--- BALANCE PAR COMPTE PCMN ----------------------------------------------------');
  const byAccount = new Map<string, { label: string; debit: number; credit: number }>();
  for (const entry of ledger.entries) {
    for (const line of entry.lines) {
      const agg = byAccount.get(line.account) ?? { label: line.accountLabel, debit: 0, credit: 0 };
      agg.debit += line.debit;
      agg.credit += line.credit;
      byAccount.set(line.account, agg);
    }
  }
  rows.push(`${fixed('COMPTE', 10)}${fixed('LIBELLE', 40)}${fixed('DEBIT', 16, 'right')}${fixed('CREDIT', 16, 'right')}${fixed('SOLDE', 16, 'right')}`);
  for (const [account, agg] of Array.from(byAccount.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push(
      `${fixed(account, 10)}${fixed(asciiSafe(agg.label), 40)}${fixed(amount2(agg.debit), 16, 'right')}${fixed(amount2(agg.credit), 16, 'right')}${fixed(amount2(agg.debit - agg.credit), 16, 'right')}`,
    );
  }
  rows.push('');

  if (report.errors.length > 0) {
    rows.push('--- ERREURS BLOQUANTES ---------------------------------------------------------');
    report.errors.forEach((e, i) => rows.push(`${String(i + 1).padStart(3)}. ${asciiSafe(e)}`));
    rows.push('');
  }
  if (report.warnings.length > 0) {
    rows.push('--- AVERTISSEMENTS -------------------------------------------------------------');
    report.warnings.forEach((w, i) => rows.push(`${String(i + 1).padStart(3)}. ${asciiSafe(w)}`));
    rows.push('');
  }

  rows.push('================================================================================');
  rows.push('Controle effectue selon les regles de la comptabilite en partie double (AR PCMN).');
  rows.push('================================================================================');

  return {
    filename: 'CONTROLE_PARTIE_DOUBLE.txt',
    content: crlf(rows),
    mimeType: 'text/plain;charset=utf-8',
    encoding: 'utf-8',
    description: 'Rapport de contrôle — équilibre débits/crédits & balance PCMN',
    recordCount: report.entryCount,
  };
}

/* ==========================================================================
 * SECTION 14 — MAIN ENTRY POINT
 * ========================================================================== */

/** Human-readable labels per target platform. */
const FORMAT_LABELS: Record<FiduciaryFormat, string> = {
  sage_bob50: 'Sage BOB 50 / BOB Expert (ASCII)',
  winbooks: 'WinBooks Classic & on Web (XML / WBF / ASCII)',
  horus: 'Horus Office / Horus Cloud (Bridge XML natif)',
  exact_online: 'Exact Online Belgium (CSV & XML)',
  octopus: 'Octopus Accounting (UBL 2.1 e-fff)',
  yuki: 'Yuki Belgium (UBL 2.1 e-fff)',
  full_bundle: 'Bundle fiduciaire complet (tous formats)',
};

/**
 * Generates a complete, verified fiduciary export package.
 *
 * The pipeline is always the same:
 *  1. Build the canonical Belgian double-entry ledger from the documents.
 *  2. Verify Sum(Debits) === Sum(Credits) per entry and for the whole batch.
 *  3. Render the target-specific files from that single verified ledger.
 *  4. Attach the double-entry control report.
 *
 * @param invoices  Sales invoices and credit notes (quotes are ignored).
 * @param purchases Purchase / expense documents.
 * @param company   The exporting Belgian company profile.
 * @param format    Target fiduciary platform.
 * @param options   Fiscal year, period filter and behaviour switches.
 * @returns A {@link FiduciaryExportPackage} ready for download.
 * @throws {Error} when `options.strictBalancing` is set and the ledger is unbalanced.
 */
export function exportFiduciaryPackage(
  invoices: Invoice[],
  purchases: PurchaseExpense[],
  company: CompanyProfile,
  format: FiduciaryFormat,
  options: FiduciaryExportOptions = {},
): FiduciaryExportPackage {
  const fiscalYear = options.fiscalYear ?? new Date().getFullYear();
  const includeMasterData = options.includeMasterData ?? true;

  // 1. Canonical ledger -----------------------------------------------------
  const ledger = buildLedger(invoices, purchases, { ...options, fiscalYear });

  // 2. Double-entry verification -------------------------------------------
  const balanceReport = verifyLedgerBalance(ledger.entries);
  if (options.strictBalancing && !balanceReport.isBalanced) {
    assertLedgerBalanced(ledger.entries);
  }

  // 3. Target-specific rendering -------------------------------------------
  const files: FiduciaryFile[] = [];
  switch (format) {
    case 'sage_bob50':
      files.push(...generateSageBob50Package(ledger, company, includeMasterData));
      break;
    case 'winbooks':
      files.push(...generateWinbooksPackage(ledger, company, fiscalYear));
      break;
    case 'horus':
      files.push(generateHorusXml(ledger, company, fiscalYear));
      break;
    case 'exact_online':
      files.push(...generateExactOnlinePackage(ledger, company, fiscalYear));
      break;
    case 'octopus':
      files.push(...generateEfffBundle(invoices, company, ledger, 'octopus', options));
      break;
    case 'yuki':
      files.push(...generateEfffBundle(invoices, company, ledger, 'yuki', options));
      break;
    case 'full_bundle':
      files.push(...generateSageBob50Package(ledger, company, includeMasterData));
      files.push(...generateWinbooksPackage(ledger, company, fiscalYear));
      files.push(generateHorusXml(ledger, company, fiscalYear));
      files.push(...generateExactOnlinePackage(ledger, company, fiscalYear));
      files.push(...generateEfffBundle(invoices, company, ledger, 'octopus', options));
      break;
    default:
      throw new Error(`BRABO — Format fiduciaire non supporté : « ${String(format)} ».`);
  }

  // 4. Control report -------------------------------------------------------
  files.push(generateBalanceControlReport(balanceReport, ledger, company, format));

  // 5. Statistics -----------------------------------------------------------
  const statistics = {
    salesEntries: ledger.salesEntries.length,
    purchaseEntries: ledger.purchaseEntries.length,
    customerRecords: ledger.customers.length,
    supplierRecords: ledger.suppliers.length,
    totalSalesExclVat: round2(ledger.salesEntries.reduce((a, e) => a + e.totalExclVat, 0)),
    totalPurchasesExclVat: round2(ledger.purchaseEntries.reduce((a, e) => a + e.totalExclVat, 0)),
    totalVatCollected: round2(ledger.salesEntries.reduce((a, e) => a + e.totalVat, 0)),
    totalVatDeductible: round2(
      ledger.purchaseEntries.reduce(
        (acc, e) =>
          acc +
          e.lines
            .filter((l) => l.account === PCMN_ACCOUNTS.VAT_DEDUCTIBLE)
            .reduce((a, l) => a + l.debit, 0),
        0,
      ),
    ),
  };

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  return {
    format,
    formatLabel: FORMAT_LABELS[format],
    archiveName: `BRABO_${format.toUpperCase()}_${digitsOnly(company.bceNumber)}_${fiscalYear}_${stamp}`,
    generatedAt: new Date().toISOString(),
    files,
    balanceReport,
    ledger: ledger.entries,
    statistics,
    isValid: balanceReport.isBalanced && balanceReport.errors.length === 0,
  };
}

/* ==========================================================================
 * SECTION 15 — BROWSER DOWNLOAD HELPERS
 * ========================================================================== */

/** Triggers a browser download for a single generated file. */
export function downloadFiduciaryFile(file: FiduciaryFile): void {
  const blob = new Blob([file.content], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // Flatten nested bundle paths (efff/INV_x.xml) into a safe file name.
  link.download = file.filename.replace(/\//g, '_');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Serialises a package as a single self-describing archive manifest, then
 * downloads every file plus that manifest. A real ZIP would require an extra
 * dependency; the manifest keeps the drop folder auditable in the meantime.
 */
export function downloadFiduciaryPackage(pkg: FiduciaryExportPackage): void {
  const manifest: FiduciaryFile = {
    filename: `${pkg.archiveName}_MANIFEST.json`,
    content: JSON.stringify(
      {
        archiveName: pkg.archiveName,
        format: pkg.format,
        formatLabel: pkg.formatLabel,
        generatedAt: pkg.generatedAt,
        isValid: pkg.isValid,
        statistics: pkg.statistics,
        balance: {
          isBalanced: pkg.balanceReport.isBalanced,
          totalDebits: pkg.balanceReport.totalDebits,
          totalCredits: pkg.balanceReport.totalCredits,
          difference: pkg.balanceReport.difference,
          entryCount: pkg.balanceReport.entryCount,
          lineCount: pkg.balanceReport.lineCount,
          errors: pkg.balanceReport.errors,
          warnings: pkg.balanceReport.warnings,
        },
        files: pkg.files.map((f) => ({
          filename: f.filename,
          description: f.description,
          encoding: f.encoding,
          recordCount: f.recordCount,
          byteLength: f.content.length,
        })),
      },
      null,
      2,
    ),
    mimeType: 'application/json;charset=utf-8',
    encoding: 'utf-8',
    description: 'Manifeste de l\'archive fiduciaire',
    recordCount: pkg.files.length,
  };

  for (const file of pkg.files) {
    downloadFiduciaryFile(file);
  }
  downloadFiduciaryFile(manifest);
}

/** Concatenates a package into one auditable plain-text bundle. */
export function serializeFiduciaryPackageAsText(pkg: FiduciaryExportPackage): string {
  const blocks: string[] = [];
  blocks.push(`# BRABO FIDUCIARY EXPORT — ${pkg.formatLabel}`);
  blocks.push(`# Archive : ${pkg.archiveName}`);
  blocks.push(`# Généré le : ${pkg.generatedAt}`);
  blocks.push(
    `# Partie double : ${pkg.balanceReport.isBalanced ? 'ÉQUILIBRÉE' : 'DÉSÉQUILIBRÉE'} — ` +
      `D ${amount2(pkg.balanceReport.totalDebits)} € / C ${amount2(pkg.balanceReport.totalCredits)} €`,
  );
  blocks.push('');
  for (const file of pkg.files) {
    blocks.push('================================================================================');
    blocks.push(`FILE: ${file.filename}  (${file.description}, ${file.recordCount} enregistrement(s))`);
    blocks.push('================================================================================');
    blocks.push(file.content);
    blocks.push('');
  }
  return blocks.join('\n');
}

/** Lists the target platforms available in the BRABO export UI. */
export function listFiduciaryFormats(): { value: FiduciaryFormat; label: string }[] {
  return (Object.keys(FORMAT_LABELS) as FiduciaryFormat[]).map((value) => ({
    value,
    label: FORMAT_LABELS[value],
  }));
}

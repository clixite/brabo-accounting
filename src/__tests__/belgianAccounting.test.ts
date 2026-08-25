import { describe, it, expect } from 'vitest';
import {
  validateBCE,
  formatBCE,
  generateOGM,
  formatOGM,
  validateOGM,
  calculateVatGrids,
  generateAnnualClientListing,
  generatePeppolBIS30UBL,
  generateIntervatClientListingXML,
  simulateBelgianSocialContributions,
  BELGIAN_PCMN_ACCOUNTS,
} from '../utils/belgianAccounting';
import {
  INITIAL_COMPANY_PROFILE,
  INITIAL_INVOICES,
  INITIAL_PURCHASES,
} from '../data/mockBelgianData';
import type { Invoice, PurchaseExpense, CompanyProfile, InvoiceLine } from '../types/accounting';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeInvoice(overrides: Partial<Invoice> & { lines: InvoiceLine[] }): Invoice {
  const base: Invoice = {
    id: 'inv-test',
    type: 'invoice',
    invoiceNumber: 'TEST-001',
    date: '2026-02-01',
    dueDate: '2026-03-01',
    client: {
      id: 'cli-x',
      name: 'Client Test SA',
      bceNumber: 'BE 0477.472.701',
      vatNumber: 'BE0477472701',
      peppolEndpointId: '0208:0477472701',
      isPeppolEnabled: true,
      street: 'Rue',
      number: '1',
      postalCode: '1000',
      city: 'Bruxelles',
      country: 'Belgique',
      email: 'test@test.be',
    },
    subtotalExclVat: 0,
    vatBreakdown: [],
    totalVatAmount: 0,
    totalInclVat: 0,
    structuredCommunication: generateOGM('2026001001'),
    status: 'sent',
    paymentTermsDays: 30,
    createdAt: '2026-02-01T00:00:00Z',
    ...overrides,
  };
  return base;
}

function makeLine(partial: Partial<InvoiceLine>): InvoiceLine {
  const base: InvoiceLine = {
    id: 'line-1',
    description: 'Prestation',
    pcmnAccount: '705000',
    quantity: 1,
    unitPrice: 1000,
    vatRate: 21,
    vatRegime: 'standard_21',
    totalExclVat: 1000,
    vatAmount: 210,
    totalInclVat: 1210,
    ...partial,
  };
  return base;
}

/* -------------------------------------------------------------------------- */
/* BCE / Enterprise Number                                                    */
/* -------------------------------------------------------------------------- */

describe('BCE (Belgian enterprise number) — Modulo 97', () => {
  it('validates a known-good BCE number', () => {
    const res = validateBCE('BE 0477.472.701');
    expect(res.isValid).toBe(true);
    expect(res.cleanDigits).toBe('0477472701');
    expect(res.formatted).toBe('BE 0477.472.701');
  });

  it('accepts a 9-digit legacy number by prepending 0', () => {
    // 477.472.701 (9 digits) → 0477.472.701
    const res = validateBCE('477472701');
    expect(res.cleanDigits).toBe('0477472701');
    expect(res.isValid).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    const res = validateBCE('BE 0477.472.702');
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('rejects an invalid length', () => {
    expect(validateBCE('12345').isValid).toBe(false);
  });

  it('formats clean digits into canonical form', () => {
    expect(formatBCE('0477472701')).toBe('BE 0477.472.701');
  });
});

/* -------------------------------------------------------------------------- */
/* OGM / Structured Communication                                             */
/* -------------------------------------------------------------------------- */

describe('OGM (Belgian structured communication) — Modulo 97', () => {
  it('generates a valid OGM (round-trip)', () => {
    const ogm = generateOGM('123');
    expect(validateOGM(ogm).isValid).toBe(true);
    expect(ogm).toMatch(/^\+\+\+\d{3}\/\d{4}\/\d{5}\+\+\+$/);
  });

  it('formats 12 digits into +++xxx/xxxx/xxxxx+++', () => {
    expect(formatOGM('123456789012')).toBe('+++123/4567/89012+++');
  });

  it('validates a correct modulo-97 OGM', () => {
    // 1234567890 % 97 = 2 → check "02"
    expect(validateOGM('+++123/4567/89002+++').isValid).toBe(true);
  });

  it('rejects an incorrect check digit', () => {
    expect(validateOGM('+++123/4567/89012+++').isValid).toBe(false);
  });

  it('rejects a wrong length', () => {
    expect(validateOGM('+++123/4567/890+++').isValid).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* VAT grids 00–72                                                            */
/* -------------------------------------------------------------------------- */

describe('Belgian VAT return grids (00–72)', () => {
  it('computes the balance identity grid54 − grid59 = grid71 − grid72', () => {
    const grid = calculateVatGrids(INITIAL_INVOICES, INITIAL_PURCHASES, '2026-Q1');
    const totalDue = grid.grid54 + grid.grid55 + grid.grid56 + grid.grid57;
    const diff = Math.round((totalDue - grid.grid59) * 100) / 100;
    const balance = Math.round((grid.grid71 - grid.grid72) * 100) / 100;
    expect(balance).toBeCloseTo(diff, 2);
  });

  it('routes a 21% sale to grid 03 and grid 54', () => {
    const inv = makeInvoice({
      lines: [makeLine({ totalExclVat: 1000, vatAmount: 210, vatRegime: 'standard_21', vatRate: 21 })],
      subtotalExclVat: 1000,
      totalVatAmount: 210,
      totalInclVat: 1210,
    });
    const grid = calculateVatGrids([inv], [], '2026-Q1');
    expect(grid.grid03).toBe(1000);
    expect(grid.grid54).toBeCloseTo(210, 2);
  });

  it('routes purchases to grid 82 and deductible VAT to grid 59', () => {
    const exp: PurchaseExpense = {
      id: 'e1',
      supplierName: 'Fournisseur',
      supplierBce: 'BE 0202.239.951',
      invoiceNumber: 'F-1',
      date: '2026-02-01',
      dueDate: '2026-02-01',
      category: 'Télécom',
      pcmnAccount: '616100',
      description: 'Abonnement',
      amountExclVat: 200,
      vatRate: 21,
      vatAmount: 42,
      amountInclVat: 242,
      deductibilityRate: 100,
      deductibleVatRate: 100,
      deductibleAmount: 200,
      nonDeductibleAmount: 0,
      deductibleVat: 42,
      nonDeductibleVat: 0,
      status: 'approved',
    };
    const grid = calculateVatGrids([], [exp], '2026-Q1');
    expect(grid.grid82).toBe(200);
    expect(grid.grid59).toBeCloseTo(42, 2);
  });

  it('skips pending expenses and quotes', () => {
    const quote = makeInvoice({ type: 'quote', status: 'draft', lines: [makeLine({})] });
    const pending: PurchaseExpense = {
      id: 'e2',
      supplierName: 'X',
      supplierBce: 'BE 0202.239.951',
      invoiceNumber: 'F-2',
      date: '2026-02-01',
      dueDate: '2026-02-01',
      category: 'X',
      pcmnAccount: '616100',
      description: 'X',
      amountExclVat: 500,
      vatRate: 21,
      vatAmount: 105,
      amountInclVat: 605,
      deductibilityRate: 100,
      deductibleVatRate: 100,
      deductibleAmount: 500,
      nonDeductibleAmount: 0,
      deductibleVat: 105,
      nonDeductibleVat: 0,
      status: 'pending',
    };
    const grid = calculateVatGrids([quote], [pending], '2026-Q1');
    expect(grid.grid03).toBe(0);
    expect(grid.grid59).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Annual client listing                                                      */
/* -------------------------------------------------------------------------- */

describe('Annual client listing (intervat)', () => {
  it('keeps only clients above 250 € excl VAT', () => {
    const big = makeInvoice({
      id: 'big',
      lines: [makeLine({ totalExclVat: 1000, vatAmount: 210 })],
      subtotalExclVat: 1000,
      totalVatAmount: 210,
    });
    const small = makeInvoice({
      id: 'small',
      invoiceNumber: 'S-1',
      client: { ...big.client, id: 'cli-small', name: 'Petit Client', bceNumber: 'BE 0400.378.485', vatNumber: 'BE0400378485' },
      lines: [makeLine({ totalExclVat: 100, vatAmount: 21 })],
      subtotalExclVat: 100,
      totalVatAmount: 21,
    });
    const listing = generateAnnualClientListing([big, small], 2026);
    expect(listing.length).toBe(1);
    expect(listing[0].clientBce).toBe('BE 0477.472.701');
  });
});

/* -------------------------------------------------------------------------- */
/* Peppol UBL & Intervat XML                                                  */
/* -------------------------------------------------------------------------- */

describe('Peppol BIS 3.0 UBL & Intervat XML', () => {
  const company: CompanyProfile = INITIAL_COMPANY_PROFILE;

  it('generates UBL with mandatory EN16931 identifiers', () => {
    const inv = INITIAL_INVOICES[0];
    const xml = generatePeppolBIS30UBL(inv, company);
    expect(xml).toContain('urn:cen.eu:en16931:2017');
    expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:3.0');
    expect(xml).toContain('schemeID="0208"');
    expect(xml).toContain('0477472701');
    expect(xml).toContain(inv.invoiceNumber);
    expect(xml).toContain(inv.structuredCommunication);
  });

  it('emits a CreditNote root for credit notes', () => {
    const cn = makeInvoice({ type: 'credit_note', invoiceNumber: 'CN-1', lines: [makeLine({})] });
    const xml = generatePeppolBIS30UBL(cn, company);
    expect(xml).toContain('<CreditNote');
    expect(xml).toContain('<cbc:InvoiceTypeCode>381</cbc:InvoiceTypeCode>');
  });

  it('generates Intervat client listing XML with control totals', () => {
    const listing = generateAnnualClientListing(INITIAL_INVOICES, 2026);
    const xml = generateIntervatClientListingXML(2026, listing, company);
    expect(xml).toContain('ClientListingConsignment');
    expect(xml).toContain('0789456175');
    expect(xml).toContain('<ControlTotal>');
  });
});

/* -------------------------------------------------------------------------- */
/* Social contributions                                                       */
/* -------------------------------------------------------------------------- */

describe('INASTI / RSVZ social contributions', () => {
  it('applies the 20.5% first-bracket rate', () => {
    const sim = simulateBelgianSocialContributions(68000);
    // 68000 * 0.205 = 13940 gross annual
    expect(sim.totalAnnualPayment).toBeCloseTo(13940 * 1.0305, 1);
  });

  it('caps PLCI/VAPZ deduction at 4160 €', () => {
    const sim = simulateBelgianSocialContributions(100000);
    expect(sim.vapzMaxDeductible).toBeCloseTo(4160, 1);
  });

  it('enforces the minimum quarterly contribution for low income', () => {
    const sim = simulateBelgianSocialContributions(0);
    expect(sim.totalAnnualPayment).toBeGreaterThanOrEqual(865.5 * 4);
  });
});

/* -------------------------------------------------------------------------- */
/* PCMN chart of accounts                                                     */
/* -------------------------------------------------------------------------- */

describe('PCMN chart of accounts', () => {
  it('exposes the Belgian normalized chart', () => {
    expect(BELGIAN_PCMN_ACCOUNTS.length).toBeGreaterThan(15);
    expect(BELGIAN_PCMN_ACCOUNTS.some((a) => a.code === '705000')).toBe(true);
    expect(BELGIAN_PCMN_ACCOUNTS.some((a) => a.code === '614100')).toBe(true);
  });
});

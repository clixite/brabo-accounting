export type BelgianVatRate = 21 | 12 | 6 | 0;

export type BelgianVatRegime = 
  | 'standard_21' 
  | 'reduced_12' 
  | 'reduced_6' 
  | 'zero_0' 
  | 'cocontractant_art20' 
  | 'intracommunity_art39bis' 
  | 'intracommunity_service_art21'
  | 'export_art39' 
  | 'exempt_art44'
  | 'small_business_art56bis';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'peppol_delivered' | 'cancelled';

export type PurchaseStatus = 'pending' | 'approved' | 'paid' | 'fiduciary_exported';

export type DocumentType = 'invoice' | 'quote' | 'credit_note';

export interface InvoiceLine {
  id: string;
  description: string;
  pcmnAccount: string; // e.g. "700000" Ventes de marchandises, "705000" Prestations de services
  quantity: number;
  unitPrice: number;
  vatRate: BelgianVatRate;
  vatRegime: BelgianVatRegime;
  totalExclVat: number;
  vatAmount: number;
  totalInclVat: number;
}

export interface ClientParty {
  id: string;
  name: string;
  bceNumber: string; // BE 0xxx.xxx.xxx
  vatNumber: string; // BE0xxxxxxxxx
  peppolEndpointId: string; // e.g. 0208:0123456789
  isPeppolEnabled: boolean;
  street: string;
  number: string;
  box?: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone?: string;
  iban?: string;
  bic?: string;
}

export interface Invoice {
  id: string;
  type: DocumentType;
  invoiceNumber: string; // e.g. "2026-0042"
  referenceQuoteId?: string;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  client: ClientParty;
  lines: InvoiceLine[];
  subtotalExclVat: number;
  vatBreakdown: {
    rate: BelgianVatRate;
    regime: BelgianVatRegime;
    baseAmount: number;
    vatAmount: number;
  }[];
  totalVatAmount: number;
  totalInclVat: number;
  structuredCommunication: string; // e.g. "+++123/4567/89012+++"
  status: InvoiceStatus;
  peppolStatus?: {
    isSent: boolean;
    sentAt?: string;
    messageId?: string;
    deliveryResponseCode?: 'ACCEPTED' | 'PENDING' | 'REJECTED';
    ublXml?: string;
  };
  notes?: string;
  paymentTermsDays: number;
  createdAt: string;
  paidAt?: string;
}

export interface PurchaseExpense {
  id: string;
  supplierName: string;
  supplierBce: string;
  supplierIban?: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  category: string;
  pcmnAccount: string; // e.g. "611000", "600000", "614000"
  description: string;
  amountExclVat: number;
  vatRate: BelgianVatRate;
  vatAmount: number;
  amountInclVat: number;
  deductibilityRate: number; // 100, 75 (fuel/car), 50 (restaurant), 0 (fines)
  deductibleVatRate: number; // percentage of VAT deductible
  deductibleAmount: number;
  nonDeductibleAmount: number;
  deductibleVat: number;
  nonDeductibleVat: number;
  structuredCommunication?: string;
  status: PurchaseStatus;
  receiptUrl?: string;
  ocrConfidence?: number;
  ocrExtractedData?: {
    supplierRecognized: boolean;
    vatDetected: number;
    bceValidated: boolean;
    /** OCR server metadata (present when the scan came from the real engine). */
    engine?: string;
    engineVersion?: string;
    processedAt?: string;
    confidence?: number;
    rawText?: string;
    manuallyCorrectedFields?: string[];
    warnings?: string[];
  };
}

export interface BankTransaction {
  id: string;
  statementNumber: string;
  date: string;
  valutaDate: string;
  amount: number; // positive = credit, negative = debit
  currency: 'EUR';
  counterpartyName: string;
  counterpartyIban: string;
  counterpartyBic?: string;
  communication: string;
  isStructured: boolean;
  structuredCommunication?: string;
  matchedInvoiceId?: string;
  matchedExpenseId?: string;
  reconciled: boolean;
  reconciliationMethod?: 'OGM_EXACT' | 'AMOUNT_NAME_MATCH' | 'MANUAL';
}

export interface CompanyProfile {
  name: string;
  legalForm: 'SRL' | 'BV' | 'SA' | 'NV' | 'SC' | 'CV' | 'Indépendant' | 'Eenmanszaak';
  bceNumber: string; // BE 0123.456.789
  vatNumber: string; // BE0123456789
  rpmCity: string; // Registre des personnes morales e.g. "Bruxelles" / "Antwerpen"
  street: string;
  number: string;
  box?: string;
  postalCode: string;
  city: string;
  country: string;
  iban: string;
  bic: string;
  bankName: string;
  peppolEndpointId: string;
  email: string;
  phone: string;
  website: string;
  vatRegime: 'monthly' | 'quarterly' | 'franchise_art56bis';
  naceBelCode: string;
  fiduciaryName: string;
  fiduciaryItaaNumber: string;
  fiduciaryEmail: string;
}

export interface VatGridDeclaration {
  period: string; // e.g. "2026-Q1" or "2026-03"
  year: number;
  
  // Cadre II - Ventes & Opérations sortantes
  grid00: number; // Opérations soumises au taux 0%
  grid01: number; // Opérations 6%
  grid02: number; // Opérations 12%
  grid03: number; // Opérations 21%
  grid44: number; // Prestations de services intracommunautaires art 21 §2
  grid45: number; // Opérations soumises au cocontractant art 20
  grid46: number; // Livraisons intracommunautaires art 39bis
  grid47: number; // Autres opérations exemptées / export

  // Cadre III - TVA due
  grid54: number; // TVA due sur opérations des grilles 01, 02, 03
  grid55: number; // TVA due sur acquisitions intracommunautaires
  grid56: number; // TVA due sur opérations cocontractant
  grid57: number; // TVA de régularisation

  // Cadre IV - Achats & TVA déductible
  grid81: number; // Achats de marchandises, matières premières
  grid82: number; // Achats de services et biens divers
  grid83: number; // Biens d'investissement
  grid84: number; // Notes de crédit reçues
  grid85: number; // Notes de crédit délivrées
  grid59: number; // Total TVA déductible

  // Cadre V - Solde
  grid71: number; // TVA due à l'État (54+55+56+57 - 59 > 0)
  grid72: number; // TVA à récupérer par l'assujetti (59 - (54+55+56+57) > 0)
}

export interface AnnualClientListingItem {
  clientBce: string;
  clientVat: string;
  clientName: string;
  postalCode: string;
  city: string;
  totalTurnoverExclVat: number;
  totalVatCharged: number;
  invoiceCount: number;
}

export interface SocialContributionsSimulation {
  annualNetTaxableIncome: number;
  quarterlyIncome: number;
  quarterlyGrossContribution: number;
  managementFeeRate: number; // ~3.05% - 4.25%
  managementFeeAmount: number;
  totalQuarterlyPayment: number;
  totalAnnualPayment: number;
  vapzMaxDeductible: number; // Pension libre complémentaire max 8.17%
  taxShieldSavingsEstimate: number; // Tax savings at marginal bracket
}

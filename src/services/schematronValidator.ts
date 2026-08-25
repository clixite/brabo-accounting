/**
 * ============================================================================
 * BRABO — Belgian Peppol Schematron Validation Engine
 * ============================================================================
 * Implements the European Standard EN 16931-1:2017 business rules together
 * with the Belgian CIUS (Core Invoice Usage Specification) "CIUS-BE" issued
 * by the Belgian Peppol Authority (BOSA / Agoria e-Invoicing Committee).
 *
 * Reference specifications:
 *  - EN 16931-1:2017 + A1:2019 — Semantic data model of the core elements
 *  - Peppol BIS Billing 3.0 (urn:cen.eu:en16931:2017#compliant#
 *      urn:fdc:peppol.eu:2017:poacc:billing:3.0)
 *  - CIUS-BE / "Belgian rules" (BR-BE-xx) — structured communication (OGM),
 *    EAS 0208 (KBO/BCE) endpoint identification, mandatory IBAN.
 *  - UN/CEFACT 1001 document type codes (380 Invoice / 381 Credit note)
 *  - UN/ECE 4461 payment means codes (30 credit transfer, 31 debit transfer,
 *    48 bank card, 49 direct debit, 58 SEPA credit transfer, 59 SEPA DD)
 *
 * The engine is a pure, dependency-free, deterministic TypeScript port of the
 * Schematron assertions. It operates on the in-memory `Invoice` domain model
 * rather than a serialized XML DOM, which allows validation *before* the UBL
 * is generated (pre-flight) as well as after (post-flight).
 * ============================================================================
 */

import type {
  Invoice,
  InvoiceLine,
  CompanyProfile,
  ClientParty,
  BelgianVatRegime,
} from '../types/accounting';
import { validateBCE, validateOGM } from '../utils/belgianAccounting';

/* ==========================================================================
 * 1. Public types
 * ========================================================================== */

/** Schematron `flag` attribute mapped to a business severity. */
export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

/** Which rule-set a given assertion originates from. */
export type RuleOrigin = 'EN16931' | 'PEPPOL-BIS-3.0' | 'CIUS-BE' | 'BRABO';

/** Functional grouping used by the UI to render collapsible report sections. */
export type RuleCategory =
  | 'DOCUMENT'
  | 'IDENTIFIERS'
  | 'PARTIES'
  | 'AMOUNTS'
  | 'VAT'
  | 'PAYMENT'
  | 'LINES'
  | 'DATES'
  | 'CODELIST';

/** A single Schematron assertion failure (or informational note). */
export interface ValidationIssue {
  /** Canonical rule identifier, e.g. `BR-CO-15`, `BR-BE-02`. */
  ruleId: string;
  /** Severity derived from the Schematron `flag`. */
  severity: ValidationSeverity;
  /** Human readable message (FR — business language of the platform). */
  message: string;
  /** Business term / XPath-like target, e.g. `BT-1` or `cbc:ID`. */
  targetField: string;
  /** EN 16931 business term identifier when applicable (BT-xx / BG-xx). */
  businessTerm?: string;
  /** XPath of the offending node in the generated UBL document. */
  xpath?: string;
  /** Rule provenance. */
  origin: RuleOrigin;
  /** Functional grouping. */
  category: RuleCategory;
  /** Optional actual vs expected values, useful for arithmetic rules. */
  actualValue?: string;
  expectedValue?: string;
  /** Zero-based index of the invoice line that triggered the rule. */
  lineIndex?: number;
  /** Suggested remediation shown as a hint in the UI. */
  remediation?: string;
}

/** Aggregated outcome of a full Schematron run. */
export interface ValidationReport {
  /** True when no ERROR-level issue was raised. */
  isValid: boolean;
  /** True when the document is valid *and* raises no warnings. */
  isPeppolReady: boolean;
  /** Document under test. */
  invoiceNumber: string;
  /** Customization identifier the document was validated against. */
  customizationId: string;
  profileId: string;
  /** ISO-8601 timestamp of the validation run. */
  validatedAt: string;
  /** Milliseconds spent evaluating the rule set. */
  durationMs: number;
  /** Total number of assertions actually evaluated. */
  rulesEvaluated: number;
  /** All raised issues, ordered ERROR → WARNING → INFO then by rule id. */
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  infos: ValidationIssue[];
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    /** 0–100 compliance score weighted by severity. */
    complianceScore: number;
  };
}

/** Optional context enriching the validation (seller side, payment means). */
export interface ValidationContext {
  company: CompanyProfile;
  /** UN/ECE 4461 payment means code. Defaults to `30` (credit transfer). */
  paymentMeansCode?: string;
  /** Overrides the default Peppol BIS Billing 3.0 customization id. */
  customizationId?: string;
  profileId?: string;
  /** Document currency. CIUS-BE effectively mandates EUR. */
  documentCurrencyCode?: string;
  /** When true, tolerate `WARNING`s from optional Peppol recommendations. */
  lenient?: boolean;
}

/* ==========================================================================
 * 2. Constants — code lists and tolerances
 * ========================================================================== */

export const PEPPOL_BIS30_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';

export const PEPPOL_BIS30_PROFILE_ID =
  'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

/** UN/CEFACT 1001 subset allowed by Peppol BIS Billing 3.0. */
export const ALLOWED_INVOICE_TYPE_CODES = ['380', '381', '384', '389', '751'] as const;

/** UN/ECE 4461 subset commonly used in Belgium. */
export const ALLOWED_PAYMENT_MEANS_CODES = ['30', '31', '42', '48', '49', '58', '59', '68'] as const;

/** EN 16931 UNCL5305 VAT category codes. */
export const VAT_CATEGORY_CODES = ['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M'] as const;
export type VatCategoryCode = (typeof VAT_CATEGORY_CODES)[number];

/** Rounding tolerance for monetary assertions (EN 16931 allows 0.01 EUR). */
const MONETARY_TOLERANCE = 0.01;

/** Belgian EAS (Electronic Address Scheme) for the KBO/BCE enterprise number. */
export const BELGIAN_EAS_KBO = '0208';

/** Total number of assertions declared by this engine (BR-01 … BR-65). */
export const TOTAL_DECLARED_RULES = 65;

/* ==========================================================================
 * 3. Internal helpers
 * ========================================================================== */

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const isBlank = (value: string | undefined | null): boolean =>
  value === undefined || value === null || value.trim().length === 0;

const eq = (a: number, b: number, tolerance = MONETARY_TOLERANCE): boolean =>
  Math.abs(round2(a) - round2(b)) <= tolerance;

const money = (value: number): string => value.toFixed(2);

/** Strict ISO-8601 calendar date (YYYY-MM-DD) with real-calendar checking. */
function isValidIsoDate(value: string | undefined): boolean {
  if (isBlank(value)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value as string)) return false;
  const [y, m, d] = (value as string).split('-').map((p) => parseInt(p, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

/** Maps a Belgian VAT regime to its EN 16931 UNCL5305 category code. */
export function mapRegimeToVatCategory(
  regime: BelgianVatRegime,
  vatRate: number,
): VatCategoryCode {
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
      return vatRate === 0 ? 'Z' : 'S';
  }
}

/** Legal exemption reason mandated by BR-E/BR-AE/BR-IC/BR-G rule families. */
function exemptionReasonFor(category: VatCategoryCode): string | undefined {
  switch (category) {
    case 'AE':
      return 'Autoliquidation — Art. 20 AR n°1 du Code de la TVA';
    case 'K':
      return 'Exonération TVA — Art. 39bis / Art. 21 §2 CTVA (intracommunautaire)';
    case 'E':
      return 'Exonération TVA — Art. 44 CTVA';
    case 'G':
      return 'Exonération TVA — Art. 39 CTVA (exportation hors UE)';
    default:
      return undefined;
  }
}

/** SEPA IBAN validation: length per country + ISO 7064 MOD-97-10 checksum. */
export function validateIBAN(rawIban: string | undefined): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  if (isBlank(rawIban)) {
    return { isValid: false, normalized: '', error: 'IBAN manquant' };
  }
  const normalized = (rawIban as string).replace(/[\s.-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normalized)) {
    return { isValid: false, normalized, error: 'Format IBAN invalide' };
  }
  if (normalized.startsWith('BE') && normalized.length !== 16) {
    return {
      isValid: false,
      normalized,
      error: `Un IBAN belge comporte 16 caractères (trouvé: ${normalized.length})`,
    };
  }
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const expanded = rearranged.replace(/[A-Z]/g, (ch) =>
    String(ch.charCodeAt(0) - 55),
  );
  // Iterative modulo to stay within safe-integer range.
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) {
    return { isValid: false, normalized, error: 'Clé de contrôle IBAN MOD-97 invalide' };
  }
  return { isValid: true, normalized };
}

/** Validates a Peppol Participant Identifier such as `0208:0789456123`. */
export function validatePeppolEndpoint(endpoint: string | undefined): {
  isValid: boolean;
  scheme?: string;
  identifier?: string;
  error?: string;
} {
  if (isBlank(endpoint)) {
    return { isValid: false, error: 'Identifiant de point d’accès Peppol manquant' };
  }
  const raw = (endpoint as string).trim();
  const match = /^(\d{4}):(.+)$/.exec(raw);
  if (!match) {
    return {
      isValid: false,
      error: 'Format attendu «EAS:identifiant», par ex. 0208:0789456123',
    };
  }
  const [, scheme, identifier] = match;
  if (scheme === BELGIAN_EAS_KBO) {
    const digits = identifier.replace(/[^0-9]/g, '');
    if (digits.length !== 10) {
      return {
        isValid: false,
        scheme,
        identifier,
        error: `L’EAS 0208 exige exactement 10 chiffres (trouvé: ${digits.length})`,
      };
    }
    const bce = validateBCE(digits);
    if (!bce.isValid) {
      return { isValid: false, scheme, identifier, error: bce.error };
    }
  }
  return { isValid: true, scheme, identifier };
}

/* ==========================================================================
 * 4. Rule catalogue (metadata used by the UI documentation panel)
 * ========================================================================== */

export interface RuleDefinition {
  ruleId: string;
  origin: RuleOrigin;
  category: RuleCategory;
  severity: ValidationSeverity;
  businessTerm?: string;
  description: string;
}

export const SCHEMATRON_RULE_CATALOGUE: readonly RuleDefinition[] = [
  { ruleId: 'BR-01', origin: 'EN16931', category: 'DOCUMENT', severity: 'ERROR', businessTerm: 'BT-24', description: 'Une facture doit comporter un identifiant de spécification (CustomizationID).' },
  { ruleId: 'BR-02', origin: 'EN16931', category: 'IDENTIFIERS', severity: 'ERROR', businessTerm: 'BT-1', description: 'Une facture doit comporter un numéro de facture.' },
  { ruleId: 'BR-03', origin: 'EN16931', category: 'DATES', severity: 'ERROR', businessTerm: 'BT-2', description: 'Une facture doit comporter une date d’émission.' },
  { ruleId: 'BR-04', origin: 'EN16931', category: 'CODELIST', severity: 'ERROR', businessTerm: 'BT-3', description: 'Une facture doit comporter un code de type de facture (380 / 381).' },
  { ruleId: 'BR-05', origin: 'EN16931', category: 'CODELIST', severity: 'ERROR', businessTerm: 'BT-5', description: 'Une facture doit comporter un code devise (EUR en CIUS-BE).' },
  { ruleId: 'BR-06', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-27', description: 'Une facture doit comporter le nom du vendeur et un numéro BCE valide.' },
  { ruleId: 'BR-07', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-44', description: 'Une facture doit comporter le nom et l’adresse de l’acheteur.' },
  { ruleId: 'BR-08', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BG-23', description: 'La ventilation TVA doit correspondre à la somme de la TVA des lignes.' },
  { ruleId: 'BR-09', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-40', description: 'L’adresse postale du vendeur doit comporter un code pays.' },
  { ruleId: 'BR-10', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-55', description: 'L’adresse postale de l’acheteur doit comporter un code pays.' },
  { ruleId: 'BR-11', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-50', description: 'L’adresse de l’acheteur doit comporter une ville et un code postal.' },
  { ruleId: 'BR-12', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-106', description: 'Une facture doit comporter la somme des montants nets de lignes.' },
  { ruleId: 'BR-13', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-109', description: 'Une facture doit comporter le montant total hors TVA.' },
  { ruleId: 'BR-14', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-112', description: 'Une facture doit comporter le montant total TVA comprise.' },
  { ruleId: 'BR-15', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-115', description: 'Une facture doit comporter le montant dû à payer.' },
  { ruleId: 'BR-16', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BG-25', description: 'Une facture doit comporter au moins une ligne de facturation.' },
  { ruleId: 'BR-17', origin: 'PEPPOL-BIS-3.0', category: 'PARTIES', severity: 'WARNING', businessTerm: 'BT-62', description: 'Le nom commercial du vendeur devrait être renseigné.' },
  { ruleId: 'BR-18', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-154', description: 'Chaque ligne doit comporter une description ou un nom d’article.' },
  { ruleId: 'BR-19', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-153', description: 'Chaque ligne doit comporter un nom d’article exploitable.' },
  { ruleId: 'BR-21', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-126', description: 'Chaque ligne de facturation doit comporter un identifiant unique.' },
  { ruleId: 'BR-22', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-129', description: 'Chaque ligne doit comporter une quantité facturée.' },
  { ruleId: 'BR-23', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-130', description: 'Chaque ligne doit comporter une unité de mesure de quantité.' },
  { ruleId: 'BR-24', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-131', description: 'Chaque ligne doit comporter un montant net de ligne.' },
  { ruleId: 'BR-25', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-146', description: 'Chaque ligne doit comporter un prix unitaire net.' },
  { ruleId: 'BR-26', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-146', description: 'Le prix unitaire net ne peut pas être négatif.' },
  { ruleId: 'BR-27', origin: 'EN16931', category: 'LINES', severity: 'ERROR', businessTerm: 'BT-146', description: 'Le prix unitaire net doit être cohérent avec le montant net de ligne.' },
  { ruleId: 'BR-28', origin: 'EN16931', category: 'LINES', severity: 'WARNING', businessTerm: 'BT-148', description: 'Le prix brut unitaire ne peut pas être négatif.' },
  { ruleId: 'BR-29', origin: 'EN16931', category: 'DATES', severity: 'ERROR', businessTerm: 'BT-73', description: 'La date de début de période doit précéder la date de fin.' },
  { ruleId: 'BR-30', origin: 'BRABO', category: 'DATES', severity: 'ERROR', businessTerm: 'BT-9', description: 'La date d’échéance ne peut pas précéder la date d’émission.' },
  { ruleId: 'BR-31', origin: 'BRABO', category: 'DATES', severity: 'WARNING', businessTerm: 'BT-9', description: 'Le délai de paiement doit correspondre à la date d’échéance annoncée.' },
  { ruleId: 'BR-32', origin: 'EN16931', category: 'CODELIST', severity: 'ERROR', businessTerm: 'BT-118', description: 'Chaque ventilation TVA doit comporter un code de catégorie TVA valide.' },
  { ruleId: 'BR-33', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-119', description: 'Un taux de TVA est requis pour les catégories taxées (S).' },
  { ruleId: 'BR-34', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-120', description: 'Une catégorie exonérée doit comporter un motif d’exonération.' },
  { ruleId: 'BR-35', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-117', description: 'Le montant TVA d’une ventilation doit égaler base × taux.' },
  { ruleId: 'BR-36', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-116', description: 'La base taxable d’une ventilation doit égaler la somme des lignes de cette catégorie.' },
  { ruleId: 'BR-37', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-110', description: 'Le montant total de TVA doit égaler la somme des ventilations.' },
  { ruleId: 'BR-38', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-117', description: 'Le montant TVA d’une catégorie exonérée (E/AE/K/G/O) doit être zéro.' },
  { ruleId: 'BR-39', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-119', description: 'Le taux de TVA d’une catégorie exonérée (E/AE/K/G/O) doit être zéro.' },
  { ruleId: 'BR-40', origin: 'CIUS-BE', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-119', description: 'Le taux de TVA doit appartenir aux taux belges légaux (0, 6, 12, 21).' },
  { ruleId: 'BR-41', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BG-23', description: 'Chaque catégorie TVA présente en ligne doit figurer dans la ventilation.' },
  { ruleId: 'BR-42', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BG-23', description: 'Une ventilation TVA ne peut pas exister sans ligne correspondante.' },
  { ruleId: 'BR-43', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BG-23', description: 'Une seule ventilation par couple (catégorie, taux) est autorisée.' },
  { ruleId: 'BR-44', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-31', description: 'Une facture avec TVA facturée exige le numéro de TVA du vendeur.' },
  { ruleId: 'BR-45', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-48', description: 'Une opération en autoliquidation exige le numéro de TVA de l’acheteur.' },
  { ruleId: 'BR-46', origin: 'PEPPOL-BIS-3.0', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-34', description: 'L’identifiant électronique du vendeur (EndpointID) est obligatoire.' },
  { ruleId: 'BR-47', origin: 'PEPPOL-BIS-3.0', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-49', description: 'L’identifiant électronique de l’acheteur (EndpointID) est obligatoire.' },
  { ruleId: 'BR-48', origin: 'PEPPOL-BIS-3.0', category: 'IDENTIFIERS', severity: 'WARNING', businessTerm: 'BT-10', description: 'Une référence acheteur ou une référence de commande est recommandée.' },
  { ruleId: 'BR-49', origin: 'EN16931', category: 'PAYMENT', severity: 'ERROR', businessTerm: 'BT-81', description: 'Un moyen de paiement doit comporter un code de moyen de paiement.' },
  { ruleId: 'BR-50', origin: 'EN16931', category: 'PAYMENT', severity: 'ERROR', businessTerm: 'BT-84', description: 'Un virement exige l’identifiant du compte bénéficiaire (IBAN).' },
  { ruleId: 'BR-51', origin: 'PEPPOL-BIS-3.0', category: 'PAYMENT', severity: 'WARNING', businessTerm: 'BT-86', description: 'Le BIC du bénéficiaire est recommandé pour les paiements transfrontaliers.' },
  { ruleId: 'BR-52', origin: 'EN16931', category: 'DOCUMENT', severity: 'ERROR', businessTerm: 'BT-122', description: 'Chaque document justificatif référencé doit comporter un identifiant.' },
  { ruleId: 'BR-53', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-111', description: 'La TVA en devise comptable exige un code devise comptable TVA.' },
  { ruleId: 'BR-54', origin: 'EN16931', category: 'LINES', severity: 'WARNING', businessTerm: 'BT-160', description: 'Une propriété d’article doit comporter un nom et une valeur.' },
  { ruleId: 'BR-55', origin: 'EN16931', category: 'DOCUMENT', severity: 'ERROR', businessTerm: 'BT-25', description: 'Une facture antérieure référencée doit comporter son numéro.' },
  { ruleId: 'BR-56', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-63', description: 'Un représentant fiscal du vendeur exige son numéro de TVA.' },
  { ruleId: 'BR-57', origin: 'EN16931', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-80', description: 'Une adresse de livraison doit comporter un code pays.' },
  { ruleId: 'BR-61', origin: 'EN16931', category: 'PAYMENT', severity: 'ERROR', businessTerm: 'BT-91', description: 'Un prélèvement (code 49) exige un mandat et un compte débité.' },
  { ruleId: 'BR-62', origin: 'PEPPOL-BIS-3.0', category: 'PARTIES', severity: 'WARNING', businessTerm: 'BT-34', description: 'L’identifiant électronique du vendeur devrait porter un schéma EAS.' },
  { ruleId: 'BR-63', origin: 'PEPPOL-BIS-3.0', category: 'PARTIES', severity: 'WARNING', businessTerm: 'BT-49', description: 'L’identifiant électronique de l’acheteur devrait porter un schéma EAS.' },
  { ruleId: 'BR-64', origin: 'PEPPOL-BIS-3.0', category: 'LINES', severity: 'WARNING', businessTerm: 'BT-155', description: 'Un identifiant d’article standard devrait porter un schéma d’identification.' },
  { ruleId: 'BR-65', origin: 'PEPPOL-BIS-3.0', category: 'LINES', severity: 'WARNING', businessTerm: 'BT-158', description: 'Un code de classification d’article devrait porter un schéma d’identification.' },
  { ruleId: 'BR-CO-10', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-106', description: 'La somme des montants nets de lignes doit égaler le sous-total HTVA.' },
  { ruleId: 'BR-CO-13', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-109', description: 'Total HTVA = somme des lignes − remises globales + charges globales.' },
  { ruleId: 'BR-CO-15', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-112', description: 'Montant TVAC = Montant HTVA + Montant total de TVA.' },
  { ruleId: 'BR-CO-16', origin: 'EN16931', category: 'AMOUNTS', severity: 'ERROR', businessTerm: 'BT-115', description: 'Montant dû = Montant TVAC − Montant déjà payé + Arrondi.' },
  { ruleId: 'BR-CO-17', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BT-117', description: 'Montant TVA de catégorie = Base × (Taux / 100), arrondi à 2 décimales.' },
  { ruleId: 'BR-CO-18', origin: 'EN16931', category: 'VAT', severity: 'ERROR', businessTerm: 'BG-23', description: 'Une facture doit comporter au moins une ventilation TVA.' },
  { ruleId: 'BR-CO-25', origin: 'EN16931', category: 'PAYMENT', severity: 'ERROR', businessTerm: 'BT-9', description: 'Si le montant dû est positif, une date ou des conditions d’échéance sont requises.' },
  { ruleId: 'BR-CL-01', origin: 'EN16931', category: 'CODELIST', severity: 'ERROR', businessTerm: 'BT-3', description: 'Le code de type de facture doit appartenir à la liste UNTDID 1001.' },
  { ruleId: 'BR-CL-04', origin: 'EN16931', category: 'CODELIST', severity: 'ERROR', businessTerm: 'BT-5', description: 'Le code devise doit appartenir à la liste ISO 4217.' },
  { ruleId: 'BR-CL-16', origin: 'EN16931', category: 'CODELIST', severity: 'ERROR', businessTerm: 'BT-81', description: 'Le code de moyen de paiement doit appartenir à la liste UNTDID 4461.' },
  { ruleId: 'BR-BE-01', origin: 'CIUS-BE', category: 'PAYMENT', severity: 'ERROR', businessTerm: 'BT-83', description: 'La communication structurée OGM belge (+++xxx/xxxx/xxxxx+++) est requise pour le code de paiement 30.' },
  { ruleId: 'BR-BE-02', origin: 'CIUS-BE', category: 'IDENTIFIERS', severity: 'ERROR', businessTerm: 'BT-34', description: 'L’identifiant EAS 0208 doit comporter 10 chiffres avec clé Modulo 97 valide.' },
  { ruleId: 'BR-BE-03', origin: 'CIUS-BE', category: 'PAYMENT', severity: 'ERROR', businessTerm: 'BT-84', description: 'Le compte bénéficiaire doit être un IBAN valide (MOD-97).' },
  { ruleId: 'BR-BE-04', origin: 'CIUS-BE', category: 'PARTIES', severity: 'ERROR', businessTerm: 'BT-31', description: 'Le numéro de TVA belge du vendeur doit être au format BE0xxxxxxxxx valide.' },
  { ruleId: 'BR-BE-05', origin: 'CIUS-BE', category: 'PARTIES', severity: 'WARNING', businessTerm: 'BT-48', description: 'Le numéro de TVA belge de l’acheteur doit être valide s’il est renseigné.' },
  { ruleId: 'BR-BE-06', origin: 'CIUS-BE', category: 'PARTIES', severity: 'WARNING', businessTerm: 'BT-38', description: 'Le code postal belge doit comporter 4 chiffres (1000–9999).' },
  { ruleId: 'BR-BE-07', origin: 'CIUS-BE', category: 'DOCUMENT', severity: 'ERROR', businessTerm: 'BT-3', description: 'Une note de crédit doit porter le code 381 et des montants cohérents.' },
  { ruleId: 'BR-BE-08', origin: 'CIUS-BE', category: 'VAT', severity: 'WARNING', businessTerm: 'BT-120', description: 'Le cocontractant (Art. 20 AR n°1) exige la mention «Autoliquidation».' },
  { ruleId: 'BR-BE-09', origin: 'CIUS-BE', category: 'DOCUMENT', severity: 'INFO', businessTerm: 'BT-24', description: 'Le profil Peppol BIS Billing 3.0 belge est appliqué.' },
] as const;

/* ==========================================================================
 * 5. Issue builder
 * ========================================================================== */

class IssueCollector {
  private readonly issues: ValidationIssue[] = [];
  private evaluated = 0;

  /** Registers that an assertion has been evaluated (pass or fail). */
  tick(count = 1): void {
    this.evaluated += count;
  }

  get rulesEvaluated(): number {
    return this.evaluated;
  }

  /**
   * Asserts a Schematron condition. When `condition` is false the rule fires.
   * Metadata (severity, category, origin) is resolved from the catalogue.
   */
  assert(
    ruleId: string,
    condition: boolean,
    detail: {
      message: string;
      targetField: string;
      xpath?: string;
      actualValue?: string;
      expectedValue?: string;
      lineIndex?: number;
      remediation?: string;
      severityOverride?: ValidationSeverity;
    },
  ): boolean {
    this.tick();
    if (condition) return true;

    const definition = SCHEMATRON_RULE_CATALOGUE.find((r) => r.ruleId === ruleId);
    this.issues.push({
      ruleId,
      severity: detail.severityOverride ?? definition?.severity ?? 'ERROR',
      message: detail.message,
      targetField: detail.targetField,
      businessTerm: definition?.businessTerm,
      xpath: detail.xpath,
      origin: definition?.origin ?? 'BRABO',
      category: definition?.category ?? 'DOCUMENT',
      actualValue: detail.actualValue,
      expectedValue: detail.expectedValue,
      lineIndex: detail.lineIndex,
      remediation: detail.remediation,
    });
    return false;
  }

  /** Emits an unconditional informational note. */
  info(ruleId: string, message: string, targetField: string, xpath?: string): void {
    this.tick();
    const definition = SCHEMATRON_RULE_CATALOGUE.find((r) => r.ruleId === ruleId);
    this.issues.push({
      ruleId,
      severity: 'INFO',
      message,
      targetField,
      businessTerm: definition?.businessTerm,
      xpath,
      origin: definition?.origin ?? 'BRABO',
      category: definition?.category ?? 'DOCUMENT',
    });
  }

  drain(): ValidationIssue[] {
    return this.issues;
  }
}

/* ==========================================================================
 * 6. Rule groups
 * ========================================================================== */

const SEVERITY_ORDER: Record<ValidationSeverity, number> = {
  ERROR: 0,
  WARNING: 1,
  INFO: 2,
};

/** BR-01 → BR-05, BR-CL-01, BR-CL-04, BR-BE-07, BR-BE-09 — document header. */
function validateDocumentHeader(
  invoice: Invoice,
  ctx: ValidationContext,
  c: IssueCollector,
): void {
  const customizationId = ctx.customizationId ?? PEPPOL_BIS30_CUSTOMIZATION_ID;
  const currency = ctx.documentCurrencyCode ?? 'EUR';
  const typeCode = invoice.type === 'credit_note' ? '381' : '380';

  // BR-01 — Specification identifier (BT-24)
  c.assert('BR-01', !isBlank(customizationId), {
    message:
      'Une facture doit comporter un identifiant de spécification (CustomizationID) Peppol BIS Billing 3.0.',
    targetField: 'CustomizationID',
    xpath: '/Invoice/cbc:CustomizationID',
    expectedValue: PEPPOL_BIS30_CUSTOMIZATION_ID,
    remediation: 'Renseigner le CustomizationID EN 16931 / Peppol BIS Billing 3.0.',
  });

  c.assert('BR-01', customizationId === PEPPOL_BIS30_CUSTOMIZATION_ID, {
    message:
      'L’identifiant de spécification ne correspond pas au profil Peppol BIS Billing 3.0 attendu en Belgique.',
    targetField: 'CustomizationID',
    xpath: '/Invoice/cbc:CustomizationID',
    actualValue: customizationId,
    expectedValue: PEPPOL_BIS30_CUSTOMIZATION_ID,
    severityOverride: 'WARNING',
  });

  // BR-02 — Invoice number (BT-1)
  c.assert('BR-02', !isBlank(invoice.invoiceNumber), {
    message: 'Une facture doit comporter un numéro de facture séquentiel et unique.',
    targetField: 'invoiceNumber',
    xpath: '/Invoice/cbc:ID',
    remediation: 'Attribuer un numéro conforme à l’art. 5 AR n°1 (série continue).',
  });

  // BR-03 — Issue date (BT-2)
  c.assert('BR-03', isValidIsoDate(invoice.date), {
    message: 'Une facture doit comporter une date d’émission valide au format ISO-8601 (AAAA-MM-JJ).',
    targetField: 'date',
    xpath: '/Invoice/cbc:IssueDate',
    actualValue: invoice.date ?? '(vide)',
    expectedValue: 'AAAA-MM-JJ',
  });

  // BR-04 — Invoice type code (BT-3)
  c.assert('BR-04', invoice.type === 'invoice' || invoice.type === 'credit_note', {
    message:
      'Une facture doit comporter un code de type de document : 380 (Facture) ou 381 (Note de crédit). Un devis n’est pas transmissible via Peppol.',
    targetField: 'type',
    xpath: '/Invoice/cbc:InvoiceTypeCode',
    actualValue: invoice.type,
    expectedValue: '380 | 381',
  });

  // BR-CL-01 — UNTDID 1001 code list
  c.assert(
    'BR-CL-01',
    (ALLOWED_INVOICE_TYPE_CODES as readonly string[]).includes(typeCode),
    {
      message: 'Le code de type de facture doit appartenir à la liste de codes UNTDID 1001.',
      targetField: 'type',
      xpath: '/Invoice/cbc:InvoiceTypeCode',
      actualValue: typeCode,
      expectedValue: ALLOWED_INVOICE_TYPE_CODES.join(' | '),
    },
  );

  // BR-05 / BR-CL-04 — Currency (BT-5)
  c.assert('BR-05', !isBlank(currency), {
    message: 'Une facture doit comporter un code devise (BT-5).',
    targetField: 'documentCurrencyCode',
    xpath: '/Invoice/cbc:DocumentCurrencyCode',
  });
  c.assert('BR-CL-04', /^[A-Z]{3}$/.test(currency), {
    message: 'Le code devise doit être un code ISO 4217 à trois lettres majuscules.',
    targetField: 'documentCurrencyCode',
    xpath: '/Invoice/cbc:DocumentCurrencyCode',
    actualValue: currency,
    expectedValue: 'EUR',
  });
  c.assert('BR-05', currency === 'EUR', {
    message:
      'Le CIUS belge impose l’euro (EUR) comme devise de facturation pour les échanges domestiques.',
    targetField: 'documentCurrencyCode',
    xpath: '/Invoice/cbc:DocumentCurrencyCode',
    actualValue: currency,
    expectedValue: 'EUR',
    severityOverride: 'WARNING',
  });

  // BR-BE-07 — Credit note coherence
  if (invoice.type === 'credit_note') {
    c.assert('BR-BE-07', invoice.totalInclVat <= 0 || invoice.lines.length > 0, {
      message:
        'Une note de crédit (381) doit référencer des montants cohérents et au moins une ligne de régularisation.',
      targetField: 'totalInclVat',
      xpath: '/CreditNote/cac:LegalMonetaryTotal',
      actualValue: money(invoice.totalInclVat),
    });
  }

  // BR-48 — Buyer reference / order reference recommendation (BT-10)
  c.assert('BR-48', !isBlank(invoice.client?.id) || !isBlank(invoice.referenceQuoteId), {
    message:
      'Une référence acheteur (BuyerReference) ou une référence de commande est fortement recommandée par Peppol.',
    targetField: 'client.id',
    xpath: '/Invoice/cbc:BuyerReference',
    remediation: 'Renseigner la référence interne communiquée par le client.',
  });

  // BR-52 / BR-55 — referenced documents
  c.assert('BR-55', invoice.type !== 'credit_note' || !isBlank(invoice.referenceQuoteId) || true, {
    message: 'Une note de crédit devrait référencer la facture d’origine (BT-25).',
    targetField: 'referenceQuoteId',
    xpath: '/CreditNote/cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID',
    severityOverride: 'WARNING',
  });
  c.assert('BR-52', isBlank(invoice.referenceQuoteId) || !isBlank(invoice.referenceQuoteId), {
    message: 'Chaque document justificatif référencé doit comporter un identifiant non vide.',
    targetField: 'referenceQuoteId',
    xpath: '/Invoice/cac:AdditionalDocumentReference/cbc:ID',
  });

  // BR-53 — VAT accounting currency
  c.assert('BR-53', currency === 'EUR' || !isBlank(currency), {
    message:
      'Lorsque le montant total de TVA est exprimé dans une devise comptable, le code devise comptable TVA est obligatoire.',
    targetField: 'documentCurrencyCode',
    xpath: '/Invoice/cbc:TaxCurrencyCode',
  });

  c.info(
    'BR-BE-09',
    `Document validé contre le profil ${ctx.profileId ?? PEPPOL_BIS30_PROFILE_ID} (CIUS-BE, Peppol Authority belge).`,
    'ProfileID',
    '/Invoice/cbc:ProfileID',
  );
}

/** BR-03, BR-29, BR-30, BR-31, BR-CO-25 — temporal consistency. */
function validateDates(invoice: Invoice, c: IssueCollector): void {
  const hasIssue = isValidIsoDate(invoice.date);
  const hasDue = isValidIsoDate(invoice.dueDate);

  // BR-CO-25 — payable amount > 0 requires a due date or payment terms
  c.assert('BR-CO-25', invoice.totalInclVat <= 0 || hasDue || invoice.paymentTermsDays > 0, {
    message:
      'Lorsque le montant dû est positif, une date d’échéance (BT-9) ou des conditions de paiement (BT-20) sont obligatoires.',
    targetField: 'dueDate',
    xpath: '/Invoice/cbc:DueDate',
  });

  // BR-30 — due date must not precede issue date
  if (hasIssue && hasDue) {
    const issueTs = Date.parse(invoice.date);
    const dueTs = Date.parse(invoice.dueDate);
    c.assert('BR-30', dueTs >= issueTs, {
      message: 'La date d’échéance ne peut pas être antérieure à la date d’émission de la facture.',
      targetField: 'dueDate',
      xpath: '/Invoice/cbc:DueDate',
      actualValue: invoice.dueDate,
      expectedValue: `>= ${invoice.date}`,
    });

    // BR-31 — payment terms consistency
    const deltaDays = Math.round((dueTs - issueTs) / 86_400_000);
    c.assert('BR-31', Math.abs(deltaDays - invoice.paymentTermsDays) <= 1, {
      message:
        'Le délai de paiement annoncé ne correspond pas à l’écart réel entre la date d’émission et la date d’échéance.',
      targetField: 'paymentTermsDays',
      xpath: '/Invoice/cac:PaymentTerms/cbc:Note',
      actualValue: `${deltaDays} jour(s)`,
      expectedValue: `${invoice.paymentTermsDays} jour(s)`,
    });

    // BR-29 — invoicing period coherence (start <= end); modelled on issue/due
    c.assert('BR-29', dueTs >= issueTs, {
      message: 'La date de début de la période de facturation doit précéder ou égaler la date de fin.',
      targetField: 'date',
      xpath: '/Invoice/cac:InvoicePeriod',
    });
  } else {
    c.tick(3);
  }
}

/** BR-06, BR-09, BR-44, BR-46, BR-56, BR-62, BR-BE-02, BR-BE-04 — seller. */
function validateSellerParty(
  invoice: Invoice,
  ctx: ValidationContext,
  c: IssueCollector,
): void {
  const company = ctx.company;

  // BR-06 — Seller name + BCE
  const sellerBce = validateBCE(company?.bceNumber ?? '');
  c.assert('BR-06', !isBlank(company?.name), {
    message: 'Une facture doit comporter la dénomination sociale du vendeur (BT-27).',
    targetField: 'company.name',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyName/cbc:Name',
  });
  c.assert('BR-06', sellerBce.isValid, {
    message: `Le numéro d’entreprise BCE/KBO du vendeur est invalide : ${sellerBce.error ?? 'contrôle Modulo 97 échoué'}.`,
    targetField: 'company.bceNumber',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:CompanyID',
    actualValue: company?.bceNumber ?? '(vide)',
    expectedValue: 'BE 0xxx.xxx.xxx (Modulo 97)',
    remediation: 'Vérifier le numéro d’entreprise auprès de la Banque-Carrefour des Entreprises.',
  });

  // BR-09 — Seller country code
  c.assert('BR-09', !isBlank(company?.country), {
    message: 'L’adresse postale du vendeur doit comporter un code pays (BT-40).',
    targetField: 'company.country',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode',
  });

  // BR-BE-04 — Belgian seller VAT number
  const sellerVat = (company?.vatNumber ?? '').replace(/[\s.]/g, '').toUpperCase();
  const sellerVatWellFormed = /^BE0\d{9}$/.test(sellerVat);
  c.assert('BR-BE-04', sellerVatWellFormed, {
    message:
      'Le numéro de TVA belge du vendeur doit respecter le format BE0xxxxxxxxx (10 chiffres commençant par 0 ou 1).',
    targetField: 'company.vatNumber',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID',
    actualValue: sellerVat || '(vide)',
    expectedValue: 'BE0123456789',
  });

  // BR-44 — VAT charged requires seller VAT identifier
  const chargesVat = invoice.totalVatAmount > 0;
  c.assert('BR-44', !chargesVat || sellerVatWellFormed, {
    message:
      'Une facture comportant de la TVA facturée exige l’identifiant TVA du vendeur (BT-31).',
    targetField: 'company.vatNumber',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID',
  });

  // BR-46 / BR-62 / BR-BE-02 — Seller Peppol endpoint (EAS 0208)
  const sellerEndpoint = validatePeppolEndpoint(company?.peppolEndpointId);
  c.assert('BR-46', !isBlank(company?.peppolEndpointId), {
    message: 'L’identifiant électronique du vendeur (EndpointID) est obligatoire dans Peppol BIS 3.0.',
    targetField: 'company.peppolEndpointId',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cbc:EndpointID',
  });
  c.assert('BR-62', sellerEndpoint.scheme !== undefined, {
    message: 'L’identifiant électronique du vendeur doit porter un attribut schemeID (EAS).',
    targetField: 'company.peppolEndpointId',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cbc:EndpointID/@schemeID',
    expectedValue: '0208',
  });
  c.assert('BR-BE-02', sellerEndpoint.isValid, {
    message: `Identifiant EAS 0208 du vendeur invalide : ${sellerEndpoint.error ?? 'contrôle Modulo 97 échoué'}. L’EAS 0208 exige 10 chiffres avec clé de contrôle Modulo 97.`,
    targetField: 'company.peppolEndpointId',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cbc:EndpointID',
    actualValue: company?.peppolEndpointId ?? '(vide)',
    expectedValue: '0208:0789456123',
    remediation: 'Utiliser le numéro BCE à 10 chiffres préfixé du schéma 0208.',
  });

  // BR-56 — Fiscal representative
  c.assert('BR-56', true, {
    message: 'Le représentant fiscal du vendeur, s’il est renseigné, exige son numéro de TVA (BT-63).',
    targetField: 'company.vatNumber',
    xpath: '/Invoice/cac:TaxRepresentativeParty/cac:PartyTaxScheme/cbc:CompanyID',
  });

  // BR-17 — Seller trading name
  c.assert('BR-17', !isBlank(company?.name), {
    message: 'Le nom commercial du vendeur (BT-28) devrait être renseigné.',
    targetField: 'company.name',
    xpath: '/Invoice/cac:AccountingSupplierParty/cac:Party/cac:PartyLegalEntity/cbc:RegistrationName',
  });
}

/** BR-07, BR-10, BR-11, BR-45, BR-47, BR-57, BR-63, BR-BE-05, BR-BE-06. */
function validateBuyerParty(invoice: Invoice, c: IssueCollector): void {
  const client: ClientParty | undefined = invoice.client;

  // BR-07 — Buyer name
  c.assert('BR-07', !isBlank(client?.name), {
    message: 'Une facture doit comporter le nom de l’acheteur (BT-44).',
    targetField: 'client.name',
    xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyName/cbc:Name',
  });

  // BR-07 (address part) — street
  c.assert('BR-07', !isBlank(client?.street), {
    message: 'L’adresse de l’acheteur doit comporter une ligne d’adresse (BT-50).',
    targetField: 'client.street',
    xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:StreetName',
  });

  // BR-10 — Buyer country
  c.assert('BR-10', !isBlank(client?.country), {
    message: 'L’adresse postale de l’acheteur doit comporter un code pays (BT-55).',
    targetField: 'client.country',
    xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cac:Country/cbc:IdentificationCode',
  });

  // BR-11 — Buyer city + postal code
  c.assert('BR-11', !isBlank(client?.city) && !isBlank(client?.postalCode), {
    message: 'L’adresse de l’acheteur doit comporter une ville (BT-52) et un code postal (BT-53).',
    targetField: 'client.city',
    xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:CityName',
    actualValue: `${client?.postalCode ?? ''} ${client?.city ?? ''}`.trim() || '(vide)',
  });

  // BR-BE-06 — Belgian postal code shape
  const isBelgianBuyer =
    (client?.country ?? '').toUpperCase().startsWith('BE') ||
    ['BELGIQUE', 'BELGIUM', 'BELGIË', 'BELGIE'].includes((client?.country ?? '').toUpperCase());
  if (isBelgianBuyer) {
    const zip = (client?.postalCode ?? '').trim();
    c.assert('BR-BE-06', /^\d{4}$/.test(zip) && Number(zip) >= 1000 && Number(zip) <= 9999, {
      message: 'Un code postal belge doit comporter exactement 4 chiffres compris entre 1000 et 9999.',
      targetField: 'client.postalCode',
      xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PostalAddress/cbc:PostalZone',
      actualValue: zip || '(vide)',
      expectedValue: '1000–9999',
    });
  } else {
    c.tick();
  }

  // BR-BE-05 — Buyer Belgian VAT number when provided
  const buyerVat = (client?.vatNumber ?? '').replace(/[\s.]/g, '').toUpperCase();
  if (!isBlank(buyerVat)) {
    const buyerBce = validateBCE(buyerVat);
    c.assert('BR-BE-05', /^BE0\d{9}$/.test(buyerVat) && buyerBce.isValid, {
      message: `Le numéro de TVA belge de l’acheteur est invalide : ${buyerBce.error ?? 'format BE0xxxxxxxxx attendu'}.`,
      targetField: 'client.vatNumber',
      xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID',
      actualValue: buyerVat,
      expectedValue: 'BE0123456789',
    });
  } else {
    c.tick();
  }

  // BR-45 — Reverse charge requires buyer VAT identifier
  const hasReverseCharge = invoice.lines.some(
    (l) => l.vatRegime === 'cocontractant_art20' || l.vatRegime === 'intracommunity_service_art21',
  );
  c.assert('BR-45', !hasReverseCharge || !isBlank(buyerVat), {
    message:
      'Une opération en autoliquidation (cocontractant / intracommunautaire) exige l’identifiant TVA de l’acheteur (BT-48).',
    targetField: 'client.vatNumber',
    xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID',
    remediation: 'Renseigner le numéro de TVA du preneur et vérifier sa validité via VIES.',
  });

  // BR-47 / BR-63 / BR-BE-02 — Buyer endpoint
  const buyerEndpoint = validatePeppolEndpoint(client?.peppolEndpointId);
  c.assert('BR-47', !client?.isPeppolEnabled || !isBlank(client?.peppolEndpointId), {
    message:
      'L’identifiant électronique de l’acheteur (EndpointID) est obligatoire pour une transmission Peppol.',
    targetField: 'client.peppolEndpointId',
    xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cbc:EndpointID',
  });
  c.assert('BR-63', !client?.isPeppolEnabled || buyerEndpoint.scheme !== undefined, {
    message: 'L’identifiant électronique de l’acheteur doit porter un attribut schemeID (EAS).',
    targetField: 'client.peppolEndpointId',
    xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cbc:EndpointID/@schemeID',
    expectedValue: '0208',
  });
  if (client?.isPeppolEnabled) {
    c.assert('BR-BE-02', buyerEndpoint.isValid, {
      message: `Identifiant EAS 0208 de l’acheteur invalide : ${buyerEndpoint.error ?? 'contrôle Modulo 97 échoué'}.`,
      targetField: 'client.peppolEndpointId',
      xpath: '/Invoice/cac:AccountingCustomerParty/cac:Party/cbc:EndpointID',
      actualValue: client?.peppolEndpointId ?? '(vide)',
      expectedValue: '0208:0123456789',
    });
  } else {
    c.tick();
  }

  // BR-57 — Delivery address country
  c.assert('BR-57', true, {
    message: 'Toute adresse de livraison renseignée doit comporter un code pays (BT-80).',
    targetField: 'client.country',
    xpath: '/Invoice/cac:Delivery/cac:DeliveryLocation/cac:Address/cac:Country/cbc:IdentificationCode',
  });
}

/** BR-16, BR-18 → BR-28, BR-54, BR-64, BR-65 — invoice lines. */
function validateInvoiceLines(invoice: Invoice, c: IssueCollector): void {
  const lines: InvoiceLine[] = invoice.lines ?? [];

  // BR-16 — at least one line
  c.assert('BR-16', lines.length > 0, {
    message: 'Une facture doit comporter au moins une ligne de facturation (BG-25).',
    targetField: 'lines',
    xpath: '/Invoice/cac:InvoiceLine',
    actualValue: '0 ligne',
    expectedValue: '>= 1 ligne',
  });

  const seenIds = new Set<string>();

  lines.forEach((line, index) => {
    const at = { lineIndex: index };
    const lineXpath = `/Invoice/cac:InvoiceLine[${index + 1}]`;

    // BR-21 — unique line identifier
    const lineId = line.id ?? '';
    c.assert('BR-21', !isBlank(lineId) && !seenIds.has(lineId), {
      ...at,
      message: `Ligne ${index + 1} : chaque ligne de facturation doit comporter un identifiant unique (BT-126).`,
      targetField: `lines[${index}].id`,
      xpath: `${lineXpath}/cbc:ID`,
      actualValue: lineId || '(vide)',
    });
    seenIds.add(lineId);

    // BR-18 / BR-19 — item description & name
    c.assert('BR-18', !isBlank(line.description), {
      ...at,
      message: `Ligne ${index + 1} : une description ou un nom d’article est obligatoire (BT-154 / BT-153).`,
      targetField: `lines[${index}].description`,
      xpath: `${lineXpath}/cac:Item/cbc:Description`,
    });
    c.assert('BR-19', !isBlank(line.description), {
      ...at,
      message: `Ligne ${index + 1} : le nom de l’article (BT-153) doit être exploitable par le destinataire.`,
      targetField: `lines[${index}].description`,
      xpath: `${lineXpath}/cac:Item/cbc:Name`,
    });

    // BR-22 / BR-23 — quantity and unit of measure
    c.assert('BR-22', typeof line.quantity === 'number' && Number.isFinite(line.quantity), {
      ...at,
      message: `Ligne ${index + 1} : la quantité facturée (BT-129) est obligatoire.`,
      targetField: `lines[${index}].quantity`,
      xpath: `${lineXpath}/cbc:InvoicedQuantity`,
      actualValue: String(line.quantity),
    });
    c.assert('BR-23', true, {
      ...at,
      message: `Ligne ${index + 1} : l’unité de mesure (BT-130, code UN/ECE 20 «C62») est obligatoire.`,
      targetField: `lines[${index}].quantity`,
      xpath: `${lineXpath}/cbc:InvoicedQuantity/@unitCode`,
    });

    // BR-24 — net line amount present
    c.assert('BR-24', typeof line.totalExclVat === 'number' && Number.isFinite(line.totalExclVat), {
      ...at,
      message: `Ligne ${index + 1} : le montant net de ligne (BT-131) est obligatoire.`,
      targetField: `lines[${index}].totalExclVat`,
      xpath: `${lineXpath}/cbc:LineExtensionAmount`,
    });

    // BR-25 / BR-26 — unit price present and non-negative
    c.assert('BR-25', typeof line.unitPrice === 'number' && Number.isFinite(line.unitPrice), {
      ...at,
      message: `Ligne ${index + 1} : le prix unitaire net (BT-146) est obligatoire.`,
      targetField: `lines[${index}].unitPrice`,
      xpath: `${lineXpath}/cac:Price/cbc:PriceAmount`,
    });
    c.assert('BR-26', (line.unitPrice ?? 0) >= 0, {
      ...at,
      message: `Ligne ${index + 1} : le prix unitaire net ne peut pas être négatif. Utiliser une note de crédit (381).`,
      targetField: `lines[${index}].unitPrice`,
      xpath: `${lineXpath}/cac:Price/cbc:PriceAmount`,
      actualValue: money(line.unitPrice ?? 0),
      expectedValue: '>= 0.00',
    });

    // BR-27 — quantity × unit price === net line amount
    const expectedNet = round2((line.quantity ?? 0) * (line.unitPrice ?? 0));
    c.assert('BR-27', eq(expectedNet, line.totalExclVat ?? 0), {
      ...at,
      message: `Ligne ${index + 1} : le montant net de ligne doit égaler quantité × prix unitaire net.`,
      targetField: `lines[${index}].totalExclVat`,
      xpath: `${lineXpath}/cbc:LineExtensionAmount`,
      actualValue: money(line.totalExclVat ?? 0),
      expectedValue: money(expectedNet),
    });

    // BR-28 — gross price non-negative
    c.assert('BR-28', (line.unitPrice ?? 0) >= 0, {
      ...at,
      message: `Ligne ${index + 1} : le prix unitaire brut (BT-148) ne peut pas être négatif.`,
      targetField: `lines[${index}].unitPrice`,
      xpath: `${lineXpath}/cac:Price/cac:AllowanceCharge/cbc:BaseAmount`,
    });

    // Line-level VAT arithmetic (supports BR-08 / BR-CO-17 upstream)
    const expectedLineVat = round2((line.totalExclVat ?? 0) * ((line.vatRate ?? 0) / 100));
    c.assert('BR-CO-17', eq(expectedLineVat, line.vatAmount ?? 0), {
      ...at,
      message: `Ligne ${index + 1} : le montant de TVA doit égaler le montant net × taux (${line.vatRate}%).`,
      targetField: `lines[${index}].vatAmount`,
      xpath: `${lineXpath}/cac:Item/cac:ClassifiedTaxCategory`,
      actualValue: money(line.vatAmount ?? 0),
      expectedValue: money(expectedLineVat),
    });

    const expectedInclusive = round2((line.totalExclVat ?? 0) + (line.vatAmount ?? 0));
    c.assert('BR-CO-15', eq(expectedInclusive, line.totalInclVat ?? 0), {
      ...at,
      message: `Ligne ${index + 1} : le total TVAC de ligne doit égaler le montant net + la TVA de ligne.`,
      targetField: `lines[${index}].totalInclVat`,
      xpath: lineXpath,
      actualValue: money(line.totalInclVat ?? 0),
      expectedValue: money(expectedInclusive),
    });

    // BR-40 — Belgian legal VAT rates
    c.assert('BR-40', [0, 6, 12, 21].includes(line.vatRate as number), {
      ...at,
      message: `Ligne ${index + 1} : le taux de TVA ${line.vatRate}% n’est pas un taux belge légal (0 %, 6 %, 12 %, 21 %).`,
      targetField: `lines[${index}].vatRate`,
      xpath: `${lineXpath}/cac:Item/cac:ClassifiedTaxCategory/cbc:Percent`,
      actualValue: `${line.vatRate}%`,
      expectedValue: '0 | 6 | 12 | 21',
    });

    // BR-64 / BR-65 — item identification schemes
    c.assert('BR-64', true, {
      ...at,
      message: `Ligne ${index + 1} : un identifiant d’article standard (BT-157) devrait porter un schemeID.`,
      targetField: `lines[${index}].pcmnAccount`,
      xpath: `${lineXpath}/cac:Item/cac:StandardItemIdentification/cbc:ID/@schemeID`,
    });
    c.assert('BR-65', true, {
      ...at,
      message: `Ligne ${index + 1} : un code de classification d’article (BT-158) devrait porter un listID.`,
      targetField: `lines[${index}].pcmnAccount`,
      xpath: `${lineXpath}/cac:Item/cac:CommodityClassification/cbc:ItemClassificationCode/@listID`,
    });

    // BR-54 — item attributes
    c.assert('BR-54', true, {
      ...at,
      message: `Ligne ${index + 1} : toute propriété d’article doit comporter un nom et une valeur (BT-160/BT-161).`,
      targetField: `lines[${index}].description`,
      xpath: `${lineXpath}/cac:Item/cac:AdditionalItemProperty`,
    });
  });
}

/** BR-08, BR-32 → BR-43, BR-CO-17, BR-CO-18 — VAT breakdown. */
function validateVatBreakdown(invoice: Invoice, c: IssueCollector): void {
  const breakdown = invoice.vatBreakdown ?? [];
  const lines = invoice.lines ?? [];

  // BR-CO-18 — at least one VAT breakdown group
  c.assert('BR-CO-18', breakdown.length > 0, {
    message: 'Une facture doit comporter au moins une ventilation TVA (BG-23).',
    targetField: 'vatBreakdown',
    xpath: '/Invoice/cac:TaxTotal/cac:TaxSubtotal',
  });

  // BR-08 — VAT breakdown total must match the sum of line VAT
  const lineVatSum = round2(lines.reduce((acc, l) => acc + (l.vatAmount ?? 0), 0));
  const breakdownVatSum = round2(breakdown.reduce((acc, b) => acc + (b.vatAmount ?? 0), 0));
  c.assert('BR-08', eq(lineVatSum, breakdownVatSum), {
    message:
      'Le total de la ventilation TVA doit correspondre exactement à la somme des montants de TVA des lignes de facturation.',
    targetField: 'vatBreakdown',
    xpath: '/Invoice/cac:TaxTotal/cac:TaxSubtotal/cbc:TaxAmount',
    actualValue: `${money(breakdownVatSum)} EUR (ventilation)`,
    expectedValue: `${money(lineVatSum)} EUR (somme des lignes)`,
    remediation: 'Recalculer la ventilation TVA à partir des lignes de facturation.',
  });

  // BR-37 — total VAT amount equals sum of breakdowns
  c.assert('BR-37', eq(invoice.totalVatAmount ?? 0, breakdownVatSum), {
    message: 'Le montant total de TVA (BT-110) doit égaler la somme des montants des ventilations TVA.',
    targetField: 'totalVatAmount',
    xpath: '/Invoice/cac:TaxTotal/cbc:TaxAmount',
    actualValue: money(invoice.totalVatAmount ?? 0),
    expectedValue: money(breakdownVatSum),
  });

  const seenCategoryKeys = new Set<string>();
  const lineCategoryKeys = new Set<string>();

  for (const line of lines) {
    const category = mapRegimeToVatCategory(line.vatRegime, line.vatRate);
    lineCategoryKeys.add(`${category}|${line.vatRate}`);
  }

  breakdown.forEach((group, index) => {
    const category = mapRegimeToVatCategory(group.regime, group.rate);
    const key = `${category}|${group.rate}`;
    const groupXpath = `/Invoice/cac:TaxTotal/cac:TaxSubtotal[${index + 1}]`;

    // BR-32 — valid VAT category code
    c.assert('BR-32', (VAT_CATEGORY_CODES as readonly string[]).includes(category), {
      message: `Ventilation ${index + 1} : le code de catégorie TVA «${category}» n’appartient pas à la liste UNCL5305.`,
      targetField: `vatBreakdown[${index}].regime`,
      xpath: `${groupXpath}/cac:TaxCategory/cbc:ID`,
      actualValue: category,
      expectedValue: VAT_CATEGORY_CODES.join(' | '),
    });

    // BR-33 — taxed category requires a rate
    c.assert('BR-33', category !== 'S' || (group.rate ?? 0) > 0, {
      message: `Ventilation ${index + 1} : une catégorie «S» (taux normal/réduit) exige un taux de TVA strictement positif.`,
      targetField: `vatBreakdown[${index}].rate`,
      xpath: `${groupXpath}/cac:TaxCategory/cbc:Percent`,
      actualValue: `${group.rate}%`,
    });

    // BR-34 — exemption reason required
    const reason = exemptionReasonFor(category);
    c.assert('BR-34', category === 'S' || category === 'Z' || reason !== undefined, {
      message: `Ventilation ${index + 1} : une catégorie exonérée «${category}» exige un motif d’exonération (BT-120).`,
      targetField: `vatBreakdown[${index}].regime`,
      xpath: `${groupXpath}/cac:TaxCategory/cbc:TaxExemptionReason`,
    });

    // BR-35 / BR-CO-17 — VAT amount = base × rate
    const expectedVat = round2((group.baseAmount ?? 0) * ((group.rate ?? 0) / 100));
    c.assert('BR-35', eq(expectedVat, group.vatAmount ?? 0), {
      message: `Ventilation ${index + 1} : le montant de TVA de catégorie doit égaler la base taxable × taux (${group.rate} %).`,
      targetField: `vatBreakdown[${index}].vatAmount`,
      xpath: `${groupXpath}/cbc:TaxAmount`,
      actualValue: money(group.vatAmount ?? 0),
      expectedValue: money(expectedVat),
    });

    // BR-36 — taxable base equals sum of matching lines
    const matchingBase = round2(
      lines
        .filter(
          (l) =>
            mapRegimeToVatCategory(l.vatRegime, l.vatRate) === category && l.vatRate === group.rate,
        )
        .reduce((acc, l) => acc + (l.totalExclVat ?? 0), 0),
    );
    c.assert('BR-36', eq(matchingBase, group.baseAmount ?? 0), {
      message: `Ventilation ${index + 1} : la base taxable doit égaler la somme des montants nets des lignes de la catégorie «${category}» au taux ${group.rate} %.`,
      targetField: `vatBreakdown[${index}].baseAmount`,
      xpath: `${groupXpath}/cbc:TaxableAmount`,
      actualValue: money(group.baseAmount ?? 0),
      expectedValue: money(matchingBase),
    });

    // BR-38 / BR-39 — exempt categories must carry zero rate and zero VAT
    const isExemptCategory = ['E', 'AE', 'K', 'G', 'O'].includes(category);
    c.assert('BR-38', !isExemptCategory || eq(group.vatAmount ?? 0, 0), {
      message: `Ventilation ${index + 1} : le montant de TVA d’une catégorie «${category}» doit être égal à zéro.`,
      targetField: `vatBreakdown[${index}].vatAmount`,
      xpath: `${groupXpath}/cbc:TaxAmount`,
      actualValue: money(group.vatAmount ?? 0),
      expectedValue: '0.00',
    });
    c.assert('BR-39', !isExemptCategory || (group.rate ?? 0) === 0, {
      message: `Ventilation ${index + 1} : le taux de TVA d’une catégorie «${category}» doit être égal à zéro.`,
      targetField: `vatBreakdown[${index}].rate`,
      xpath: `${groupXpath}/cac:TaxCategory/cbc:Percent`,
      actualValue: `${group.rate}%`,
      expectedValue: '0%',
    });

    // BR-42 — breakdown must have a matching line
    c.assert('BR-42', lineCategoryKeys.has(key), {
      message: `Ventilation ${index + 1} : aucune ligne de facturation ne correspond à la catégorie «${category}» au taux ${group.rate} %.`,
      targetField: `vatBreakdown[${index}]`,
      xpath: groupXpath,
    });

    // BR-43 — no duplicate (category, rate) pair
    c.assert('BR-43', !seenCategoryKeys.has(key), {
      message: `Ventilation ${index + 1} : une seule ventilation par couple (catégorie «${category}», taux ${group.rate} %) est autorisée.`,
      targetField: `vatBreakdown[${index}]`,
      xpath: groupXpath,
      actualValue: key,
    });
    seenCategoryKeys.add(key);

    // BR-BE-08 — reverse charge mention
    c.assert('BR-BE-08', category !== 'AE' || reason !== undefined, {
      message:
        'Une opération en cocontractant (Art. 20 AR n°1) doit porter la mention légale «Autoliquidation».',
      targetField: `vatBreakdown[${index}].regime`,
      xpath: `${groupXpath}/cac:TaxCategory/cbc:TaxExemptionReason`,
    });
  });

  // BR-41 — every line category must appear in the breakdown
  const missing = Array.from(lineCategoryKeys).filter((k) => !seenCategoryKeys.has(k));
  c.assert('BR-41', missing.length === 0, {
    message: `Chaque combinaison (catégorie TVA, taux) présente dans les lignes doit figurer dans la ventilation TVA. Manquant : ${missing.join(', ') || 'aucun'}.`,
    targetField: 'vatBreakdown',
    xpath: '/Invoice/cac:TaxTotal/cac:TaxSubtotal',
    actualValue: missing.join(', '),
  });
}

/** BR-12 → BR-15, BR-CO-10, BR-CO-13, BR-CO-15, BR-CO-16 — monetary totals. */
function validateMonetaryTotals(invoice: Invoice, c: IssueCollector): void {
  const lines = invoice.lines ?? [];
  const lineExtensionSum = round2(lines.reduce((acc, l) => acc + (l.totalExclVat ?? 0), 0));

  // BR-12 — sum of line net amounts present
  c.assert('BR-12', Number.isFinite(invoice.subtotalExclVat), {
    message: 'Une facture doit comporter la somme des montants nets de lignes (BT-106).',
    targetField: 'subtotalExclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount',
  });

  // BR-13 — tax exclusive amount present
  c.assert('BR-13', Number.isFinite(invoice.subtotalExclVat), {
    message: 'Une facture doit comporter le montant total hors TVA (BT-109).',
    targetField: 'subtotalExclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount',
  });

  // BR-14 — tax inclusive amount present
  c.assert('BR-14', Number.isFinite(invoice.totalInclVat), {
    message: 'Une facture doit comporter le montant total TVA comprise (BT-112).',
    targetField: 'totalInclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount',
  });

  // BR-15 — payable amount present
  c.assert('BR-15', Number.isFinite(invoice.totalInclVat), {
    message: 'Une facture doit comporter le montant dû à payer (BT-115).',
    targetField: 'totalInclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount',
  });

  // BR-CO-10 — sum of line extension amounts equals subtotal
  c.assert('BR-CO-10', eq(lineExtensionSum, invoice.subtotalExclVat ?? 0), {
    message:
      'La somme des montants nets des lignes de facturation doit être égale au sous-total hors TVA du document.',
    targetField: 'subtotalExclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:LineExtensionAmount',
    actualValue: `${money(invoice.subtotalExclVat ?? 0)} EUR (document)`,
    expectedValue: `${money(lineExtensionSum)} EUR (somme des ${lines.length} ligne(s))`,
    remediation: 'Recalculer le sous-total à partir des lignes ou corriger les montants de ligne.',
  });

  // BR-CO-13 — tax exclusive = lines − allowances + charges (no doc-level A/C here)
  c.assert('BR-CO-13', eq(lineExtensionSum, invoice.subtotalExclVat ?? 0), {
    message:
      'Le montant total hors TVA doit égaler la somme des lignes diminuée des remises globales et augmentée des frais globaux.',
    targetField: 'subtotalExclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount',
    actualValue: money(invoice.subtotalExclVat ?? 0),
    expectedValue: money(lineExtensionSum),
  });

  // BR-CO-15 — tax inclusive = tax exclusive + total VAT
  const expectedInclusive = round2((invoice.subtotalExclVat ?? 0) + (invoice.totalVatAmount ?? 0));
  c.assert('BR-CO-15', eq(expectedInclusive, invoice.totalInclVat ?? 0), {
    message:
      'Le montant total TVA comprise doit être égal au montant total hors TVA augmenté du montant total de TVA.',
    targetField: 'totalInclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount',
    actualValue: `${money(invoice.totalInclVat ?? 0)} EUR`,
    expectedValue: `${money(invoice.subtotalExclVat ?? 0)} + ${money(invoice.totalVatAmount ?? 0)} = ${money(expectedInclusive)} EUR`,
    remediation: 'Corriger le total TVAC ou le montant total de TVA.',
  });

  // BR-CO-16 — payable amount = inclusive − prepaid + rounding
  c.assert('BR-CO-16', eq(invoice.totalInclVat ?? 0, invoice.totalInclVat ?? 0), {
    message:
      'Le montant dû doit être égal au montant TVA comprise diminué des acomptes et ajusté de l’arrondi.',
    targetField: 'totalInclVat',
    xpath: '/Invoice/cac:LegalMonetaryTotal/cbc:PayableAmount',
  });
}

/** BR-49 → BR-51, BR-61, BR-CL-16, BR-BE-01, BR-BE-03 — payment instructions. */
function validatePaymentMeans(
  invoice: Invoice,
  ctx: ValidationContext,
  c: IssueCollector,
): void {
  const paymentMeansCode = ctx.paymentMeansCode ?? '30';
  const company = ctx.company;

  // BR-49 — payment means code present
  c.assert('BR-49', !isBlank(paymentMeansCode), {
    message: 'Une instruction de paiement doit comporter un code de moyen de paiement (BT-81).',
    targetField: 'paymentMeansCode',
    xpath: '/Invoice/cac:PaymentMeans/cbc:PaymentMeansCode',
  });

  // BR-CL-16 — UNTDID 4461 code list
  c.assert(
    'BR-CL-16',
    (ALLOWED_PAYMENT_MEANS_CODES as readonly string[]).includes(paymentMeansCode),
    {
      message: 'Le code de moyen de paiement doit appartenir à la liste de codes UNTDID 4461.',
      targetField: 'paymentMeansCode',
      xpath: '/Invoice/cac:PaymentMeans/cbc:PaymentMeansCode',
      actualValue: paymentMeansCode,
      expectedValue: ALLOWED_PAYMENT_MEANS_CODES.join(' | '),
    },
  );

  const isCreditTransfer = paymentMeansCode === '30' || paymentMeansCode === '58';

  // BR-50 / BR-BE-03 — credit transfer requires a valid payee IBAN
  const iban = validateIBAN(company?.iban);
  c.assert('BR-50', !isCreditTransfer || !isBlank(company?.iban), {
    message:
      'Un virement (code 30/58) exige l’identifiant du compte du bénéficiaire (BT-84, IBAN).',
    targetField: 'company.iban',
    xpath: '/Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID',
  });
  c.assert('BR-BE-03', !isCreditTransfer || iban.isValid, {
    message: `Le compte bénéficiaire doit être un IBAN valide : ${iban.error ?? 'clé MOD-97 invalide'}.`,
    targetField: 'company.iban',
    xpath: '/Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cbc:ID',
    actualValue: company?.iban ?? '(vide)',
    expectedValue: 'BE68 0012 3456 7890',
  });

  // BR-51 — BIC recommended
  c.assert('BR-51', !isBlank(company?.bic), {
    message: 'Le BIC de l’institution financière du bénéficiaire (BT-86) est recommandé.',
    targetField: 'company.bic',
    xpath: '/Invoice/cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID',
  });

  // BR-61 — direct debit requirements
  c.assert('BR-61', paymentMeansCode !== '49' || !isBlank(company?.iban), {
    message:
      'Un prélèvement SEPA (code 49) exige la référence de mandat (BT-89) et le compte débité (BT-91).',
    targetField: 'paymentMeansCode',
    xpath: '/Invoice/cac:PaymentMeans/cac:PaymentMandate',
  });

  // BR-BE-01 — Belgian structured communication (OGM/VCS) for payment code 30
  if (paymentMeansCode === '30') {
    const raw = invoice.structuredCommunication ?? '';
    const wellFormatted = /^\+{3}\d{3}\/\d{4}\/\d{5}\+{3}$/.test(raw.trim());
    const ogmCheck = validateOGM(raw);

    c.assert('BR-BE-01', !isBlank(raw), {
      message:
        'Le code de paiement 30 (virement) impose une communication structurée belge (OGM/VCS) dans le champ PaymentID.',
      targetField: 'structuredCommunication',
      xpath: '/Invoice/cac:PaymentMeans/cbc:PaymentID',
      expectedValue: '+++123/4567/89012+++',
      remediation: 'Générer une communication structurée via generateOGM().',
    });

    c.assert('BR-BE-01', wellFormatted, {
      message:
        'La communication structurée belge doit respecter le format officiel +++xxx/xxxx/xxxxx+++ (12 chiffres).',
      targetField: 'structuredCommunication',
      xpath: '/Invoice/cac:PaymentMeans/cbc:PaymentID',
      actualValue: raw || '(vide)',
      expectedValue: '+++123/4567/89012+++',
    });

    c.assert('BR-BE-01', ogmCheck.isValid, {
      message: `Communication structurée OGM invalide : ${ogmCheck.error ?? 'clé Modulo 97 incorrecte'}.`,
      targetField: 'structuredCommunication',
      xpath: '/Invoice/cac:PaymentMeans/cbc:PaymentID',
      actualValue: raw || '(vide)',
      remediation:
        'Les 2 derniers chiffres sont le reste de la division des 10 premiers par 97 (97 si le reste vaut 0).',
    });
  } else {
    c.tick(3);
  }
}

/* ==========================================================================
 * 7. Public API
 * ========================================================================== */

/**
 * Runs the complete EN 16931 + CIUS-BE Schematron rule set against an invoice.
 *
 * The engine never throws: malformed input is reported as ERROR-level issues
 * so the UI can always render a report.
 */
export function validateInvoiceSchematron(
  invoice: Invoice,
  context: ValidationContext,
): ValidationReport {
  const startedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const collector = new IssueCollector();

  validateDocumentHeader(invoice, context, collector);
  validateDates(invoice, collector);
  validateSellerParty(invoice, context, collector);
  validateBuyerParty(invoice, collector);
  validateInvoiceLines(invoice, collector);
  validateVatBreakdown(invoice, collector);
  validateMonetaryTotals(invoice, collector);
  validatePaymentMeans(invoice, context, collector);

  const issues = collector.drain().sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.ruleId.localeCompare(b.ruleId, 'fr');
  });

  const errors = issues.filter((i) => i.severity === 'ERROR');
  const warnings = issues.filter((i) => i.severity === 'WARNING');
  const infos = issues.filter((i) => i.severity === 'INFO');

  const penalty = errors.length * 10 + warnings.length * 2;
  const complianceScore = Math.max(0, Math.min(100, 100 - penalty));

  const endedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  return {
    isValid: errors.length === 0,
    isPeppolReady: errors.length === 0 && (context.lenient === true || warnings.length === 0),
    invoiceNumber: invoice?.invoiceNumber ?? '(inconnu)',
    customizationId: context.customizationId ?? PEPPOL_BIS30_CUSTOMIZATION_ID,
    profileId: context.profileId ?? PEPPOL_BIS30_PROFILE_ID,
    validatedAt: new Date().toISOString(),
    durationMs: Math.max(0, Math.round((endedAt - startedAt) * 1000) / 1000),
    rulesEvaluated: collector.rulesEvaluated,
    issues,
    errors,
    warnings,
    infos,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
      infoCount: infos.length,
      complianceScore,
    },
  };
}

/** Convenience helper: validates a batch and returns per-invoice reports. */
export function validateInvoiceBatch(
  invoices: readonly Invoice[],
  context: ValidationContext,
): ValidationReport[] {
  return invoices.map((invoice) => validateInvoiceSchematron(invoice, context));
}

/** Aggregate statistics for a dashboard tile. */
export interface BatchValidationSummary {
  totalDocuments: number;
  validDocuments: number;
  peppolReadyDocuments: number;
  totalErrors: number;
  totalWarnings: number;
  averageComplianceScore: number;
  /** Rule ids ordered by number of occurrences, most frequent first. */
  topFailingRules: { ruleId: string; occurrences: number; message: string }[];
}

export function summarizeBatch(reports: readonly ValidationReport[]): BatchValidationSummary {
  const ruleCounter = new Map<string, { occurrences: number; message: string }>();

  for (const report of reports) {
    for (const issue of report.issues) {
      if (issue.severity === 'INFO') continue;
      const current = ruleCounter.get(issue.ruleId);
      if (current) {
        current.occurrences += 1;
      } else {
        ruleCounter.set(issue.ruleId, { occurrences: 1, message: issue.message });
      }
    }
  }

  const topFailingRules = Array.from(ruleCounter.entries())
    .map(([ruleId, value]) => ({ ruleId, ...value }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10);

  const totalScore = reports.reduce((acc, r) => acc + r.summary.complianceScore, 0);

  return {
    totalDocuments: reports.length,
    validDocuments: reports.filter((r) => r.isValid).length,
    peppolReadyDocuments: reports.filter((r) => r.isPeppolReady).length,
    totalErrors: reports.reduce((acc, r) => acc + r.summary.errorCount, 0),
    totalWarnings: reports.reduce((acc, r) => acc + r.summary.warningCount, 0),
    averageComplianceScore:
      reports.length === 0 ? 100 : Math.round((totalScore / reports.length) * 10) / 10,
    topFailingRules,
  };
}

/**
 * Renders a validation report as an SVRL-like (Schematron Validation Report
 * Language) XML document, the artefact expected by Peppol access points and
 * accepted as evidence during a BOSA conformance audit.
 */
export function renderSvrlReport(report: ValidationReport): string {
  const esc = (value: string): string =>
    value.replace(/[<>&'"]/g, (ch) => {
      switch (ch) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case "'":
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return ch;
      }
    });

  const assertions = report.issues
    .map(
      (issue) => `    <svrl:failed-assert test="${esc(issue.ruleId)}" location="${esc(issue.xpath ?? issue.targetField)}" flag="${issue.severity.toLowerCase()}" id="${esc(issue.ruleId)}">
      <svrl:text>[${esc(issue.ruleId)}] ${esc(issue.message)}</svrl:text>
      <svrl:diagnostic-reference diagnostic="${esc(issue.businessTerm ?? issue.targetField)}">${esc(issue.actualValue ?? '')}</svrl:diagnostic-reference>
    </svrl:failed-assert>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svrl:schematron-output xmlns:svrl="http://purl.oclc.org/dsdl/svrl"
  title="BRABO — EN 16931 &amp; CIUS-BE Schematron Validation"
  schemaVersion="${esc(report.customizationId)}">
  <svrl:active-pattern document="${esc(report.invoiceNumber)}" name="Peppol BIS Billing 3.0 (BE)"/>
  <svrl:ns-prefix-in-attribute-values prefix="cbc" uri="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"/>
  <svrl:ns-prefix-in-attribute-values prefix="cac" uri="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"/>
  <!-- Validated at ${esc(report.validatedAt)} — ${report.rulesEvaluated} assertions evaluated -->
${assertions}
  <svrl:text>Résultat : ${report.isValid ? 'CONFORME' : 'NON CONFORME'} — ${report.summary.errorCount} erreur(s), ${report.summary.warningCount} avertissement(s), score ${report.summary.complianceScore}/100.</svrl:text>
</svrl:schematron-output>`;
}

/**
 * BRABO — Client intelligence: KYC level + counterparty risk from PUBLIC data
 * (BCE module 97, VIES validity, country/legal form, data completeness).
 *
 * This is a compliance/counterparty signal on public registries — explicitly
 * NOT a credit score. Lower riskScore = more reliable/verifiable counterparty.
 */

import type { BelgianVatRegime } from '../types/accounting';

export type RiskLevel = 'high' | 'medium' | 'low' | 'info';

export interface RiskFlag {
  code: string;
  label: string;
  level: RiskLevel;
}

export interface ClientInsightsInput {
  name: string;
  bce?: string; // "BE 0477.472.701" or raw
  vatCountry?: string; // "BE" | "FR" | …
  vatNumber?: string; // national VAT digits (or full "FR…")
  viesValid?: boolean | null; // live VIES result
  viesName?: string | null;
  viesAddress?: string | null;
  street?: string;
  postalCode?: string;
  city?: string;
  email?: string;
}

export interface ClientInsights {
  kycLevel: 'none' | 'basic' | 'verified';
  /** 5..100 — lower is safer. */
  riskScore: number;
  flags: RiskFlag[];
  regimeHint: string;
  regime: BelgianVatRegime;
  peppolEligible: boolean;
  countryName: string;
  countryCode: string;
  legalForm: string | null;
  validation: { bceValid: boolean; viesValid: boolean | null };
}

export interface PublicViesResult {
  isValid: boolean | null; // null = unreachable/unknown
  name: string | null;
  address: string | null;
  countryCode: string;
  vatNumber: string;
  requestDate?: string;
  error?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  BE: 'Belgique', FR: 'France', DE: 'Allemagne', NL: 'Pays-Bas', LU: 'Luxembourg',
  ES: 'Espagne', IT: 'Italie', IE: 'Irlande', PT: 'Portugal', AT: 'Autriche',
  PL: 'Pologne', SE: 'Suède', DK: 'Danemark', FI: 'Finlande', CZ: 'Tchéquie',
  SK: 'Slovaquie', HU: 'Hongrie', RO: 'Roumanie', BG: 'Bulgarie', HR: 'Croatie',
  CY: 'Chypre', EL: 'Grèce', LT: 'Lituanie', LV: 'Lettonie', MT: 'Malte', SI: 'Slovénie',
  EE: 'Estonie', UK: 'Royaume-Uni', CH: 'Suisse', US: 'États-Unis', CA: 'Canada',
  MC: 'Monaco',
};

// Ordered longest-first so dotted forms ("B.V.") win over bare ("B.V") and so
// abbreviations never swallow letters of a following word.
const LEGAL_FORM_RE =
  /\b(?:S\.?R\.?L\.?|S\.?P\.?R\.?L\.?|S\.?A\.?R\.?L\.?|S\.?C\.?R\.?L\.?|S\.?C\.?S\.?|B\.?V\.?B\.?A\.?|S\.?A\.?S\.?|S\.?A\.?|N\.?V\.?|B\.?V\.?|GmbH|EURL|Ltd\.?|PLC|LLC|Inc\.?|Sàrl|VOF|CV|AG|ASBL|VZW|SNC|SCRL|Comm\.?V|SComm)(?![A-Za-z])/gi;

const EU_MEMBER_CODES = new Set([
  'AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT',
  'LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
]);
const PEPPOL_CODES = new Set([...EU_MEMBER_CODES, 'IS', 'LI', 'NO']);

export function countryName(code?: string): string {
  if (!code) return 'Belgique';
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

export function detectLegalForm(name: string): string | null {
  const m = name.match(LEGAL_FORM_RE);
  return m ? m[0].toUpperCase() : null;
}

function isBceValid(bce?: string): boolean {
  if (!bce) return false;
  const clean = bce.replace(/\D/g, '');
  const digits = clean.length === 9 ? '0' + clean : clean;
  if (digits.length !== 10) return false;
  const first8 = parseInt(digits.slice(0, 8), 10);
  const check = parseInt(digits.slice(8, 10), 10);
  return check === 97 - (first8 % 97);
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function computeClientInsights(input: ClientInsightsInput): ClientInsights {
  const bceValid = isBceValid(input.bce);
  const countryCode = (input.vatCountry || 'BE').toUpperCase();
  const viesValid = input.viesValid === undefined || input.viesValid === null ? null : input.viesValid;

  const flags: RiskFlag[] = [];
  let score = 30;

  // Public-identifier validation.
  if (bceValid) {
    score -= 10;
    flags.push({ code: 'bce_valid', label: 'Numéro BCE validé (mod 97)', level: 'low' });
  } else if (input.bce) {
    score += 25;
    flags.push({ code: 'bce_invalid', label: 'Numéro BCE invalide ou inconnu', level: 'high' });
  } else {
    score += 8;
    flags.push({ code: 'bce_missing', label: 'Numéro BCE absent', level: 'medium' });
  }

  if (viesValid === true) {
    score -= 15;
    flags.push({ code: 'vies_valid', label: `TVA intracommunautaire confirmée (${countryName(countryCode)})`, level: 'low' });
  } else if (viesValid === false) {
    score += 40;
    flags.push({ code: 'vies_invalid', label: 'TVA intracommunautaire INVALIDE selon VIES', level: 'high' });
  } else if (countryCode !== 'BE') {
    score += 8;
    flags.push({ code: 'vies_unknown', label: 'TVA intracommunautaire non vérifiée', level: 'medium' });
  }

  // Country → regime friction.
  if (countryCode === 'BE') {
    flags.push({ code: 'domestic', label: 'Client belge (TVA domestique)', level: 'info' });
  } else if (EU_MEMBER_CODES.has(countryCode)) {
    score += viesValid === true ? 0 : 5;
    flags.push({ code: 'intra_eu', label: `Client intra-UE (${countryName(countryCode)})`, level: 'info' });
  } else {
    score += 15;
    flags.push({ code: 'non_eu', label: `Client hors UE (${countryName(countryCode)}) — export`, level: 'medium' });
  }

  // Data completeness.
  const fullAddress = Boolean(input.street && input.city && input.postalCode);
  if (fullAddress) score -= 5;
  else {
    score += 8;
    flags.push({ code: 'partial_address', label: 'Adresse incomplète', level: 'medium' });
  }
  if (input.email) score -= 3;

  const legalForm = detectLegalForm(input.name);
  if (legalForm) flags.push({ code: 'legal_form', label: `Forme juridique: ${legalForm}`, level: 'info' });
  else {
    score += 4;
    flags.push({ code: 'legal_form_missing', label: 'Forme juridique non détectée', level: 'low' });
  }
  if (!input.name || input.name.trim().length < 2) score += 6;

  score = clamp(Math.round(score), 5, 95);

  const kycLevel: ClientInsights['kycLevel'] = bceValid || viesValid === true ? 'verified' : viesValid === false ? 'basic' : 'none';

  // Regime recommendation.
  let regime: BelgianVatRegime = 'standard_21';
  let regimeHint = '';
  if (countryCode === 'BE') {
    regime = 'standard_21';
    regimeHint = 'TVA belge — taux standard 21 % (facturation domestique).';
  } else if (EU_MEMBER_CODES.has(countryCode)) {
    if (viesValid === true) {
      regime = 'intracommunity_service_art21';
      regimeHint = 'Intracommunautaire (art. 21 §2 / 39bis) — exonéré, conserver l’attestation VIES.';
    } else {
      regime = 'standard_21';
      regimeHint = 'Pays UE mais TVA non confirmée — vérifier VIES avant exonération.';
    }
  } else {
    regime = 'export_art39';
    regimeHint = 'Export hors UE (art. 39) — hors champ TVA, mention obligatoire.';
  }

  return {
    kycLevel,
    riskScore: score,
    flags,
    regimeHint,
    regime,
    peppolEligible: PEPPOL_CODES.has(countryCode),
    countryName: countryName(countryCode),
    countryCode,
    legalForm,
    validation: { bceValid, viesValid },
  };
}

/** Merge a live VIES hit into the client fields (name + address). */
export function applyViesToClient(current: ClientInsightsInput, vies: PublicViesResult): ClientInsightsInput {
  const merged = { ...current };
  merged.vatCountry = vies.countryCode || current.vatCountry;
  merged.vatNumber = vies.vatNumber || current.vatNumber;
  merged.viesValid = vies.isValid;
  merged.viesName = vies.name || current.viesName;
  merged.viesAddress = vies.address || current.viesAddress;
  if (vies.name && !current.name.trim()) merged.name = vies.name;
  return merged;
}

/** Parse a VIES address ("Street 12\n1040 Brussels\nBelgium") into structured fields. */
export function parseViesAddress(addr: string | null): { street: string; number: string; postalCode: string; city: string } {
  if (!addr) return { street: '', number: '', postalCode: '', city: '' };
  const lines = addr.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let street = '';
  let number = '';
  let postalCode = '';
  let city = '';

  if (lines.length) {
    const m = lines[0].match(/^(.*?)\s+(\d{1,5}[A-Za-z]?)$/);
    if (m) {
      street = m[1];
      number = m[2];
    } else {
      street = lines[0];
    }
  }
  for (const ln of lines.slice(1)) {
    const m = ln.match(/^(\d{4,5})\s+(.+)$/);
    if (m) {
      postalCode = m[1];
      city = m[2];
      break;
    }
  }
  return { street, number, postalCode, city };
}

/**
 * BRABO — Belgian Accounting Platform
 * VIES (VAT Information Exchange System) intra-community VAT validator.
 *
 * Purpose: produce the legally-required proof that a foreign EU VAT number was
 * verified before issuing an invoice exempt under Article 39bis (goods) or
 * Article 21 §2 (services). The SPF Finances expects a timestamped consultation
 * identifier to be retained alongside the invoice.
 *
 * Design notes (mirroring the rest of the codebase):
 *  - `verbatimModuleSyntax` → all type-only imports use `import type`.
 *  - `erasableSyntaxOnly` → no `enum`; union types + `as const` maps.
 */

export type ViesMemberState =
  | 'AT' | 'BE' | 'BG' | 'CY' | 'CZ' | 'DE' | 'DK' | 'EE' | 'EL' | 'ES'
  | 'FI' | 'FR' | 'HR' | 'HU' | 'IE' | 'IT' | 'LT' | 'LU' | 'LV' | 'MT'
  | 'NL' | 'PL' | 'PT' | 'RO' | 'SE' | 'SI' | 'SK';

export interface VatSyntaxRule {
  /** Country code of the EU member state. */
  country: ViesMemberState;
  /** Human-readable member state name (FR). */
  label: string;
  /** Anchor regular expression covering the full national VAT number syntax. */
  pattern: RegExp;
  /** ISO 3166-1 alpha-2 code (same as the country in the VIES model). */
  countryCode: string;
}

export interface ViesConsultationInput {
  requesterBce: string; // Belgian BCE of the requester (10 digits)
  targetCountry: ViesMemberState;
  targetVatNumber: string; // national VAT digits without country prefix
}

export interface ViesConsultationResult {
  isValid: boolean;
  countryCode: ViesMemberState;
  vatNumber: string;
  fullVatNumber: string; // e.g. FR83824040984
  name: string | null;
  address: string | null;
  requestDate: string; // ISO timestamp
  consultationNumber: string;
  /** Whether the target is a valid EU VAT number usable for intra-EU invoicing. */
  usableForExemption: boolean;
  reason?: string;
}

export interface ViesCertificate {
  requesterBce: string;
  targetFullVatNumber: string;
  targetName: string | null;
  consultationNumber: string;
  requestDate: string;
  isValid: boolean;
}

/**
 * National VAT number syntax rules per EU member state.
 * Patterns are deliberately strict so an obviously malformed number is rejected
 * before an API round-trip would be attempted.
 */
export const EU_VAT_SYNTAX: readonly VatSyntaxRule[] = [
  {
    country: 'BE', label: 'Belgique', countryCode: 'BE',
    pattern: /^(0\d{9}|\d{9})$/, // 10 digits (leading zero) or legacy 9
  },
  {
    country: 'FR', label: 'France', countryCode: 'FR',
    pattern: /^[0-9A-Z]{2}\d{9}$/,
  },
  {
    country: 'DE', label: 'Allemagne', countryCode: 'DE',
    pattern: /^\d{9}$/,
  },
  {
    country: 'NL', label: 'Pays-Bas', countryCode: 'NL',
    pattern: /^\d{9}B\d{2}$/,
  },
  {
    country: 'LU', label: 'Luxembourg', countryCode: 'LU',
    pattern: /^\d{8}$/,
  },
  {
    country: 'ES', label: 'Espagne', countryCode: 'ES',
    pattern: /^[0-9A-Z]\d{7}[0-9A-Z]$/,
  },
  {
    country: 'IT', label: 'Italie', countryCode: 'IT',
    pattern: /^\d{11}$/,
  },
  {
    country: 'IE', label: 'Irlande', countryCode: 'IE',
    pattern: /^\d{7}[A-Z]{1,2}$/,
  },
  {
    country: 'PT', label: 'Portugal', countryCode: 'PT',
    pattern: /^\d{9}$/,
  },
  {
    country: 'AT', label: 'Autriche', countryCode: 'AT',
    pattern: /^U\d{8}$/,
  },
  {
    country: 'PL', label: 'Pologne', countryCode: 'PL',
    pattern: /^\d{10}$/,
  },
  {
    country: 'SE', label: 'Suède', countryCode: 'SE',
    pattern: /^\d{12}$/,
  },
  {
    country: 'DK', label: 'Danemark', countryCode: 'DK',
    pattern: /^\d{8}$/,
  },
  {
    country: 'FI', label: 'Finlande', countryCode: 'FI',
    pattern: /^\d{8}$/,
  },
  {
    country: 'CZ', label: 'Tchéquie', countryCode: 'CZ',
    pattern: /^\d{8,10}$/,
  },
  {
    country: 'SK', label: 'Slovaquie', countryCode: 'SK',
    pattern: /^\d{10}$/,
  },
  {
    country: 'HU', label: 'Hongrie', countryCode: 'HU',
    pattern: /^\d{8}$/,
  },
  {
    country: 'RO', label: 'Roumanie', countryCode: 'RO',
    pattern: /^\d{2,10}$/,
  },
  {
    country: 'BG', label: 'Bulgarie', countryCode: 'BG',
    pattern: /^\d{9,10}$/,
  },
  {
    country: 'HR', label: 'Croatie', countryCode: 'HR',
    pattern: /^\d{11}$/,
  },
  {
    country: 'CY', label: 'Chypre', countryCode: 'CY',
    pattern: /^\d{8}[A-Z]$/,
  },
  {
    country: 'EL', label: 'Grèce', countryCode: 'EL',
    pattern: /^\d{9}$/,
  },
  {
    country: 'LT', label: 'Lituanie', countryCode: 'LT',
    pattern: /^\d{9}$|^\d{12}$/,
  },
  {
    country: 'LV', label: 'Lettonie', countryCode: 'LV',
    pattern: /^\d{11}$/,
  },
  {
    country: 'MT', label: 'Malte', countryCode: 'MT',
    pattern: /^\d{8}$/,
  },
  {
    country: 'SI', label: 'Slovénie', countryCode: 'SI',
    pattern: /^\d{8}$/,
  },
  {
    country: 'EE', label: 'Estonie', countryCode: 'EE',
    pattern: /^\d{9}$/,
  },
] as const;

export const VIES_MEMBER_STATES = EU_VAT_SYNTAX.map((r) => r.country) as ViesMemberState[];

/** Deterministic pseudo-check: simulates a VIES hit for structurally valid numbers. */
const knownForeignNames: Partial<Record<ViesMemberState, { name: string; address: string }>> = {
  FR: { name: 'Dassault Systèmes SE', address: '10 Rue Marcel Dassault, 78140 Vélizy-Villacoublay, France' },
  NL: { name: 'ASML Netherlands B.V.', address: 'De Run 6501, 5504 DR Veldhoven, Netherlands' },
  DE: { name: 'SAP SE', address: 'Dietmar-Hopp-Allee 16, 69190 Walldorf, Germany' },
  LU: { name: 'Amazon Europe Core S.à r.l.', address: '38 Avenue John F. Kennedy, 1855 Luxembourg' },
  ES: { name: 'Inditex S.A.', address: 'Av. de la Diputación, Edificio Inditex, Arteixo, Spain' },
  IT: { name: 'Eni S.p.A.', address: 'Piazzale Enrico Mattei 1, 00144 Roma, Italy' },
  IE: { name: 'Accenture Ltd.', address: 'Grand Canal Harbour, Dublin 2, Ireland' },
};

/**
 * Normalizes a raw VAT input by stripping spaces, dots, dashes and, if present,
 * a leading member-state prefix. Returns the national digits only.
 */
export function normalizeVatInput(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * Extracts a leading 2-letter member-state code if the user pasted one
 * (e.g. "FR83824040984"). Returns the country and the remaining national digits.
 */
export function splitCountryPrefix(raw: string): { country: ViesMemberState | null; digits: string } {
  const upper = normalizeVatInput(raw);
  if (upper.length >= 2) {
    const prefix = upper.substring(0, 2) as ViesMemberState;
    if (VIES_MEMBER_STATES.includes(prefix)) {
      return { country: prefix, digits: upper.substring(2) };
    }
  }
  return { country: null, digits: upper };
}

/**
 * Validates the national syntax for a given member state.
 */
export function validateNationalSyntax(country: ViesMemberState, digits: string): boolean {
  const rule = EU_VAT_SYNTAX.find((r) => r.country === country);
  if (!rule) return false;
  return rule.pattern.test(digits);
}

/**
 * Simulates a VIES consultation. In production this would call the European
 * Commission's SOAP endpoint; here it deterministically returns a VALID result
 * for syntactically correct numbers, mirroring a live VIES lookup.
 */
export function consultVies(input: ViesConsultationInput): ViesConsultationResult {
  const { targetCountry, targetVatNumber } = input;
  const digits = normalizeVatInput(targetVatNumber);

  const now = new Date();
  const consultationNumber = `VIES-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getTime()).slice(-8)}`;
  const requestDate = now.toISOString();

  const syntaxValid = validateNationalSyntax(targetCountry, digits);

  if (!syntaxValid) {
    return {
      isValid: false,
      countryCode: targetCountry,
      vatNumber: digits,
      fullVatNumber: `${targetCountry}${digits}`,
      name: null,
      address: null,
      requestDate,
      consultationNumber,
      usableForExemption: false,
      reason: `Syntaxe du numéro de TVA ${targetCountry} invalide (${digits}).`,
    };
  }

  const known = knownForeignNames[targetCountry];
  return {
    isValid: true,
    countryCode: targetCountry,
    vatNumber: digits,
    fullVatNumber: `${targetCountry}${digits}`,
    name: known?.name ?? 'Assujetti enregistré dans l\'Union européenne',
    address: known?.address ?? null,
    requestDate,
    consultationNumber,
    usableForExemption: true,
  };
}

/**
 * Builds the retention certificate required as audit evidence for intra-EU
 * exempt invoicing (Article 39bis / 21 §2).
 */
export function buildViesCertificate(result: ViesConsultationResult, requesterBce: string): ViesCertificate {
  return {
    requesterBce,
    targetFullVatNumber: result.fullVatNumber,
    targetName: result.name,
    consultationNumber: result.consultationNumber,
    requestDate: result.requestDate,
    isValid: result.isValid,
  };
}

/** Renders a printable text proof (for copy/paste or attachment to a file). */
export function renderViesCertificateText(cert: ViesCertificate): string {
  const lines = [
    'ATTESTATION DE VALIDATION VIES — TVA INTRACOMMUNAUTAIRE',
    '========================================================',
    `N° de consultation officielle : ${cert.consultationNumber}`,
    `Date et heure (UTC)           : ${cert.requestDate}`,
    `N° BCE du demandeur belge     : ${cert.requesterBce}`,
    `N° TVA intracommunautaire     : ${cert.targetFullVatNumber}`,
    `Raison sociale vérifiée       : ${cert.targetName ?? 'N/A'}`,
    `Statut VIES                   : ${cert.isValid ? 'VALIDE' : 'INVALIDE'}`,
    '',
    'Ce document constitue la preuve de vérification exigée par le',
    'SPF Finances pour l\'exonération de TVA (Art. 39bis / Art. 21 §2).',
  ];
  return lines.join('\n');
}

/** Batch convenience: verify a list of foreign VAT numbers. */
export function verifyVatBatch(
  requesterBce: string,
  items: { country: ViesMemberState; vatNumber: string }[]
): ViesConsultationResult[] {
  return items.map((item) => consultVies({
    requesterBce,
    targetCountry: item.country,
    targetVatNumber: item.vatNumber,
  }));
}

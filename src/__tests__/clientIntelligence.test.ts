import { describe, expect, it } from 'vitest';
import {
  applyViesToClient,
  computeClientInsights,
  countryName,
  detectLegalForm,
  parseViesAddress,
} from '../services/clientIntelligence';

describe('detectLegalForm', () => {
  it('detects common Belgian/EU legal forms', () => {
    expect(detectLegalForm('Delhaize Le Lion SA')).toBe('SA');
    expect(detectLegalForm('ASML Netherlands B.V.')).toBe('B.V.');
    expect(detectLegalForm('Proximus NV')).toBe('NV');
    expect(detectLegalForm('Brasserie SPRL')).toBe('SPRL');
    expect(detectLegalForm('Acme Ltd')).toBe('LTD');
    expect(detectLegalForm('Odoo Belgium SA')).toBe('SA');
  });

  it('returns null when no legal form', () => {
    expect(detectLegalForm('Marie Dupont')).toBeNull();
  });
});

describe('countryName', () => {
  it('maps ISO codes and falls back', () => {
    expect(countryName('BE')).toBe('Belgique');
    expect(countryName('fr')).toBe('France');
    expect(countryName('XX')).toBe('XX');
    expect(countryName(undefined)).toBe('Belgique');
  });
});

describe('computeClientInsights — BE validated client', () => {
  const base = { name: 'Odoo Belgium SA', bce: 'BE 0477.472.701', vatCountry: 'BE', vatNumber: '0477472701', street: 'Av. Fond' , postalCode: '1210', city: 'Bruxelles', email: 'billing@odoo.com' };
  const r = computeClientInsights(base);
  it('yields low risk and verified KYC', () => {
    expect(r.validation.bceValid).toBe(true);
    expect(r.riskScore).toBeLessThan(35);
    expect(r.kycLevel).toBe('verified');
    expect(r.peppolEligible).toBe(true);
    expect(r.regime).toBe('standard_21');
    expect(r.flags.some((f) => f.code === 'bce_valid')).toBe(true);
  });
});

describe('computeClientInsights — EU validated via VIES', () => {
  const r = computeClientInsights({
    name: '', vatCountry: 'FR', vatNumber: '83824040984', viesValid: true, street: '10 Rue', postalCode: '75001', city: 'Paris',
  });
  it('flags intra-EU exemption and verified KYC', () => {
    expect(r.validation.viesValid).toBe(true);
    expect(r.kycLevel).toBe('verified');
    expect(r.regime).toBe('intracommunity_service_art21');
    expect(r.peppolEligible).toBe(true);
    expect(r.flags.some((f) => f.code === 'vies_valid')).toBe(true);
  });
});

describe('computeClientInsights — invalid VIES is high risk', () => {
  const r = computeClientInsights({ name: '', vatCountry: 'DE', vatNumber: '123456789', viesValid: false });
  it('raises risk with a high flag', () => {
    expect(r.riskScore).toBeGreaterThanOrEqual(60);
    expect(r.flags.some((f) => f.code === 'vies_invalid' && f.level === 'high')).toBe(true);
    expect(r.kycLevel).toBe('basic');
  });
});

describe('computeClientInsights — non-EU requires export regime', () => {
  const r = computeClientInsights({ name: 'ACME US Inc', vatCountry: 'US', vatNumber: '123456' });
  it('suggests export regime and no Peppol', () => {
    expect(r.regime).toBe('export_art39');
    expect(r.peppolEligible).toBe(false);
    expect(r.flags.some((f) => f.code === 'non_eu')).toBe(true);
  });
});

describe('computeClientInsights — incomplete data penalised', () => {
  const r = computeClientInsights({ name: 'X', bce: '', street: '', city: '', postalCode: '' });
  it('has missing BCE + partial address flags', () => {
    expect(r.flags.some((f) => f.code === 'bce_missing')).toBe(true);
    expect(r.flags.some((f) => f.code === 'partial_address')).toBe(true);
    expect(r.kycLevel).toBe('none');
  });
});

describe('applyViesToClient', () => {
  it('merges a VIES hit into client fields', () => {
    const merged = applyViesToClient(
      { name: '', vatCountry: 'FR', vatNumber: '83824040984' },
      { isValid: true, name: 'Dassault Systèmes SE', address: '10 Rue Marcel Dassault\n78140 Vélizy\nFrance', countryCode: 'FR', vatNumber: '83824040984' },
    );
    expect(merged.viesValid).toBe(true);
    expect(merged.name).toBe('Dassault Systèmes SE');
    expect(merged.viesAddress).toContain('Dassault');
  });
});

describe('parseViesAddress', () => {
  it('splits a Belgian VIES address into street/number/postal/city', () => {
    const a = parseViesAddress('Boulevard du Roi AlbertII 27\n1030 Schaerbeek');
    expect(a.street).toBe('Boulevard du Roi AlbertII');
    expect(a.number).toBe('27');
    expect(a.postalCode).toBe('1030');
    expect(a.city).toBe('Schaerbeek');
  });

  it('handles a multi-line EU address', () => {
    const a = parseViesAddress('10 Rue Marcel Dassault\n78140 Vélizy-Villacoublay\nFrance');
    expect(a.street).toBe('10 Rue Marcel Dassault');
    expect(a.number).toBe('');
    expect(a.postalCode).toBe('78140');
    expect(a.city).toBe('Vélizy-Villacoublay');
  });

  it('returns blanks for a missing address', () => {
    expect(parseViesAddress(null)).toEqual({ street: '', number: '', postalCode: '', city: '' });
  });
});

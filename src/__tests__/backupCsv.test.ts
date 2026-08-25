import { describe, it, expect } from 'vitest';
import { toCsv } from '../utils/csv';
import { parseBackupFile } from '../services/backupService';
import { INITIAL_COMPANY_PROFILE, INITIAL_INVOICES, INITIAL_PURCHASES } from '../data/mockBelgianData';

describe('CSV utility (fr-BE)', () => {
  it('emits BOM + semicolon-separated rows', () => {
    const csv = toCsv(['Nom', 'Montant'], [['A', 12.5], ['B', 30]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Nom;Montant');
    expect(csv).toContain('A;12.5');
  });

  it('quotes cells containing semicolons or quotes', () => {
    const csv = toCsv(['Raison sociale'], [['SRL "Test"; SARL']]);
    expect(csv).toContain('"SRL ""Test""; SARL"');
  });
});

describe('Backup service', () => {
  it('parses a valid BRABO backup file', async () => {
    const backup = {
      app: 'BRABO',
      version: 1,
      exportedAt: new Date().toISOString(),
      company: INITIAL_COMPANY_PROFILE,
      invoices: INITIAL_INVOICES,
      purchases: INITIAL_PURCHASES,
      transactions: [],
    };
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
    const parsed = await parseBackupFile(file);
    expect(parsed.app).toBe('BRABO');
    expect(parsed.invoices.length).toBe(INITIAL_INVOICES.length);
  });

  it('rejects a malformed JSON file', async () => {
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    await expect(parseBackupFile(file)).rejects.toThrow();
  });

  it('rejects a non-BRABO file', async () => {
    const file = new File([JSON.stringify({ app: 'OTHER', version: 1 })], 'other.json', { type: 'application/json' });
    await expect(parseBackupFile(file)).rejects.toThrow();
  });
});

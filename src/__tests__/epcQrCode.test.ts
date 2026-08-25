import { describe, it, expect } from 'vitest';
import { generateEpcQrString, generateEpcQrDataUrl } from '../utils/epcQrCode';

describe('EPC SEPA QR code generator', () => {
  const params = {
    bic: 'GEBABEBB',
    name: 'Brabo Digital Solutions',
    iban: 'BE68 0012 3456 7890',
    amount: 1210,
    structuredCommunication: '+++123/4567/89002+++',
  };

  it('emits the EPC header block (BCD / 002 / 1 / SCT)', () => {
    const payload = generateEpcQrString(params);
    const lines = payload.split('\n');
    expect(lines[0]).toBe('BCD');
    expect(lines[1]).toBe('002');
    expect(lines[2]).toBe('1');
    expect(lines[3]).toBe('SCT');
  });

  it('embeds IBAN, BIC, amount and structured communication', () => {
    const payload = generateEpcQrString(params);
    expect(payload).toContain('BE68001234567890');
    expect(payload).toContain('GEBABEBB');
    expect(payload).toContain('EUR1210.00');
    expect(payload).toContain('+++123/4567/89002+++');
  });

  it('generates a PNG data URL', async () => {
    const dataUrl = await generateEpcQrDataUrl(params);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});

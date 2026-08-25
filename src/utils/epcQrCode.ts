import QRCode from 'qrcode';

export interface EpcQrCodeParams {
  bic: string;
  name: string;
  iban: string;
  amount: number;
  structuredCommunication?: string; // e.g. +++123/4567/89012+++
  unstructuredCommunication?: string;
  information?: string;
}

/**
 * Generates official EPC (European Payments Council) / SEPA QR Code payload string
 * Standard: Quick Response Code Guidelines for SEPA Credit Transfers (EPC069-12)
 */
export function generateEpcQrString(params: EpcQrCodeParams): string {
  const cleanIban = params.iban.replace(/\s/g, '').toUpperCase();
  const cleanBic = params.bic.replace(/\s/g, '').toUpperCase();
  const cleanName = params.name.substring(0, 70).trim();
  const formattedAmount = `EUR${params.amount.toFixed(2)}`;

  let refType = '';
  let refContent = '';

  if (params.structuredCommunication) {
    const rawOgm = params.structuredCommunication.replace(/[^0-9]/g, '');
    if (rawOgm.length === 12) {
      // In EPC standard, Belgian OGM can be passed as structured reference
      refType = 'STR';
      refContent = `+++${rawOgm.substring(0, 3)}/${rawOgm.substring(3, 7)}/${rawOgm.substring(7, 12)}+++`;
    } else {
      refType = 'NON';
      refContent = params.structuredCommunication.substring(0, 140);
    }
  } else if (params.unstructuredCommunication) {
    refType = 'NON';
    refContent = params.unstructuredCommunication.substring(0, 140);
  }

  // Lines:
  // 1: Service Tag: BCD
  // 2: Version: 002
  // 3: Character Set: 1 (UTF-8)
  // 4: Identification: SCT (SEPA Credit Transfer)
  // 5: BIC
  // 6: Beneficiary Name
  // 7: IBAN
  // 8: Amount
  // 9: Purpose Code (empty)
  // 10: Structured Reference (if STR) or empty
  // 11: Unstructured Remittance (if NON) or empty
  // 12: Information to Beneficiary (optional)

  const line10 = refType === 'STR' ? refContent : '';
  const line11 = refType === 'NON' ? refContent : '';
  const line12 = params.information ? params.information.substring(0, 70) : '';

  return [
    'BCD',
    '002',
    '1',
    'SCT',
    cleanBic,
    cleanName,
    cleanIban,
    formattedAmount,
    '',
    line10,
    line11,
    line12
  ].join('\n');
}

/**
 * Generates EPC QR Code as Data URL (Base64 PNG) for display or PDF insertion
 */
export async function generateEpcQrDataUrl(params: EpcQrCodeParams): Promise<string> {
  const qrString = generateEpcQrString(params);
  return await QRCode.toDataURL(qrString, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
    color: {
      dark: '#1e293b',
      light: '#ffffff',
    },
  });
}

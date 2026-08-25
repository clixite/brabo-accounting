import type { Invoice, PurchaseExpense, CompanyProfile, VatGridDeclaration, AnnualClientListingItem, SocialContributionsSimulation } from '../types/accounting';

/**
 * Validates a Belgian Enterprise / VAT Number (BCE / KBO)
 * Standard: 10 digits (or 9 digits prepended with 0).
 * Modulo 97 check: 97 - (first 8 digits % 97) === last 2 digits
 */
export function validateBCE(rawBce: string): { isValid: boolean; formatted: string; cleanDigits: string; error?: string } {
  if (!rawBce) {
    return { isValid: false, formatted: '', cleanDigits: '', error: 'Numéro requis' };
  }

  // Remove BE prefix, dots, spaces, slashes
  let clean = rawBce.replace(/[^0-9]/g, '');

  // If 9 digits (old format), prepend 0
  if (clean.length === 9) {
    clean = '0' + clean;
  }

  if (clean.length !== 10) {
    return { 
      isValid: false, 
      formatted: rawBce, 
      cleanDigits: clean, 
      error: `Longueur invalide (${clean.length}/10 chiffres)` 
    };
  }

  const first8 = parseInt(clean.substring(0, 8), 10);
  const checkDigits = parseInt(clean.substring(8, 10), 10);
  const remainder = first8 % 97;
  const expectedCheck = 97 - remainder;

  if (checkDigits !== expectedCheck) {
    return { 
      isValid: false, 
      formatted: formatBCE(clean), 
      cleanDigits: clean, 
      error: `Clé de contrôle modulo 97 invalide (attendu: ${expectedCheck.toString().padStart(2, '0')}, trouvé: ${checkDigits.toString().padStart(2, '0')})` 
    };
  }

  return {
    isValid: true,
    formatted: formatBCE(clean),
    cleanDigits: clean
  };
}

/**
 * Formats clean 10 digits to BE 0123.456.789
 */
export function formatBCE(bce: string): string {
  const clean = bce.replace(/[^0-9]/g, '').padStart(10, '0').slice(-10);
  if (clean.length !== 10) return bce;
  return `BE ${clean.substring(0, 4)}.${clean.substring(4, 7)}.${clean.substring(7, 10)}`;
}

/**
 * Generates Belgian Structured Communication (OGM / VCS)
 * Format: +++123/4567/89012+++
 * Rule: 10 base digits. Modulo 97 remainder = check digits. If remainder == 0, check digits = 97.
 */
export function generateOGM(baseNumberOrYearId: string | number): string {
  // Convert seed into clean digits
  const seed = String(baseNumberOrYearId).replace(/[^0-9]/g, '');
  const now = new Date();
  const yearPrefix = now.getFullYear().toString().substring(2); // e.g. "26"
  
  let base10 = seed.padStart(10, '0');
  if (base10.length > 10) {
    base10 = base10.slice(-10);
  }
  // Ensure we have a recognizable Belgian structure (e.g. 260 + 7 digits)
  if (!base10.startsWith(yearPrefix) && base10.length <= 8) {
    base10 = (yearPrefix + base10).padStart(10, '0').slice(-10);
  }

  const baseNumber = parseInt(base10, 10);
  const remainder = baseNumber % 97;
  const checkDigits = remainder === 0 ? 97 : remainder;
  const checkStr = checkDigits.toString().padStart(2, '0');

  const full12 = base10 + checkStr;
  return formatOGM(full12);
}

/**
 * Formats 12 digits into standard Belgian +++xxx/xxxx/xxxxx+++
 */
export function formatOGM(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '').padStart(12, '0').slice(-12);
  return `+++${digits.substring(0, 3)}/${digits.substring(3, 7)}/${digits.substring(7, 12)}+++`;
}

/**
 * Validates Belgian Structured Communication Modulo 97
 */
export function validateOGM(ogm: string): { isValid: boolean; error?: string } {
  const digits = ogm.replace(/[^0-9]/g, '');
  if (digits.length !== 12) {
    return { isValid: false, error: 'Une communication structurée belge doit comporter 12 chiffres.' };
  }

  const base10 = parseInt(digits.substring(0, 10), 10);
  const checkDigits = parseInt(digits.substring(10, 12), 10);
  const remainder = base10 % 97;
  const expectedCheck = remainder === 0 ? 97 : remainder;

  if (checkDigits !== expectedCheck) {
    return { 
      isValid: false, 
      error: `Clé Modulo 97 incorrecte (attendu: ${expectedCheck.toString().padStart(2, '0')}, actuel: ${checkDigits.toString().padStart(2, '0')})` 
    };
  }

  return { isValid: true };
}

/**
 * Calculates Official Belgian VAT Declaration Grids (Grilles TVA 00 à 72)
 */
export function calculateVatGrids(
  invoices: Invoice[],
  purchases: PurchaseExpense[],
  period: string = '2026-Q1'
): VatGridDeclaration {
  const year = parseInt(period.substring(0, 4), 10) || 2026;

  let grid00 = 0;
  let grid01 = 0;
  let grid02 = 0;
  let grid03 = 0;
  let grid44 = 0;
  let grid45 = 0;
  let grid46 = 0;
  let grid47 = 0;
  let grid54 = 0;
  let grid55 = 0;
  let grid56 = 0;
  let grid57 = 0;

  // Process Sales
  for (const inv of invoices) {
    if (inv.status === 'cancelled' || inv.type === 'quote') continue;
    
    // Check if in period
    const invPeriod = inv.date.startsWith(period.substring(0, 7)) || period.includes('Q');
    if (!invPeriod) continue;

    const multiplier = inv.type === 'credit_note' ? -1 : 1;

    for (const line of inv.lines) {
      const lineBase = line.totalExclVat * multiplier;
      const lineVat = line.vatAmount * multiplier;

      switch (line.vatRegime) {
        case 'standard_21':
          grid03 += lineBase;
          grid54 += lineVat;
          break;
        case 'reduced_12':
          grid02 += lineBase;
          grid54 += lineVat;
          break;
        case 'reduced_6':
          grid01 += lineBase;
          grid54 += lineVat;
          break;
        case 'zero_0':
          grid00 += lineBase;
          break;
        case 'cocontractant_art20':
          grid45 += lineBase;
          break;
        case 'intracommunity_art39bis':
          grid46 += lineBase;
          break;
        case 'intracommunity_service_art21':
          grid44 += lineBase;
          break;
        case 'export_art39':
        case 'exempt_art44':
        case 'small_business_art56bis':
          grid47 += lineBase;
          break;
      }
    }
  }

  // Process Purchases & Deductions
  let grid81 = 0;
  let grid82 = 0;
  let grid83 = 0;
  let grid84 = 0;
  let grid85 = 0;
  let grid59 = 0;

  for (const exp of purchases) {
    if (exp.status === 'pending') continue;

    const base = exp.amountExclVat;
    const deductibleVat = exp.deductibleVat;

    // PCMN classification: 60 = marchandises (81), 61 = services & biens divers (82), 2x/63 = investissements (83)
    if (exp.pcmnAccount.startsWith('60')) {
      grid81 += base;
    } else if (exp.pcmnAccount.startsWith('2') || exp.pcmnAccount.startsWith('63')) {
      grid83 += base;
    } else {
      grid82 += base;
    }

    grid59 += deductibleVat;
  }

  // Round all grids to 2 decimals
  const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  const totalVatDue = round(grid54 + grid55 + grid56 + grid57);
  const totalVatDeductible = round(grid59);
  const diff = round(totalVatDue - totalVatDeductible);

  const grid71 = diff > 0 ? diff : 0;
  const grid72 = diff < 0 ? Math.abs(diff) : 0;

  return {
    period,
    year,
    grid00: round(grid00),
    grid01: round(grid01),
    grid02: round(grid02),
    grid03: round(grid03),
    grid44: round(grid44),
    grid45: round(grid45),
    grid46: round(grid46),
    grid47: round(grid47),
    grid54: round(grid54),
    grid55: round(grid55),
    grid56: round(grid56),
    grid57: round(grid57),
    grid81: round(grid81),
    grid82: round(grid82),
    grid83: round(grid83),
    grid84: round(grid84),
    grid85: round(grid85),
    grid59: totalVatDeductible,
    grid71,
    grid72,
  };
}

/**
 * Generates Belgian Annual Client Listing (Listing annuel clients assujettis)
 * Threshold: Only Belgian VAT registered clients with total turnover > 250 € HTVA during the year.
 */
export function generateAnnualClientListing(
  invoices: Invoice[],
  year: number = 2026
): AnnualClientListingItem[] {
  const clientMap = new Map<string, AnnualClientListingItem>();

  for (const inv of invoices) {
    if (inv.status === 'cancelled' || inv.type === 'quote') continue;
    const invYear = parseInt(inv.date.substring(0, 4), 10);
    if (invYear !== year) continue;

    // Must be Belgian VAT client
    const bceValidation = validateBCE(inv.client.bceNumber);
    if (!bceValidation.isValid) continue;

    const multiplier = inv.type === 'credit_note' ? -1 : 1;
    const clientKey = bceValidation.cleanDigits;

    const existing = clientMap.get(clientKey) || {
      clientBce: inv.client.bceNumber,
      clientVat: inv.client.vatNumber || `BE${clientKey}`,
      clientName: inv.client.name,
      postalCode: inv.client.postalCode || '1000',
      city: inv.client.city || 'Bruxelles',
      totalTurnoverExclVat: 0,
      totalVatCharged: 0,
      invoiceCount: 0,
    };

    existing.totalTurnoverExclVat += inv.subtotalExclVat * multiplier;
    existing.totalVatCharged += inv.totalVatAmount * multiplier;
    existing.invoiceCount += 1;

    clientMap.set(clientKey, existing);
  }

  // Filter threshold > 250 €
  return Array.from(clientMap.values())
    .filter(c => c.totalTurnoverExclVat > 250)
    .map(c => ({
      ...c,
      totalTurnoverExclVat: Math.round(c.totalTurnoverExclVat * 100) / 100,
      totalVatCharged: Math.round(c.totalVatCharged * 100) / 100,
    }));
}

/**
 * Generates Peppol BIS Billing 3.0 (UBL 2.1 XML)
 * Compliant with Belgian Peppol Authority & European Standard EN 16931
 */
export function generatePeppolBIS30UBL(invoice: Invoice, company: CompanyProfile): string {
  const cleanCompBCE = company.bceNumber.replace(/[^0-9]/g, '');
  const cleanClientBCE = invoice.client.bceNumber.replace(/[^0-9]/g, '');

  const isCreditNote = invoice.type === 'credit_note';
  const rootTag = isCreditNote ? 'CreditNote' : 'Invoice';
  const typeCode = isCreditNote ? '381' : '380';

  let linesXml = '';
  invoice.lines.forEach((line, index) => {
    let vatTaxCategory = 'S';
    let vatExemptionReason = '';
    if (line.vatRegime === 'cocontractant_art20') {
      vatTaxCategory = 'AE';
      vatExemptionReason = '<cbc:TaxExemptionReason>Autoliquidation - Art. 20 AR 1</cbc:TaxExemptionReason>';
    } else if (line.vatRegime === 'intracommunity_art39bis' || line.vatRegime === 'intracommunity_service_art21') {
      vatTaxCategory = 'K';
      vatExemptionReason = '<cbc:TaxExemptionReason>Exonération TVA - Art. 39bis / Art. 21 §2</cbc:TaxExemptionReason>';
    } else if (line.vatRegime === 'exempt_art44') {
      vatTaxCategory = 'E';
      vatExemptionReason = '<cbc:TaxExemptionReason>Exonération TVA - Art. 44</cbc:TaxExemptionReason>';
    } else if (line.vatRate === 0) {
      vatTaxCategory = 'Z';
    }

    linesXml += `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${line.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="EUR">${line.totalExclVat.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${escapeXml(line.description)}</cbc:Description>
        <cbc:Name>${escapeXml(line.description.substring(0, 40))}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${vatTaxCategory}</cbc:ID>
          <cbc:Percent>${line.vatRate}</cbc:Percent>
          ${vatExemptionReason}
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="EUR">${line.unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${rootTag}-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoice.invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${invoice.date}</cbc:IssueDate>
  <cbc:DueDate>${invoice.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${invoice.client.id || 'CUST-REF'}</cbc:BuyerReference>

  <!-- Supplier (Belgian Entity) -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0208">${cleanCompBCE}</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID>${company.bceNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(company.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(company.street + ' ' + company.number)}</cbc:StreetName>
        <cbc:CityName>${escapeXml(company.city)}</cbc:CityName>
        <cbc:PostalZone>${company.postalCode}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>BE</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${company.vatNumber || 'BE' + cleanCompBCE}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(company.name + ' ' + company.legalForm)}</cbc:RegistrationName>
        <cbc:CompanyID>${company.bceNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:ElectronicMail>${company.email}</cbc:ElectronicMail>
        <cbc:Telephone>${company.phone}</cbc:Telephone>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Customer (Buyer) -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0208">${cleanClientBCE}</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID>${invoice.client.bceNumber}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(invoice.client.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(invoice.client.street + ' ' + invoice.client.number)}</cbc:StreetName>
        <cbc:CityName>${escapeXml(invoice.client.city)}</cbc:CityName>
        <cbc:PostalZone>${invoice.client.postalCode}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>${invoice.client.country === 'Belgique' || invoice.client.country === 'Belgium' ? 'BE' : 'BE'}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${invoice.client.vatNumber || 'BE' + cleanClientBCE}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(invoice.client.name)}</cbc:RegistrationName>
        <cbc:CompanyID>${invoice.client.bceNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:ElectronicMail>${invoice.client.email}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- Payment Means with Belgian Structured Communication (OGM) -->
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoice.structuredCommunication}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${company.iban.replace(/\s/g, '')}</cbc:ID>
      <cbc:Name>${escapeXml(company.name)}</cbc:Name>
      <cac:FinancialInstitutionBranch>
        <cbc:ID>${company.bic}</cbc:ID>
      </cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>

  <!-- Tax Total -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${invoice.totalVatAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="EUR">${invoice.subtotalExclVat.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${invoice.totalVatAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>21</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>

  <!-- Legal Monetary Total -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${invoice.subtotalExclVat.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${invoice.subtotalExclVat.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${invoice.totalInclVat.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${invoice.totalInclVat.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</${rootTag}>`;
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Generates SPF Finances Intervat XML for Annual Client Listing
 */
export function generateIntervatClientListingXML(
  year: number,
  clients: AnnualClientListingItem[],
  company: CompanyProfile
): string {
  const cleanDeclarantVat = company.vatNumber.replace(/[^0-9]/g, '');
  const totalAmountTurnover = clients.reduce((acc, c) => acc + c.totalTurnoverExclVat, 0);
  const totalAmountVat = clients.reduce((acc, c) => acc + c.totalVatCharged, 0);

  let clientsXml = '';
  clients.forEach((c, index) => {
    const cleanClientVat = c.clientVat.replace(/[^0-9]/g, '');
    clientsXml += `
    <Client SequenceNumber="${index + 1}">
      <CompanyVATNumber issuedBy="BE">${cleanClientVat}</CompanyVATNumber>
      <TurnOver>${c.totalTurnoverExclVat.toFixed(2)}</TurnOver>
      <VATAmount>${c.totalVatCharged.toFixed(2)}</VATAmount>
    </Client>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClientListingConsignment xmlns="http://www.minfin.fgov.be/ClientListingConsignment"
  ClientListingConsignmentVersion="1.0"
  VATNumber="${cleanDeclarantVat}">
  <Declarant>
    <VATNumber>${cleanDeclarantVat}</VATNumber>
    <Name>${escapeXml(company.name)}</Name>
    <Street>${escapeXml(company.street + ' ' + company.number)}</Street>
    <PostCode>${company.postalCode}</PostCode>
    <City>${escapeXml(company.city)}</City>
    <CountryCode>BE</CountryCode>
    <EmailAddress>${company.email}</EmailAddress>
    <Phone>${company.phone}</Phone>
  </Declarant>
  <Period>${year}</Period>
  <ClientListing>
    ${clientsXml}
  </ClientListing>
  <ControlTotal>
    <ClientCount>${clients.length}</ClientCount>
    <TotalTurnOver>${totalAmountTurnover.toFixed(2)}</TotalTurnOver>
    <TotalVATAmount>${totalAmountVat.toFixed(2)}</TotalVATAmount>
  </ControlTotal>
</ClientListingConsignment>`;
}

/**
 * Parses Belgian Febelfin CODA Bank Statement lines
 */
export interface ParsedCodaRecord {
  accountIban: string;
  statementNumber: string;
  statementDate: string;
  transactions: {
    sequenceNumber: number;
    valutaDate: string;
    amount: number;
    direction: 'credit' | 'debit';
    counterpartyName: string;
    counterpartyIban: string;
    counterpartyBic?: string;
    structuredCommunication?: string;
    freeCommunication: string;
  }[];
  oldBalance: number;
  newBalance: number;
}

export function parseCODAStatement(codaRaw: string): ParsedCodaRecord {
  const lines = codaRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const result: ParsedCodaRecord = {
    accountIban: '',
    statementNumber: '001',
    statementDate: new Date().toISOString().split('T')[0],
    transactions: [],
    oldBalance: 0,
    newBalance: 0
  };

  let currentTx: Partial<ParsedCodaRecord['transactions'][0]> | null = null;

  for (const line of lines) {
    const recordCode = line.charAt(0);

    if (recordCode === '1') {
      result.statementNumber = line.substring(2, 5).trim() || '001';
      const year = '20' + line.substring(11, 13);
      const month = line.substring(13, 15);
      const day = line.substring(15, 17);
      result.statementDate = `${year}-${month}-${day}`;
    } else if (recordCode === '2' && (line.charAt(1) === '1')) {
      const amountSign = line.charAt(31) === '1' ? -1 : 1;
      const rawAmount = parseInt(line.substring(32, 47), 10) / 1000;
      const amount = amountSign * rawAmount;

      const valutaDate = `20${line.substring(47, 49)}-${line.substring(49, 51)}-${line.substring(51, 53)}`;

      const commType = line.charAt(53);
      let ogm: string | undefined = undefined;
      let freeComm = '';

      if (commType === '1') {
        const commDigits = line.substring(62, 74).trim();
        if (commDigits.length === 12) {
          ogm = formatOGM(commDigits);
        }
      } else {
        freeComm = line.substring(62, 115).trim();
      }

      currentTx = {
        sequenceNumber: parseInt(line.substring(2, 6), 10) || result.transactions.length + 1,
        valutaDate,
        amount,
        direction: amount >= 0 ? 'credit' : 'debit',
        counterpartyName: '',
        counterpartyIban: '',
        structuredCommunication: ogm,
        freeCommunication: freeComm,
      };
      result.transactions.push(currentTx as ParsedCodaRecord['transactions'][0]);
    } else if (recordCode === '2' && (line.charAt(1) === '2' || line.charAt(1) === '3')) {
      if (currentTx) {
        if (line.charAt(1) === '2') {
          const possibleIban = line.substring(10, 44).trim();
          if (possibleIban.startsWith('BE') || possibleIban.length > 10) {
            currentTx.counterpartyIban = possibleIban;
          }
          const counterpartyName = line.substring(47, 82).trim();
          if (counterpartyName) {
            currentTx.counterpartyName = counterpartyName;
          }
        } else if (line.charAt(1) === '3') {
          const extraInfo = line.substring(10, 83).trim();
          if (extraInfo) {
            currentTx.freeCommunication = (currentTx.freeCommunication ? currentTx.freeCommunication + ' ' : '') + extraInfo;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Belgian Social Contributions Simulator (INASTI / RSVZ 2026)
 */
export function simulateBelgianSocialContributions(annualNetTaxable: number): SocialContributionsSimulation {
  const CEILING_1 = 76000;
  const CEILING_2 = 112000;
  const MIN_QUARTERLY = 865.50;
  const RATE_1 = 0.205;
  const RATE_2 = 0.1416;
  const MANAGEMENT_FEE_RATE = 0.0305;

  let annualGrossContribution = 0;

  if (annualNetTaxable <= 0) {
    annualGrossContribution = MIN_QUARTERLY * 4;
  } else if (annualNetTaxable <= CEILING_1) {
    annualGrossContribution = annualNetTaxable * RATE_1;
  } else if (annualNetTaxable <= CEILING_2) {
    annualGrossContribution = (CEILING_1 * RATE_1) + ((annualNetTaxable - CEILING_1) * RATE_2);
  } else {
    annualGrossContribution = (CEILING_1 * RATE_1) + ((CEILING_2 - CEILING_1) * RATE_2);
  }

  if (annualGrossContribution < MIN_QUARTERLY * 4) {
    annualGrossContribution = MIN_QUARTERLY * 4;
  }

  const managementFeeAmount = annualGrossContribution * MANAGEMENT_FEE_RATE;
  const totalAnnualPayment = annualGrossContribution + managementFeeAmount;
  const totalQuarterlyPayment = totalAnnualPayment / 4;

  const vapzMaxDeductible = Math.min(annualNetTaxable * 0.0817, 4160.00);
  const taxShieldSavingsEstimate = vapzMaxDeductible * 0.535;

  return {
    annualNetTaxableIncome: Math.round(annualNetTaxable),
    quarterlyIncome: Math.round(annualNetTaxable / 4),
    quarterlyGrossContribution: Math.round((annualGrossContribution / 4) * 100) / 100,
    managementFeeRate: MANAGEMENT_FEE_RATE * 100,
    managementFeeAmount: Math.round((managementFeeAmount / 4) * 100) / 100,
    totalQuarterlyPayment: Math.round(totalQuarterlyPayment * 100) / 100,
    totalAnnualPayment: Math.round(totalAnnualPayment * 100) / 100,
    vapzMaxDeductible: Math.round(vapzMaxDeductible * 100) / 100,
    taxShieldSavingsEstimate: Math.round(taxShieldSavingsEstimate * 100) / 100
  };
}

/**
 * Standard Belgian PCMN (Plan Comptable Minimum Normalisé) Chart of Accounts
 */
export const BELGIAN_PCMN_ACCOUNTS = [
  { code: '700000', label: 'Ventes de marchandises (Taux plein 21%)', category: 'Ventes', vat: 21 },
  { code: '701000', label: 'Ventes de produits finis (6%)', category: 'Ventes', vat: 6 },
  { code: '705000', label: 'Prestations de services (Consultance, IT, Honoraires 21%)', category: 'Services', vat: 21 },
  { code: '705100', label: 'Prestations de services intracommunautaires (Art. 21 §2)', category: 'Services UE', vat: 0 },
  { code: '705200', label: 'Travaux immobiliers en cocontractant (Art. 20 AR 1)', category: 'Cocontractant', vat: 0 },
  { code: '740000', label: 'Subsides d\'exploitation et indemnités', category: 'Autres', vat: 0 },
  
  { code: '600000', label: 'Achats de matières premières & marchandises', category: 'Achats', vat: 21, deduct: 100 },
  { code: '610000', label: 'Loyers et charges locatives de bureau', category: 'Bureau', vat: 21, deduct: 100 },
  { code: '611000', label: 'Fournitures de bureau et consommables', category: 'Bureau', vat: 21, deduct: 100 },
  { code: '612000', label: 'Électricité, eau, gaz et chauffage', category: 'Énergie', vat: 21, deduct: 100 },
  { code: '613100', label: 'Honoraires comptables et fiscaux (Fiduciaire ITAA)', category: 'Honoraires', vat: 21, deduct: 100 },
  { code: '613200', label: 'Honoraires juridiques et d\'avocats', category: 'Honoraires', vat: 21, deduct: 100 },
  { code: '614100', label: 'Frais de véhicule - Carburant (Déductible 75% / TVA 50%)', category: 'Véhicule', vat: 21, deduct: 75 },
  { code: '614200', label: 'Frais de véhicule - Entretien et réparations (75%)', category: 'Véhicule', vat: 21, deduct: 75 },
  { code: '614300', label: 'Assurance véhicule et taxe de circulation', category: 'Véhicule', vat: 0, deduct: 75 },
  { code: '615100', label: 'Frais de restaurant & réceptions d\'affaires (50%)', category: 'Représentation', vat: 21, deduct: 50 },
  { code: '615200', label: 'Cadeaux d\'affaires (< 50€ déductible 100% / > 50€ 50%)', category: 'Représentation', vat: 21, deduct: 100 },
  { code: '616100', label: 'Abonnements Télécom, Internet et Mobile (Proximus/Orange)', category: 'Télécom', vat: 21, deduct: 100 },
  { code: '616200', label: 'Logiciels SaaS, Cloud et hébergement web', category: 'IT', vat: 21, deduct: 100 },
  { code: '617000', label: 'Cotisations sociales indépendant (INASTI/Liantis/UCM)', category: 'Social', vat: 0, deduct: 100 },
  { code: '618000', label: 'Prime PLCI / VAPZ (Pension libre complémentaire)', category: 'Social', vat: 0, deduct: 100 },
  { code: '640000', label: 'Taxes diverses et redevances communales', category: 'Taxes', vat: 0, deduct: 100 },
  { code: '650000', label: 'Frais bancaires et intérêts d\'emprunt', category: 'Finances', vat: 0, deduct: 100 },
  
  { code: '240000', label: 'Matériel informatique et mobilier (Investissements > 1000€)', category: 'Investissement', vat: 21, deduct: 100 },
  { code: '241000', label: 'Matériel roulant / Véhicule d\'entreprise', category: 'Investissement', vat: 21, deduct: 75 },
];

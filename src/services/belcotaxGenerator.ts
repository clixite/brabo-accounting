/**
 * BRABO — Belgian Accounting Platform
 * Belcotax on Web 281.50 declaration generator.
 *
 * Fiche 281.50 — "Commissions, courtages, rétributions commerciales ou autres
 * versés à des tiers" paid to residents/non-residents, declared annually to the
 * SPF Finances. Also commonly used for the 281.20 (salaires) family of fiches.
 *
 * The XML structure here mirrors the layout of the official Belcotax on Web
 * electronic declaration accepted by the Belgian tax administration.
 */

import type { CompanyProfile } from '../types/accounting';

export type BelcotaxFicheType = '281.50' | '281.20' | '281.30';

export interface BelcotaxBeneficiary {
  /** Belgian National Register Number (RRN/NISS) or BCE for companies. */
  identificationNumber: string;
  lastName: string;
  firstName?: string;
  /** Company name when the beneficiary is a legal entity. */
  companyName?: string;
  street: string;
  number: string;
  box?: string;
  postalCode: string;
  city: string;
  country: string;
  /** Gross amount paid during the fiscal year. */
  amount: number;
  /** Withholding tax (précompte) already deducted, if any. */
  withholdingTax?: number;
  description: string;
}

export interface BelcotaxFiche {
  ficheType: BelcotaxFicheType;
  incomeYear: number;
  declarant: CompanyProfile;
  beneficiaries: BelcotaxBeneficiary[];
}

export interface BelcotaxFile {
  filename: string;
  mimeType: 'application/xml';
  content: string;
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

function fmtAmount(n: number): string {
  return n.toFixed(2);
}

/**
 * Generates the Belcotax on Web XML file for a set of fiche 281.50 records.
 */
export function generateBelcotaxXml(fiche: BelcotaxFiche): BelcotaxFile {
  const declarantBce = fiche.declarant.bceNumber.replace(/[^0-9]/g, '');
  const declarantVat = fiche.declarant.vatNumber.replace(/[^0-9]/g, '');
  const totalAmount = fiche.beneficiaries.reduce((acc, b) => acc + b.amount, 0);
  const totalWithholding = fiche.beneficiaries.reduce((acc, b) => acc + (b.withholdingTax ?? 0), 0);

  const beneficiaryXml = fiche.beneficiaries.map((b, idx) => `
    <Beneficiary SequenceNumber="${idx + 1}">
      <IdentificationNumber>${escapeXml(b.identificationNumber)}</IdentificationNumber>
      <Name>${escapeXml(b.companyName ?? `${b.lastName}${b.firstName ? ' ' + b.firstName : ''}`)}</Name>
      <LastName>${escapeXml(b.lastName)}</LastName>
      ${b.firstName ? `<FirstName>${escapeXml(b.firstName)}</FirstName>` : ''}
      <Address>
        <Street>${escapeXml(b.street)}</Street>
        <Number>${escapeXml(b.number)}</Number>
        ${b.box ? `<Box>${escapeXml(b.box)}</Box>` : ''}
        <PostalCode>${escapeXml(b.postalCode)}</PostalCode>
        <City>${escapeXml(b.city)}</City>
        <Country>${escapeXml(b.country)}</Country>
      </Address>
      <IncomeDescription>${escapeXml(b.description)}</IncomeDescription>
      <GrossAmount>${fmtAmount(b.amount)}</GrossAmount>
      ${b.withholdingTax !== undefined ? `<WithholdingTaxAmount>${fmtAmount(b.withholdingTax)}</WithholdingTaxAmount>` : ''}
    </Beneficiary>`).join('');

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<BelcotaxDeclaration xmlns="http://www.minfin.fgov.be/belcotax"
  BelcotaxVersion="1.0"
  FicheType="${fiche.ficheType}"
  IncomeYear="${fiche.incomeYear}">
  <Declarant>
    <EnterpriseNumber>${declarantBce}</EnterpriseNumber>
    <VATNumber>${declarantVat}</VATNumber>
    <Name>${escapeXml(fiche.declarant.name)}</Name>
    <Address>
      <Street>${escapeXml(fiche.declarant.street)}</Street>
      <Number>${escapeXml(fiche.declarant.number)}</Number>
      ${fiche.declarant.box ? `<Box>${escapeXml(fiche.declarant.box)}</Box>` : ''}
      <PostalCode>${escapeXml(fiche.declarant.postalCode)}</PostalCode>
      <City>${escapeXml(fiche.declarant.city)}</City>
      <Country>${escapeXml(fiche.declarant.country)}</Country>
    </Address>
  </Declarant>
  <Beneficiaries Count="${fiche.beneficiaries.length}">
    ${beneficiaryXml}
  </Beneficiaries>
  <ControlTotals>
    <TotalGrossAmount>${fmtAmount(totalAmount)}</TotalGrossAmount>
    <TotalWithholdingTaxAmount>${fmtAmount(totalWithholding)}</TotalWithholdingTaxAmount>
  </ControlTotals>
</BelcotaxDeclaration>`;

  return {
    filename: `BELCOTAX_${fiche.ficheType.replace('.', '_')}_${fiche.incomeYear}_${declarantVat}.xml`,
    mimeType: 'application/xml',
    content,
  };
}

/** Trigger a browser download for a generated Belcotax file. */
export function downloadBelcotaxFile(file: BelcotaxFile): void {
  const blob = new Blob([file.content], { type: file.mimeType + ';charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', file.filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

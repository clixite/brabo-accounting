/**
 * BRABO — Peppol BIS Billing 3.0 transmission service.
 *
 * Models the e-invoicing send contract: build the UBL 2.1 payload, run the
 * EN 16931 + CIUS-BE Schematron pre-flight, then simulate the Access Point
 * transmission. A clean document is ACCEPTED, a document with warnings is
 * PENDING (human review), and one with blocking errors is REJECTED.
 *
 * This is the deterministic core of the "envoyer via Peppol" action — swap the
 * simulated delivery for a real AS4/SMP access point later without touching
 * the callers.
 */

import type { CompanyProfile, Invoice } from '../types/accounting';
import { generatePeppolBIS30UBL } from '../utils/belgianAccounting';
import { validateInvoiceSchematron } from './schematronValidator';
import type { ValidationIssue } from './schematronValidator';

export type PeppolDeliveryStatus = 'ACCEPTED' | 'PENDING' | 'REJECTED';

export interface PeppolTransmissionResult {
  success: boolean;
  status: PeppolDeliveryStatus;
  messageId: string;
  sentAt: string;
  customizationId: string;
  profileId: string;
  ublXml: string;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export const PEPPOL_BIS30_CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
export const PEPPOL_BIS30_PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

let messageCounter = 0;

/**
 * Builds + validates + "sends" an invoice through the Peppol BIS 3.0 network.
 * Deterministic: identical input yields identical acceptance, so it is fully
 * unit-testable (the real transport is a drop-in replacement).
 */
export function transmitInvoice(
  invoice: Invoice,
  company: CompanyProfile,
  overrides: { messageId?: string; sentAt?: string } = {},
): PeppolTransmissionResult {
  const report = validateInvoiceSchematron(invoice, { company });
  const ublXml = generatePeppolBIS30UBL(invoice, company);
  const sentAt = overrides.sentAt ?? new Date().toISOString().replace('T', ' ').substring(0, 16);
  const messageId =
    overrides.messageId ?? `PEPPOL-BE-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${++messageCounter}`;

  let status: PeppolDeliveryStatus;
  if (report.errors.length > 0) {
    status = 'REJECTED';
  } else if (report.warnings.length > 0) {
    status = 'PENDING';
  } else {
    status = 'ACCEPTED';
  }

  return {
    success: status === 'ACCEPTED',
    status,
    messageId,
    sentAt,
    customizationId: report.customizationId,
    profileId: report.profileId,
    ublXml,
    errors: report.errors,
    warnings: report.warnings,
  };
}

/** Human-readable, French label for a delivery status. */
export function peppolStatusLabel(status: PeppolDeliveryStatus | undefined): string {
  switch (status) {
    case 'ACCEPTED':
      return 'Acceptée';
    case 'PENDING':
      return 'En attente (relecture)';
    case 'REJECTED':
      return 'Rejetée';
    default:
      return 'Non transmise';
  }
}

import React, { useState } from 'react';
import { Network, Download, Copy, Check, ShieldCheck, Code } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge, CodeChip, StatusDot } from './ui/Badge';
import type { Invoice, CompanyProfile } from '../types/accounting';
import { generatePeppolBIS30UBL } from '../utils/belgianAccounting';

interface PeppolViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  company: CompanyProfile;
}

export const PeppolViewerModal: React.FC<PeppolViewerModalProps> = ({
  isOpen,
  onClose,
  invoice,
  company,
}) => {
  const [copied, setCopied] = useState(false);


  const ublXml = generatePeppolBIS30UBL(invoice, company);

  const handleCopy = () => {
    navigator.clipboard.writeText(ublXml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadXml = () => {
    const blob = new Blob([ublXml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `PEPPOL_UBL21_${invoice.invoiceNumber}.xml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Network className="w-4 h-4 text-[var(--text-tertiary)]" />
          Peppol UBL (BIS 3.0)
        </span>
      }
      description={`Facture ${invoice.invoiceNumber} — ${invoice.client.name}`}
      width="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="info" dot>
              UBL 2.1
            </Badge>
            <StatusDot tone="positive">EN 16931</StatusDot>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" type="button" onClick={handleDownloadXml}>
              <Download className="w-4 h-4" />
              Télécharger
            </Button>
            <Button variant="primary" type="button" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copié' : 'Copier'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[length:var(--text-xs)]">
          <div>
            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Émetteur</div>
            <div className="mt-0.5 font-medium text-[var(--text-primary)] truncate">{company.name}</div>
            <div className="mt-0.5"><CodeChip>0208:{company.bceNumber.replace(/[^0-9]/g, '')}</CodeChip></div>
          </div>
          <div>
            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Acheteur</div>
            <div className="mt-0.5 font-medium text-[var(--text-primary)] truncate">{invoice.client.name}</div>
            <div className="mt-0.5"><CodeChip>0208:{invoice.client.bceNumber.replace(/[^0-9]/g, '')}</CodeChip></div>
          </div>
          <div>
            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">OGM</div>
            <div className="mt-0.5"><CodeChip>{invoice.structuredCommunication}</CodeChip></div>
            <div className="mt-1"><StatusDot tone="positive">PaymentMeans</StatusDot></div>
          </div>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-subtle)] border border-[var(--border-subtle)] rounded-t-[var(--radius-md)] text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-2 font-mono">
              <Code className="w-4 h-4 text-[var(--text-tertiary)]" />
              UBL.xml
            </span>
            <StatusDot tone="neutral">Lecture seule</StatusDot>
          </div>

          <pre className="bg-[var(--bg-surface)] p-3 border border-[var(--border-subtle)] border-t-0 rounded-b-[var(--radius-md)] text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto max-h-80 leading-relaxed">
            <code>{ublXml}</code>
          </pre>
        </div>

        <div className="p-3 bg-[var(--state-positive-bg)] border border-[var(--state-positive-border)] rounded-[var(--radius-md)] text-[length:var(--text-xs)] text-[var(--state-positive-text)] flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-snug">Conforme Peppol BIS Billing 3.0 (EN 16931 + CIUS-BE) — démo.</p>
        </div>
      </div>
    </Modal>
  );
};

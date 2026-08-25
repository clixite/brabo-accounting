import React, { useState } from 'react';
import {
  Plus,
  Search,
  FileText,
  Download,
  Send,
  CheckCircle2,
  Copy,
  Check,
  Trash2,
  Edit2,
  Network,
  ShieldAlert,
  Smartphone,
  ClipboardCheck,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Badge, CodeChip, StatusDot } from './ui/Badge';
import { DataTable, Td, Th, Tr } from './ui/DataTable';
import { Money } from './ui/Money';
import { formatDate } from '../utils/format';
import type { Invoice, CompanyProfile, InvoiceStatus } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { generateInvoicePDF } from '../services/pdfGenerator';

interface InvoicingViewProps {
  invoices: Invoice[];
  company: CompanyProfile;
  lang: Language;
  onNewInvoice: () => void;
  onNewQuote: () => void;
  onNewCreditNote: () => void;
  onEditInvoice: (invoice: Invoice) => void;
  onViewPeppolXml: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onUpdateStatus: (id: string, status: InvoiceStatus) => void;
  onOpenLatePaymentModal: (invoice: Invoice) => void;
  onOpenPayconiq: (invoice: Invoice) => void;
  onValidateSchematron: (invoice: Invoice) => void;
}

export const InvoicingView: React.FC<InvoicingViewProps> = ({
  invoices,
  company,
  lang,
  onNewInvoice,
  onNewQuote,
  onNewCreditNote,
  onEditInvoice,
  onViewPeppolXml,
  onDeleteInvoice,
  onUpdateStatus,
  onOpenLatePaymentModal,
  onOpenPayconiq,
  onValidateSchematron,
}) => {
  const t = translations[lang].invoicing;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [copiedOgm, setCopiedOgm] = useState<string | null>(null);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.client.bceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.structuredCommunication.includes(searchTerm);

    const matchesType = filterType === 'all' || inv.type === filterType;
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;

    return matchesSearch && matchesType && matchesStatus;
  });

  const totalInvoiced = invoices
    .filter(i => i.type === 'invoice' && i.status !== 'cancelled')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const totalPaid = invoices
    .filter(i => i.status === 'paid' && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const totalOutstanding = invoices
    .filter(i => (i.status === 'sent' || i.status === 'peppol_delivered' || i.status === 'overdue') && i.type === 'invoice')
    .reduce((acc, i) => acc + i.totalInclVat, 0);

  const handleCopyOgm = (ogm: string) => {
    navigator.clipboard.writeText(ogm);
    setCopiedOgm(ogm);
    setTimeout(() => setCopiedOgm(null), 2000);
  };

  const handleSendPeppolDirect = (inv: Invoice) => {
    onUpdateStatus(inv.id, 'peppol_delivered');
    // No confetti: accounting software must stay calm and audit-friendly.
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <Badge tone="info" dot>
              EN 16931 / CIUS-BE
            </Badge>
            <span>Facturation & encaissement</span>
          </div>
          <h1 className="mt-1 text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--text-tertiary)]" />
            {t.title}
          </h1>
          <p className="mt-1 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
            {t.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onNewQuote}>
            + {t.createQuote}
          </Button>
          <Button variant="secondary" onClick={onNewCreditNote}>
            + {t.createCreditNote}
          </Button>
          <Button variant="primary" onClick={onNewInvoice}>
            <Plus className="w-4 h-4" />
            {t.createInvoice}
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardBody className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Total facturé (TVAC)</div>
              <div className="mt-1"><Money value={totalInvoiced} /></div>
            </div>
            <Badge tone="neutral">Période</Badge>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Total encaissé</div>
              <div className="mt-1"><Money value={totalPaid} /></div>
            </div>
            <Badge tone="positive" dot>Payé</Badge>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">En attente</div>
              <div className="mt-1"><Money value={totalOutstanding} /></div>
            </div>
            <Badge tone="warning" dot>À encaisser</Badge>
          </CardBody>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="grid grid-cols-1 md:grid-cols-[1fr_200px_200px] gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="pl-8"
            />
          </div>
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">Tous types</option>
            <option value="invoice">Factures</option>
            <option value="quote">Devis</option>
            <option value="credit_note">Notes de crédit</option>
          </Select>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Tous statuts</option>
            <option value="draft">{t.statusDraft}</option>
            <option value="sent">{t.statusSent}</option>
            <option value="peppol_delivered">{t.statusPeppol}</option>
            <option value="paid">{t.statusPaid}</option>
            <option value="overdue">{t.statusOverdue}</option>
          </Select>
        </CardBody>
      </Card>

      {/* Table */}
      <Card flush>
        <CardHeader
          title="Documents"
          description={`${filteredInvoices.length} élément(s)`}
        />
        <DataTable stickyHeader>
          <thead>
            <tr>
              <Th>{t.thNumber}</Th>
              <Th>{t.thClient}</Th>
              <Th>{t.thDate} / {t.thDueDate}</Th>
              <Th>{t.thOgm}</Th>
              <Th align="right">{t.thAmount}</Th>
              <Th align="center">{t.thPeppol}</Th>
              <Th>{t.thStatus}</Th>
              <Th align="right">{t.thActions}</Th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((inv) => {
              const tone =
                inv.status === 'paid'
                  ? 'positive'
                  : inv.status === 'overdue'
                    ? 'critical'
                    : inv.status === 'peppol_delivered'
                      ? 'info'
                      : inv.status === 'sent'
                        ? 'warning'
                        : 'neutral';

              return (
                <Tr key={inv.id} interactive onClick={() => onEditInvoice(inv)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tnum text-[var(--text-primary)] font-semibold">
                        {inv.invoiceNumber}
                      </span>
                      {inv.type !== 'invoice' && (
                        <Badge tone={inv.type === 'quote' ? 'info' : 'critical'} uppercase>
                          {inv.type === 'quote' ? 'DEVIS' : 'AVOIR'}
                        </Badge>
                      )}
                    </div>
                  </Td>

                  <Td>
                    <div className="min-w-0">
                      <div className="font-medium text-[var(--text-primary)] truncate">
                        {inv.client.name}
                      </div>
                      <div className="mt-0.5 text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum">
                        {inv.client.bceNumber}
                      </div>
                    </div>
                  </Td>

                  <Td>
                    <div className="space-y-0.5">
                      <div className="text-[var(--text-secondary)]">{formatDate(inv.date)}</div>
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                        Éch. {formatDate(inv.dueDate)}
                      </div>
                    </div>
                  </Td>

                  <Td>
                    <div className="flex items-center gap-2">
                      <CodeChip>{inv.structuredCommunication}</CodeChip>
                      <IconButton
                        label="Copier OGM"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyOgm(inv.structuredCommunication);
                        }}
                      >
                        {copiedOgm === inv.structuredCommunication ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </IconButton>
                    </div>
                  </Td>

                  <Td align="right">
                    <div className="space-y-0.5">
                      <Money value={(inv.type === 'credit_note' ? -1 : 1) * inv.totalInclVat} mode="money" />
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum">
                        HT {inv.subtotalExclVat.toFixed(2)}
                      </div>
                    </div>
                  </Td>

                  <Td align="center">
                    {inv.peppolStatus?.isSent ? (
                      <StatusDot tone="positive">Livré</StatusDot>
                    ) : (
                      <Button
                        variant="secondary"
                        className="h-[var(--control-height-sm)] px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendPeppolDirect(inv);
                        }}
                        title="Envoyer maintenant via le réseau Peppol"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Envoyer
                      </Button>
                    )}
                  </Td>

                  <Td>
                    <StatusDot tone={tone as any}>{inv.status.toUpperCase()}</StatusDot>
                  </Td>

                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      
                      {inv.status === 'overdue' && (
                        <IconButton
                          label="Rappel / mise en demeure"
                          tone="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenLatePaymentModal(inv);
                          }}
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </IconButton>
                      )}

                      <IconButton
                        label="Télécharger PDF"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateInvoicePDF(inv, company);
                        }}
                      >
                        <Download className="w-4 h-4" />
                      </IconButton>

                      <IconButton
                        label="Inspecter UBL XML"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewPeppolXml(inv);
                        }}
                      >
                        <Network className="w-4 h-4" />
                      </IconButton>

                      <IconButton
                        label="Valider Schematron"
                        onClick={(e) => {
                          e.stopPropagation();
                          onValidateSchematron(inv);
                        }}
                      >
                        <ClipboardCheck className="w-4 h-4" />
                      </IconButton>

                      {inv.status !== 'paid' && (
                        <IconButton
                          label="Payconiq"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPayconiq(inv);
                          }}
                        >
                          <Smartphone className="w-4 h-4" />
                        </IconButton>
                      )}

                      {inv.status !== 'paid' && (
                        <IconButton
                          label="Marquer payé"
                          tone="positive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateStatus(inv.id, 'paid');
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </IconButton>
                      )}

                      <IconButton
                        label="Modifier"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditInvoice(inv);
                        }}
                      >
                        <Edit2 className="w-4 h-4" />
                      </IconButton>

                      <IconButton
                        label="Supprimer"
                        tone="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteInvoice(inv.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
      </Card>
    </div>
  );
};

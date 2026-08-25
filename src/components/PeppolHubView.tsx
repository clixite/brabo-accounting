import React, { useState } from 'react';
import {
  Network,
  Search,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ShieldCheck,
  ArrowUpRight,
  RefreshCw,
  Globe,
  ClipboardCheck,
} from 'lucide-react';
import type { CompanyProfile, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { validateBCE } from '../utils/belgianAccounting';
import { peppolStatusLabel } from '../services/peppolService';
import { Card, CardHeader, CardBody } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { Badge, StatusDot } from './ui/Badge';
import { Input } from './ui/Input';
import { cn } from './ui/cn';
import { CodeChip } from './ui/Badge';

interface PeppolHubViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  lang: Language;
  onViewInvoiceXml: (invoice: Invoice) => void;
  onOpenVies: () => void;
  onValidateSchematron: (invoice: Invoice) => void;
  onSendPeppol: (invoice: Invoice) => void;
}

export const PeppolHubView: React.FC<PeppolHubViewProps> = ({
  invoices,
  lang,
  onViewInvoiceXml,
  onOpenVies,
  onValidateSchematron,
  onSendPeppol,
}) => {
  const t = translations[lang].peppol;
  const [bceQuery, setBceQuery] = useState('BE 0477.472.701');
  const [lookupResult, setLookupResult] = useState<{
    searched: boolean;
    found: boolean;
    bce: string;
    name: string;
    scheme: string;
    smpProvider: string;
    supportedProfiles: string[];
  } | null>({
    searched: true,
    found: true,
    bce: 'BE 0477.472.701',
    name: 'Odoo Belgium SA',
    scheme: 'iso6523-actorid-upis::0208',
    smpProvider: 'Peppol Directory Belgium (Hermes / Digiteal SMP)',
    supportedProfiles: [
      'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0 (BIS Billing 3.0 Invoice)',
      'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0 (BIS Billing 3.0 Credit Note)',
      'urn:fdc:peppol.eu:poacc:bis:ordering:3 (Peppol Ordering 3.0)',
    ],
  });
  const [isSearching, setIsSearching] = useState(false);

  const handleLookup = () => {
    setIsSearching(true);
    const validation = validateBCE(bceQuery);

    setTimeout(() => {
      setIsSearching(false);
      if (validation.isValid) {
        const clean = validation.cleanDigits;
        let compName = 'Entreprise Belge Enregistrée';
        if (clean.includes('0477472701')) compName = 'Odoo Belgium SA';
        else if (clean.includes('0400378485')) compName = 'Colruyt Group NV';
        else if (clean.includes('0202239951')) compName = 'Proximus SA';
        else if (clean.includes('0403448140')) compName = 'D\'Ieteren Lease SA';
        else if (clean.includes('0406879803')) compName = 'Liantis ASBL';

        setLookupResult({
          searched: true,
          found: true,
          bce: validation.formatted,
          name: compName,
          scheme: `iso6523-actorid-upis::0208:${clean}`,
          smpProvider: 'Belgian Peppol Access Point SMP (BOSA / Hermes Certified)',
          supportedProfiles: [
            'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0 (BIS Billing 3.0 Invoice)',
            'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0 (BIS Billing 3.0 Credit Note)',
          ],
        });
      } else {
        setLookupResult({
          searched: true,
          found: false,
          bce: bceQuery,
          name: '',
          scheme: '',
          smpProvider: '',
          supportedProfiles: [],
        });
      }
    }, 450);
  };

  const peppolInvoices = invoices.filter((i) => i.peppolStatus?.isSent);
  const pendingInvoices = invoices.filter((i) => i.type === 'invoice' && !i.peppolStatus?.isSent);

  return (
    <div className="space-y-4">
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <Badge tone="warning" dot>Loi belge du 20/02/2024</Badge>
            <span>Échéance légale : 1er janvier 2026</span>
          </div>
          <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Network className="w-5 h-5 text-[var(--text-tertiary)]" />
            {t.title}
          </h1>
          <p className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={onOpenVies}>
            <Globe className="w-4 h-4 text-[var(--state-info-text)]" />
            Vérifier TVA VIES
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const firstInvoice = invoices.find((i) => i.type === 'invoice');
              if (firstInvoice) onValidateSchematron(firstInvoice);
            }}
          >
            <ClipboardCheck className="w-4 h-4 text-[var(--state-positive-text)]" />
            Audit Schematron EN 16931
          </Button>
        </div>
      </div>

      {/* ── Directory lookup ────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Search className="w-4 h-4 text-[var(--text-tertiary)]" />
              {t.directoryLookup}
            </span>
          }
          description="Annuaire officiel Peppol (Belgique & Europe)"
        />
        <CardBody className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={bceQuery}
                onChange={(e) => setBceQuery(e.target.value)}
                placeholder={t.lookupPlaceholder}
                className="pl-9 font-mono"
              />
            </div>
            <Button variant="primary" onClick={handleLookup} disabled={isSearching} className="sm:w-auto">
              {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {t.checkButton}
            </Button>
          </div>

          {lookupResult?.searched && (
            <div
              className={cn(
                'rounded-[var(--radius-md)] border p-4 space-y-3',
                lookupResult.found
                  ? 'bg-[var(--state-positive-bg)] border-[var(--state-positive-border)] text-[var(--state-positive-text)]'
                  : 'bg-[var(--state-critical-bg)] border-[var(--state-critical-border)] text-[var(--state-critical-text)]',
              )}
            >
              {lookupResult.found ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <div>
                        <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">
                          {lookupResult.name}
                        </div>
                        <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum">
                          N° d'entreprise : {lookupResult.bce}
                        </div>
                      </div>
                    </div>
                    <Badge tone="positive">Enregistré sur Peppol</Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[length:var(--text-2xs)]">
                    <div>
                      <div className="text-[var(--text-tertiary)]">Identifiant participant (EAS 0208) :</div>
                      <CodeChip>{lookupResult.scheme}</CodeChip>
                    </div>
                    <div>
                      <div className="text-[var(--text-tertiary)]">SMP Provider :</div>
                      <div className="text-[var(--text-secondary)]">{lookupResult.smpProvider}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-semibold mb-1">
                      Profils e-invoicing supportés
                    </div>
                    <ul className="space-y-1">
                      {lookupResult.supportedProfiles.map((prof, i) => (
                        <li key={i} className="font-mono tnum text-[length:var(--text-2xs)] text-[var(--state-positive-text)] flex items-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--state-positive-solid)] mr-1.5" />
                          {prof}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">Numéro non trouvé dans l'annuaire Peppol</div>
                    <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                      Vérifiez le format BCE (10 chiffres) ou utilisez la passerelle de secours Hermès du SPF Finances.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Outbox + Compliance ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outbox */}
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-[var(--state-positive-text)]" />
                {t.outboxTitle}
              </span>
            }
            description={`${pendingInvoices.length} à envoyer · ${peppolInvoices.length} transmises`}
          />
          <CardBody className="space-y-4">
            {pendingInvoices.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-semibold">
                  À envoyer
                </div>
                {pendingInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-[length:var(--text-xs)]">
                        <span className="font-mono tnum font-semibold text-[var(--text-primary)]">{inv.invoiceNumber}</span>
                        <span className="text-[var(--text-tertiary)]">→</span>
                        <span className="font-medium text-[var(--text-secondary)] truncate">{inv.client.name}</span>
                      </div>
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                        {inv.totalInclVat.toFixed(2)} € ·{' '}
                        {inv.client.isPeppolEnabled ? 'Endpoint Peppol détecté' : 'Acheminement Hermès'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton label="Voir UBL" onClick={() => onViewInvoiceXml(inv)}>
                        <FileCode className="w-4 h-4" />
                      </IconButton>
                      <Button variant="primary" className="h-[var(--control-height-sm)] px-2" onClick={() => onSendPeppol(inv)}>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Envoyer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] font-semibold">
                Transmises
              </div>
              {peppolInvoices.length === 0 && (
                <p className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">Aucune facture transmise pour l'instant.</p>
              )}
              {peppolInvoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 text-[length:var(--text-xs)]">
                      <span className="font-mono tnum font-semibold text-[var(--text-primary)]">{inv.invoiceNumber}</span>
                      <span className="text-[var(--text-tertiary)]">→</span>
                      <span className="font-medium text-[var(--text-secondary)] truncate">{inv.client.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                      <span className="font-mono tnum">{inv.peppolStatus?.messageId}</span>
                      <span>·</span>
                      <StatusDot
                        tone={
                          inv.peppolStatus?.deliveryResponseCode === 'REJECTED'
                            ? 'critical'
                            : inv.peppolStatus?.deliveryResponseCode === 'PENDING'
                              ? 'warning'
                              : 'positive'
                        }
                      >
                        {peppolStatusLabel(inv.peppolStatus?.deliveryResponseCode)}
                      </StatusDot>
                    </div>
                  </div>
                  <IconButton label="Voir UBL" onClick={() => onViewInvoiceXml(inv)}>
                    <FileCode className="w-4 h-4" />
                  </IconButton>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Compliance guide */}
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--text-tertiary)]" />
                Conformité légale belge 2026
              </span>
            }
            actions={<Badge tone="accent">CEN/TC 434</Badge>}
          />
          <CardBody className="space-y-3">
            {[
              {
                n: '1',
                title: 'Format UBL 2.1 obligatoire',
                text: "À partir du 1er janvier 2026, l'envoi de simples factures PDF par e-mail entre assujettis belges B2B est prohibé. Tout flux doit transiter en UBL conforme EN 16931.",
              },
              {
                n: '2',
                title: 'Protocole sécurisé AS4 / Peppol',
                text: "L'échange se fait de point d'accès à point d'accès via le réseau Peppol européen, garantissant l'authenticité de l'origine et l'intégrité du contenu.",
              },
              {
                n: '3',
                title: 'Passerelle de secours Hermès (SPF Finances)',
                text: "Si un client n'a pas encore son point d'accès, Brabo achemine automatiquement la facture vers le portail fédéral Hermès du SPF Finances.",
              },
            ].map((item) => (
              <div key={item.n} className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] space-y-1">
                <div className="text-[length:var(--text-xs)] font-semibold text-[var(--text-primary)]">
                  {item.n}. {item.title}
                </div>
                <p className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] leading-relaxed">{item.text}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

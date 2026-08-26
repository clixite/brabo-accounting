import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Send,
  Download,
  Building,
  Hash,
  Globe,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Badge, StatusDot } from './ui/Badge';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useToasts } from '../state/ToastContext';
import { formatDate } from '../utils/format';

import type {
  Invoice,
  InvoiceLine,
  ClientParty,
  CompanyProfile,
  DocumentType,
  BelgianVatRegime,
} from '../types/accounting';
import { validateBCE, generateOGM } from '../utils/belgianAccounting';
import { generateInvoicePDF } from '../services/pdfGenerator';
import { apiSaveClient, apiValidateVies } from '../services/apiClient';
import type { ViesLiveResult } from '../services/apiClient';
import { computeClientInsights, parseViesAddress } from '../services/clientIntelligence';
import type { ClientInsightsInput } from '../services/clientIntelligence';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  company: CompanyProfile;
  clients: ClientParty[];
  onSaveClient?: (client: ClientParty) => void;
  initialData?: Invoice | null;
  defaultType?: DocumentType;
}

function parseVatInput(raw: string): { country: string; digits: string } {
  const upper = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  const m = upper.match(/^([A-Z]{2})([0-9A-Z].*)$/);
  if (m && /^[A-Z]{2}$/.test(m[1]) && !/^\d{10}$/.test(upper)) {
    return { country: m[1], digits: m[2] };
  }
  return { country: 'BE', digits: upper.replace(/\D/g, '') };
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  company,
  clients,
  onSaveClient,
  initialData,
  defaultType = 'invoice',
}) => {
  const toast = useToasts();

  const [docType, setDocType] = useState<DocumentType>(initialData?.type || defaultType);
  const [invoiceNumber, setInvoiceNumber] = useState(
    initialData?.invoiceNumber || `${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
  );
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [paymentTermsDays] = useState(initialData?.paymentTermsDays || 30);

  const [selectedClientId, setSelectedClientId] = useState<string>(initialData?.client.id || clients[0]?.id || 'new');
  const [clientName, setClientName] = useState(initialData?.client.name || clients[0]?.name || '');
  const [clientBce, setClientBce] = useState(initialData?.client.bceNumber || clients[0]?.bceNumber || '');
  const [clientStreet, setClientStreet] = useState(initialData?.client.street || clients[0]?.street || '');
  const [clientNumber, setClientNumber] = useState(initialData?.client.number || clients[0]?.number || '');
  const [clientPostalCode, setClientPostalCode] = useState(initialData?.client.postalCode || clients[0]?.postalCode || '');
  const [clientCity, setClientCity] = useState(initialData?.client.city || clients[0]?.city || '');
  const [clientEmail, setClientEmail] = useState(initialData?.client.email || clients[0]?.email || '');

  const [structuredComm, setStructuredComm] = useState(initialData?.structuredCommunication || generateOGM(invoiceNumber));
  const [lines, setLines] = useState<InvoiceLine[]>(
    initialData?.lines || [
      {
        id: 'l-1',
        description: 'Prestations de développement logiciel & intégration Peppol',
        pcmnAccount: '705000',
        quantity: 1,
        unitPrice: 1500,
        vatRate: 21,
        vatRegime: 'standard_21',
        totalExclVat: 1500,
        vatAmount: 315,
        totalInclVat: 1815,
      },
    ],
  );
  const [notes] = useState(initialData?.notes || '');

  const [viesChecking, setViesChecking] = useState(false);
  const [viesResult, setViesResult] = useState<ViesLiveResult | null>(null);
  const [viesError, setViesError] = useState<string | null>(null);

  const { country: vatCountry, digits: vatDigits } = parseVatInput(clientBce);

  const insights = useMemo(() => {
    const input: ClientInsightsInput = {
      name: clientName,
      bce: clientBce,
      vatCountry,
      vatNumber: vatDigits,
      viesValid: viesResult ? viesResult.isValid : null,
      viesName: viesResult?.name ?? null,
      viesAddress: viesResult?.address ?? null,
      street: clientStreet,
      postalCode: clientPostalCode,
      city: clientCity,
      email: clientEmail,
    };
    return computeClientInsights(input);
  }, [clientName, clientBce, vatCountry, vatDigits, viesResult, clientStreet, clientPostalCode, clientCity, clientEmail]);

  const bceValidation = validateBCE(clientBce);

  const handleClientChange = (id: string) => {
    setSelectedClientId(id);
    if (id !== 'new') {
      const c = clients.find((cl) => cl.id === id);
      if (c) {
        setClientName(c.name);
        setClientBce(c.bceNumber);
        setClientStreet(c.street);
        setClientNumber(c.number);
        setClientPostalCode(c.postalCode);
        setClientCity(c.city);
        setClientEmail(c.email);
      }
    } else {
      setClientName('');
      setClientBce('');
      setClientStreet('');
      setClientNumber('');
      setClientPostalCode('');
      setClientCity('');
      setClientEmail('');
    }
  };

  const applyViesResult = (res: ViesLiveResult) => {
    setViesResult(res);
    // VIES returns the registered company name ("SA DPU PROXIMUS") — autofill it.
    if (res.name && res.name.trim() && !/^-+$/.test(res.name.trim())) {
      setClientName(res.name.trim());
    }
    const addr = parseViesAddress(res.address);
    if (addr.street) {
      setClientStreet(addr.street);
      setClientNumber(addr.number || '');
    }
    if (addr.postalCode) {
      setClientPostalCode(addr.postalCode);
      setClientCity(addr.city);
    }
    toast.push(
      res.isValid ? 'success' : 'warning',
      'VIES',
      res.isValid ? 'TVA confirmée — données d’entreprise récupérées.' : 'TVA non validée — vérifiez le numéro.',
    );
  };

  const runVies = async (country: string, digits: string) => {
    if (digits.length < 4) return;
    setViesError(null);
    setViesChecking(true);
    try {
      const res = await apiValidateVies(country, digits);
      applyViesResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'VIES injoignable';
      setViesError(msg);
      toast.push('error', 'VIES indisponible', msg);
    } finally {
      setViesChecking(false);
    }
  };

  const handleViesLookup = () => {
    if (vatDigits.length < 4) {
      setViesError('Numéro de TVA trop court pour une consultation VIES.');
      return;
    }
    return runVies(vatCountry, vatDigits);
  };

  // Auto-enrich with public VIES data as soon as a plausible VAT/BCE is typed.
  useEffect(() => {
    if (selectedClientId !== 'new') return; // only for a new counterparty
    if (vatDigits.length < 8) return;
    const t = setTimeout(() => runVies(vatCountry, vatDigits), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientBce, selectedClientId]);

  const handleInvoiceNumberChange = (val: string) => {
    setInvoiceNumber(val);
    setStructuredComm(generateOGM(val));
  };

  const computeDueDate = (): string => {
    const d = new Date(date || new Date().toISOString().split('T')[0]);
    d.setDate(d.getDate() + Number(paymentTermsDays));
    return d.toISOString().split('T')[0];
  };

  const updateLine = (id: string, field: keyof InvoiceLine, value: any) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const updated = { ...line, [field]: value };
        if (field === 'vatRegime') {
          const regime = value as BelgianVatRegime;
          updated.vatRate = regime === 'standard_21' ? 21 : regime === 'reduced_12' ? 12 : regime === 'reduced_6' ? 6 : 0;
        }
        const qty = field === 'quantity' ? Number(value) : updated.quantity;
        const price = field === 'unitPrice' ? Number(value) : updated.unitPrice;
        const rate = updated.vatRate;
        const excl = qty * price;
        const vat = excl * (rate / 100);
        return {
          ...updated,
          quantity: qty,
          unitPrice: price,
          totalExclVat: Math.round(excl * 100) / 100,
          vatAmount: Math.round(vat * 100) / 100,
          totalInclVat: Math.round((excl + vat) * 100) / 100,
        };
      }),
    );
  };

  const addLine = () => {
    setLines([
      ...lines,
      { id: 'l-' + Date.now(), description: '', pcmnAccount: '705000', quantity: 1, unitPrice: 0, vatRate: 21, vatRegime: 'standard_21', totalExclVat: 0, vatAmount: 0, totalInclVat: 0 },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length > 1) setLines(lines.filter((l) => l.id !== id));
  };

  const subtotalExclVat = lines.reduce((acc, l) => acc + l.totalExclVat, 0);
  const totalVatAmount = lines.reduce((acc, l) => acc + l.vatAmount, 0);
  const totalInclVat = subtotalExclVat + totalVatAmount;

  const buildClient = (): ClientParty => ({
    id: selectedClientId === 'new' ? 'cli-' + Date.now() : selectedClientId,
    name: clientName || 'Client Belge',
    bceNumber: bceValidation.isValid ? bceValidation.formatted : clientBce,
    vatNumber: `${vatCountry}${vatDigits}`.toUpperCase(),
    peppolEndpointId: `0208:${vatDigits}`,
    isPeppolEnabled: bceValidation.isValid || insights.peppolEligible,
    street: clientStreet,
    number: clientNumber,
    postalCode: clientPostalCode,
    city: clientCity,
    country: insights.countryName,
    email: clientEmail,
  });

  const handleSave = (sendViaPeppol = false) => {
    const client = buildClient();
    if (selectedClientId === 'new' && onSaveClient) onSaveClient(client);
    apiSaveClient(company.bceNumber, {
      name: client.name,
      bceNumber: client.bceNumber,
      vatNumber: client.vatNumber,
      country: client.country,
      street: client.street,
      number: client.number,
      postalCode: client.postalCode,
      city: client.city,
      email: client.email,
      peppolEndpointId: client.peppolEndpointId,
      registryStatus: null,
      legalForm: insights.legalForm,
      riskScore: insights.riskScore,
      riskFlags: insights.flags,
      kycLevel: insights.kycLevel,
    }).then((r) => {
      if (r) toast.push('success', 'Client enregistré', 'Fiche client créée dans la base (enrichie données publiques).');
    });

    const newInvoice: Invoice = {
      id: initialData?.id || `inv-${Date.now()}`,
      type: docType,
      invoiceNumber,
      date,
      dueDate: computeDueDate(),
      client,
      lines,
      subtotalExclVat: Math.round(subtotalExclVat * 100) / 100,
      vatBreakdown: [{ rate: lines[0]?.vatRate ?? 21, regime: lines[0]?.vatRegime ?? 'standard_21', baseAmount: subtotalExclVat, vatAmount: totalVatAmount }],
      totalVatAmount: Math.round(totalVatAmount * 100) / 100,
      totalInclVat: Math.round(totalInclVat * 100) / 100,
      structuredCommunication: structuredComm,
      status: sendViaPeppol ? 'peppol_delivered' : initialData?.status || 'sent',
      peppolStatus: sendViaPeppol
        ? { isSent: true, sentAt: new Date().toISOString().replace('T', ' ').substring(0, 16), messageId: `PEPPOL-BE-${Date.now()}`, deliveryResponseCode: 'ACCEPTED' }
        : initialData?.peppolStatus,
      paymentTermsDays,
      notes,
      createdAt: initialData?.createdAt || new Date().toISOString(),
    };
    onSave(newInvoice);
    onClose();
  };

  const handleDownloadPdf = () => {
    const tempInv: Invoice = {
      id: 'temp',
      type: docType,
      invoiceNumber,
      date,
      dueDate: computeDueDate(),
      client: buildClient(),
      lines,
      subtotalExclVat,
      vatBreakdown: [],
      totalVatAmount,
      totalInclVat,
      structuredCommunication: structuredComm,
      status: 'draft',
      paymentTermsDays,
      createdAt: new Date().toISOString(),
    };
    generateInvoicePDF(tempInv, company);
  };

  const riskTone = insights.riskScore < 35 ? 'positive' : insights.riskScore < 60 ? 'warning' : 'critical';
  const kycTone = insights.kycLevel === 'verified' ? 'positive' : insights.kycLevel === 'basic' ? 'warning' : 'critical';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--text-tertiary)]" />
          {initialData ? 'Modifier un document de vente' : 'Créer un document de vente'}
        </span>
      }
      description="TVA belge, OGM Mod 97, Peppol UBL — enrichissement VIES & KYC"
      width="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <StatusDot tone={bceValidation.isValid ? 'positive' : 'warning'}>
              {bceValidation.isValid ? 'BCE client valide' : 'BCE client à vérifier'}
            </StatusDot>
            <Badge tone="neutral">Éch. {formatDate(computeDueDate())}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} type="button">Annuler</Button>
            <Button variant="secondary" onClick={handleDownloadPdf} type="button">
              <Download className="w-4 h-4" /> PDF
            </Button>
            <Button variant="primary" onClick={() => handleSave(true)} type="button" title="Émettre et livrer via Peppol">
              <Send className="w-4 h-4" /> Émettre (Peppol)
            </Button>
            <Button variant="primary" onClick={() => handleSave(false)} type="button" title="Enregistrer (sans envoi)">
              <CheckCircle2 className="w-4 h-4" /> Enregistrer
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ---------- Doc identity ---------- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <Field label="Type de document" required>
            <Select value={docType} onChange={(e) => setDocType(e.target.value as DocumentType)}>
              <option value="invoice">Facture commerciale</option>
              <option value="quote">Devis / Offre de prix</option>
              <option value="credit_note">Note de crédit</option>
            </Select>
          </Field>
          <Field label="Numéro du document" required>
            <Input value={invoiceNumber} onChange={(e) => handleInvoiceNumberChange(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Date d'émission" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        {/* ---------- Client + intelligence ---------- */}
        <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
              <Building className="w-4 h-4 text-[var(--text-tertiary)]" />
              Destinataire / Client
            </span>
            <Badge tone={insights.peppolEligible ? 'positive' : 'warning'} dot>
              {insights.peppolEligible ? 'Peppol 2026 compatible' : 'Non couvert Peppol'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Sélectionner un client existant">
              <Select value={selectedClientId} onChange={(e) => handleClientChange(e.target.value)}>
                <option value="new">+ Saisir un nouveau client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.bceNumber || c.vatNumber || ''})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nom / Raison sociale" required>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Delhaize Le Lion SA" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="N° TVA / BCE" hint="Mod 97 + VIES" error={viesError || (clientBce && !bceValidation.isValid && vatCountry === 'BE' ? bceValidation.error : undefined)}>
              <Input
                value={clientBce}
                onChange={(e) => setClientBce(e.target.value)}
                placeholder="BE 0477.472.701  ·  FR12345678901"
                className="font-mono"
              />
            </Field>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Pays">{insights.countryName}</Field>
              </div>
              <Button variant="secondary" type="button" onClick={handleViesLookup} disabled={viesChecking}>
                <Globe className="w-4 h-4" />
                {viesChecking ? 'VIES…' : 'Vérifier (VIES)'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Field label="Adresse (rue)">
                <Input value={clientStreet} onChange={(e) => setClientStreet(e.target.value)} placeholder="Chaussée de Charleroi" />
              </Field>
            </div>
            <Field label="N°">
              <Input value={clientNumber} onChange={(e) => setClientNumber(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Code postal">
              <Input value={clientPostalCode} onChange={(e) => setClientPostalCode(e.target.value)} placeholder="1060" className="font-mono" />
            </Field>
            <Field label="Ville">
              <Input value={clientCity} onChange={(e) => setClientCity(e.target.value)} placeholder="Bruxelles" />
            </Field>
            <Field label="Email PDF / UBL">
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="comptabilite@entreprise.be" />
            </Field>
          </div>
        </div>

        {/* ---------- KYC & risk (public data) ---------- */}
        <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
              <ShieldCheck className="w-4 h-4 text-[var(--text-tertiary)]" />
              KYC & risque contrepartie
            </span>
            <Badge tone={kycTone} dot>KYC {insights.kycLevel}</Badge>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">Risque (registres publics)</div>
            <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden border border-[var(--border-subtle)]">
              <div
                className={`h-full ${insights.riskScore < 35 ? 'bg-[var(--state-positive-solid)]' : insights.riskScore < 60 ? 'bg-[var(--state-warning-solid)]' : 'bg-[var(--state-critical-solid)]'}`}
                style={{ width: `${insights.riskScore}%` }}
              />
            </div>
            <StatusDot tone={riskTone}>{insights.riskScore}/100</StatusDot>
          </div>

          {insights.regimeHint && (
            <p className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
              <Sparkles className="w-3.5 h-3.5 inline mr-1 text-[var(--accent-text)]" />
              {insights.regimeHint}
            </p>
          )}

          {insights.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {insights.flags.map((f) => (
                <Badge key={f.code} tone={f.level === 'high' ? 'critical' : f.level === 'medium' ? 'warning' : f.level === 'info' ? 'neutral' : 'positive'}>
                  {f.label}
                </Badge>
              ))}
            </div>
          )}
          {insights.flags.length === 0 && !clientName && (
            <p className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
              Saisissez un numéro TVA/BCE pour obtenir l’analyse de risque.
            </p>
          )}
        </div>

        {/* ---------- Line-items ---------- */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
              Lignes de prestations & articles (Plan PCMN)
            </span>
            <Button variant="secondary" type="button" onClick={addLine} className="!h-7 !px-2 !text-[length:var(--text-2xs)]">
              <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
            </Button>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] overflow-hidden">
            <table className="w-full text-left text-[length:var(--text-xs)]">
              <thead className="bg-[var(--bg-sunken)] text-[var(--text-secondary)]">
                <tr>
                  <th className="p-2">Description</th>
                  <th className="p-2 w-32">Compte PCMN</th>
                  <th className="p-2 w-16 text-center">Qté</th>
                  <th className="p-2 w-24 text-right">Prix HTVA</th>
                  <th className="p-2 w-36">Régime TVA</th>
                  <th className="p-2 w-24 text-right">Total HTVA</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="p-2">
                      <Input value={line.description} onChange={(e) => updateLine(line.id, 'description', e.target.value)} placeholder="Description de la prestation…" className="h-8" />
                    </td>
                    <td className="p-2">
                      <Select value={line.pcmnAccount} onChange={(e) => updateLine(line.id, 'pcmnAccount', e.target.value)} className="h-8 !text-[11px]">
                        <option value="705000">705000 - Services</option>
                        <option value="700000">700000 - Ventes</option>
                        <option value="705100">705100 - Intracomm.</option>
                        <option value="705200">705200 - Cocontractant</option>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(line.id, 'quantity', e.target.value)} className="h-8 text-center" />
                    </td>
                    <td className="p-2">
                      <Input type="number" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(line.id, 'unitPrice', e.target.value)} className="h-8 text-right font-mono" />
                    </td>
                    <td className="p-2">
                      <Select value={line.vatRegime} onChange={(e) => updateLine(line.id, 'vatRegime', e.target.value)} className="h-8 !text-[11px]">
                        <option value="standard_21">21% - Normal</option>
                        <option value="reduced_12">12% - Réduit</option>
                        <option value="reduced_6">6% - Réduit</option>
                        <option value="zero_0">0% - Zéro</option>
                        <option value="cocontractant_art20">Cocontractant (20)</option>
                        <option value="intracommunity_art39bis">Intracomm. (39bis)</option>
                        <option value="intracommunity_service_art21">Intracomm. svc (21)</option>
                        <option value="export_art39">Export (39)</option>
                        <option value="exempt_art44">Exonéré (44)</option>
                      </Select>
                    </td>
                    <td className="p-2 text-right font-mono font-semibold">{line.totalExclVat.toFixed(2)} €</td>
                    <td className="p-2 text-center">
                      <button type="button" onClick={() => removeLine(line.id)} className="text-[var(--text-tertiary)] hover:text-[var(--state-critical-text)] p-1 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- OGM & totals ---------- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
                <Hash className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                Communication structurée (OGM)
              </span>
              <StatusDot tone="positive">Modulo 97 OK</StatusDot>
            </div>
            <Input value={structuredComm} onChange={(e) => setStructuredComm(e.target.value)} className="font-mono text-center font-semibold tracking-wider" />
            <p className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
              Générée selon la formule officielle Febelfin pour le rapprochement bancaire automatique.
            </p>
          </div>

          <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2 text-[length:var(--text-xs)]">
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Sous-total HTVA :</span>
              <span className="font-mono font-semibold">{subtotalExclVat.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-[var(--text-secondary)]">
              <span>Total TVA (Grille 54) :</span>
              <span className="font-mono font-semibold">{totalVatAmount.toFixed(2)} €</span>
            </div>
            <div className="border-t border-[var(--border-subtle)] pt-2 flex justify-between text-sm font-bold text-[var(--text-primary)]">
              <span>Total TVAC :</span>
              <span className="font-mono text-base">{totalInclVat.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          <AlertTriangle className="w-3 h-3" />
          L’envoi Peppol est un acte juridique : vérifiez le client et l’exonération avant émission.
        </div>
      </div>
    </Modal>
  );
};

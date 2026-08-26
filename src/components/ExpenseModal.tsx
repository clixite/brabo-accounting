import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Receipt, ScanLine, Upload, AlertTriangle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Badge, StatusDot } from './ui/Badge';
import { Money } from './ui/Money';
import { useToasts } from '../state/ToastContext';
import type { PurchaseExpense, BelgianVatRate } from '../types/accounting';
import { validateBCE, BELGIAN_PCMN_ACCOUNTS } from '../utils/belgianAccounting';
import { OcrApiError, checkOcrHealth, extractInvoice } from '../services/ocrService';
import type { OcrExtractResult } from '../services/ocrService';
import { isOcrAmountConsistent, mapOcrResultToForm, ocrQualityDots } from '../services/ocrMapper';
import { isSupportedScanFile, prepareScanFile } from '../services/imagePreprocess';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: PurchaseExpense) => void;
}

type ServerStatus = 'checking' | 'online' | 'offline';

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose, onSave }) => {
  const toast = useToasts();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [supplierName, setSupplierName] = useState('Proximus SA');
  const [supplierBce, setSupplierBce] = useState('BE 0202.239.951');
  const [supplierIban, setSupplierIban] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('PROX-2026-9912');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [structuredComm, setStructuredComm] = useState('');
  const [amountExclVat, setAmountExclVat] = useState<number>(185.00);
  const [vatRate, setVatRate] = useState<BelgianVatRate>(21);
  const [pcmnAccount, setPcmnAccount] = useState('616100');
  const [category, setCategory] = useState('Télécom & Abonnements Pro');
  const [description, setDescription] = useState('Fibre Pro Bizz + Pack Mobile 5G illimité');
  const [deductibilityRate, setDeductibilityRate] = useState<number>(100);
  const [deductibleVatRate, setDeductibleVatRate] = useState<number>(100);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus>('checking');
  const [ocrResult, setOcrResult] = useState<OcrExtractResult | null>(null);
  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  /** Aborts any in-flight OCR call when the modal closes. */
  const scanAbortRef = useRef<AbortController | null>(null);

  // Fresh scan session each time the modal opens: probe the OCR server, reset state.
  useEffect(() => {
    if (!isOpen) {
      scanAbortRef.current?.abort();
      scanAbortRef.current = null;
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setServerStatus('checking');
    setOcrResult(null);
    setScanError(null);
    setEditedFields(new Set());
    checkOcrHealth()
      .then(() => { if (!cancelled) setServerStatus('online'); })
      .catch(() => { if (!cancelled) setServerStatus('offline'); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const vatAmount = Math.round(amountExclVat * (vatRate / 100) * 100) / 100;
  const amountInclVat = Math.round((amountExclVat + vatAmount) * 100) / 100;

  const deductibleAmount = Math.round(amountExclVat * (deductibilityRate / 100) * 100) / 100;
  const nonDeductibleAmount = Math.round((amountExclVat - deductibleAmount) * 100) / 100;

  const deductibleVat = Math.round(vatAmount * (deductibleVatRate / 100) * 100) / 100;
  const nonDeductibleVat = Math.round((vatAmount - deductibleVat) * 100) / 100;

  /** Mark a field as manually corrected after an OCR extraction. */
  const markEdited = (key: string) => {
    if (ocrResult) {
      setEditedFields((prev) => new Set(prev).add(key));
    }
  };

  const applyOcr = (result: OcrExtractResult) => {
    const v = mapOcrResultToForm(result);
    if (v.supplierName) setSupplierName(v.supplierName);
    if (v.supplierBce) setSupplierBce(v.supplierBce);
    if (v.invoiceNumber) setInvoiceNumber(v.invoiceNumber);
    if (v.date) setDate(v.date);
    if (v.dueDate) setDueDate(v.dueDate);
    if (v.amountExclVat != null) setAmountExclVat(v.amountExclVat);
    if (v.vatRate != null) setVatRate(v.vatRate);
    if (v.pcmnAccount) {
      setPcmnAccount(v.pcmnAccount);
      const account = BELGIAN_PCMN_ACCOUNTS.find((a) => a.code === v.pcmnAccount);
      if (account) {
        if (account.deduct !== undefined) setDeductibilityRate(account.deduct);
        if (account.vat !== undefined) setVatRate(account.vat as BelgianVatRate);
      }
    }
    if (v.category) setCategory(v.category);
    if (v.description) setDescription(v.description);
    if (v.deductibilityRate != null) setDeductibilityRate(v.deductibilityRate);
    if (v.deductibleVatRate != null) setDeductibleVatRate(v.deductibleVatRate);
    if (v.structuredCommunication) setStructuredComm(v.structuredCommunication);
    if (v.iban) setSupplierIban(v.iban);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    const check = isSupportedScanFile(file);
    if (!check.ok) {
      toast.push('error', 'Fichier refusé', check.reason);
      return;
    }

    setIsScanning(true);
    setScanError(null);
    try {
      const prepared = await prepareScanFile(file);
      const result = await extractInvoice(prepared, 180_000, scanAbortRef.current?.signal);
      setOcrResult(result);
      applyOcr(result);
      toast.push('success', 'OCR terminé', 'Champs pré-remplis — vérifiez avant d’enregistrer.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return; // modal closed — silently cancel
      }
      const message =
        err instanceof OcrApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Serveur injoignable';
      setScanError(message);
      toast.push(
        'error',
        'OCR serveur indisponible',
        'Démarrez le conteneur ocr-server, ou utilisez le mode démo ci-dessous.',
      );
    } finally {
      setIsScanning(false);
    }
  };

  const loadPreset = (presetType: 'proximus' | 'car' | 'resto' | 'social' | 'apple') => {
    setIsScanning(true);

    setTimeout(() => {
      setIsScanning(false);

      if (presetType === 'proximus') {
        setSupplierName('Proximus SA');
        setSupplierBce('BE 0202.239.951');
        setInvoiceNumber('PROX-2026-9912');
        setAmountExclVat(245.00);
        setVatRate(21);
        setPcmnAccount('616100');
        setCategory('Télécom & Internet');
        setDescription('Abonnement Fibre Bizz & Cartes Sim Pro');
        setDeductibilityRate(100);
        setDeductibleVatRate(100);
      } else if (presetType === 'car') {
        setSupplierName('D\'Ieteren Lease SA');
        setSupplierBce('BE 0403.448.140');
        setInvoiceNumber('DIET-2026-1049');
        setAmountExclVat(850.00);
        setVatRate(21);
        setPcmnAccount('614100');
        setCategory('Véhicule & Leasing');
        setDescription('Loyer leasing mensuel Audi électrique + Carte de recharge');
        setDeductibilityRate(75);
        setDeductibleVatRate(50);
      } else if (presetType === 'resto') {
        setSupplierName('Brasserie Les Brigittines');
        setSupplierBce('BE 0465.123.890');
        setInvoiceNumber('TICKET-BRIG-088');
        setAmountExclVat(140.00);
        setVatRate(12);
        setPcmnAccount('615100');
        setCategory('Frais de représentation & Restaurant');
        setDescription('Repas de travail avec client néerlandophone (50% déductible, TVA non récupérable)');
        setDeductibilityRate(50);
        setDeductibleVatRate(0);
      } else if (presetType === 'social') {
        setSupplierName('Liantis Guichet & Caisse Sociale');
        setSupplierBce('BE 0406.879.803');
        setInvoiceNumber('LIAN-2026-COTIS');
        setAmountExclVat(1520.00);
        setVatRate(0);
        setPcmnAccount('617000');
        setCategory('Cotisations Sociales Indépendant');
        setDescription('Appel trimestriel INASTI / Cotisations sociales Q1 2026');
        setDeductibilityRate(100);
        setDeductibleVatRate(100);
      } else if (presetType === 'apple') {
        setSupplierName('Apple Retail Belgium BV');
        setSupplierBce('BE 0474.965.249');
        setInvoiceNumber('APPL-2026-901');
        setAmountExclVat(2399.00);
        setVatRate(21);
        setPcmnAccount('240000');
        setCategory('Investissement Matériel IT');
        setDescription('MacBook Pro M3 16 pouces pour comptabilité et développement');
        setDeductibilityRate(100);
        setDeductibleVatRate(100);
      }
    }, 600);
  };

  const bceVal = validateBCE(supplierBce);
  const qualityDots = ocrResult ? ocrQualityDots(ocrResult) : [];
  const amountsConsistent = ocrResult ? isOcrAmountConsistent(ocrResult) : true;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newExpense: PurchaseExpense = {
      id: 'exp-' + Date.now(),
      supplierName,
      supplierBce: bceVal.isValid ? bceVal.formatted : supplierBce,
      supplierIban: supplierIban || undefined,
      invoiceNumber,
      date,
      dueDate,
      category,
      pcmnAccount,
      description,
      amountExclVat,
      vatRate,
      vatAmount,
      amountInclVat,
      deductibilityRate,
      deductibleVatRate,
      deductibleAmount,
      nonDeductibleAmount,
      deductibleVat,
      nonDeductibleVat,
      structuredCommunication: structuredComm || undefined,
      status: 'approved',
      ocrConfidence: ocrResult ? ocrResult.confidence : 98.8,
      ocrExtractedData: ocrResult
        ? {
            supplierRecognized: Boolean(ocrResult.fields?.supplierName?.value),
            vatDetected: vatAmount,
            bceValidated: bceVal.isValid,
            engine: ocrResult.engine,
            engineVersion: ocrResult.engineVersion,
            processedAt: ocrResult.processedAt,
            confidence: ocrResult.confidence,
            rawText: ocrResult.rawText.slice(0, 20_000),
            manuallyCorrectedFields: [...editedFields],
            warnings: ocrResult.warnings,
          }
        : {
            supplierRecognized: true,
            vatDetected: vatAmount,
            bceValidated: bceVal.isValid,
          },
    };

    onSave(newExpense);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Receipt className="w-4 h-4 text-[var(--text-tertiary)]" />
          Scanner / saisir une dépense
        </span>
      }
      description="OCR serveur (PaddleOCR) + règles de déductibilité fiscale belge"
      width="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            {bceVal.isValid ? (
              <StatusDot tone="positive">BCE valide</StatusDot>
            ) : (
              <StatusDot tone="warning">BCE à vérifier</StatusDot>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} type="button">
              Annuler
            </Button>
            <Button variant="primary" type="submit" disabled={isScanning}>
              Enregistrer
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ------------------------------------------------------------------ */}
        {/* Real OCR scan (server)                                             */}
        {/* ------------------------------------------------------------------ */}
        <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)] inline-flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-[var(--text-tertiary)]" />
              Scanner un document
              <Badge
                tone={serverStatus === 'online' ? 'positive' : serverStatus === 'offline' ? 'critical' : 'neutral'}
                dot
              >
                {serverStatus === 'online'
                  ? 'OCR serveur en ligne'
                  : serverStatus === 'offline'
                    ? 'Serveur OCR hors ligne'
                    : 'Vérification…'}
              </Badge>
            </div>
            {isScanning && <StatusDot tone="info">Analyse…</StatusDot>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="secondary"
              type="button"
              disabled={isScanning}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              Photo / PDF
            </Button>
            {ocrResult && (
              <Badge tone="positive" dot>
                Extraits — confiance {Math.round(ocrResult.confidence * 100)}%
              </Badge>
            )}
            {ocrResult && (
              <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                {ocrResult.engine} {ocrResult.engineVersion} · {ocrResult.pages} page{ocrResult.pages > 1 ? 's' : ''}
              </span>
            )}
            {scanError && (
              <span className="inline-flex items-center gap-1.5 text-[length:var(--text-2xs)] text-[var(--state-critical-text)]">
                <AlertTriangle className="w-3.5 h-3.5" />
                {scanError}
              </span>
            )}
          </div>

          {ocrResult && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {qualityDots.map((dot) => (
                <StatusDot key={dot.key} tone={dot.ok ? 'positive' : 'warning'}>
                  {dot.label}
                  {dot.confidence != null && dot.ok ? ` ${Math.round(dot.confidence * 100)}%` : ' —'}
                </StatusDot>
              ))}
              {!amountsConsistent && (
                <StatusDot tone="critical">Écart TVAC ≠ HTVA + TVA</StatusDot>
              )}
              {editedFields.size > 0 && (
                <StatusDot tone="info">{editedFields.size} champ(s) corrigé(s)</StatusDot>
              )}
            </div>
          )}

          {ocrResult && ocrResult.warnings.length > 0 && (
            <ul className="space-y-0.5 text-[length:var(--text-2xs)] text-[var(--state-warning-text)]">
              {ocrResult.warnings.map((w, i) => (
                <li key={i} className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Offline demo presets                                               */}
        {/* ------------------------------------------------------------------ */}
        <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)] inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--text-tertiary)]" />
              Démo hors-ligne (presets)
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" type="button" onClick={() => loadPreset('proximus')} disabled={isScanning}>
              Proximus
            </Button>
            <Button variant="secondary" type="button" onClick={() => loadPreset('car')} disabled={isScanning}>
              Véhicule
            </Button>
            <Button variant="secondary" type="button" onClick={() => loadPreset('resto')} disabled={isScanning}>
              Restaurant
            </Button>
            <Button variant="secondary" type="button" onClick={() => loadPreset('social')} disabled={isScanning}>
              Sociales
            </Button>
            <Button variant="secondary" type="button" onClick={() => loadPreset('apple')} disabled={isScanning}>
              IT (immo)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fournisseur" required>
            <Input
              value={supplierName}
              onChange={(e) => { setSupplierName(e.target.value); markEdited('supplierName'); }}
            />
          </Field>

          <Field label="BCE fournisseur" required hint={bceVal.isValid ? 'Mod97 OK' : bceVal.error}>
            <Input
              value={supplierBce}
              onChange={(e) => { setSupplierBce(e.target.value); markEdited('supplierBce'); }}
              className="font-mono"
            />
          </Field>

          <Field label="Référence" required>
            <Input
              value={invoiceNumber}
              onChange={(e) => { setInvoiceNumber(e.target.value); markEdited('invoiceNumber'); }}
            />
          </Field>

          <Field label="Date" required>
            <Input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); markEdited('invoiceDate'); }}
            />
          </Field>

          <Field label="Échéance">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); markEdited('dueDate'); }}
            />
          </Field>

          <Field label="Communication structurée (OGM)" hint="Rapprochement bancaire automatique">
            <Input
              value={structuredComm}
              onChange={(e) => { setStructuredComm(e.target.value); markEdited('structuredCommunication'); }}
              placeholder="+++123/4567/89012+++"
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="PCMN" hint="Imputation comptable">
            <Select
              value={pcmnAccount}
              onChange={(e) => {
                setPcmnAccount(e.target.value);
                markEdited('pcmnAccount');
                const found = BELGIAN_PCMN_ACCOUNTS.find((a) => a.code === e.target.value);
                if (found) {
                  if (found.deduct !== undefined) setDeductibilityRate(found.deduct);
                  if (found.vat !== undefined) setVatRate(found.vat as BelgianVatRate);
                }
              }}
            >
              {BELGIAN_PCMN_ACCOUNTS.filter((a) => a.code.startsWith('6') || a.code.startsWith('2')).map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} - {a.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Libellé / objet">
            <Input
              value={description}
              onChange={(e) => { setDescription(e.target.value); markEdited('description'); }}
            />
          </Field>

          <Field label="IBAN fournisseur">
            <Input
              value={supplierIban}
              onChange={(e) => { setSupplierIban(e.target.value); markEdited('iban'); }}
              placeholder="BE68 5390 0754 7034"
              className="font-mono"
            />
          </Field>

          <Field label="Catégorie">
            <Input
              value={category}
              onChange={(e) => { setCategory(e.target.value); markEdited('category'); }}
            />
          </Field>
        </div>

        <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-3">
          <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">TVA & déductibilité</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Montant HTVA (€)">
              <Input
                type="number"
                step="0.01"
                value={amountExclVat}
                onChange={(e) => { setAmountExclVat(parseFloat(e.target.value) || 0); markEdited('totalExclVat'); }}
                className="font-mono"
              />
            </Field>

            <Field label="Taux TVA">
              <Select value={vatRate} onChange={(e) => { setVatRate(parseInt(e.target.value, 10) as BelgianVatRate); markEdited('vatRate'); }}>
                <option value={21}>21%</option>
                <option value={12}>12%</option>
                <option value={6}>6%</option>
                <option value={0}>0%</option>
              </Select>
            </Field>

            <Field label="Déductibilité (%)">
              <Select value={deductibilityRate} onChange={(e) => { setDeductibilityRate(parseInt(e.target.value, 10)); markEdited('deductibilityRate'); }}>
                <option value={100}>100%</option>
                <option value={75}>75%</option>
                <option value={50}>50%</option>
                <option value={0}>0%</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">TVA totale</div>
              <div className="mt-0.5"><Money value={vatAmount} /></div>
            </div>
            <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">TVA déductible</div>
              <div className="mt-0.5"><Money value={deductibleVat} /></div>
            </div>
            <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Base déductible</div>
              <div className="mt-0.5"><Money value={deductibleAmount} /></div>
            </div>
            <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Total TVAC</div>
              <div className="mt-0.5"><Money value={amountInclVat} /></div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <Badge tone="info" dot>Grille 59</Badge>
            <span>TVA déductible (démo)</span>
          </div>
        </div>
      </form>
    </Modal>
  );
};

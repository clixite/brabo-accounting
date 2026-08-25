import React, { useState } from 'react';
import { Sparkles, Receipt } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Badge, StatusDot } from './ui/Badge';
import { Money } from './ui/Money';
import type { PurchaseExpense, BelgianVatRate } from '../types/accounting';
import { validateBCE, BELGIAN_PCMN_ACCOUNTS } from '../utils/belgianAccounting';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: PurchaseExpense) => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose, onSave }) => {
  const [supplierName, setSupplierName] = useState('Proximus SA');
  const [supplierBce, setSupplierBce] = useState('BE 0202.239.951');
  const [invoiceNumber, setInvoiceNumber] = useState('PROX-2026-9912');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amountExclVat, setAmountExclVat] = useState<number>(185.00);
  const [vatRate, setVatRate] = useState<BelgianVatRate>(21);
  const [pcmnAccount, setPcmnAccount] = useState('616100');
  const [category, setCategory] = useState('Télécom & Abonnements Pro');
  const [description, setDescription] = useState('Fibre Pro Bizz + Pack Mobile 5G illimité');
  const [deductibilityRate, setDeductibilityRate] = useState<number>(100);
  const [deductibleVatRate, setDeductibleVatRate] = useState<number>(100);
  const [isScanning, setIsScanning] = useState(false);


  const vatAmount = Math.round(amountExclVat * (vatRate / 100) * 100) / 100;
  const amountInclVat = Math.round((amountExclVat + vatAmount) * 100) / 100;

  const deductibleAmount = Math.round(amountExclVat * (deductibilityRate / 100) * 100) / 100;
  const nonDeductibleAmount = Math.round((amountExclVat - deductibleAmount) * 100) / 100;

  const deductibleVat = Math.round(vatAmount * (deductibleVatRate / 100) * 100) / 100;
  const nonDeductibleVat = Math.round((vatAmount - deductibleVat) * 100) / 100;

  const loadPreset = (presetType: 'proximus' | 'car' | 'resto' | 'social' | 'apple') => {
    setIsScanning(true);

    setTimeout(() => {
      setIsScanning(false);
      // No confetti.

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newExpense: PurchaseExpense = {
      id: 'exp-' + Date.now(),
      supplierName,
      supplierBce: bceVal.isValid ? bceVal.formatted : supplierBce,
      invoiceNumber,
      date,
      dueDate: date,
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
      status: 'approved',
      ocrConfidence: 98.8,
      ocrExtractedData: {
        supplierRecognized: true,
        vatDetected: vatAmount,
        bceValidated: bceVal.isValid,
      }
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
      description="OCR + règles de déductibilité fiscale belge"
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
          
          <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)] inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--text-tertiary)]" />
                Presets (démo OCR)
              </div>
              {isScanning && <StatusDot tone="info">Analyse…</StatusDot>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" type="button" onClick={() => loadPreset('proximus')}>
                Proximus
              </Button>
              <Button variant="secondary" type="button" onClick={() => loadPreset('car')}>
                Véhicule
              </Button>
              <Button variant="secondary" type="button" onClick={() => loadPreset('resto')}>
                Restaurant
              </Button>
              <Button variant="secondary" type="button" onClick={() => loadPreset('social')}>
                Sociales
              </Button>
              <Button variant="secondary" type="button" onClick={() => loadPreset('apple')}>
                IT (immo)
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Fournisseur" required>
              <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </Field>

            <Field label="BCE fournisseur" required hint={bceVal.isValid ? 'Mod97 OK' : bceVal.error}>
              <Input value={supplierBce} onChange={(e) => setSupplierBce(e.target.value)} className="font-mono" />
            </Field>

            <Field label="Référence" required>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </Field>

            <Field label="Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="PCMN" hint="Imputation comptable">
              <Select
                value={pcmnAccount}
                onChange={(e) => {
                  setPcmnAccount(e.target.value);
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
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
                  onChange={(e) => setAmountExclVat(parseFloat(e.target.value) || 0)}
                  className="font-mono"
                />
              </Field>

              <Field label="Taux TVA">
                <Select value={vatRate} onChange={(e) => setVatRate(parseInt(e.target.value, 10) as BelgianVatRate)}>
                  <option value={21}>21%</option>
                  <option value={12}>12%</option>
                  <option value={6}>6%</option>
                  <option value={0}>0%</option>
                </Select>
              </Field>

              <Field label="Déductibilité (%)">
                <Select value={deductibilityRate} onChange={(e) => setDeductibilityRate(parseInt(e.target.value, 10))}>
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

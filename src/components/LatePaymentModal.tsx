import React, { useState } from 'react';
import { 
  X, 
  Send, 
  Copy, 
  Check, 
  ShieldAlert,
  FileText
} from 'lucide-react';
import type { Invoice, CompanyProfile } from '../types/accounting';

interface LatePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  company: CompanyProfile;
}

export const LatePaymentModal: React.FC<LatePaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  company,
}) => {
  const [reminderType, setReminderType] = useState<'gentle' | 'formal' | 'legal_notice'>('formal');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const today = new Date();
  const due = new Date(invoice.dueDate);
  const diffTime = today.getTime() - due.getTime();
  const daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  const legalAnnualRate = 0.125; 
  const statutoryInterest = Math.round((invoice.totalInclVat * legalAnnualRate * (daysOverdue / 365)) * 100) / 100;
  
  const legalRecoveryFee = 40.00;
  const contractualClauseFee = Math.max(50.00, Math.round(invoice.totalInclVat * 0.10 * 100) / 100);

  const appliedFee = reminderType === 'legal_notice' ? contractualClauseFee : legalRecoveryFee;
  const totalClaimAmount = invoice.totalInclVat + (reminderType === 'gentle' ? 0 : statutoryInterest + appliedFee);

  const reminderLetter = `OBJET : ${
    reminderType === 'gentle' ? 'Rappel amical de paiement' :
    reminderType === 'formal' ? 'RAPPEL DE PAIEMENT & INTÉRÊTS DE RETARD (Loi du 02/08/2002)' :
    'MISE EN DEMEURE OFFICIELLE AVANT PROCÉDURE JUDICIAIRE'
  }
Facture n° : ${invoice.invoiceNumber} du ${invoice.date}
Montant principal TVAC : ${invoice.totalInclVat.toFixed(2)} €
Communication structurée : ${invoice.structuredCommunication}
Échéance initiale : ${invoice.dueDate} (${daysOverdue} jours de retard)

Madame, Monsieur,

${reminderType === 'gentle' ? 
`Sauf erreur ou omission de notre part, nous constatons que la facture ci-dessus référencée est arrivée à échéance le ${invoice.dueDate} et reste à ce jour impayée.

Nous vous invitons à bien vouloir régulariser ce montant de ${invoice.totalInclVat.toFixed(2)} € sur notre compte bancaire ${company.iban} avec la communication structurée obligatoire ${invoice.structuredCommunication}.` 
: reminderType === 'formal' ?
`Malgré nos précédents contacts, nous constatons que la facture n° ${invoice.invoiceNumber} échue depuis ${daysOverdue} jours n'a toujours pas été honorée.

Conformément à la loi belge du 2 août 2002 concernant la lutte contre le retard de paiement dans les transactions commerciales, ce retard entraîne de plein droit l'application :
- D'une indemnité forfaitaire pour frais de recouvrement : ${legalRecoveryFee.toFixed(2)} €
- D'intérêts de retard légaux (taux officiel 12,50% l'an) : ${statutoryInterest.toFixed(2)} €

Soit un montant total exigible de : ${totalClaimAmount.toFixed(2)} €

Nous vous prions de verser cette somme sous 8 jours sur le compte ${company.iban} (BIC: ${company.bic}) avec la communication structurée ${invoice.structuredCommunication}.`
:
`Nous vous mettons formellement EN DEMEURE par la présente de procéder au paiement intégral de la créance suivante :

- Principal facture ${invoice.invoiceNumber} : ${invoice.totalInclVat.toFixed(2)} €
- Clause pénale contractuelle (10%) : ${contractualClauseFee.toFixed(2)} €
- Intérêts moratoires légaux : ${statutoryInterest.toFixed(2)} €
TOTAL DÛ : ${totalClaimAmount.toFixed(2)} €

À défaut de réception des fonds sur notre compte ${company.iban} sous 48 heures ouvrables, le dossier sera immédiatement transmis à notre avocat / huissier de justice près le Tribunal de l'Entreprise de ${company.rpmCity} sans autre préavis.`}

Veuillez agréer nos salutations distinguées.

${company.name}
Service Comptabilité & Recouvrement
BCE : ${company.bceNumber}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(reminderLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Calculateur de Retard & Lettre de Rappel Conforme</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                  {daysOverdue} jours de retard
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Loi belge du 02/08/2002 B2B • Intérêts légaux & indemnité forfaitaire 40 €
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          
          {/* Severity selector */}
          <div className="flex bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/60 gap-1.5">
            <button
              onClick={() => setReminderType('gentle')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                reminderType === 'gentle' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
              }`}
            >
              1. Rappel amical (Sans frais)
            </button>
            <button
              onClick={() => setReminderType('formal')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                reminderType === 'formal' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300 hover:text-white'
              }`}
            >
              2. Rappel formel (Intérêts 12.5% + 40 €)
            </button>
            <button
              onClick={() => setReminderType('legal_notice')}
              className={`flex-1 py-2 rounded-lg font-semibold transition ${
                reminderType === 'legal_notice' ? 'bg-red-600 text-white font-bold shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              3. Mise en demeure avant citation
            </button>
          </div>

          {/* Legal Calculation Box */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">Montant Principal</span>
              <span className="font-mono font-bold text-white text-sm">{invoice.totalInclVat.toFixed(2)} €</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Intérêts Moratoires (12.5%)</span>
              <span className="font-mono font-bold text-red-400 text-sm">
                {reminderType === 'gentle' ? '0.00 €' : `+ ${statutoryInterest.toFixed(2)} €`}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Indemnité Recouvrement</span>
              <span className="font-mono font-bold text-red-400 text-sm">
                {reminderType === 'gentle' ? '0.00 €' : `+ ${appliedFee.toFixed(2)} €`}
              </span>
            </div>
            <div className="bg-slate-900 p-2 rounded-lg border border-slate-800 text-right">
              <span className="text-amber-400 block text-[10px] uppercase font-bold">Total Exigible</span>
              <span className="font-mono font-extrabold text-amber-300 text-base">{totalClaimAmount.toFixed(2)} €</span>
            </div>
          </div>

          {/* Draft text preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-bold uppercase text-[11px] flex items-center">
                <FileText className="w-3.5 h-3.5 mr-1 text-amber-400" />
                Modèle de courrier / e-mail de rappel légal belge
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 text-amber-400 hover:text-amber-300 font-bold"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copié !' : 'Copier le texte'}</span>
              </button>
            </div>

            <textarea
              readOnly
              rows={11}
              value={reminderLetter}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 font-mono text-[11px] text-slate-300 leading-relaxed focus:outline-none"
            />
          </div>

          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 text-slate-400 text-[11px] leading-relaxed">
            💡 <strong>Règle de droit belge :</strong> Entre entreprises (B2B), les intérêts de retard courent de plein droit dès le lendemain de l'échéance sans mise en demeure préalable (loi du 2 août 2002). L'indemnité forfaitaire de 40 € est due dès le premier jour de retard sans justification requise.
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
          >
            Fermer
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-md shadow-amber-500/20 flex items-center"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Copier & Envoyer au client
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

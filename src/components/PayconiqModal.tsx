import React, { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  Smartphone, 
  Copy, 
  Check, 
  Zap
} from 'lucide-react';
import QRCode from 'qrcode';
import type { Invoice } from '../types/accounting';
import confetti from 'canvas-confetti';

interface PayconiqModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onPaymentSuccess: (invoiceId: string) => void;
}

export const PayconiqModal: React.FC<PayconiqModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onPaymentSuccess,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [simulatedStatus, setSimulatedStatus] = useState<'pending' | 'success'>('pending');

  const payconiqDeepLink = `payconiq://pay?t=BE-BRABO-${invoice.invoiceNumber}-${invoice.totalInclVat}`;

  useEffect(() => {
    if (isOpen) {
      setSimulatedStatus('pending');
      QRCode.toDataURL(payconiqDeepLink, {
        width: 220,
        margin: 1,
        color: {
          dark: '#ec4899', // Payconiq signature pink
          light: '#ffffff'
        }
      }).then(setQrDataUrl);
    }
  }, [isOpen, payconiqDeepLink]);

  if (!isOpen) return null;

  const handleSimulatePayment = () => {
    setSimulatedStatus('success');
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
    setTimeout(() => {
      onPaymentSuccess(invoice.id);
      onClose();
    }, 1800);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(payconiqDeepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] max-w-md w-full shadow-[var(--shadow-modal)] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-[var(--text-primary)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-hover)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-pink-500/10 text-pink-400 rounded-[var(--radius-md)] border border-pink-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Paiement Payconiq by Bancontact</h2>
              <p className="text-xs text-[var(--text-tertiary)]">Règlement instantané sécurisé en Belgique</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-[var(--radius-md)] hover:bg-[var(--bg-subtle)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-center text-xs">
          
          {/* Invoice Summary */}
          <div className="bg-[var(--bg-subtle)] p-3 rounded-[var(--radius-md)] border border-[var(--border-default)] flex justify-between items-center">
            <div className="text-left">
              <span className="font-bold text-[var(--text-primary)] block">Facture #{invoice.invoiceNumber}</span>
              <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{invoice.structuredCommunication}</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-mono font-black text-pink-400">{invoice.totalInclVat.toFixed(2)} €</span>
              <span className="text-[10px] text-[var(--text-tertiary)] block">TVAC</span>
            </div>
          </div>

          {/* QR Code Container */}
          <div className="bg-white p-4 rounded-[var(--radius-lg)] shadow-inner w-fit mx-auto border border-pink-200 relative group">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Payconiq QR Code" className="w-48 h-48 mx-auto" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-[var(--text-tertiary)] font-mono">
                Génération...
              </div>
            )}
            
            {simulatedStatus === 'success' && (
              <div className="absolute inset-0 bg-[var(--bg-app)]/90 backdrop-blur-sm rounded-[var(--radius-lg)] flex flex-col items-center justify-center text-[var(--state-positive-text)] animate-in fade-in">
                <CheckCircle2 className="w-12 h-12 text-[var(--state-positive-text)] animate-bounce" />
                <span className="font-bold text-sm mt-2">Paiement Reçu !</span>
                <span className="text-[10px] text-[var(--state-positive-text)]/80">Lettrage automatique effectué</span>
              </div>
            )}
          </div>

          <p className="text-[var(--text-tertiary)] text-[11px] max-w-xs mx-auto">
            Scannez ce QR code avec l'application <strong>Payconiq by Bancontact</strong> ou votre app bancaire belge (Belfius, KBC, Fortis, ING).
          </p>

          {/* Simulator button */}
          <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
            <button
              onClick={handleSimulatePayment}
              disabled={simulatedStatus === 'success'}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-[var(--text-primary)] font-bold rounded-[var(--radius-md)] shadow-[var(--shadow)] shadow-pink-500/20 transition flex items-center justify-center space-x-1.5 text-xs disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              <span>Simuler le paiement instantané Payconiq</span>
            </button>

            <button
              onClick={handleCopyLink}
              className="w-full py-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center justify-center space-x-1 text-[11px]"
            >
              {copied ? <Check className="w-3 h-3 text-[var(--state-positive-text)]" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Lien copié !' : 'Copier le deep-link Payconiq'}</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};

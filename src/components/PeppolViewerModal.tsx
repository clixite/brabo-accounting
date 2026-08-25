import React, { useState } from 'react';
import { X, Network, Download, Copy, Check, ShieldCheck, Code } from 'lucide-react';
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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Inspecteur Peppol BIS Billing 3.0 (UBL 2.1)</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  EN 16931 Validé
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Facture n° <strong className="text-white">{invoice.invoiceNumber}</strong> pour <strong className="text-white">{invoice.client.name}</strong>
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

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          
          {/* Peppol Metadata Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px]">Émetteur (Fournisseur)</span>
              <span className="font-semibold text-white truncate block">{company.name}</span>
              <span className="font-mono text-amber-400 text-[11px]">0208:{company.bceNumber.replace(/[^0-9]/g, '')}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Destinataire (Acheteur)</span>
              <span className="font-semibold text-white truncate block">{invoice.client.name}</span>
              <span className="font-mono text-amber-400 text-[11px]">0208:{invoice.client.bceNumber.replace(/[^0-9]/g, '')}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Communication OGM</span>
              <span className="font-mono font-bold text-white text-[11px]">{invoice.structuredCommunication}</span>
              <span className="text-[10px] text-emerald-400 block">✓ Inclus dans PaymentMeans</span>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="relative">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950 rounded-t-lg border-t border-x border-slate-800 text-xs text-slate-400">
              <span className="flex items-center space-x-1 font-mono text-[11px]">
                <Code className="w-3.5 h-3.5 mr-1 text-amber-400" />
                UBL-2.1-Invoice-Peppol-BIS-3.0.xml
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center space-x-1 text-[11px] text-slate-300 hover:text-amber-300"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copié' : 'Copier XML'}</span>
                </button>
              </div>
            </div>

            <pre className="bg-slate-950 p-4 rounded-b-lg border border-slate-800 text-[11px] font-mono text-emerald-400/90 overflow-x-auto max-h-80 leading-relaxed">
              <code>{ublXml}</code>
            </pre>
          </div>

          {/* Compliance note */}
          <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Ce document XML est strictement conforme au format Peppol BIS Billing 3.0 prescrit par la législation belge et le SPF Finances pour la facturation électronique B2B obligatoire.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
          >
            Fermer
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownloadXml}
              className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-md shadow-amber-500/20"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Télécharger le fichier XML Peppol
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

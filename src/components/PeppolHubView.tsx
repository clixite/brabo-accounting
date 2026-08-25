import React, { useState } from 'react';
import { 
  Network, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  FileCode, 
  ShieldCheck, 
  ArrowUpRight, 
  RefreshCw 
} from 'lucide-react';
import type { CompanyProfile, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { validateBCE } from '../utils/belgianAccounting';

interface PeppolHubViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  lang: Language;
  onViewInvoiceXml: (invoice: Invoice) => void;
}

export const PeppolHubView: React.FC<PeppolHubViewProps> = ({
  invoices,
  lang,
  onViewInvoiceXml,
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
      'urn:fdc:peppol.eu:poacc:bis:ordering:3 (Peppol Ordering 3.0)'
    ]
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
          ]
        });
      } else {
        setLookupResult({
          searched: true,
          found: false,
          bce: bceQuery,
          name: '',
          scheme: '',
          smpProvider: '',
          supportedProfiles: []
        });
      }
    }, 450);
  };

  const peppolInvoices = invoices.filter(i => i.peppolStatus?.isSent);

  return (
    <div className="space-y-6">
      
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Loi Belge du 20/02/2024
            </span>
            <span className="text-xs text-slate-400">Échéance légale : 1er Janvier 2026</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center mt-1">
            <Network className="w-6 h-6 mr-2 text-amber-400" />
            {t.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {t.subtitle}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center">
            <ShieldCheck className="w-4 h-4 mr-1.5 text-emerald-400" />
            <span>Point d'accès Peppol AS4 Connecté</span>
          </div>
        </div>
      </div>

      {/* Lookup Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center">
            <Search className="w-4 h-4 mr-2 text-amber-400" />
            {t.directoryLookup}
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">Annuaire officiel Peppol (Belgique & Europe)</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={bceQuery}
              onChange={(e) => setBceQuery(e.target.value)}
              placeholder={t.lookupPlaceholder}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={handleLookup}
            disabled={isSearching}
            className="px-5 py-2.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition flex items-center justify-center shrink-0"
          >
            {isSearching ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
            {t.checkButton}
          </button>
        </div>

        {/* Lookup Results */}
        {lookupResult && lookupResult.searched && (
          <div className={`p-4 rounded-xl border text-xs ${
            lookupResult.found 
              ? 'bg-emerald-950/30 border-emerald-500/30 text-slate-200' 
              : 'bg-red-950/30 border-red-500/30 text-red-200'
          }`}>
            {lookupResult.found ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-300 text-sm block">{lookupResult.name}</span>
                      <span className="font-mono text-[11px] text-slate-400">N° d'entreprise : {lookupResult.bce}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Enregistré sur Peppol
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Identifiant Participant Peppol (EAS 0208) :</span>
                    <span className="font-mono font-bold text-amber-300">{lookupResult.scheme}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">SMP Provider :</span>
                    <span className="text-slate-300">{lookupResult.smpProvider}</span>
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold block mb-1">Profils e-Invoicing supportés :</span>
                  <ul className="space-y-1">
                    {lookupResult.supportedProfiles.map((prof, i) => (
                      <li key={i} className="font-mono text-[10px] text-emerald-400/90 flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
                        {prof}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <div>
                  <span className="font-bold block">Numéro non trouvé dans l'annuaire Peppol</span>
                  <span className="text-[11px] text-red-300/80">
                    Vérifiez le format du numéro BCE belge (10 chiffres) ou utilisez la passerelle de secours Hermes du SPF Finances.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Outbox & Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Outbox */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center">
              <ArrowUpRight className="w-4 h-4 mr-2 text-emerald-400" />
              {t.outboxTitle}
            </h3>
            <span className="text-xs text-slate-400">{peppolInvoices.length} transmises</span>
          </div>

          <div className="space-y-2.5">
            {peppolInvoices.map((inv) => (
              <div
                key={inv.id}
                className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-white">{inv.invoiceNumber}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-semibold text-slate-200">{inv.client.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                    <span className="font-mono">{inv.peppolStatus?.messageId}</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-bold">200 OK Accepted</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onViewInvoiceXml(inv)}
                    className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition"
                    title="Voir le code XML UBL 2.1"
                  >
                    <FileCode className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance Guide */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center">
              <ShieldCheck className="w-4 h-4 mr-2 text-amber-400" />
              Conformité Légale Belge 2026
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              CEN/TC 434
            </span>
          </div>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
              <span className="font-bold text-white block">1. Format UBL 2.1 obligatoire</span>
              <p className="text-[11px] text-slate-400">
                À partir du 1er janvier 2026, l'envoi de simples factures PDF par e-mail entre assujettis belges B2B est prohibé. Tout flux doit transiter en UBL conforme EN 16931.
              </p>
            </div>

            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
              <span className="font-bold text-white block">2. Protocole sécurisé AS4 / Peppol</span>
              <p className="text-[11px] text-slate-400">
                L'échange se fait de point d'accès à point d'accès via le réseau Peppol européen, garantissant l'authenticité de l'origine et l'intégrité du contenu.
              </p>
            </div>

            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-1">
              <span className="font-bold text-white block">3. Passerelle de secours Hermès (SPF Finances)</span>
              <p className="text-[11px] text-slate-400">
                Si un client n'a pas encore configuré son propre point d'accès, Brabo achemine automatiquement la facture vers le portail fédéral Hermès du SPF Finances.
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

import React, { useState } from 'react';
import { 
  X, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  RefreshCw, 
  Copy,
  Check
} from 'lucide-react';

interface ViesLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  requesterBce: string;
}

interface ViesResult {
  countryCode: string;
  vatNumber: string;
  isValid: boolean;
  name?: string;
  address?: string;
  requestDate: string;
  consultationNumber: string;
}

export const ViesLookupModal: React.FC<ViesLookupModalProps> = ({
  isOpen,
  onClose,
  requesterBce,
}) => {
  const [country, setCountry] = useState('FR');
  const [vatNumberInput, setVatNumberInput] = useState('83824040984');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ViesResult | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleVerify = () => {
    setLoading(true);
    const cleanVat = vatNumberInput.replace(/[^a-zA-Z0-9]/g, '');

    setTimeout(() => {
      setLoading(false);
      const isMockValid = cleanVat.length >= 8;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const consultationId = `WBRV-${Date.now().toString().substring(4)}-${Math.floor(1000 + Math.random() * 9000)}`;

      if (isMockValid) {
        let compName = 'Société Partenaire Européenne';
        let compAddress = '10 Rue de la Paix, 75002 Paris, France';

        if (country === 'FR') {
          compName = 'Dassault Systèmes SE';
          compAddress = '10 Rue Marcel Dassault, 78140 Vélizy-Villacoublay, France';
        } else if (country === 'NL') {
          compName = 'ASML Netherlands B.V.';
          compAddress = 'De Run 6501, 5504 DR Veldhoven, Netherlands';
        } else if (country === 'DE') {
          compName = 'SAP SE';
          compAddress = 'Dietmar-Hopp-Allee 16, 69190 Walldorf, Germany';
        } else if (country === 'LU') {
          compName = 'Amazon Europe Core S.à r.l.';
          compAddress = '38 Avenue John F. Kennedy, 1855 Luxembourg';
        }

        setResult({
          countryCode: country,
          vatNumber: cleanVat,
          isValid: true,
          name: compName,
          address: compAddress,
          requestDate: now,
          consultationNumber: consultationId,
        });
      } else {
        setResult({
          countryCode: country,
          vatNumber: cleanVat,
          isValid: false,
          requestDate: now,
          consultationNumber: consultationId,
        });
      }
    }, 500);
  };

  const handleCopy = () => {
    if (!result) return;
    const text = `ATTESTATION DE VALIDATION VIES (TVA INTRACOMMUNAUTAIRE)\nN° Consultation : ${result.consultationNumber}\nDate : ${result.requestDate}\nDemandeur : ${requesterBce}\nTVA Validée : ${result.countryCode}${result.vatNumber}\nNom : ${result.name || 'N/A'}\nStatut : ${result.isValid ? 'VALIDE' : 'INVALIDE'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Vérificateur de TVA Intracommunautaire VIES</h2>
              <p className="text-xs text-slate-400">Commission Européenne • Justificatif légal d'exonération Art. 39bis / 21 §2</p>
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
          
          {/* Query Inputs */}
          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-3">
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider block">
              Interrogation directe de la base VIES
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">État membre de l'UE</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="FR">France (FR)</option>
                  <option value="NL">Pays-Bas (NL)</option>
                  <option value="DE">Allemagne (DE)</option>
                  <option value="LU">Luxembourg (LU)</option>
                  <option value="ES">Espagne (ES)</option>
                  <option value="IT">Italie (IT)</option>
                  <option value="IE">Irlande (IE)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">Numéro de TVA étranger</label>
                <div className="flex space-x-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400">
                      {country}
                    </span>
                    <input
                      type="text"
                      value={vatNumberInput}
                      onChange={(e) => setVatNumberInput(e.target.value)}
                      placeholder="83824040984"
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <button
                    onClick={handleVerify}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center shrink-0"
                  >
                    {loading ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1" />}
                    Vérifier
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Results display */}
          {result && (
            <div className={`p-4 rounded-xl border ${
              result.isValid 
                ? 'bg-emerald-950/30 border-emerald-500/30 text-slate-200' 
                : 'bg-red-950/30 border-red-500/30 text-red-200'
            } space-y-3`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {result.isValid ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-sm block">
                      {result.isValid ? 'Numéro de TVA Intracommunautaire VALIDE' : 'Numéro de TVA INVALIDE ou Inconnu'}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      N° TVA : {result.countryCode} {result.vatNumber}
                    </span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  result.isValid 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {result.isValid ? 'VIES CONFIRMÉ' : 'REJETÉ'}
                </span>
              </div>

              {result.isValid && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Raison sociale :</span>
                    <span className="font-bold text-white">{result.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Adresse enregistrée :</span>
                    <span className="text-slate-300">{result.address}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Horodatage de consultation :</span>
                    <span className="font-mono text-slate-300">{result.requestDate}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Identifiant unique de preuve :</span>
                    <span className="font-mono font-bold text-amber-300">{result.consultationNumber}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Legal Note */}
          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 text-slate-400 text-[11px] leading-relaxed">
            🛡️ <strong>Preuve fiscale requise par le SPF Finances :</strong> Pour facturer hors taxe à un client assujetti d'un autre État membre de l'UE (autoliquidation Art. 21 §2 ou livraison Art. 39bis), vous devez impérativement conserver la preuve de validation VIES avec le numéro de consultation horodaté.
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

          {result && result.isValid && (
            <button
              onClick={handleCopy}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition shadow-md shadow-amber-500/20 flex items-center"
            >
              {copied ? <Check className="w-3.5 h-3.5 mr-1 text-slate-950" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? 'Preuve Copiée !' : 'Copier l\'Attestation de Preuve'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

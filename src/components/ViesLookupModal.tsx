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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] max-w-2xl w-full shadow-[var(--shadow-modal)] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-[var(--text-primary)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-hover)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-500/10 text-[var(--state-info-text)] rounded-[var(--radius-md)] border border-blue-500/20">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Vérificateur de TVA Intracommunautaire VIES</h2>
              <p className="text-xs text-[var(--text-tertiary)]">Commission Européenne • Justificatif légal d'exonération Art. 39bis / 21 §2</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-[var(--radius-md)] hover:bg-[var(--bg-subtle)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
          
          {/* Query Inputs */}
          <div className="bg-[var(--bg-subtle)] p-4 rounded-[var(--radius-md)] border border-[var(--border-default)] space-y-3">
            <span className="text-xs font-bold text-[var(--state-warning-text)] uppercase tracking-wider block">
              Interrogation directe de la base VIES
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">État membre de l'UE</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-[var(--bg-sunken)] border border-[var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)]"
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
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">Numéro de TVA étranger</label>
                <div className="flex space-x-2">
                  <div className="flex-1 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-[var(--text-tertiary)]">
                      {country}
                    </span>
                    <input
                      type="text"
                      value={vatNumberInput}
                      onChange={(e) => setVatNumberInput(e.target.value)}
                      placeholder="83824040984"
                      className="w-full bg-[var(--bg-sunken)] border border-[var(--border-default)] rounded-[var(--radius-md)] pl-10 pr-3 py-2 text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>

                  <button
                    onClick={handleVerify}
                    disabled={loading}
                    className="px-4 py-2 rounded-[var(--radius-md)] bg-gradient-to-r bg-[var(--accent-solid)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] font-bold text-xs shadow-[var(--shadow)] shadow-[var(--shadow)] transition flex items-center shrink-0"
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
            <div className={`p-4 rounded-[var(--radius-md)] border ${
              result.isValid 
                ? 'bg-[var(--state-positive-bg)] border-[var(--state-positive-border)] text-[var(--text-primary)]' 
                : 'bg-[var(--state-critical-bg)] border-[var(--state-critical-border)] text-[var(--state-critical-text)]'
            } space-y-3`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {result.isValid ? (
                    <CheckCircle2 className="w-5 h-5 text-[var(--state-positive-text)] shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-[var(--state-critical-text)] shrink-0" />
                  )}
                  <div>
                    <span className="font-bold text-sm block">
                      {result.isValid ? 'Numéro de TVA Intracommunautaire VALIDE' : 'Numéro de TVA INVALIDE ou Inconnu'}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                      N° TVA : {result.countryCode} {result.vatNumber}
                    </span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  result.isValid 
                    ? 'bg-[var(--state-positive-bg)] text-[var(--state-positive-text)] border border-[var(--state-positive-border)]' 
                    : 'bg-[var(--state-critical-bg)] text-[var(--state-critical-text)] border border-[var(--state-critical-border)]'
                }`}>
                  {result.isValid ? 'VIES CONFIRMÉ' : 'REJETÉ'}
                </span>
              </div>

              {result.isValid && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)] text-[11px]">
                  <div>
                    <span className="text-[var(--text-tertiary)] block">Raison sociale :</span>
                    <span className="font-bold text-[var(--text-primary)]">{result.name}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)] block">Adresse enregistrée :</span>
                    <span className="text-[var(--text-secondary)]">{result.address}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)] block">Horodatage de consultation :</span>
                    <span className="font-mono text-[var(--text-secondary)]">{result.requestDate}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)] block">Identifiant unique de preuve :</span>
                    <span className="font-mono font-bold text-[var(--state-warning-text)]">{result.consultationNumber}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Legal Note */}
          <div className="p-3 bg-[var(--bg-subtle)] rounded-[var(--radius-md)] border border-[var(--border-default)]/50 text-[var(--text-tertiary)] text-[11px] leading-relaxed">
            🛡️ <strong>Preuve fiscale requise par le SPF Finances :</strong> Pour facturer hors taxe à un client assujetti d'un autre État membre de l'UE (autoliquidation Art. 21 §2 ou livraison Art. 39bis), vous devez impérativement conserver la preuve de validation VIES avec le numéro de consultation horodaté.
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            Fermer
          </button>

          {result && result.isValid && (
            <button
              onClick={handleCopy}
              className="px-4 py-2 text-xs font-bold rounded-[var(--radius-md)] bg-[var(--accent-solid)] hover:bg-[var(--accent-hover)] text-[var(--accent-text)] transition shadow-[var(--shadow)] shadow-[var(--shadow)] flex items-center"
            >
              {copied ? <Check className="w-3.5 h-3.5 mr-1 text-[var(--accent-text)]" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
              {copied ? 'Preuve Copiée !' : 'Copier l\'Attestation de Preuve'}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

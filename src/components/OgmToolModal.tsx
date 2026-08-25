import React, { useState } from 'react';
import { X, Hash, Copy, Check, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { generateOGM, validateOGM } from '../utils/belgianAccounting';

interface OgmToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OgmToolModal: React.FC<OgmToolModalProps> = ({ isOpen, onClose }) => {
  const [seedInput, setSeedInput] = useState('2026001042');
  const [generatedOgm, setGeneratedOgm] = useState(() => generateOGM('2026001042'));
  const [verifyInput, setVerifyInput] = useState('+++108/4567/89045+++');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = () => {
    const randomSeed = Math.floor(10000000 + Math.random() * 90000000).toString();
    setSeedInput(randomSeed);
    setGeneratedOgm(generateOGM(randomSeed));
  };

  const handleCustomSeedChange = (val: string) => {
    setSeedInput(val);
    setGeneratedOgm(generateOGM(val || '1'));
  };

  const verificationResult = validateOGM(verifyInput);

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedOgm);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Générateur & Validateur OGM Belge</h3>
              <p className="text-xs text-slate-400">Communication structurée belge (Modulo 97 - Febelfin)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm">
          
          {/* Section 1: Generator */}
          <div className="space-y-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                1. Générer une communication structurée
              </label>
              <button
                onClick={handleGenerate}
                className="text-xs text-slate-400 hover:text-amber-400 flex items-center space-x-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Aléatoire</span>
              </button>
            </div>

            <div>
              <input
                type="text"
                value={seedInput}
                onChange={(e) => handleCustomSeedChange(e.target.value)}
                placeholder="Entrez votre numéro de facture (ex: 2026042)"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:border-amber-500"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Calcul automatique des 2 chiffres de contrôle par Modulo 97 (reste 0 → 97).
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-amber-500/30">
              <div>
                <span className="text-[10px] text-amber-400 uppercase font-bold block">Résultat officiel Febelfin</span>
                <span className="text-lg font-mono font-bold text-amber-300 tracking-wider">
                  {generatedOgm}
                </span>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-md shadow-amber-500/10"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copié !' : 'Copier'}</span>
              </button>
            </div>
          </div>

          {/* Section 2: Validator */}
          <div className="space-y-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              2. Valider une communication existante
            </label>
            
            <input
              type="text"
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              placeholder="+++123/4567/89012+++"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:outline-none focus:border-blue-500"
            />

            <div className={`p-3 rounded-lg border text-xs flex items-start space-x-2.5 ${
              verificationResult.isValid 
                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                : 'bg-red-950/40 border-red-500/30 text-red-300'
            }`}>
              {verificationResult.isValid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Communication OGM Valide</span>
                    <span className="text-[11px] text-emerald-400/80">La clé de contrôle Modulo 97 correspond exactement à la norme Febelfin.</span>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Communication OGM Invalide</span>
                    <span className="text-[11px] text-red-400/80">{verificationResult.error}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
            💡 <strong className="text-slate-300">Règle belge :</strong> En Belgique, la communication structurée comprend 12 chiffres. Les 10 premiers forment la référence et les 2 derniers sont le résultat de la division euclidienne (modulo 97).
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-slate-800 bg-slate-900/80">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};

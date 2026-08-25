import React, { useState } from 'react';
import { Hash, Copy, Check, RefreshCw } from 'lucide-react';
import { generateOGM, validateOGM } from '../utils/belgianAccounting';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { StatusDot } from './ui/Badge';

interface OgmToolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OgmToolModal: React.FC<OgmToolModalProps> = ({ isOpen, onClose }) => {
  const [seedInput, setSeedInput] = useState('2026001042');
  const [generatedOgm, setGeneratedOgm] = useState(() => generateOGM('2026001042'));
  const [verifyInput, setVerifyInput] = useState('+++108/4567/89045+++');
  const [copied, setCopied] = useState(false);


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
    <Modal
      open={isOpen}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Hash className="w-4 h-4 text-[var(--text-tertiary)]" />
          Générateur / validateur OGM
        </span>
      }
      description="Communication structurée belge (Modulo 97 - Febelfin)"
      width="md"
    >
      <div className="space-y-4">
          
          <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
                Générer une communication
              </div>
              <Button variant="secondary" type="button" onClick={handleGenerate} className="h-[var(--control-height-sm)] px-2">
                <RefreshCw className="w-3.5 h-3.5" />
                Aléatoire
              </Button>
            </div>

            <Field label="Seed (référence)" hint="12 chiffres max recommandés">
              <Input value={seedInput} onChange={(e) => handleCustomSeedChange(e.target.value)} className="font-mono" />
            </Field>

            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Résultat</div>
                <div className="mt-0.5 font-mono tnum text-[length:var(--text-sm)] text-[var(--text-primary)] truncate">
                  {generatedOgm}
                </div>
              </div>
              <Button variant="primary" onClick={handleCopy} type="button" className="h-[var(--control-height-sm)] px-2">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié' : 'Copier'}
              </Button>
            </div>
          </div>

          <div className="p-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)] space-y-3">
            <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
              Valider une communication
            </div>

            <Field label="OGM">
              <Input
                value={verifyInput}
                onChange={(e) => setVerifyInput(e.target.value)}
                placeholder="+++123/4567/89012+++"
                className="font-mono"
              />
            </Field>

            <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {verificationResult.isValid ? (
                <StatusDot tone="positive">Valide (Modulo 97)</StatusDot>
              ) : (
                <StatusDot tone="critical">{verificationResult.error ?? 'Invalide'}</StatusDot>
              )}
            </div>

            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
              Règle : 12 chiffres, clé = modulo 97 (reste 0 → 97).
            </div>
          </div>
        </div>
      </Modal>
  );
};

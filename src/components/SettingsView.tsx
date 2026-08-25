import React, { useState } from 'react';
import { 
  Settings, 
  Building2, 
  ShieldCheck, 
  BookOpen, 
  Save, 
  CheckCircle2, 
  Landmark
} from 'lucide-react';
import type { CompanyProfile } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { BELGIAN_PCMN_ACCOUNTS, validateBCE } from '../utils/belgianAccounting';
import confetti from 'canvas-confetti';
import { Card, CardHeader, CardBody } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Field } from './ui/Field';
import { DataTable, Th, Td, Tr } from './ui/DataTable';
import { cn } from './ui/cn';

interface SettingsViewProps {
  company: CompanyProfile;
  lang: Language;
  onUpdateCompany: (updated: CompanyProfile) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  company,
  onUpdateCompany,
}) => {
  const [formData, setFormData] = useState<CompanyProfile>({ ...company });
  const [activeTab, setActiveTab] = useState<'profile' | 'pcmn'>('profile');
  const [pcmnSearch, setPcmnSearch] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  const bceVal = validateBCE(formData.bceNumber);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCompany(formData);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
  };

  const filteredPcmn = BELGIAN_PCMN_ACCOUNTS.filter(a => 
    a.code.includes(pcmnSearch) || a.label.toLowerCase().includes(pcmnSearch.toLowerCase()) || a.category.toLowerCase().includes(pcmnSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">

      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <Badge tone="accent" dot>Configuration</Badge>
            <span>Entité juridique belge & PCMN</span>
          </div>
          <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Settings className="w-5 h-5 text-[var(--text-tertiary)]" />
            Paramètres & Plan Comptable PCMN
          </h1>
          <p className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">
            Configuration de votre entité juridique belge, point d'accès Peppol et plan de comptes normalisé.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-1 p-1 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={cn(
              'h-[var(--control-height-sm)] px-3 rounded-[var(--radius-sm)]',
              'text-[length:var(--text-xs)] font-semibold transition-colors',
              activeTab === 'profile'
                ? 'bg-[var(--accent-solid)] text-[var(--accent-text)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            Entité Belge & Peppol
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pcmn')}
            className={cn(
              'h-[var(--control-height-sm)] px-3 rounded-[var(--radius-sm)]',
              'text-[length:var(--text-xs)] font-semibold transition-colors',
              activeTab === 'pcmn'
                ? 'bg-[var(--accent-solid)] text-[var(--accent-text)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            Plan Comptable PCMN
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--state-positive-bg)] border border-[var(--state-positive-border)] text-[length:var(--text-xs)] text-[var(--state-positive-text)] animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Paramètres de l'entreprise belge enregistrés avec succès !</span>
        </div>
      )}

      {activeTab === 'profile' && (
        <form onSubmit={handleSubmit}>
          <Card flush className="shadow-[var(--shadow)]">
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[var(--text-tertiary)]" />
                  Entité Belge & Peppol
                </span>
              }
              description="Identification légale, coordonnées bancaires et fiduciaire référente"
              actions={
                bceVal.isValid ? (
                  <Badge tone="positive" dot>BCE valide</Badge>
                ) : (
                  <Badge tone="warning" dot>BCE à vérifier</Badge>
                )
              }
            />
            <CardBody className="space-y-6">

              {/* Section 1: Identification & BCE */}
              <div className="space-y-4">
                <h3 className="text-[length:var(--text-2xs)] font-semibold uppercase tracking-wide text-[var(--accent-solid)] flex items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2">
                  <Building2 className="w-4 h-4" />
                  1. Identification Légale (BCE / KBO)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Raison Sociale / Nom">
                    <Input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="font-semibold"
                    />
                  </Field>

                  <Field label="Forme Juridique">
                    <Select
                      value={formData.legalForm}
                      onChange={(e) => setFormData({ ...formData, legalForm: e.target.value as any })}
                    >
                      <option value="SRL">SRL (Société à Responsabilité Limitée)</option>
                      <option value="BV">BV (Besloten Vennootschap)</option>
                      <option value="SA">SA (Société Anonyme)</option>
                      <option value="NV">NV (Naamloze Vennootschap)</option>
                      <option value="Indépendant">Indépendant (Personne physique)</option>
                      <option value="Eenmanszaak">Eenmanszaak</option>
                    </Select>
                  </Field>

                  <Field
                    label="Numéro BCE / TVA (Mod 97)"
                    hint={
                      bceVal.isValid ? (
                        <span className="text-[var(--state-positive-text)]">✓ N° BCE valide</span>
                      ) : (
                        <span className="text-[var(--accent-solid)]">{bceVal.error}</span>
                      )
                    }
                  >
                    <Input
                      type="text"
                      value={formData.bceNumber}
                      onChange={(e) => {
                        const val = e.target.value;
                        const cleaned = val.replace(/[^0-9]/g, '');
                        setFormData({ 
                          ...formData, 
                          bceNumber: val,
                          vatNumber: 'BE' + cleaned,
                          peppolEndpointId: `0208:${cleaned}`
                        });
                      }}
                      className="font-mono tnum"
                    />
                  </Field>

                  <Field label="RPM / RPR (Tribunal de l'Entreprise)">
                    <Input
                      type="text"
                      value={formData.rpmCity}
                      onChange={(e) => setFormData({ ...formData, rpmCity: e.target.value })}
                    />
                  </Field>

                  <Field label="Code NACE-BEL">
                    <Input
                      type="text"
                      value={formData.naceBelCode}
                      onChange={(e) => setFormData({ ...formData, naceBelCode: e.target.value })}
                    />
                  </Field>

                  <Field label="Régime de Déclaration TVA">
                    <Select
                      value={formData.vatRegime}
                      onChange={(e) => setFormData({ ...formData, vatRegime: e.target.value as any })}
                    >
                      <option value="quarterly">Trimestriel (Standard PME / Indépendant)</option>
                      <option value="monthly">Mensuel (CA &gt; 2.500.000 € ou sur option)</option>
                      <option value="franchise_art56bis">Régime de la Franchise (Art. 56bis &lt; 25k€)</option>
                    </Select>
                  </Field>
                </div>
              </div>

              {/* Section 2: Address & Banking */}
              <div className="space-y-4">
                <h3 className="text-[length:var(--text-2xs)] font-semibold uppercase tracking-wide text-[var(--accent-solid)] flex items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2">
                  <Landmark className="w-4 h-4" />
                  2. Adresse & Coordonnées Bancaires
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Rue & Numéro">
                    <Input
                      type="text"
                      value={`${formData.street} ${formData.number}`}
                      onChange={(e) => {
                        const parts = e.target.value.split(' ');
                        setFormData({ ...formData, street: parts.slice(0, -1).join(' ') || parts[0], number: parts[parts.length - 1] || '' });
                      }}
                    />
                  </Field>

                  <Field label="Code Postal & Ville">
                    <Input
                      type="text"
                      value={`${formData.postalCode} ${formData.city}`}
                      onChange={(e) => {
                        const parts = e.target.value.split(' ');
                        setFormData({ ...formData, postalCode: parts[0] || '', city: parts.slice(1).join(' ') || '' });
                      }}
                    />
                  </Field>

                  <Field label="IBAN Professionnel (Belgique)">
                    <Input
                      type="text"
                      value={formData.iban}
                      onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                      className="font-mono tnum"
                    />
                  </Field>

                  <Field label="BIC & Banque">
                    <Input
                      type="text"
                      value={`${formData.bic} - ${formData.bankName}`}
                      onChange={(e) => {
                        const parts = e.target.value.split('-');
                        setFormData({ ...formData, bic: parts[0]?.trim() || '', bankName: parts[1]?.trim() || '' });
                      }}
                    />
                  </Field>

                  <Field label="Email Entreprise">
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </Field>

                  <Field label="Identifiant Point d'Accès Peppol">
                    <Input
                      type="text"
                      value={formData.peppolEndpointId}
                      onChange={(e) => setFormData({ ...formData, peppolEndpointId: e.target.value })}
                      className="font-mono tnum text-[var(--accent-solid)]"
                    />
                  </Field>
                </div>
              </div>

              {/* Section 3: Fiduciary Link */}
              <div className="space-y-4">
                <h3 className="text-[length:var(--text-2xs)] font-semibold uppercase tracking-wide text-[var(--accent-solid)] flex items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2">
                  <ShieldCheck className="w-4 h-4" />
                  3. Fiduciaire & Expert-Comptable Référent (ITAA)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Cabinet / Fiduciaire">
                    <Input
                      type="text"
                      value={formData.fiduciaryName}
                      onChange={(e) => setFormData({ ...formData, fiduciaryName: e.target.value })}
                    />
                  </Field>

                  <Field label="N° d'Agrément ITAA">
                    <Input
                      type="text"
                      value={formData.fiduciaryItaaNumber}
                      onChange={(e) => setFormData({ ...formData, fiduciaryItaaNumber: e.target.value })}
                      className="font-mono tnum"
                    />
                  </Field>

                  <Field label="Email de l'Expert-Comptable">
                    <Input
                      type="email"
                      value={formData.fiduciaryEmail}
                      onChange={(e) => setFormData({ ...formData, fiduciaryEmail: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-[var(--border-subtle)]">
                <Button type="submit" variant="primary">
                  <Save className="w-4 h-4" />
                  Enregistrer les modifications
                </Button>
              </div>

            </CardBody>
          </Card>
        </form>
      )}

      {/* TAB 2: PCMN CHART OF ACCOUNTS */}
      {activeTab === 'pcmn' && (
        <Card flush className="shadow-[var(--shadow)]">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--text-tertiary)]" />
                Plan Comptable Minimum Normalisé Belge (PCMN)
              </span>
            }
            description="Comptes standardisés à 6 chiffres utilisés pour la catégorisation automatique des ventes, achats et déductions fiscales."
            actions={
              <div className="w-full sm:w-64">
                <Input
                  type="text"
                  value={pcmnSearch}
                  onChange={(e) => setPcmnSearch(e.target.value)}
                  placeholder="Filtrer un compte ou libellé..."
                />
              </div>
            }
          />
          <DataTable stickyHeader>
            <thead>
              <tr>
                <Th className="pl-4 w-28">N° Compte</Th>
                <Th>Intitulé officiel PCMN</Th>
                <Th className="w-32">Catégorie</Th>
                <Th align="center" className="w-24">Taux TVA</Th>
                <Th align="center" className="pr-4 w-28">Déductibilité</Th>
              </tr>
            </thead>
            <tbody>
              {filteredPcmn.map((acc) => (
                <Tr key={acc.code} interactive>
                  <Td mono className="pl-4 font-semibold text-[var(--accent-solid)]">{acc.code}</Td>
                  <Td className="font-medium text-[var(--text-primary)]">{acc.label}</Td>
                  <Td className="text-[var(--text-tertiary)]">{acc.category}</Td>
                  <Td align="center" mono>{acc.vat}%</Td>
                  <Td align="center" className="pr-4">
                    <Badge
                      tone={
                        acc.deduct === 100
                          ? 'positive'
                          : acc.deduct === 75
                            ? 'info'
                            : acc.deduct === 50
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {acc.deduct !== undefined ? `${acc.deduct}%` : 'N/A'}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}

    </div>
  );
};

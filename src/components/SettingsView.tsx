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
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center">
            <Settings className="w-6 h-6 mr-2 text-amber-400" />
            Paramètres & Plan Comptable PCMN
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Configuration de votre entité juridique belge, point d'accès Peppol et plan de comptes normalisé.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'profile' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Entité Belge & Peppol
          </button>
          <button
            onClick={() => setActiveTab('pcmn')}
            className={`px-3.5 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'pcmn' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Plan Comptable PCMN
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Paramètres de l'entreprise belge enregistrés avec succès !</span>
        </div>
      )}

      {activeTab === 'profile' && (
        <form onSubmit={handleSubmit} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-xs text-slate-200">
          
          {/* Section 1: Identification & BCE */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center border-b border-slate-800 pb-2">
              <Building2 className="w-4 h-4 mr-1.5" />
              1. Identification Légale (BCE / KBO)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">Raison Sociale / Nom</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-semibold focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Forme Juridique</label>
                <select
                  value={formData.legalForm}
                  onChange={(e) => setFormData({ ...formData, legalForm: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="SRL">SRL (Société à Responsabilité Limitée)</option>
                  <option value="BV">BV (Besloten Vennootschap)</option>
                  <option value="SA">SA (Société Anonyme)</option>
                  <option value="NV">NV (Naamloze Vennootschap)</option>
                  <option value="Indépendant">Indépendant (Personne physique)</option>
                  <option value="Eenmanszaak">Eenmanszaak</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Numéro BCE / TVA (Mod 97)</label>
                <input
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white focus:border-amber-500 focus:outline-none"
                />
                {bceVal.isValid ? (
                  <span className="text-[10px] text-emerald-400 mt-0.5 block">✓ N° BCE valide</span>
                ) : (
                  <span className="text-[10px] text-amber-400 mt-0.5 block">{bceVal.error}</span>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1">RPM / RPR (Tribunal de l'Entreprise)</label>
                <input
                  type="text"
                  value={formData.rpmCity}
                  onChange={(e) => setFormData({ ...formData, rpmCity: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Code NACE-BEL</label>
                <input
                  type="text"
                  value={formData.naceBelCode}
                  onChange={(e) => setFormData({ ...formData, naceBelCode: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Régime de Déclaration TVA</label>
                <select
                  value={formData.vatRegime}
                  onChange={(e) => setFormData({ ...formData, vatRegime: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="quarterly">Trimestriel (Standard PME / Indépendant)</option>
                  <option value="monthly">Mensuel (CA &gt; 2.500.000 € ou sur option)</option>
                  <option value="franchise_art56bis">Régime de la Franchise (Art. 56bis &lt; 25k€)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Address & Banking */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center border-b border-slate-800 pb-2">
              <Landmark className="w-4 h-4 mr-1.5" />
              2. Adresse & Coordonnées Bancaires
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">Rue & Numéro</label>
                <input
                  type="text"
                  value={`${formData.street} ${formData.number}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(' ');
                    setFormData({ ...formData, street: parts.slice(0, -1).join(' ') || parts[0], number: parts[parts.length - 1] || '' });
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Code Postal & Ville</label>
                <input
                  type="text"
                  value={`${formData.postalCode} ${formData.city}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(' ');
                    setFormData({ ...formData, postalCode: parts[0] || '', city: parts.slice(1).join(' ') || '' });
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">IBAN Professionnel (Belgique)</label>
                <input
                  type="text"
                  value={formData.iban}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">BIC & Banque</label>
                <input
                  type="text"
                  value={`${formData.bic} - ${formData.bankName}`}
                  onChange={(e) => {
                    const parts = e.target.value.split('-');
                    setFormData({ ...formData, bic: parts[0]?.trim() || '', bankName: parts[1]?.trim() || '' });
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Email Entreprise</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Identifiant Point d'Accès Peppol</label>
                <input
                  type="text"
                  value={formData.peppolEndpointId}
                  onChange={(e) => setFormData({ ...formData, peppolEndpointId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-amber-300 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Fiduciary Link */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider flex items-center border-b border-slate-800 pb-2">
              <ShieldCheck className="w-4 h-4 mr-1.5" />
              3. Fiduciaire & Expert-Comptable Référent (ITAA)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-400 mb-1">Cabinet / Fiduciaire</label>
                <input
                  type="text"
                  value={formData.fiduciaryName}
                  onChange={(e) => setFormData({ ...formData, fiduciaryName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">N° d'Agrément ITAA</label>
                <input
                  type="text"
                  value={formData.fiduciaryItaaNumber}
                  onChange={(e) => setFormData({ ...formData, fiduciaryItaaNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Email de l'Expert-Comptable</label>
                <input
                  type="email"
                  value={formData.fiduciaryEmail}
                  onChange={(e) => setFormData({ ...formData, fiduciaryEmail: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition flex items-center"
            >
              <Save className="w-4 h-4 mr-1.5 stroke-[2.5]" />
              Enregistrer les modifications
            </button>
          </div>

        </form>
      )}

      {/* TAB 2: PCMN CHART OF ACCOUNTS */}
      {activeTab === 'pcmn' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center">
                <BookOpen className="w-5 h-5 mr-2 text-amber-400" />
                Plan Comptable Minimum Normalisé Belge (PCMN)
              </h3>
              <p className="text-slate-400 mt-1">
                Comptes standardisés à 6 chiffres utilisés pour la catégorisation automatique des ventes, achats et déductions fiscales.
              </p>
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                value={pcmnSearch}
                onChange={(e) => setPcmnSearch(e.target.value)}
                placeholder="Filtrer un compte ou libellé..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-slate-300">
              <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4 w-28">N° Compte</th>
                  <th className="p-3">Intitulé officiel PCMN</th>
                  <th className="p-3 w-32">Catégorie</th>
                  <th className="p-3 w-24 text-center">Taux TVA</th>
                  <th className="p-3 pr-4 w-28 text-center">Déductibilité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPcmn.map((acc) => (
                  <tr key={acc.code} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 pl-4 font-mono font-bold text-amber-300">{acc.code}</td>
                    <td className="p-3 font-medium text-white">{acc.label}</td>
                    <td className="p-3 text-slate-400">{acc.category}</td>
                    <td className="p-3 text-center font-mono">{acc.vat}%</td>
                    <td className="p-3 pr-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                        acc.deduct === 100 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        acc.deduct === 75 ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                        acc.deduct === 50 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {acc.deduct !== undefined ? `${acc.deduct}%` : 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

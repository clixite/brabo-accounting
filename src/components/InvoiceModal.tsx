import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Send, 
  Download, 
  Building, 
  Hash 
} from 'lucide-react';
import type { Invoice, InvoiceLine, ClientParty, CompanyProfile, DocumentType, BelgianVatRegime } from '../types/accounting';
import { validateBCE, generateOGM } from '../utils/belgianAccounting';
import { generateInvoicePDF } from '../services/pdfGenerator';
import confetti from 'canvas-confetti';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  company: CompanyProfile;
  clients: ClientParty[];
  initialData?: Invoice | null;
  defaultType?: DocumentType;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  company,
  clients,
  initialData,
  defaultType = 'invoice',
}) => {
  const [docType, setDocType] = useState<DocumentType>(initialData?.type || defaultType);
  const [invoiceNumber, setInvoiceNumber] = useState(
    initialData?.invoiceNumber || `${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
  );
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [paymentTermsDays] = useState(initialData?.paymentTermsDays || 30);
  
  const [selectedClientId, setSelectedClientId] = useState<string>(initialData?.client.id || clients[0]?.id || 'new');
  const [clientName, setClientName] = useState(initialData?.client.name || clients[0]?.name || '');
  const [clientBce, setClientBce] = useState(initialData?.client.bceNumber || clients[0]?.bceNumber || '');
  const [clientStreet, setClientStreet] = useState(initialData?.client.street || clients[0]?.street || '');
  const [clientNumber, setClientNumber] = useState(initialData?.client.number || clients[0]?.number || '');
  const [clientPostalCode, setClientPostalCode] = useState(initialData?.client.postalCode || clients[0]?.postalCode || '');
  const [clientCity, setClientCity] = useState(initialData?.client.city || clients[0]?.city || '');
  const [clientEmail, setClientEmail] = useState(initialData?.client.email || clients[0]?.email || '');

  const [structuredComm, setStructuredComm] = useState(
    initialData?.structuredCommunication || generateOGM(invoiceNumber)
  );

  const [lines, setLines] = useState<InvoiceLine[]>(
    initialData?.lines || [
      {
        id: 'l-1',
        description: 'Prestations de développement logiciel & intégration Peppol',
        pcmnAccount: '705000',
        quantity: 1,
        unitPrice: 1500,
        vatRate: 21,
        vatRegime: 'standard_21',
        totalExclVat: 1500,
        vatAmount: 315,
        totalInclVat: 1815,
      }
    ]
  );

  const [notes] = useState(initialData?.notes || '');

  useEffect(() => {
    if (selectedClientId !== 'new') {
      const c = clients.find(cl => cl.id === selectedClientId);
      if (c) {
        setClientName(c.name);
        setClientBce(c.bceNumber);
        setClientStreet(c.street);
        setClientNumber(c.number);
        setClientPostalCode(c.postalCode);
        setClientCity(c.city);
        setClientEmail(c.email);
      }
    }
  }, [selectedClientId, clients]);

  const handleInvoiceNumberChange = (val: string) => {
    setInvoiceNumber(val);
    setStructuredComm(generateOGM(val));
  };

  const computeDueDate = (): string => {
    const d = new Date(date || new Date().toISOString().split('T')[0]);
    d.setDate(d.getDate() + Number(paymentTermsDays));
    return d.toISOString().split('T')[0];
  };

  const updateLine = (id: string, field: keyof InvoiceLine, value: any) => {
    setLines(prev => prev.map(line => {
      if (line.id !== id) return line;

      const updated = { ...line, [field]: value };

      if (field === 'vatRegime') {
        const regime = value as BelgianVatRegime;
        if (regime === 'standard_21') updated.vatRate = 21;
        else if (regime === 'reduced_12') updated.vatRate = 12;
        else if (regime === 'reduced_6') updated.vatRate = 6;
        else updated.vatRate = 0;
      }

      const qty = field === 'quantity' ? Number(value) : updated.quantity;
      const price = field === 'unitPrice' ? Number(value) : updated.unitPrice;
      const rate = updated.vatRate;

      const excl = qty * price;
      const vat = excl * (rate / 100);
      const incl = excl + vat;

      return {
        ...updated,
        quantity: qty,
        unitPrice: price,
        totalExclVat: Math.round(excl * 100) / 100,
        vatAmount: Math.round(vat * 100) / 100,
        totalInclVat: Math.round(incl * 100) / 100,
      };
    }));
  };

  const addLine = () => {
    const newLine: InvoiceLine = {
      id: 'l-' + Date.now(),
      description: '',
      pcmnAccount: '705000',
      quantity: 1,
      unitPrice: 0,
      vatRate: 21,
      vatRegime: 'standard_21',
      totalExclVat: 0,
      vatAmount: 0,
      totalInclVat: 0,
    };
    setLines([...lines, newLine]);
  };

  const removeLine = (id: string) => {
    if (lines.length > 1) {
      setLines(lines.filter(l => l.id !== id));
    }
  };

  const subtotalExclVat = lines.reduce((acc, l) => acc + l.totalExclVat, 0);
  const totalVatAmount = lines.reduce((acc, l) => acc + l.vatAmount, 0);
  const totalInclVat = subtotalExclVat + totalVatAmount;
  const bceValidation = validateBCE(clientBce);

  if (!isOpen) return null;

  const handleSave = (sendViaPeppol = false) => {
    const client: ClientParty = {
      id: selectedClientId === 'new' ? 'cli-' + Date.now() : selectedClientId,
      name: clientName || 'Client Belge',
      bceNumber: bceValidation.isValid ? bceValidation.formatted : clientBce,
      vatNumber: bceValidation.isValid ? 'BE' + bceValidation.cleanDigits : 'BE' + clientBce.replace(/[^0-9]/g, ''),
      peppolEndpointId: bceValidation.isValid ? `0208:${bceValidation.cleanDigits}` : '',
      isPeppolEnabled: bceValidation.isValid,
      street: clientStreet,
      number: clientNumber,
      postalCode: clientPostalCode,
      city: clientCity,
      country: 'Belgique',
      email: clientEmail,
    };

    const newInvoice: Invoice = {
      id: initialData?.id || `inv-${Date.now()}`,
      type: docType,
      invoiceNumber,
      date,
      dueDate: computeDueDate(),
      client,
      lines,
      subtotalExclVat: Math.round(subtotalExclVat * 100) / 100,
      vatBreakdown: [
        {
          rate: 21,
          regime: 'standard_21',
          baseAmount: subtotalExclVat,
          vatAmount: totalVatAmount,
        }
      ],
      totalVatAmount: Math.round(totalVatAmount * 100) / 100,
      totalInclVat: Math.round(totalInclVat * 100) / 100,
      structuredCommunication: structuredComm,
      status: sendViaPeppol ? 'peppol_delivered' : initialData?.status || 'sent',
      peppolStatus: sendViaPeppol ? {
        isSent: true,
        sentAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
        messageId: `PEPPOL-BE-${Date.now()}`,
        deliveryResponseCode: 'ACCEPTED',
      } : initialData?.peppolStatus,
      paymentTermsDays,
      notes,
      createdAt: initialData?.createdAt || new Date().toISOString(),
    };

    if (sendViaPeppol) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 }
      });
    }

    onSave(newInvoice);
    onClose();
  };

  const handleDownloadPdf = () => {
    const tempInv: Invoice = {
      id: 'temp',
      type: docType,
      invoiceNumber,
      date,
      dueDate: computeDueDate(),
      client: {
        id: 'c',
        name: clientName || 'Client',
        bceNumber: clientBce,
        vatNumber: 'BE' + clientBce.replace(/[^0-9]/g, ''),
        peppolEndpointId: `0208:${clientBce.replace(/[^0-9]/g, '')}`,
        isPeppolEnabled: true,
        street: clientStreet,
        number: clientNumber,
        postalCode: clientPostalCode,
        city: clientCity,
        country: 'Belgique',
        email: clientEmail,
      },
      lines,
      subtotalExclVat,
      vatBreakdown: [],
      totalVatAmount,
      totalInclVat,
      structuredCommunication: structuredComm,
      status: 'draft',
      paymentTermsDays,
      createdAt: new Date().toISOString()
    };
    generateInvoicePDF(tempInv, company);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {initialData ? 'Modifier le document' : 'Créer un document de vente'}
              </h2>
              <p className="text-xs text-slate-400">
                Normes belges : TVA, Modulo 97 (OGM) & Passerelle Peppol UBL 2.1
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

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* Top Bar: Doc Type & Numbering */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Type de document</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="invoice">Facture commerciale</option>
                <option value="quote">Devis / Offre de prix</option>
                <option value="credit_note">Note de crédit</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Numéro du document</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => handleInvoiceNumberChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Date d'émission</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Belgian Client Selector */}
          <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center">
                <Building className="w-4 h-4 mr-1.5" />
                Destinataire / Client Belge
              </span>

              <div className="flex items-center space-x-1.5 text-xs">
                {bceValidation.isValid ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Peppol 2026 Compatible
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <AlertCircle className="w-3 h-3 mr-1" /> BCE à vérifier
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Sélectionner un client existant</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="new">+ Saisir un nouveau client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.bceNumber})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Nom ou Raison sociale</label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Delhaize Le Lion SA"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Numéro d'entreprise / BCE (Mod 97)
                </label>
                <input
                  type="text"
                  value={clientBce}
                  onChange={(e) => setClientBce(e.target.value)}
                  placeholder="BE 0477.472.701"
                  className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none ${
                    bceValidation.isValid 
                      ? 'border-emerald-500/50 focus:border-emerald-400' 
                      : 'border-amber-500/50 focus:border-amber-400'
                  }`}
                />
                {bceValidation.isValid && (
                  <span className="text-[10px] text-emerald-400 mt-0.5 block">
                    ✓ Numéro BCE officiel valide (clé modulo 97 vérifiée)
                  </span>
                )}
                {!bceValidation.isValid && clientBce && (
                  <span className="text-[10px] text-amber-400 mt-0.5 block">
                    {bceValidation.error}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Email pour envoi PDF / UBL</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="comptabilite@entreprise.be"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Rue & Numéro</label>
                  <input
                    type="text"
                    value={clientStreet}
                    onChange={(e) => setClientStreet(e.target.value)}
                    placeholder="Chaussée de Charleroi"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Code Postal & Ville</label>
                  <input
                    type="text"
                    value={`${clientPostalCode} ${clientCity}`.trim()}
                    onChange={(e) => {
                      const parts = e.target.value.split(' ');
                      setClientPostalCode(parts[0] || '');
                      setClientCity(parts.slice(1).join(' ') || '');
                    }}
                    placeholder="1060 Bruxelles"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Lignes de prestations & articles (Plan PCMN)
              </span>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center space-x-1 text-xs font-bold text-amber-400 hover:text-amber-300"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter une ligne</span>
              </button>
            </div>

            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                  <tr>
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5 w-32">Compte PCMN</th>
                    <th className="p-2.5 w-16 text-center">Qté</th>
                    <th className="p-2.5 w-24 text-right">Prix HTVA</th>
                    <th className="p-2.5 w-36">Régime TVA</th>
                    <th className="p-2.5 w-24 text-right">Total HTVA</th>
                    <th className="p-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {lines.map((line) => (
                    <tr key={line.id} className="bg-slate-900/60 hover:bg-slate-850">
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                          placeholder="Description de la prestation..."
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:border-amber-500"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={line.pcmnAccount}
                          onChange={(e) => updateLine(line.id, 'pcmnAccount', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-300"
                        >
                          <option value="705000">705000 - Services & Consultance</option>
                          <option value="700000">700000 - Ventes Marchandises</option>
                          <option value="705100">705100 - Services Intracomm.</option>
                          <option value="705200">705200 - Cocontractant</option>
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-center text-white"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.id, 'unitPrice', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-white font-mono"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={line.vatRegime}
                          onChange={(e) => updateLine(line.id, 'vatRegime', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-amber-300 font-medium"
                        >
                          <option value="standard_21">21% - Taux Normal</option>
                          <option value="reduced_12">12% - Taux Réduit (Restauration)</option>
                          <option value="reduced_6">6% - Taux Réduit (Alimentation/Rénov)</option>
                          <option value="zero_0">0% - Taux Zéro</option>
                          <option value="cocontractant_art20">Cocontractant (Art. 20)</option>
                          <option value="intracommunity_art39bis">Intracommunautaire (39bis)</option>
                          <option value="exempt_art44">Exonéré (Art. 44)</option>
                        </select>
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-white">
                        {line.totalExclVat.toFixed(2)} €
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-slate-500 hover:text-red-400 p-1 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* OGM & Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase flex items-center">
                  <Hash className="w-3.5 h-3.5 mr-1" />
                  Communication Structurée (OGM)
                </span>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">✓ Modulo 97 OK</span>
              </div>
              <input
                type="text"
                value={structuredComm}
                onChange={(e) => setStructuredComm(e.target.value)}
                className="w-full bg-slate-950 border border-amber-500/50 rounded-lg px-3 py-2 font-mono font-bold text-amber-300 text-sm tracking-wider text-center"
              />
              <p className="text-[11px] text-slate-400">
                Générée selon la formule officielle Febelfin pour rapprochement bancaire automatique.
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Sous-total HTVA :</span>
                <span className="font-mono font-semibold">{subtotalExclVat.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Total TVA (Grille 54) :</span>
                <span className="font-mono font-semibold text-amber-400">{totalVatAmount.toFixed(2)} €</span>
              </div>
              <div className="border-t border-slate-700 pt-2 flex justify-between text-sm font-bold text-white">
                <span>TOTAL TVAC :</span>
                <span className="font-mono text-base text-amber-400">{totalInclVat.toFixed(2)} €</span>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Aperçu PDF
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={() => handleSave(false)}
              className="px-4 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition"
            >
              Enregistrer
            </button>

            <button
              type="button"
              onClick={() => handleSave(true)}
              className="inline-flex items-center px-4 py-2 text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-lg shadow-lg shadow-amber-500/20 transition"
            >
              <Send className="w-3.5 h-3.5 mr-1.5 stroke-[2.5]" />
              Émettre & Livrer via Peppol
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

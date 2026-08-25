import { useState } from 'react';
import { Download, FileCheck2, Landmark, Users } from 'lucide-react';
import type { Invoice as DbInvoice, PurchaseExpense as DbPurchaseExpense } from '../../server/types/db';
import type { CompanyProfile } from '../../types/accounting';
import {
  calculateVatGrids,
  generateAnnualClientListing,
  generateIntervatClientListingXML,
  generateIntervatVatDeclarationXml,
} from '../../utils/belgianAccounting';
import { dbExpenseToClient, dbInvoiceToClient } from '../../services/tenantWorkspace';

const eur = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

interface CabinetDeclarationPanelProps {
  company: CompanyProfile;
  invoices: DbInvoice[];
  expenses: DbPurchaseExpense[];
}

/**
 * Cabinet-side filing: the accountant computes and files the client's periodic
 * VAT return and annual client listing directly from the dossier.
 */
export function CabinetDeclarationPanel({ company, invoices, expenses }: CabinetDeclarationPanelProps) {
  const [period, setPeriod] = useState('2026-Q1');
  const [filed, setFiled] = useState<string | null>(null);

  const clientInvoices = invoices.map(dbInvoiceToClient);
  const clientExpenses = expenses.map(dbExpenseToClient);
  const grids = calculateVatGrids(clientInvoices, clientExpenses, period);
  const listing = generateAnnualClientListing(clientInvoices, 2026);

  const isDue = grids.grid71 > 0;
  const balance = isDue ? grids.grid71 : grids.grid72;

  const download = (fileName: string, xml: string) => {
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fileVat = () => {
    download(`INTERVAT_TVA_${company.vatNumber}_${period}.xml`, generateIntervatVatDeclarationXml(company, grids));
    setFiled(period);
  };

  const fileListing = () => {
    download(`INTERVAT_Listing_${company.vatNumber}_2026.xml`, generateIntervatClientListingXML(2026, listing, company));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Landmark className="h-4 w-4 text-amber-400" /> Déclarations & dépôts
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-300 font-semibold"
        >
          <option value="2026-Q1">T1 2026</option>
          <option value="2026-Q2">T2 2026</option>
          <option value="2026-Q3">T3 2026</option>
          <option value="2026-Q4">T4 2026</option>
        </select>
      </div>

      <div className={`rounded-lg border p-3 ${isDue ? 'border-amber-500/30 bg-amber-950/20' : 'border-emerald-500/30 bg-emerald-950/20'}`}>
        <div className="text-[10px] uppercase text-slate-500">
          {isDue ? 'TVA à verser (grille 71)' : 'Crédit TVA (grille 72)'} · {period}
        </div>
        <div className={`text-xl font-mono font-black ${isDue ? 'text-amber-300' : 'text-emerald-300'}`}>
          {eur.format(balance)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filed === period ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/40">
            <FileCheck2 className="h-4 w-4" /> TVA déposée ({period})
          </span>
        ) : (
          <button
            onClick={fileVat}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition"
          >
            <Download className="h-4 w-4" /> Déposer la déclaration TVA
          </button>
        )}

        <button
          onClick={fileListing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
        >
          <Users className="h-4 w-4 text-blue-400" /> Listing clients {listing.length > 0 ? `(${listing.length})` : ''}
        </button>
      </div>
    </div>
  );
}

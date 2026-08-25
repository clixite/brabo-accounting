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
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

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
        <div className="flex items-center gap-2 text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">
          <Landmark className="h-4 w-4 text-[var(--accent-solid)]" /> Déclarations & dépôts
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="bg-[var(--bg-sunken)] border border-[var(--border-default)] rounded-[var(--radius-md)] px-2 py-1 text-[length:var(--text-xs)] text-[var(--accent-solid)] font-semibold"
        >
          <option value="2026-Q1">T1 2026</option>
          <option value="2026-Q2">T2 2026</option>
          <option value="2026-Q3">T3 2026</option>
          <option value="2026-Q4">T4 2026</option>
        </select>
      </div>

      <div
        className={`rounded-[var(--radius-md)] border p-3 ${
          isDue
            ? 'border-[var(--state-warning-border)] bg-[var(--state-warning-bg)]'
            : 'border-[var(--state-positive-border)] bg-[var(--state-positive-bg)]'
        }`}
      >
        <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">
          {isDue ? 'TVA à verser (grille 71)' : 'Crédit TVA (grille 72)'} · {period}
        </div>
        <div
          className={`text-[length:var(--text-xl)] font-mono tnum font-black ${
            isDue ? 'text-[var(--accent-solid)]' : 'text-[var(--state-positive-text)]'
          }`}
        >
          {eur.format(balance)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filed === period ? (
          <Badge tone="positive" className="h-[var(--control-height)] px-3 gap-1.5 font-bold">
            <FileCheck2 className="h-4 w-4" /> TVA déposée ({period})
          </Badge>
        ) : (
          <Button variant="primary" onClick={fileVat} className="shadow-[var(--shadow)]">
            <Download className="h-4 w-4" /> Déposer la déclaration TVA
          </Button>
        )}

        <Button variant="secondary" onClick={fileListing}>
          <Users className="h-4 w-4 text-[var(--state-info-text)]" /> Listing clients {listing.length > 0 ? `(${listing.length})` : ''}
        </Button>
      </div>
    </div>
  );
}

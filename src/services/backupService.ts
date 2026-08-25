import type { CompanyProfile, Invoice, PurchaseExpense, BankTransaction } from '../types/accounting';

export interface BraboBackup {
  app: 'BRABO';
  version: 1;
  exportedAt: string;
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  transactions: BankTransaction[];
}

/** Serializes the whole tenant ledger into a downloadable JSON backup. */
export function exportBackup(
  company: CompanyProfile,
  invoices: Invoice[],
  purchases: PurchaseExpense[],
  transactions: BankTransaction[],
): void {
  const backup: BraboBackup = {
    app: 'BRABO',
    version: 1,
    exportedAt: new Date().toISOString(),
    company,
    invoices,
    purchases,
    transactions,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `BRABO_SAUVEGARDE_${company.bceNumber.replace(/[^0-9]/g, '')}_${date}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Validates + parses a BRABO backup file; throws on malformed payloads. */
export async function parseBackupFile(file: File): Promise<BraboBackup> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Fichier JSON invalide.');
  }

  const b = data as Partial<BraboBackup>;
  if (b?.app !== 'BRABO' || b?.version !== 1) {
    throw new Error('Ce fichier n\'est pas une sauvegarde BRABO reconnue.');
  }
  if (!b.company || !Array.isArray(b.invoices) || !Array.isArray(b.purchases) || !Array.isArray(b.transactions)) {
    throw new Error('Structure de sauvegarde incomplète.');
  }
  return b as BraboBackup;
}

/**
 * BRABO — Belgian Accounting Platform
 * CodaBox (Isabel Group) connector.
 *
 * Automates the daily retrieval of Belgian bank statements (CODA / CAMT.053)
 * and electronic supplier invoices (e-SL / Peppol) from participating banks:
 * BNP Paribas Fortis, Belfius, KBC/CBC, ING Belgium, Triodos and others.
 *
 * This module implements a production-shaped client with a deterministic local
 * simulator so the full pipeline (fetch → parse → dedupe → reconcile) can run
 * end-to-end without network access.
 */

import type { BankTransaction } from '../types/accounting';
import { parseCODAStatement } from '../utils/belgianAccounting';
import { generateSampleCodaFile, type SampleCodaOptions } from './codaGenerator';

export type CodaBoxBank =
  | 'BNP_PARIBAS_FORTIS'
  | 'BELFIUS'
  | 'KBC'
  | 'CBC'
  | 'ING_BELGIUM'
  | 'TRIODOS';

export interface CodaBoxAccount {
  bank: CodaBoxBank;
  accountName: string;
  iban: string;
  bic: string;
}

export interface CodaBoxConfig {
  clientId: string;
  clientSecret?: string;
  country: 'BE';
  environment: 'sandbox' | 'production';
}

export interface CodaStatementSummary {
  id: string;
  accountIban: string;
  bankName: string;
  statementNumber: string;
  statementDate: string;
  format: 'CODA' | 'CAMT.053';
}

export interface CodaDeliveryBatch {
  batchId: string;
  fetchedAt: string;
  statements: CodaStatementSummary[];
  transactions: BankTransaction[];
  /** Transactions already seen in a previous batch (deduped). */
  duplicates: number;
  source: 'coda' | 'camt053';
}

export interface CodaDeliveryResult {
  batch: CodaDeliveryBatch;
  account: CodaBoxAccount;
}

export interface CodaBoxConnectorState {
  config: CodaBoxConfig;
  accounts: CodaBoxAccount[];
  lastBatchId: string | null;
  totalStatementsFetched: number;
  totalTransactionsFetched: number;
}

export const CODA_BOX_BANKS: Record<CodaBoxBank, { label: string }> = {
  BNP_PARIBAS_FORTIS: { label: 'BNP Paribas Fortis' },
  BELFIUS: { label: 'Belfius Bank' },
  KBC: { label: 'KBC Brussels' },
  CBC: { label: 'CBC Banque & Assurance' },
  ING_BELGIUM: { label: 'ING Belgium' },
  TRIODOS: { label: 'Triodos Bank' },
};

/** Maps a CodaBox bank key to the `codaGenerator` sample bank key. */
const BANK_KEY_MAP: Record<CodaBoxBank, SampleCodaOptions['bankKey']> = {
  BNP_PARIBAS_FORTIS: 'BNP_PARIBAS_FORTIS',
  BELFIUS: 'BELFIUS',
  KBC: 'KBC',
  CBC: 'CBC',
  ING_BELGIUM: 'ING_BELGIUM',
  TRIODOS: 'TRIODOS',
};

function makeBatchId(): string {
  return `CBX-${new Date().toISOString().replace(/[-:TZ.]/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/**
 * Simulates a CodaBox "daily delivery" for a single account. In production this
 * would call the CodaBox REST API (Isabel Group) and return signed CODA files.
 */
export function fetchCodaBoxDelivery(account: CodaBoxAccount): CodaDeliveryResult {
  const sample = generateSampleCodaFile({
    bankKey: BANK_KEY_MAP[account.bank],
    iban: account.iban,
    accountHolderName: account.accountName,
  });

  const parsed = parseCODAStatement(sample.content);

  const statement: CodaStatementSummary = {
    id: `stmt-${account.bank.toLowerCase()}-${parsed.statementNumber}`,
    accountIban: account.iban,
    bankName: CODA_BOX_BANKS[account.bank].label,
    statementNumber: parsed.statementNumber,
    statementDate: parsed.statementDate,
    format: 'CODA',
  };

  const transactions: BankTransaction[] = parsed.transactions.map((tx, idx) => ({
    id: `tx-${account.bank.toLowerCase()}-${parsed.statementNumber}-${idx}`,
    statementNumber: parsed.statementNumber,
    date: tx.valutaDate,
    valutaDate: tx.valutaDate,
    amount: tx.amount,
    currency: 'EUR',
    counterpartyName: tx.counterpartyName || 'Contrepartie CODA',
    counterpartyIban: tx.counterpartyIban || '',
    counterpartyBic: tx.counterpartyBic,
    communication: tx.structuredCommunication ?? tx.freeCommunication,
    isStructured: Boolean(tx.structuredCommunication),
    structuredCommunication: tx.structuredCommunication,
    reconciled: false,
  }));

  const batch: CodaDeliveryBatch = {
    batchId: makeBatchId(),
    fetchedAt: new Date().toISOString(),
    statements: [statement],
    transactions,
    duplicates: 0,
    source: 'coda',
  };

  return { batch, account };
}

/**
 * Deduplicates a batch against previously seen transaction ids.
 */
export function dedupeTransactions(
  incoming: BankTransaction[],
  seenIds: Set<string>
): { fresh: BankTransaction[]; duplicates: number } {
  const fresh: BankTransaction[] = [];
  let duplicates = 0;
  for (const tx of incoming) {
    if (seenIds.has(tx.id)) {
      duplicates += 1;
    } else {
      seenIds.add(tx.id);
      fresh.push(tx);
    }
  }
  return { fresh, duplicates };
}

/**
 * High-level connector orchestrating the daily bank feed.
 */
export class CodaBoxConnector {
  private readonly state: CodaBoxConnectorState;
  private readonly seenTxIds = new Set<string>();

  constructor(config: CodaBoxConfig, accounts: CodaBoxAccount[]) {
    this.state = {
      config,
      accounts,
      lastBatchId: null,
      totalStatementsFetched: 0,
      totalTransactionsFetched: 0,
    };
  }

  async syncAllAccounts(): Promise<CodaDeliveryResult[]> {
    const results: CodaDeliveryResult[] = [];
    for (const account of this.state.accounts) {
      const delivery = fetchCodaBoxDelivery(account);
      const { fresh, duplicates } = dedupeTransactions(delivery.batch.transactions, this.seenTxIds);

      delivery.batch.transactions = fresh;
      delivery.batch.duplicates = duplicates;

      this.state.lastBatchId = delivery.batch.batchId;
      this.state.totalStatementsFetched += delivery.batch.statements.length;
      this.state.totalTransactionsFetched += fresh.length;

      results.push(delivery);
    }
    return results;
  }

  getSnapshot(): CodaBoxConnectorState {
    return { ...this.state };
  }
}

/** Shared demo connector instance for the Belgian banking simulator. */
export const codaBoxConnector = new CodaBoxConnector(
  {
    clientId: 'brabo-sandbox',
    country: 'BE',
    environment: 'sandbox',
  },
  [
    { bank: 'BNP_PARIBAS_FORTIS', accountName: 'Compte professionnel', iban: 'BE68 0012 3456 7890', bic: 'GEBABEBB' },
    { bank: 'KBC', accountName: 'Compte de réserve', iban: 'BE73 7360 1122 3344', bic: 'KREDBEBB' },
  ]
);

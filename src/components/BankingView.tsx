import React, { useState } from 'react';
import {
  Landmark,
  Upload,
  CheckCircle2,
  Zap,
  FileCode,
  Sparkles,
  RefreshCw,
  Wand2,
  Search,
  Link2,
  ArrowRight,
} from 'lucide-react';
import { SplitView } from './ui/SplitView';
import { Segmented } from './ui/Segmented';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Badge, CodeChip, StatusDot } from './ui/Badge';
import { Button } from './ui/Button';
import { DataTable, Td, Th, Tr } from './ui/DataTable';
import { Input } from './ui/Input';
import { Money } from './ui/Money';
import { formatDate } from '../utils/format';
import type { BankTransaction, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { SAMPLE_CODA_FILE_CONTENT } from '../data/mockBelgianData';
import { parseCODAStatement } from '../utils/belgianAccounting';
import { codaBoxConnector } from '../services/codaBoxConnector';
import { autoEncodeTransactions } from '../services/autoBooker';

interface BankingViewProps {
  transactions: BankTransaction[];
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  lang: Language;
  onReconcileTransaction: (txId: string, invoiceId?: string, expenseId?: string) => void;
  onImportCodaTransactions: (newTxs: BankTransaction[]) => void;
  onAutoEncodeExpenses: (drafts: PurchaseExpense[]) => void;
}

export const BankingView: React.FC<BankingViewProps> = ({
  transactions,
  invoices,
  purchases,
  lang,
  onReconcileTransaction,
  onImportCodaTransactions,
  onAutoEncodeExpenses,
}) => {
  const t = translations[lang].banking;
  const [queue, setQueue] = useState<'unreconciled' | 'reconciled' | 'all'>('unreconciled');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCodaBoxSyncing, setIsCodaBoxSyncing] = useState(false);
  const [autoEncodeResult, setAutoEncodeResult] = useState<string | null>(null);

  const unreconciledCount = transactions.filter((t) => !t.reconciled).length;
  const reconciledCount = transactions.filter((t) => t.reconciled).length;

  const filteredTransactions = transactions.filter((tx) => {
    const matchesQueue =
      queue === 'all' ? true : queue === 'reconciled' ? tx.reconciled : !tx.reconciled;

    const term = searchTerm.trim().toLowerCase();
    const matchesSearch =
      term.length === 0
        ? true
        : tx.counterpartyName.toLowerCase().includes(term) ||
          tx.counterpartyIban.toLowerCase().includes(term) ||
          (tx.structuredCommunication || '').toLowerCase().includes(term) ||
          (tx.communication || '').toLowerCase().includes(term) ||
          tx.statementNumber.toLowerCase().includes(term);

    return matchesQueue && matchesSearch;
  });

  const selectedTx =
    (selectedId ? transactions.find((t) => t.id === selectedId) : null) ||
    (filteredTransactions.length > 0 ? filteredTransactions[0] : null);

  const handleAutoReconcileAll = () => {
    transactions.forEach(tx => {
      if (!tx.reconciled) {
        if (tx.structuredCommunication) {
          const matchedInv = invoices.find(i => i.structuredCommunication === tx.structuredCommunication);
          if (matchedInv) {
            onReconcileTransaction(tx.id, matchedInv.id, undefined);
            return;
          }
          const matchedExp = purchases.find(p => p.structuredCommunication === tx.structuredCommunication);
          if (matchedExp) {
            onReconcileTransaction(tx.id, undefined, matchedExp.id);
            return;
          }
        }
        if (tx.matchedInvoiceId) {
          onReconcileTransaction(tx.id, tx.matchedInvoiceId, undefined);
        }
      }
    });

    // No confetti: reconciliation is an audit step, keep the UI calm.

  };

  const handleAutoEncode = () => {
    const drafts = autoEncodeTransactions(transactions);
    if (drafts.length > 0) {
      onAutoEncodeExpenses(drafts);
    }
    setAutoEncodeResult(
      drafts.length > 0
        ? `${drafts.length} dépense(s) encodée(s) automatiquement — à valider dans l'onglet Dépenses.`
        : 'Aucun mouvement débit non réconcilié à encoder.',
    );
  };

  const processCodaContent = (rawText: string) => {
    const parsed = parseCODAStatement(rawText);
    const newItems: BankTransaction[] = parsed.transactions.map((t, idx) => ({
      id: `coda-tx-${Date.now()}-${idx}`,
      statementNumber: parsed.statementNumber,
      date: t.valutaDate,
      valutaDate: t.valutaDate,
      amount: t.amount,
      currency: 'EUR',
      counterpartyName: t.counterpartyName || 'Contrepartie CODA',
      counterpartyIban: t.counterpartyIban || 'BE68 0000 0000 0000',
      communication: t.structuredCommunication || t.freeCommunication,
      isStructured: !!t.structuredCommunication,
      structuredCommunication: t.structuredCommunication,
      reconciled: false,
    }));

    onImportCodaTransactions(newItems);
    // No confetti.
  };

  const handleSimulateCodaImport = () => {
    processCodaContent(SAMPLE_CODA_FILE_CONTENT);
  };

  const handleCodaBoxSync = async () => {
    setIsCodaBoxSyncing(true);
    try {
      const deliveries = await codaBoxConnector.syncAllAccounts();
      const allTransactions = deliveries.flatMap((d) => d.batch.transactions);
      if (allTransactions.length > 0) {
        onImportCodaTransactions(allTransactions);
      }
      // No confetti.
    } finally {
      setIsCodaBoxSyncing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        processCodaContent(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        processCodaContent(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <Badge tone="neutral">Febelfin CODA / CAMT.053</Badge>
            <span>Rapprochement bancaire</span>
          </div>
          <h1 className="mt-1 text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Landmark className="w-5 h-5 text-[var(--text-tertiary)]" />
            {t.title}
          </h1>
          <p className="mt-1 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">{t.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="relative overflow-hidden">
            <Upload className="w-4 h-4" />
            Charger
            <input
              type="file"
              accept=".cod,.txt,.xml"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
              title="Charger un fichier CODA (.cod) ou CAMT.053 (.xml)"
            />
          </Button>
          <Button variant="secondary" onClick={handleSimulateCodaImport}>
            <Sparkles className="w-4 h-4" />
            Démo
          </Button>
          <Button variant="secondary" onClick={handleCodaBoxSync} disabled={isCodaBoxSyncing}>
            <RefreshCw className={`w-4 h-4 ${isCodaBoxSyncing ? 'animate-spin' : ''}`} />
            {isCodaBoxSyncing ? 'Sync…' : 'Sync CodaBox'}
          </Button>
          <Button variant="secondary" onClick={handleAutoEncode} title="Proposer l'encodage des dépenses à partir des débits">
            <Wand2 className="w-4 h-4" />
            Auto-encoder
          </Button>
          <Button variant="primary" onClick={handleAutoReconcileAll} title="Rapprocher automatiquement (OGM exact)">
            <Zap className="w-4 h-4" />
            {t.matchAllBtn}
          </Button>
        </div>
      </div>

      {autoEncodeResult && (
        <div className="rounded-xl bg-sky-950/30 border border-sky-500/30 px-4 py-2.5 text-xs text-sky-200">
          {autoEncodeResult}
        </div>
      )}

      <SplitView
        left={
          <div className="space-y-3">
            {autoEncodeResult && (
              <div className="rounded-[var(--radius-lg)] bg-[var(--state-info-bg)] border border-[var(--state-info-border)] px-3 py-2 text-[length:var(--text-xs)] text-[var(--state-info-text)]">
                {autoEncodeResult}
              </div>
            )}

            <Card>
              <CardBody className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Recherche (OGM, IBAN, contrepartie, extrait…)"
                    className="pl-8"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Segmented
                    value={queue}
                    onChange={setQueue}
                    items={[
                      { value: 'unreconciled', label: 'À rapprocher', count: unreconciledCount },
                      { value: 'reconciled', label: 'Réconciliés', count: reconciledCount },
                      { value: 'all', label: 'Tous', count: transactions.length },
                    ]}
                  />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={
                    'border border-dashed rounded-[var(--radius-lg)] px-3 py-3 text-[length:var(--text-xs)] ' +
                    (isDragOver
                      ? 'border-[var(--border-focus)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border-default)] bg-[var(--bg-subtle)]')
                  }
                >
                  <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <FileCode className="w-4 h-4 text-[var(--text-tertiary)]" />
                    <span>
                      Dépose ici un fichier <strong>CODA (.cod)</strong> ou <strong>CAMT.053 (.xml)</strong>
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>

            <Card flush>
              <CardHeader title="Transactions" description={`${filteredTransactions.length} élément(s)`} />
              <DataTable stickyHeader>
                <thead>
                  <tr>
                    <Th>{t.thStatement}</Th>
                    <Th>{t.thCounterparty}</Th>
                    <Th>{t.thCommunication}</Th>
                    <Th align="right">{t.thAmount}</Th>
                    <Th>{t.thMatch}</Th>
                    <Th align="right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => {
                    const active = selectedTx?.id === tx.id;
                    const matchTone = tx.reconciled ? 'positive' : tx.matchedInvoiceId || tx.matchedExpenseId ? 'warning' : 'neutral';

                    return (
                      <Tr
                        key={tx.id}
                        interactive
                        onClick={() => setSelectedId(tx.id)}
                        className={active ? 'bg-[var(--accent-soft)]' : undefined}
                      >
                        <Td>
                          <div className="space-y-0.5">
                            <div className="font-mono tnum text-[var(--text-primary)]">#{tx.statementNumber}</div>
                            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">{formatDate(tx.valutaDate)}</div>
                          </div>
                        </Td>
                        <Td>
                          <div className="min-w-0">
                            <div className="font-medium text-[var(--text-primary)] truncate">{tx.counterpartyName}</div>
                            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum truncate">{tx.counterpartyIban}</div>
                          </div>
                        </Td>
                        <Td>
                          {tx.structuredCommunication ? (
                            <CodeChip>{tx.structuredCommunication}</CodeChip>
                          ) : (
                            <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">{tx.communication}</span>
                          )}
                        </Td>
                        <Td align="right">
                          <Money value={tx.amount} mode="signed" tone={tx.amount > 0 ? 'positive' : 'default'} />
                        </Td>
                        <Td>
                          {tx.matchedInvoiceId ? (
                            <StatusDot tone={matchTone as any}>Facture</StatusDot>
                          ) : tx.matchedExpenseId ? (
                            <StatusDot tone={matchTone as any}>Dépense</StatusDot>
                          ) : (
                            <StatusDot tone="neutral">—</StatusDot>
                          )}
                        </Td>
                        <Td align="right">
                          {tx.reconciled ? (
                            <StatusDot tone="positive">Rapproché</StatusDot>
                          ) : (
                            <Button
                              variant="secondary"
                              className="h-[var(--control-height-sm)] px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReconcileTransaction(tx.id, tx.matchedInvoiceId, tx.matchedExpenseId);
                              }}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                              Valider
                            </Button>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </Card>
          </div>
        }
        right={
          <Card>
            <CardHeader
              title={selectedTx ? `${selectedTx.amount > 0 ? 'Crédit' : 'Débit'} ${selectedTx.currency}` : 'Sélection'}
              description={selectedTx ? selectedTx.counterpartyName : 'Sélectionne une transaction'}
              actions={
                selectedTx ? (
                  <div className="flex items-center gap-1">
                    {!selectedTx.reconciled && (
                      <Button
                        variant="primary"
                        className="h-[var(--control-height-sm)] px-2"
                        onClick={() =>
                          onReconcileTransaction(selectedTx.id, selectedTx.matchedInvoiceId, selectedTx.matchedExpenseId)
                        }
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Rapprocher
                      </Button>
                    )}
                  </div>
                ) : null
              }
            />
            <CardBody className="space-y-3">
              {!selectedTx ? (
                <div className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">Aucune transaction.</div>
              ) : (
                <>
                  <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <div className="flex items-baseline justify-between">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Montant</div>
                      <Money value={selectedTx.amount} mode="signed" tone={selectedTx.amount > 0 ? 'positive' : 'default'} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[length:var(--text-xs)]">
                      <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                        <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Extrait</div>
                        <div className="mt-0.5 font-mono tnum">#{selectedTx.statementNumber}</div>
                      </div>
                      <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                        <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Valuta</div>
                        <div className="mt-0.5">{formatDate(selectedTx.valutaDate)}</div>
                      </div>
                      <div className="col-span-2 p-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                        <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Communication</div>
                        <div className="mt-0.5">
                          {selectedTx.structuredCommunication ? (
                            <CodeChip>{selectedTx.structuredCommunication}</CodeChip>
                          ) : (
                            <span className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">{selectedTx.communication}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      {selectedTx.reconciled ? (
                        <StatusDot tone="positive">Rapproché</StatusDot>
                      ) : selectedTx.matchedInvoiceId || selectedTx.matchedExpenseId ? (
                        <StatusDot tone="warning">Match proposé</StatusDot>
                      ) : (
                        <StatusDot tone="neutral">Aucun match</StatusDot>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                    <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Proposition</div>
                    <div className="mt-1 text-[length:var(--text-xs)] text-[var(--text-secondary)]">
                      {selectedTx.matchedInvoiceId
                        ? `Facture liée : ${selectedTx.matchedInvoiceId}`
                        : selectedTx.matchedExpenseId
                          ? `Dépense liée : ${selectedTx.matchedExpenseId}`
                          : 'Aucune. (À implémenter : suggestions par montant + nom)'}
                    </div>
                    {!selectedTx.reconciled && (
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          variant="secondary"
                          className="h-[var(--control-height-sm)] px-2"
                          onClick={() => onReconcileTransaction(selectedTx.id, selectedTx.matchedInvoiceId, selectedTx.matchedExpenseId)}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          Valider
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                    Next : on ajoute un vrai matching guidé (suggestions factures/dépenses) et un mode manuel.
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        }
      />

    </div>
  );
};

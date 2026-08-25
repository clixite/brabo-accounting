import { useState, useEffect, lazy, Suspense } from 'react';
import type { CompanyProfile, Invoice, PurchaseExpense, BankTransaction, DocumentType, InvoiceStatus } from './types/accounting';
import { 
  INITIAL_COMPANY_PROFILE, 
  INITIAL_INVOICES, 
  INITIAL_PURCHASES, 
  INITIAL_BANK_TRANSACTIONS,
  MOCK_CLIENTS
} from './data/mockBelgianData';
import type { NavTab } from './components/Navigation';
import { AppShell } from './components/shell/AppShell';
import { validateInvoiceSchematron } from './services/schematronValidator';
import type { ValidationReport } from './services/schematronValidator';
import { SessionBar } from './components/portal/SessionBar';
import { CommandPalette } from './components/CommandPalette';
import { useSession } from './state/SessionContext';
import { loadTenantLedger, replaceTenantLedger } from './services/tenantWorkspace';
import { transmitInvoice } from './services/peppolService';

// Code-split the heavy views/modals so the initial bundle stays lean.
const DashboardView = lazy(() => import('./components/DashboardView').then((m) => ({ default: m.DashboardView })));
const InvoicingView = lazy(() => import('./components/InvoicingView').then((m) => ({ default: m.InvoicingView })));
const ExpensesView = lazy(() => import('./components/ExpensesView').then((m) => ({ default: m.ExpensesView })));
const PeppolHubView = lazy(() => import('./components/PeppolHubView').then((m) => ({ default: m.PeppolHubView })));
const TaxCenterView = lazy(() => import('./components/TaxCenterView').then((m) => ({ default: m.TaxCenterView })));
const BankingView = lazy(() => import('./components/BankingView').then((m) => ({ default: m.BankingView })));
const ReportsView = lazy(() => import('./components/ReportsView').then((m) => ({ default: m.ReportsView })));
const AuditTrailView = lazy(() => import('./components/AuditTrailView').then((m) => ({ default: m.AuditTrailView })));
const DocumentsView = lazy(() => import('./components/DocumentsView').then((m) => ({ default: m.DocumentsView })));
const PayrollView = lazy(() => import('./components/PayrollView').then((m) => ({ default: m.PayrollView })));
const FiduciaryView = lazy(() => import('./components/FiduciaryView').then((m) => ({ default: m.FiduciaryView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));
const InvoiceModal = lazy(() => import('./components/InvoiceModal').then((m) => ({ default: m.InvoiceModal })));
const ExpenseModal = lazy(() => import('./components/ExpenseModal').then((m) => ({ default: m.ExpenseModal })));
const OgmToolModal = lazy(() => import('./components/OgmToolModal').then((m) => ({ default: m.OgmToolModal })));
const PeppolViewerModal = lazy(() => import('./components/PeppolViewerModal').then((m) => ({ default: m.PeppolViewerModal })));
const LatePaymentModal = lazy(() => import('./components/LatePaymentModal').then((m) => ({ default: m.LatePaymentModal })));
const PayconiqModal = lazy(() => import('./components/PayconiqModal').then((m) => ({ default: m.PayconiqModal })));
const ViesLookupModal = lazy(() => import('./components/ViesLookupModal').then((m) => ({ default: m.ViesLookupModal })));
const SchematronReportModal = lazy(() => import('./components/SchematronReportModal').then((m) => ({ default: m.SchematronReportModal })));

export function ClientWorkspace() {
  const { canSelfDeclare, activeTenant, user, activeRole, lang } = useSession();

  // 1. Active navigation tab
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');

  // 3. Persistent Data states
  const [company, setCompany] = useState<CompanyProfile>(() => {
    const saved = localStorage.getItem('brabo_company');
    return saved ? JSON.parse(saved) : INITIAL_COMPANY_PROFILE;
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem('brabo_invoices');
    return saved ? JSON.parse(saved) : INITIAL_INVOICES;
  });

  const [purchases, setPurchases] = useState<PurchaseExpense[]>(() => {
    const saved = localStorage.getItem('brabo_purchases');
    return saved ? JSON.parse(saved) : INITIAL_PURCHASES;
  });

  const [transactions, setTransactions] = useState<BankTransaction[]>(() => {
    const saved = localStorage.getItem('brabo_transactions');
    return saved ? JSON.parse(saved) : INITIAL_BANK_TRANSACTIONS;
  });

  // True once the workspace has been hydrated from the per-tenant store (or
  // fallen back to its local seed), so the write-through only runs afterwards.
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('brabo_lang', lang);
  }, [lang]);

  // Language switching moved to the cabinet/client session layer (not in workspace UI yet).

  useEffect(() => {
    localStorage.setItem('brabo_company', JSON.stringify(company));
  }, [company]);

  useEffect(() => {
    localStorage.setItem('brabo_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('brabo_purchases', JSON.stringify(purchases));
  }, [purchases]);

  useEffect(() => {
    localStorage.setItem('brabo_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // Hydrate from the per-tenant store (cabinet → client direction). Once the
  // store has a ledger for this tenant, it wins over the local seed.
  useEffect(() => {
    if (!activeTenant || !user || hydrated) return;
    let cancelled = false;
    loadTenantLedger(activeTenant.id, user.id)
      .then((ledger) => {
        if (cancelled) return;
        if (ledger) {
          setInvoices(ledger.invoices);
          setPurchases(ledger.purchases);
          setTransactions(ledger.transactions);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTenant, user, hydrated]);

  // Write-through to the per-tenant store so the cabinet portal reflects
  // exactly what the client encodes (source unique, bien séparé).
  // Only the company's OWNER/MANAGER writes through; an accountant inspecting
  // the workspace reads from the store but does not overwrite it.
  useEffect(() => {
    if (!activeTenant || !user || !hydrated) return;
    if (activeRole !== 'OWNER' && activeRole !== 'MANAGER') return;
    const timer = setTimeout(async () => {
      setSyncState('syncing');
      try {
        await replaceTenantLedger(activeTenant.id, user.id, { company, invoices, purchases, transactions });
        setSyncState('synced');
      } catch {
        setSyncState('error');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [activeTenant, user, activeRole, hydrated, company, invoices, purchases, transactions]);

  // 4. Modal States
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [defaultInvoiceType, setDefaultInvoiceType] = useState<DocumentType>('invoice');

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isOgmModalOpen, setIsOgmModalOpen] = useState(false);
  const [peppolViewerInvoice, setPeppolViewerInvoice] = useState<Invoice | null>(null);
  const [latePaymentInvoice, setLatePaymentInvoice] = useState<Invoice | null>(null);
  const [payconiqInvoice, setPayconiqInvoice] = useState<Invoice | null>(null);
  const [isViesModalOpen, setIsViesModalOpen] = useState(false);
  const [schematronReport, setSchematronReport] = useState<ValidationReport | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Cmd/Ctrl+K shortcut → command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Handlers for Invoices
  const handleOpenNewInvoice = () => {
    setEditingInvoice(null);
    setDefaultInvoiceType('invoice');
    setIsInvoiceModalOpen(true);
  };

  const handleOpenNewQuote = () => {
    setEditingInvoice(null);
    setDefaultInvoiceType('quote');
    setIsInvoiceModalOpen(true);
  };

  const handleOpenNewCreditNote = () => {
    setEditingInvoice(null);
    setDefaultInvoiceType('credit_note');
    setIsInvoiceModalOpen(true);
  };

  const handleEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setDefaultInvoiceType(inv.type);
    setIsInvoiceModalOpen(true);
  };

  const handleSaveInvoice = (savedInv: Invoice) => {
    setInvoices(prev => {
      const exists = prev.some(i => i.id === savedInv.id);
      if (exists) {
        return prev.map(i => i.id === savedInv.id ? savedInv : i);
      }
      return [savedInv, ...prev];
    });
  };

  const handleDeleteInvoice = (id: string) => {
    setInvoices(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateInvoiceStatus = (id: string, status: InvoiceStatus) => {
    setInvoices(prev => prev.map(inv => {
      if (inv.id !== id) return inv;
      const updated: Invoice = { ...inv, status };
      if (status === 'peppol_delivered') {
        const transmission = transmitInvoice(inv, company);
        updated.peppolStatus = {
          isSent: transmission.status !== 'REJECTED',
          sentAt: transmission.sentAt,
          messageId: transmission.messageId,
          deliveryResponseCode: transmission.status,
          ublXml: transmission.ublXml,
        };
      }
      if (status === 'paid') {
        updated.paidAt = new Date().toISOString();
      }
      return updated;
    }));
  };

  // Handlers for Purchases
  const handleSavePurchase = (savedExp: PurchaseExpense) => {
    setPurchases(prev => [savedExp, ...prev]);
  };

  const handleDeletePurchase = (id: string) => {
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  // Handlers for Banking & CODA
  const handleReconcileTransaction = (txId: string, invoiceId?: string, expenseId?: string) => {
    setTransactions(prev => prev.map(tx => {
      if (tx.id !== txId) return tx;
      return {
        ...tx,
        reconciled: true,
        matchedInvoiceId: invoiceId || tx.matchedInvoiceId,
        matchedExpenseId: expenseId || tx.matchedExpenseId,
      };
    }));

    if (invoiceId) {
      handleUpdateInvoiceStatus(invoiceId, 'paid');
    }
  };

  const handleImportCodaTransactions = (newTxs: BankTransaction[]) => {
    setTransactions(prev => [...newTxs, ...prev]);
  };

  // Handlers for new production engines
  const handleValidateSchematron = (inv: Invoice) => {
    const report = validateInvoiceSchematron(inv, { company });
    setSchematronReport(report);
  };

  const handleOpenPayconiq = (inv: Invoice) => {
    setPayconiqInvoice(inv);
  };

  const handleOpenVies = () => {
    setIsViesModalOpen(true);
  };

  // Count badges for Navigation
  const overdueCount = invoices.filter(i => i.status === 'overdue' && i.type === 'invoice').length;
  const pendingExpensesCount = purchases.filter(p => p.status === 'pending').length;
  const unreconciledBankCount = transactions.filter(t => !t.reconciled).length;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500 text-sm">
          Chargement de l'espace client…
        </div>
      }
    >
    <div>
      {/* Session & role strip (client ↔ cabinet separation) */}
      <SessionBar syncState={syncState} />

      <AppShell
        company={company}
        lang={lang}
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        overdueCount={overdueCount}
        pendingExpensesCount={pendingExpensesCount}
        unreconciledBankCount={unreconciledBankCount}
      >
        {currentTab === 'dashboard' && (
          <DashboardView
            company={company}
            invoices={invoices}
            purchases={purchases}
            transactions={transactions}
            lang={lang}
            onNewInvoice={handleOpenNewInvoice}
            onScanExpense={() => setIsExpenseModalOpen(true)}
            onOpenOgmTool={() => setIsOgmModalOpen(true)}
            onNavigateTab={(tab) => setCurrentTab(tab)}
            onViewInvoice={(inv) => handleEditInvoice(inv)}
          />
        )}

        {currentTab === 'reports' && (
          <ReportsView
            company={company}
            invoices={invoices}
            purchases={purchases}
            transactions={transactions}
            lang={lang}
          />
        )}

        {currentTab === 'audit' && <AuditTrailView lang={lang} />}

        {currentTab === 'documents' && <DocumentsView lang={lang} />}

        {currentTab === 'payroll' && <PayrollView lang={lang} />}

        {currentTab === 'invoicing' && (
          <InvoicingView
            invoices={invoices}
            company={company}
            lang={lang}
            onNewInvoice={handleOpenNewInvoice}
            onNewQuote={handleOpenNewQuote}
            onNewCreditNote={handleOpenNewCreditNote}
            onEditInvoice={handleEditInvoice}
            onViewPeppolXml={(inv) => setPeppolViewerInvoice(inv)}
            onDeleteInvoice={handleDeleteInvoice}
            onUpdateStatus={handleUpdateInvoiceStatus}
            onOpenLatePaymentModal={(inv) => setLatePaymentInvoice(inv)}
            onOpenPayconiq={handleOpenPayconiq}
            onValidateSchematron={handleValidateSchematron}
          />
        )}

        {currentTab === 'expenses' && (
          <ExpensesView
            purchases={purchases}
            lang={lang}
            onScanExpense={() => setIsExpenseModalOpen(true)}
            onDeleteExpense={handleDeletePurchase}
          />
        )}

        {currentTab === 'peppol' && (
          <PeppolHubView
            company={company}
            invoices={invoices}
            purchases={purchases}
            lang={lang}
            onViewInvoiceXml={(inv) => setPeppolViewerInvoice(inv)}
            onOpenVies={handleOpenVies}
            onValidateSchematron={handleValidateSchematron}
            onSendPeppol={(inv) => handleUpdateInvoiceStatus(inv.id, 'peppol_delivered')}
          />
        )}

        {currentTab === 'taxCenter' && (
          <TaxCenterView
            company={company}
            invoices={invoices}
            purchases={purchases}
            lang={lang}
            canSelfDeclare={canSelfDeclare}
          />
        )}

        {currentTab === 'banking' && (
          <BankingView
            transactions={transactions}
            invoices={invoices}
            purchases={purchases}
            lang={lang}
            onReconcileTransaction={handleReconcileTransaction}
            onImportCodaTransactions={handleImportCodaTransactions}
            onAutoEncodeExpenses={(drafts) => setPurchases(prev => [...drafts, ...prev])}
          />
        )}

        {currentTab === 'fiduciary' && (
          <FiduciaryView
            company={company}
            invoices={invoices}
            purchases={purchases}
            lang={lang}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsView
            company={company}
            lang={lang}
            onUpdateCompany={setCompany}
          />
        )}

      </AppShell>

      {/* Modals */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onSave={handleSaveInvoice}
        company={company}
        clients={MOCK_CLIENTS}
        initialData={editingInvoice}
        defaultType={defaultInvoiceType}
      />

      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSave={handleSavePurchase}
      />

      <OgmToolModal
        isOpen={isOgmModalOpen}
        onClose={() => setIsOgmModalOpen(false)}
      />

      {peppolViewerInvoice && (
        <PeppolViewerModal
          isOpen={!!peppolViewerInvoice}
          onClose={() => setPeppolViewerInvoice(null)}
          invoice={peppolViewerInvoice}
          company={company}
        />
      )}

      {latePaymentInvoice && (
        <LatePaymentModal
          isOpen={!!latePaymentInvoice}
          onClose={() => setLatePaymentInvoice(null)}
          invoice={latePaymentInvoice}
          company={company}
        />
      )}

      {payconiqInvoice && (
        <PayconiqModal
          isOpen={!!payconiqInvoice}
          onClose={() => setPayconiqInvoice(null)}
          invoice={payconiqInvoice}
          onPaymentSuccess={(id) => handleUpdateInvoiceStatus(id, 'paid')}
        />
      )}

      <ViesLookupModal
        isOpen={isViesModalOpen}
        onClose={() => setIsViesModalOpen(false)}
        requesterBce={company.bceNumber}
      />

      {schematronReport && (
        <SchematronReportModal
          isOpen={!!schematronReport}
          onClose={() => setSchematronReport(null)}
          report={schematronReport}
        />
      )}

      <CommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        invoices={invoices}
        clients={MOCK_CLIENTS}
        lang={lang}
        company={company}
        onNavigate={(tab) => setCurrentTab(tab)}
        onOpenInvoice={handleEditInvoice}
        onNewInvoice={handleOpenNewInvoice}
        onScanExpense={() => setIsExpenseModalOpen(true)}
        onOpenOgmTool={() => setIsOgmModalOpen(true)}
      />

    </div>
    </Suspense>
  );
}

export default ClientWorkspace;

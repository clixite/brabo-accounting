import { useState, useEffect } from 'react';
import type { CompanyProfile, Invoice, PurchaseExpense, BankTransaction, DocumentType, InvoiceStatus } from './types/accounting';
import { 
  INITIAL_COMPANY_PROFILE, 
  INITIAL_INVOICES, 
  INITIAL_PURCHASES, 
  INITIAL_BANK_TRANSACTIONS,
  MOCK_CLIENTS
} from './data/mockBelgianData';
import type { Language } from './i18n/translations';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import type { NavTab } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { InvoicingView } from './components/InvoicingView';
import { ExpensesView } from './components/ExpensesView';
import { PeppolHubView } from './components/PeppolHubView';
import { TaxCenterView } from './components/TaxCenterView';
import { BankingView } from './components/BankingView';
import { FiduciaryView } from './components/FiduciaryView';
import { SettingsView } from './components/SettingsView';
import { InvoiceModal } from './components/InvoiceModal';
import { ExpenseModal } from './components/ExpenseModal';
import { OgmToolModal } from './components/OgmToolModal';
import { PeppolViewerModal } from './components/PeppolViewerModal';
import { LatePaymentModal } from './components/LatePaymentModal';

export function App() {
  // 1. Language state
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('brabo_lang') as Language) || 'fr';
  });

  // 2. Active navigation tab
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

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('brabo_lang', lang);
  }, [lang]);

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

  // 4. Modal States
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [defaultInvoiceType, setDefaultInvoiceType] = useState<DocumentType>('invoice');

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isOgmModalOpen, setIsOgmModalOpen] = useState(false);
  const [peppolViewerInvoice, setPeppolViewerInvoice] = useState<Invoice | null>(null);
  const [latePaymentInvoice, setLatePaymentInvoice] = useState<Invoice | null>(null);

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
        updated.peppolStatus = {
          isSent: true,
          sentAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
          messageId: `PEPPOL-BE-${Date.now()}`,
          deliveryResponseCode: 'ACCEPTED',
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

  // Count badges for Navigation
  const overdueCount = invoices.filter(i => i.status === 'overdue' && i.type === 'invoice').length;
  const pendingExpensesCount = purchases.filter(p => p.status === 'pending').length;
  const unreconciledBankCount = transactions.filter(t => !t.reconciled).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      
      {/* Top Application Header */}
      <Header
        company={company}
        lang={lang}
        onLanguageChange={setLang}
        onNewInvoice={handleOpenNewInvoice}
        onScanExpense={() => setIsExpenseModalOpen(true)}
      />

      {/* Main Navigation Tabs */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        lang={lang}
        overdueCount={overdueCount}
        pendingExpensesCount={pendingExpensesCount}
        unreconciledBankCount={unreconciledBankCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
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
          />
        )}

        {currentTab === 'taxCenter' && (
          <TaxCenterView
            company={company}
            invoices={invoices}
            purchases={purchases}
            lang={lang}
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

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-300">BRABO Accounting & Peppol Hub</span>
            <span>•</span>
            <span>Conforme SPF Finances & Loi belge du 20/02/2024</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Échange direct Peppol UBL 2.1 (EAS 0208) • BCE Modulo 97 • Febelfin CODA
          </div>
        </div>
      </footer>

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

    </div>
  );
}

export default App;

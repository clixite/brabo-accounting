import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, Receipt, Hash, CornerDownLeft, LayoutDashboard, ArrowRight } from 'lucide-react';
import type { Invoice, ClientParty, CompanyProfile } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import type { NavTab } from './Navigation';
import { cn } from './ui/cn';
import { formatDate } from '../utils/format';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  invoices: Invoice[];
  clients: ClientParty[];
  lang: Language;
  company: CompanyProfile;
  onNavigate: (tab: NavTab) => void;
  onOpenInvoice: (invoice: Invoice) => void;
  onNewInvoice: () => void;
  onScanExpense: () => void;
  onOpenOgmTool: () => void;
}

type PaletteItem =
  | { kind: 'nav'; label: string; hint: string; tab: NavTab; icon: React.ReactNode }
  | { kind: 'action'; label: string; hint: string; run: () => void; icon: React.ReactNode }
  | { kind: 'invoice'; label: string; hint: string; invoice: Invoice; icon: React.ReactNode }
  | { kind: 'client'; label: string; hint: string; client: ClientParty; icon: React.ReactNode };

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  invoices,
  clients,
  lang,
  company,
  onNavigate,
  onOpenInvoice,
  onNewInvoice,
  onScanExpense,
  onOpenOgmTool,
}) => {
  const t = translations[lang];
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset + focus when opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);

    const navItems: PaletteItem[] = [
      { kind: 'nav', label: t.nav.dashboard, hint: 'Tableau de bord', tab: 'dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      { kind: 'nav', label: t.nav.invoicing, hint: 'Facturation & encaissement', tab: 'invoicing', icon: <FileText className="w-4 h-4" /> },
      { kind: 'nav', label: t.nav.expenses, hint: 'Achats & dépenses', tab: 'expenses', icon: <Receipt className="w-4 h-4" /> },
      { kind: 'nav', label: t.nav.peppol, hint: 'Hub e-invoicing B2B', tab: 'peppol', icon: <ArrowRight className="w-4 h-4" /> },
      { kind: 'nav', label: t.nav.taxCenter, hint: 'TVA & déclarations', tab: 'taxCenter', icon: <ArrowRight className="w-4 h-4" /> },
      { kind: 'nav', label: t.nav.banking, hint: 'Banque & CODA', tab: 'banking', icon: <ArrowRight className="w-4 h-4" /> },
    ];

    const actionItems: PaletteItem[] = [
      { kind: 'action', label: t.invoicing.createInvoice, hint: 'Nouvelle facture', run: onNewInvoice, icon: <FileText className="w-4 h-4" /> },
      { kind: 'action', label: t.expenses.scanButton, hint: 'Scanner une dépense', run: onScanExpense, icon: <Receipt className="w-4 h-4" /> },
      { kind: 'action', label: t.dashboard.generateOgm, hint: 'Générateur OGM', run: onOpenOgmTool, icon: <Hash className="w-4 h-4" /> },
    ];

    const invoiceItems: PaletteItem[] = invoices
      .filter((i) => match(i.invoiceNumber) || match(i.client.name) || match(i.structuredCommunication))
      .slice(0, 6)
      .map((inv) => ({
        kind: 'invoice' as const,
        label: `${inv.invoiceNumber} — ${inv.client.name}`,
        hint: `${formatDate(inv.date)} · ${inv.totalInclVat.toFixed(2)} €`,
        invoice: inv,
        icon: <FileText className="w-4 h-4" />,
      }));

    const clientItems: PaletteItem[] = clients
      .filter((c) => match(c.name) || match(c.bceNumber))
      .slice(0, 4)
      .map((c) => ({
        kind: 'client' as const,
        label: c.name,
        hint: c.bceNumber,
        client: c,
        icon: <ArrowRight className="w-4 h-4" />,
      }));

    return [...navItems, ...actionItems, ...invoiceItems, ...clientItems];
  }, [query, invoices, clients, t, onNewInvoice, onScanExpense, onOpenOgmTool]);

  useEffect(() => setActiveIndex(0), [items.length, query]);

  // Keyboard navigation.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) run(item);
    }
  };

  const run = (item: PaletteItem) => {
    if (item.kind === 'nav') onNavigate(item.tab);
    else if (item.kind === 'action') item.run();
    else if (item.kind === 'invoice') onOpenInvoice(item.invoice);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[var(--bg-overlay)]" onMouseDown={onClose} aria-hidden="true" />
      <div className="absolute inset-0 flex items-start justify-center p-4 pt-[12vh]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Palette de commandes"
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            'w-full max-w-xl',
            'bg-[var(--bg-surface)] border border-[var(--border-default)]',
            'rounded-[var(--radius-lg)] shadow-[var(--shadow-modal)] overflow-hidden',
          )}
        >
          {/* Input */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--border-subtle)]">
            <Search className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Rechercher : facture, client, BCE, OGM, action…"
              className="flex-1 bg-transparent outline-none text-[length:var(--text-sm)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
            <kbd className="shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] text-[length:var(--text-2xs)] font-mono text-[var(--text-tertiary)]">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5" role="listbox">
            {items.length === 0 && (
              <div className="px-3 py-8 text-center text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
                Aucun résultat pour « {query} ».
              </div>
            )}
            {items.map((item, idx) => {
              const active = idx === activeIndex;
              return (
                <button
                  key={idx}
                  role="option"
                  aria-selected={active}
                  onClick={() => run(item)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-left transition-colors',
                    active ? 'bg-[var(--bg-hover)]' : 'bg-transparent',
                  )}
                >
                  <span className={cn('shrink-0', active ? 'text-[var(--accent-solid)]' : 'text-[var(--text-tertiary)]')}>
                    {item.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[length:var(--text-xs)] font-medium text-[var(--text-primary)] truncate">
                      {item.label}
                    </span>
                    <span className="block text-[length:var(--text-2xs)] text-[var(--text-tertiary)] truncate">
                      {item.hint}
                    </span>
                  </span>
                  {item.kind === 'nav' && (
                    <CornerDownLeft className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border-subtle)] text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <span>{company.name}</span>
            <span className="flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" /> ouvrir · ↑↓ naviguer
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Landmark,
  Loader2,
  Receipt,
  ShieldCheck,
  ShieldOff,
  TrendingUp,
} from 'lucide-react';
import { dbStore } from '../../server/services/dbStore';
import { useSession } from '../../state/SessionContext';
import type { Invoice, PurchaseExpense } from '../../server/types/db';
import { SessionBar } from './SessionBar';
import { FiscalStrategyPanel } from './FiscalStrategyPanel';
import { FiscalRecommendationsPanel } from './FiscalRecommendationsPanel';
import { CabinetDeclarationPanel } from './CabinetDeclarationPanel';
import { tenantToCompanyProfile } from '../../services/tenantWorkspace';
import { consolidateStatements } from '../../services/reporting';
import type { ClientFinancialProfile } from '../../services/fiscalRecommender';

interface ClientKpi {
  tenantId: string;
  turnover: number;
  revenueExclVat: number;
  expensesExclVat: number;
  vatCollected: number;
  vatDeductible: number;
  overdueCount: number;
  overdueAmount: number;
  invoiceCount: number;
  expenseCount: number;
  selfDeclaration: boolean;
}

interface ClientDetail {
  invoices: Invoice[];
  expenses: PurchaseExpense[];
}

const eur = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

/** Builds the fiscal-recommendation input from a dossier's loaded data. */
function buildProfile(
  detail: ClientDetail | null,
  kpi: ClientKpi | undefined,
  vatRegime: string,
): ClientFinancialProfile {
  const invoices = detail?.invoices ?? [];
  const expenses = detail?.expenses ?? [];
  return {
    turnoverExclVat: invoices.reduce((a, i) => a + i.subtotalExclVat, 0),
    vatCollected: invoices.reduce((a, i) => a + i.totalVatAmount, 0),
    vatDeductible: expenses.reduce((a, e) => a + e.deductibleVat, 0),
    expensesExclVat: expenses.reduce((a, e) => a + e.amountExclVat, 0),
    overdueCount: invoices.filter((i) => i.status === 'overdue').length,
    overdueAmount: invoices.filter((i) => i.status === 'overdue').reduce((a, i) => a + i.amountDue, 0),
    selfDeclarationGranted: kpi?.selfDeclaration ?? false,
    vatRegime,
    hasDirectorRemuneration45k: false,
  };
}

/**
 * Cabinet / firm portal. The expert-comptable pilots all client dossiers from
 * here: KPIs, TVA, impayés, and the client's self-filing right — every read is
 * scoped per tenant through the multi-tenant store.
 */
export function FirmPortalView() {
  const { user, tenants, grantSelfDeclaration, revokeSelfDeclaration, enterClientWorkspace } = useSession();
  const [kpis, setKpis] = useState<Record<string, ClientKpi>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyTenant, setBusyTenant] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const map: Record<string, ClientKpi> = {};
    for (const tenant of tenants) {
      try {
        const ctx = await dbStore.createContext(user.id, tenant.id);
        const [invoices, expenses, members] = await Promise.all([
          dbStore.invoices.list(ctx, { limit: 1000 }),
          dbStore.expenses.list(ctx, { limit: 1000 }),
          dbStore.memberships.listForTenant(ctx),
        ]);
        const invs = invoices.items.filter((i) => i.type === 'invoice');
        const owner = members.find((m) => m.role === 'OWNER');
        const selfDeclaration = owner ? !owner.deniedPermissions.includes('vat:submit') : false;

        map[tenant.id] = {
          tenantId: tenant.id,
          turnover: invs.reduce((acc, i) => acc + i.totalInclVat, 0),
          revenueExclVat: invs.reduce((acc, i) => acc + i.subtotalExclVat, 0),
          expensesExclVat: expenses.items.reduce((acc, e) => acc + e.amountExclVat, 0),
          vatCollected: invs.reduce((acc, i) => acc + i.totalVatAmount, 0),
          vatDeductible: expenses.items.reduce((acc, e) => acc + e.deductibleVat, 0),
          overdueCount: invs.filter((i) => i.status === 'overdue').length,
          overdueAmount: invs.filter((i) => i.status === 'overdue').reduce((acc, i) => acc + i.amountDue, 0),
          invoiceCount: invs.length,
          expenseCount: expenses.items.length,
          selfDeclaration,
        };
      } catch {
        map[tenant.id] = {
          tenantId: tenant.id,
          turnover: 0,
          revenueExclVat: 0,
          expensesExclVat: 0,
          vatCollected: 0,
          vatDeductible: 0,
          overdueCount: 0,
          overdueAmount: 0,
          invoiceCount: 0,
          expenseCount: 0,
          selfDeclaration: false,
        };
      }
    }
    setKpis(map);
    setLoading(false);
  }, [user, tenants]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(
    async (tenantId: string) => {
      if (!user) return;
      setSelected(tenantId);
      setDetailLoading(true);
      try {
        const ctx = await dbStore.createContext(user.id, tenantId);
        const [invoices, expenses] = await Promise.all([
          dbStore.invoices.list(ctx, { limit: 1000 }),
          dbStore.expenses.list(ctx, { limit: 1000 }),
        ]);
        setDetail({
          invoices: invoices.items.filter((i) => i.type === 'invoice'),
          expenses: expenses.items,
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [user],
  );

  const toggleDeclaration = useCallback(
    async (tenantId: string, current: boolean) => {
      setBusyTenant(tenantId);
      try {
        if (current) await revokeSelfDeclaration(tenantId);
        else await grantSelfDeclaration(tenantId);
        await load();
      } finally {
        setBusyTenant(null);
      }
    },
    [grantSelfDeclaration, revokeSelfDeclaration, load],
  );

  const totals = useMemo(() => {
    const list = Object.values(kpis);
    return {
      clients: list.length,
      turnover: list.reduce((a, k) => a + k.turnover, 0),
      vatNet: list.reduce((a, k) => a + (k.vatCollected - k.vatDeductible), 0),
      overdue: list.reduce((a, k) => a + k.overdueAmount, 0),
    };
  }, [kpis]);

  const consolidated = useMemo(
    () =>
      consolidateStatements(
        tenants.map((t) => ({
          name: t.name,
          revenueExclVat: kpis[t.id]?.revenueExclVat ?? 0,
          expensesExclVat: kpis[t.id]?.expensesExclVat ?? 0,
          vatCollected: kpis[t.id]?.vatCollected ?? 0,
          vatDeductible: kpis[t.id]?.vatDeductible ?? 0,
          overdueAmount: kpis[t.id]?.overdueAmount ?? 0,
        })),
      ),
    [tenants, kpis],
  );

  const selectedTenant = tenants.find((t) => t.id === selected);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <SessionBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase mb-1">
              <Landmark className="h-4 w-4" /> Espace Cabinet
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Pilotage des dossiers clients</h1>
            <p className="text-sm text-slate-400 mt-1">
              {user?.displayName} · Expert-comptable certifié ITAA · {totals.clients} dossier(s) actif(s)
            </p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Clients actifs', value: String(totals.clients), icon: Building2, tone: 'text-slate-200' },
            { label: 'Chiffre d\'affaires', value: eur.format(totals.turnover), icon: TrendingUp, tone: 'text-amber-300' },
            { label: 'TVA nette (collectée − déductible)', value: eur.format(totals.vatNet), icon: CircleDollarSign, tone: 'text-emerald-300' },
            { label: 'Impayés', value: eur.format(totals.overdue), icon: Receipt, tone: 'text-red-400' },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center gap-2 text-slate-400 text-[11px] uppercase tracking-wide mb-2">
                <c.icon className={`h-4 w-4 ${c.tone}`} /> {c.label}
              </div>
              <div className={`text-xl font-extrabold ${c.tone}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Rapports consolidés (P&L multi-clients) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 mb-8">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wide mb-4">
            <TrendingUp className="h-4 w-4" /> Rapports consolidés (P&L multi-clients)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase text-slate-500">CA HTVA</div>
              <div className="font-mono font-bold text-slate-100">{eur.format(consolidated.totalRevenueExclVat)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Charges HTVA</div>
              <div className="font-mono font-bold text-slate-300">{eur.format(consolidated.totalExpensesExclVat)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Résultat brut</div>
              <div className={`font-mono font-bold ${consolidated.totalGrossResult >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                {eur.format(consolidated.totalGrossResult)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">TVA nette</div>
              <div className="font-mono font-bold text-sky-300">{eur.format(consolidated.totalVatNet)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500">Impayés</div>
              <div className="font-mono font-bold text-red-400">{eur.format(consolidated.totalOverdue)}</div>
            </div>
          </div>

          {consolidated.rankedByRevenue.length > 0 && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <div className="text-[10px] uppercase text-slate-500 mb-2">Top clients par CA HTVA</div>
              <div className="space-y-1.5">
                {consolidated.rankedByRevenue.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-slate-500 font-mono">{i + 1}.</span>
                    <span className="flex-1 text-slate-300 truncate">{c.name}</span>
                    <span className="font-mono text-slate-200">{eur.format(c.revenueExclVat)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Chargement des dossiers…
          </div>
        ) : (
          <div className="grid gap-4">
            {tenants.map((tenant) => {
              const kpi = kpis[tenant.id];
              if (!kpi) return null;
              const net = kpi.vatCollected - kpi.vatDeductible;
              return (
                <div
                  key={tenant.id}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition overflow-hidden"
                >
                  <div className="p-5">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      {/* Identity */}
                      <div className="flex items-center gap-3 lg:w-72 shrink-0">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-100 truncate">{tenant.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{tenant.bceDigits} · {tenant.vatRegime}</div>
                        </div>
                      </div>

                      {/* KPIs */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                        <div>
                          <div className="text-[10px] uppercase text-slate-500">CA</div>
                          <div className="font-bold text-slate-100">{eur.format(kpi.turnover)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-slate-500">TVA nette</div>
                          <div className={`font-bold ${net >= 0 ? 'text-emerald-300' : 'text-sky-300'}`}>{eur.format(net)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-slate-500">Impayés</div>
                          <div className={`font-bold ${kpi.overdueCount > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                            {kpi.overdueCount} · {eur.format(kpi.overdueAmount)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-slate-500">Pièces</div>
                          <div className="font-bold text-slate-300">{kpi.invoiceCount} fact. · {kpi.expenseCount} ach.</div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleDeclaration(tenant.id, kpi.selfDeclaration)}
                          disabled={busyTenant === tenant.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            kpi.selfDeclaration
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                          title="Autoriser le client à déposer sa propre déclaration TVA"
                        >
                          {busyTenant === tenant.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : kpi.selfDeclaration ? (
                            <ShieldCheck className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldOff className="h-3.5 w-3.5" />
                          )}
                          {kpi.selfDeclaration ? 'Déclaration client active' : 'Déclaration client bloquée'}
                        </button>

                        <button
                          onClick={() => openDetail(tenant.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition"
                        >
                          <FileText className="h-3.5 w-3.5" /> Dossier
                        </button>

                        <button
                          onClick={() => enterClientWorkspace(tenant.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" /> Espace client
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inline dossier */}
                  {selected === tenant.id && (
                    <div className="border-t border-slate-800 bg-slate-950/60 p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                          <FileText className="h-4 w-4 text-amber-400" /> Dossier {selectedTenant?.name}
                        </div>
                        <button
                          onClick={() => setSelected(null)}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" /> Fermer
                        </button>
                      </div>

                      {detailLoading ? (
                        <div className="py-8 text-center text-slate-500">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                        </div>
                      ) : (
                        <div className="space-y-5">
                          <div className="grid md:grid-cols-2 gap-5">
                          <div>
                            <div className="text-[11px] uppercase text-slate-500 mb-2">Factures clients</div>
                            <div className="space-y-2">
                              {detail?.invoices.length === 0 && (
                                <p className="text-xs text-slate-500">Aucune facture.</p>
                              )}
                              {detail?.invoices.map((inv) => (
                                <div key={inv.id} className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                                    <span className="font-mono text-slate-300">{inv.invoiceNumber}</span>
                                    <span className="text-slate-500">{inv.client.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-200">{eur.format(inv.totalInclVat)}</span>
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                      inv.status === 'paid'
                                        ? 'bg-emerald-500/10 text-emerald-300'
                                        : inv.status === 'overdue'
                                          ? 'bg-red-500/10 text-red-300'
                                          : 'bg-slate-800 text-slate-300'
                                    }`}>{inv.status}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] uppercase text-slate-500 mb-2">Achats & TVA déductible</div>
                            <div className="space-y-2">
                              {detail?.expenses.length === 0 && (
                                <p className="text-xs text-slate-500">Aucun achat.</p>
                              )}
                              {detail?.expenses.map((exp) => (
                                <div key={exp.id} className="flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    <span className="text-slate-300">{exp.supplierName}</span>
                                    <span className="text-slate-500">{exp.category}</span>
                                  </div>
                                  <span className="font-semibold text-slate-200">{eur.format(exp.deductibleVat)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          </div>

                          <div className="pt-4 border-t border-slate-800">
                            <CabinetDeclarationPanel
                              company={tenantToCompanyProfile(tenant)}
                              invoices={detail?.invoices ?? []}
                              expenses={detail?.expenses ?? []}
                            />
                          </div>

                          <div className="pt-4 border-t border-slate-800">
                            <FiscalStrategyPanel clientName={selectedTenant?.name ?? ''} />
                          </div>

                          <div className="pt-4 border-t border-slate-800">
                            <FiscalRecommendationsPanel
                              profile={buildProfile(detail, kpis[tenant.id], tenant.vatRegime)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-900 py-4 text-center text-[11px] text-slate-600">
        BRABO Cabinet — séparation stricte des dossiers par tenant · piste d'audit chaînée SHA-256
      </footer>
    </div>
  );
}

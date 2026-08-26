import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Building2,
  CircleDollarSign,
  Gauge,
  Landmark,
  LayoutGrid,
  Loader2,
  LogOut,
  PlayCircle,
  Plus,
  ScrollText,
  TrendingUp,
  Users,
} from 'lucide-react';
import { dbStore } from '../../server/services/dbStore';
import { useSession } from '../../state/SessionContext';
import { useToasts } from '../../state/ToastContext';
import type { Firm, FirmMembership, FirmSubscription } from '../../server/types/db';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { FirmWizard } from './FirmWizard';
import { PlansPanel } from './PlansPanel';
import { PlatformAuditPanel } from './PlatformAuditPanel';

const eur = (n: number) =>
  new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

interface FirmRow {
  firm: Firm;
  clientCount: number;
  planName: string;
  planPriceMonthly: number;
  subscription: FirmSubscription | null;
}

type Tab = 'overview' | 'firms' | 'plans' | 'audit';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'firms', label: 'Fiduciaires', icon: <Landmark className="h-4 w-4" /> },
  { id: 'plans', label: 'Plans & facturation', icon: <CircleDollarSign className="h-4 w-4" /> },
  { id: 'audit', label: 'Journal d\'audit', icon: <ScrollText className="h-4 w-4" /> },
];

const statusTone = (status: Firm['status']): 'positive' | 'warning' | 'critical' | 'info' | 'neutral' =>
  status === 'active' ? 'positive' : status === 'trial' ? 'info' : status === 'suspended' ? 'warning' : 'neutral';

/**
 * Super Admin console — the platform layer of BRABO OS. Provisions firms,
 * plans, white-label branding and subscription billing, and can impersonate
 * any firm (audited) to inspect its cabinet portal.
 */
export function PlatformAdminView() {
  const { user, platformAdmin, logout, impersonateFirm } = useSession();
  const toast = useToasts();
  const [tab, setTab] = useState<Tab>('overview');
  const [firms, setFirms] = useState<FirmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyFirm, setBusyFirm] = useState<string | null>(null);
  const [team, setTeam] = useState<Record<string, FirmMembership[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const firmPage = await dbStore.platform.listFirms({ limit: 500 });
    const rows = await Promise.all(
      firmPage.items.map(async (firm) => {
        const [clientCount, subs] = await Promise.all([
          dbStore.platform.countFirmClients(firm.id),
          dbStore.platform.listFirmSubscriptions(firm.id),
        ]);
        const plan = firm.planId ? await dbStore.platform.findPlanById(firm.planId) : null;
        return {
          firm,
          clientCount,
          planName: plan?.name ?? '—',
          planPriceMonthly: plan?.priceMonthlyEur ?? 0,
          subscription: subs[0] ?? null,
        } satisfies FirmRow;
      }),
    );
    setFirms(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const active = firms.filter((r) => r.firm.status === 'active');
    const trial = firms.filter((r) => r.firm.status === 'trial');
    const mrr = active.reduce((sum, r) => sum + r.planPriceMonthly, 0);
    const clients = firms.reduce((sum, r) => sum + r.clientCount, 0);
    return { total: firms.length, active: active.length, trial: trial.length, mrr, clients };
  }, [firms]);

  const openImpersonate = async (row: FirmRow) => {
    setBusyFirm(row.firm.id);
    try {
      await impersonateFirm(row.firm.id);
    } catch (e) {
      toast.push('error', 'Impersonation impossible', e instanceof Error ? e.message : undefined);
      setBusyFirm(null);
    }
  };

  const toggleStatus = async (row: FirmRow) => {
    setBusyFirm(row.firm.id);
    const next: Firm['status'] = row.firm.status === 'suspended' ? 'active' : 'suspended';
    try {
      await dbStore.platform.setFirmStatus(row.firm.id, next, user?.id ?? 'system', `Super Admin → ${next}`);
      toast.push('success', 'Statut mis à jour', `${row.firm.name} → ${next}`);
      await load();
    } catch (e) {
      toast.push('error', 'Échec', e instanceof Error ? e.message : undefined);
    } finally {
      setBusyFirm(null);
    }
  };

  const toggleExpand = async (row: FirmRow) => {
    const next = expanded === row.firm.id ? null : row.firm.id;
    setExpanded(next);
    if (next && !team[row.firm.id]) {
      const members = await dbStore.platform.listFirmMemberships(row.firm.id);
      setTeam((prev) => ({ ...prev, [row.firm.id]: members }));
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-solid)] text-[var(--accent-text)] font-black text-lg">
              B
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge tone="accent" uppercase dot><Gauge className="h-3 w-3" /> Super Admin</Badge>
                <Badge tone="neutral">{platformAdmin?.role ?? 'PLATFORM_ADMIN'}</Badge>
              </div>
              <h1 className="text-[length:var(--text-lg)] font-extrabold tracking-tight truncate">
                Console plateforme — BRABO OS
              </h1>
              <p className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] truncate">
                {user?.displayName} · {user?.email}
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" /> Déconnexion
          </Button>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-3 py-2.5 text-[length:var(--text-xs)] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-[var(--accent-solid)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Fiduciaires', value: String(metrics.total), icon: Landmark, tone: 'text-[var(--text-primary)]' },
                { label: 'Actives', value: String(metrics.active), icon: TrendingUp, tone: 'text-[var(--state-positive-text)]' },
                { label: 'En essai', value: String(metrics.trial), icon: Gauge, tone: 'text-[var(--state-info-text)]' },
                { label: 'Dossiers clients', value: String(metrics.clients), icon: Users, tone: 'text-[var(--accent-solid)]' },
                { label: 'MRR estimé', value: eur(metrics.mrr), icon: CircleDollarSign, tone: 'text-[var(--state-positive-text)]' },
              ].map((c) => (
                <Card key={c.label}>
                  <div className="flex items-center gap-2 text-[var(--text-tertiary)] text-[length:var(--text-2xs)] uppercase tracking-wide mb-2">
                    <c.icon className={`h-4 w-4 ${c.tone}`} /> {c.label}
                  </div>
                  <div className={`text-[length:var(--text-xl)] font-extrabold ${c.tone}`}>{c.value}</div>
                </Card>
              ))}
            </div>

            <Card flush>
              <CardHeader
                title={<span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4 text-[var(--accent-solid)]" /> Fiduciaires récentes</span>}
                actions={<Button onClick={() => { setWizardOpen(true); }}><Plus className="h-3.5 w-3.5" /> Nouvelle fiduciaire</Button>}
              />
              <FirmsTable rows={firms} loading={loading} onImpersonate={openImpersonate} busyFirm={busyFirm} />
            </Card>
          </div>
        )}

        {tab === 'firms' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h2 className="text-[length:var(--text-lg)] font-semibold">Toutes les fiduciaires</h2>
                <p className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
                  Pilotez chaque firme : statut, plan, clients, équipe, impersonation.
                </p>
              </div>
              <Button onClick={() => setWizardOpen(true)}><Plus className="h-3.5 w-3.5" /> Nouvelle fiduciaire</Button>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-[var(--text-tertiary)]">
                  <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
                </div>
              ) : (
                firms.map((row) => (
                  <Card key={row.firm.id} flush>
                    <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                      <div className="flex items-center gap-3 lg:w-72 shrink-0">
                        <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] text-[var(--accent-text)] font-bold border border-[var(--accent-soft-border)]" style={{ backgroundColor: row.firm.brand.primaryColor || 'var(--accent-solid)' }}>
                          {row.firm.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{row.firm.name}</div>
                          <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum truncate">
                            {row.firm.brand.slug}.brabo.app · ITAA {row.firm.itaaFirmNumber || '—'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 flex-1">
                        <div>
                          <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Statut</div>
                          <Badge tone={statusTone(row.firm.status)} dot>{row.firm.status}</Badge>
                        </div>
                        <div>
                          <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Plan</div>
                          <div className="font-semibold text-[length:var(--text-xs)]">{row.planName}</div>
                        </div>
                        <div>
                          <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)]">Dossiers</div>
                          <div className="font-semibold text-[length:var(--text-xs)]">{row.clientCount}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="secondary" onClick={() => toggleExpand(row)} disabled={busyFirm === row.firm.id}>
                          <Building2 className="h-3.5 w-3.5" /> Détails
                        </Button>
                        <Button variant="secondary" onClick={() => toggleStatus(row)} disabled={busyFirm === row.firm.id}>
                          {busyFirm === row.firm.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : row.firm.status === 'suspended' ? <PlayCircle className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                          {row.firm.status === 'suspended' ? 'Réactiver' : 'Suspendre'}
                        </Button>
                        <Button onClick={() => openImpersonate(row)} disabled={busyFirm === row.firm.id}>
                          {busyFirm === row.firm.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                          Voir en tant que firme
                        </Button>
                      </div>
                    </div>

                    {expanded === row.firm.id && (
                      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-4 space-y-3">
                        <div className="grid sm:grid-cols-3 gap-4 text-[length:var(--text-xs)]">
                          <div>
                            <div className="text-[length:var(--text-2xs)] uppercase text-[var(--text-tertiary)] mb-1">Abonnement</div>
                            {row.subscription ? (
                              <div className="space-y-0.5">
                                <Badge tone="positive">{row.subscription.status}</Badge>
                                <div className="text-[var(--text-tertiary)]">{row.subscription.dossierCount} dossier(s) · provider {row.subscription.providerRef ?? '—'}</div>
                              </div>
                            ) : <span className="text-[var(--text-tertiary)]">Aucun abonnement</span>}
                          </div>
                          <div>
                            <div className="text-[length:var(--text-2xs)] uppercase text-[var(--text-tertiary)] mb-1">Marque</div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full border border-[var(--border-default)]" style={{ backgroundColor: row.firm.brand.primaryColor || '#0ea5e9' }} />
                                <span className="font-mono tnum">{row.firm.brand.primaryColor || '#0ea5e9'}</span>
                              </div>
                              <div className="text-[var(--text-tertiary)]">{row.firm.brand.slug}.brabo.app</div>
                            </div>
                          </div>
                          <div>
                            <div className="text-[length:var(--text-2xs)] uppercase text-[var(--text-tertiary)] mb-1">Équipe</div>
                            {team[row.firm.id]?.length ? (
                              <div className="space-y-0.5">
                                {team[row.firm.id].map((m) => (
                                  <div key={m.id} className="flex items-center gap-2">
                                    <Badge tone="neutral">{m.role}</Badge>
                                    <span className="text-[var(--text-tertiary)] truncate">{m.userId}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <span className="text-[var(--text-tertiary)]">Aucun membre</span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'plans' && <PlansPanel />}
        {tab === 'audit' && <PlatformAuditPanel />}
      </main>

      <footer className="border-t border-[var(--border-subtle)] py-4 text-center text-[length:var(--text-2xs)] text-[var(--text-disabled)]">
        BRABO OS — hiérarchie Plateforme → Fiduciaires → Clients · isolation stricte par niveau · audit chaîné SHA-256
      </footer>

      <FirmWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={load} />
    </div>
  );
}

function FirmsTable({
  rows,
  loading,
  onImpersonate,
  busyFirm,
}: {
  rows: FirmRow[];
  loading: boolean;
  onImpersonate: (row: FirmRow) => void;
  busyFirm: string | null;
}) {
  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-12 text-[var(--text-tertiary)] text-[length:var(--text-xs)]"><Loader2 className="h-5 w-5 animate-spin" /> Chargement…</div>;
  }
  if (rows.length === 0) {
    return <div className="px-4 py-10 text-center text-[var(--text-tertiary)] text-[length:var(--text-xs)]">Aucune fiduciaire pour l'instant.</div>;
  }
  return (
    <div className="divide-y divide-[var(--border-subtle)]">
      {rows.map((row) => (
        <div key={row.firm.id} className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--accent-text)] text-[length:var(--text-2xs)] font-bold" style={{ backgroundColor: row.firm.brand.primaryColor || 'var(--accent-solid)' }}>
            {row.firm.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[length:var(--text-xs)] font-semibold truncate">{row.firm.name}</div>
            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] truncate">{row.planName} · {row.clientCount} dossier(s)</div>
          </div>
          <Badge tone={statusTone(row.firm.status)} dot>{row.firm.status}</Badge>
          <Button variant="secondary" onClick={() => onImpersonate(row)} disabled={busyFirm === row.firm.id}>
            {busyFirm === row.firm.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
            Voir
          </Button>
        </div>
      ))}
    </div>
  );
}

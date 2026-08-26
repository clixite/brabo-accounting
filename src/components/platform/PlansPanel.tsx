import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, Loader2, Plus } from 'lucide-react';
import { dbStore } from '../../server/services/dbStore';
import { useSession } from '../../state/SessionContext';
import type { Plan } from '../../server/types/db';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { DataTable, Th, Td, Tr } from '../ui/DataTable';
import { TableEmptyRow } from '../ui/EmptyState';

const eur = (n: number) =>
  n === 0 ? 'Gratuit' : new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(n);

/** Commercial plans (SaaS tiers) managed by the Super Admin. */
export function PlansPanel() {
  const { user } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [priceMonthly, setPriceMonthly] = useState('149');
  const [pricePerDossier, setPricePerDossier] = useState('18');
  const [maxDossiers, setMaxDossiers] = useState('100');
  const [maxUsers, setMaxUsers] = useState('10');
  const [features, setFeatures] = useState('Espace client, Peppol & eBox, White-label');

  const load = useCallback(async () => {
    setLoading(true);
    const list = await dbStore.platform.listPlans();
    setPlans(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setError(null);
    if (!user) return;
    const slugClean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!name.trim() || !slugClean) return setError('Nom et slug requis.');
    setBusy(true);
    try {
      await dbStore.platform.createPlan(
        {
          slug: slugClean,
          name: name.trim(),
          priceMonthlyEur: Number(priceMonthly) || 0,
          pricePerDossierEur: Number(pricePerDossier) || 0,
          maxDossiers: maxDossiers.trim() === '' ? null : Number(maxDossiers),
          maxUsers: Number(maxUsers) || 1,
          features: features.split(',').map((f) => f.trim()).filter(Boolean),
          isActive: true,
        },
        user.id,
      );
      setModalOpen(false);
      setSlug('');
      setName('');
      setPriceMonthly('149');
      setPricePerDossier('18');
      setMaxDossiers('100');
      setMaxUsers('10');
      setFeatures('Espace client, Peppol & eBox, White-label');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création du plan.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card flush>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-[var(--accent-solid)]" /> Plans & tarification
            </span>
          }
          description="Offres d'abonnement vendues aux fiduciaires (prix par dossier + quota)."
          actions={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nouveau plan
            </Button>
          }
        />
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
            <Loader2 className="h-5 w-5 animate-spin" /> Chargement des plans…
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Plan</Th>
                <Th>Slug</Th>
                <Th align="right">Prix / mois</Th>
                <Th align="right">Prix / dossier</Th>
                <Th align="right">Dossiers inclus</Th>
                <Th align="right">Utilisateurs</Th>
                <Th>Fonctionnalités</Th>
              </tr>
            </thead>
            <tbody>
              {plans.length === 0 && <TableEmptyRow colSpan={7}>Aucun plan défini.</TableEmptyRow>}
              {plans.map((p) => (
                <Tr key={p.id}>
                  <Td className="text-[var(--text-primary)] font-semibold">{p.name}</Td>
                  <Td mono>{p.slug}</Td>
                  <Td align="right" mono>{eur(p.priceMonthlyEur)}</Td>
                  <Td align="right" mono>{eur(p.pricePerDossierEur)}</Td>
                  <Td align="right" mono>{p.maxDossiers === null ? '∞' : p.maxDossiers}</Td>
                  <Td align="right" mono>{p.maxUsers}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {p.features.slice(0, 4).map((f) => (
                        <Badge key={f} tone="neutral">{f}</Badge>
                      ))}
                      {p.features.length > 4 && <Badge tone="info">+{p.features.length - 4}</Badge>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={<span className="inline-flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-[var(--accent-solid)]" /> Nouveau plan</span>}
        description="Définissez le prix, le quota de dossiers et les fonctionnalités incluses."
        width="md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={busy}>Annuler</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Créer
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pro" />
            </Field>
            <Field label="Slug" required>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="pro" />
            </Field>
            <Field label="Prix / mois (€)">
              <Input value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Prix / dossier (€)">
              <Input value={pricePerDossier} onChange={(e) => setPricePerDossier(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Dossiers inclus" hint="vide = illimité">
              <Input value={maxDossiers} onChange={(e) => setMaxDossiers(e.target.value)} inputMode="numeric" placeholder="illimité" />
            </Field>
            <Field label="Utilisateurs max">
              <Input value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Fonctionnalités" hint="séparées par des virgules">
            <Input value={features} onChange={(e) => setFeatures(e.target.value)} />
          </Field>
          {error && (
            <p className="text-[length:var(--text-xs)] text-[var(--state-critical-text)] bg-[var(--state-critical-bg)] border border-[var(--state-critical-border)] rounded-[var(--radius-md)] px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { dbStore } from '../server/services/dbStore';
import { useSession } from '../state/SessionContext';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import type { AuditLog, AuditChainVerification } from '../server/types/db';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { DataTable, Th, Td, Tr } from './ui/DataTable';
import { cn } from './ui/cn';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Création',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  SOFT_DELETE: 'Suppression (archivée)',
  RESTORE: 'Restauration',
  READ_SENSITIVE: 'Lecture sensible',
  LOGIN: 'Connexion',
  LOGIN_FAILED: 'Échec de connexion',
  LOGOUT: 'Déconnexion',
  EXPORT: 'Export',
  PEPPOL_SEND: 'Envoi Peppol',
  VAT_SUBMIT: 'Dépôt TVA',
  RECONCILE: 'Rapprochement',
  APPROVE: 'Approbation',
  LOCK_PERIOD: 'Clôture de période',
  PERMISSION_CHANGE: 'Changement de droit',
  ACCESS_DENIED: 'Accès refusé',
};

/**
 * Append-only, hash-chained audit trail viewer. Makes the "sécurisé" property
 * visible: every financial mutation is recorded and the SHA-256 chain integrity
 * is verified live.
 */
export function AuditTrailView({ lang }: { lang: Language }) {
  const { activeTenant, user } = useSession();
  const t = translations[lang].audit;
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [verification, setVerification] = useState<AuditChainVerification | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeTenant || !user) return;
    setLoading(true);
    try {
      const ctx = await dbStore.createContext(user.id, activeTenant.id);
      const [page, verify] = await Promise.all([
        dbStore.audit.list(ctx, { limit: 200 }),
        dbStore.audit.verifyChain(ctx),
      ]);
      setEntries(page.items);
      setVerification(verify);
    } finally {
      setLoading(false);
    }
  }, [activeTenant, user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          <Badge tone="accent" dot>Sécurité &amp; traçabilité</Badge>
        </div>
        <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[var(--text-tertiary)]" />
          {t.title}
        </h1>
        <p className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">
          {t.subtitle} — chaque écriture financière est horodatée et attribuée.
        </p>
      </div>

      {/* ── Chain integrity banner ──────────────────────────────────────── */}
      {verification && (
        <div
          className={cn(
            'rounded-[var(--radius-lg)] border p-4 flex items-center gap-3',
            verification.valid
              ? 'bg-[var(--state-positive-bg)] border-[var(--state-positive-border)]'
              : 'bg-[var(--state-critical-bg)] border-[var(--state-critical-border)]',
          )}
        >
          {verification.valid ? (
            <ShieldCheck className="h-6 w-6 text-[var(--state-positive-text)] shrink-0" />
          ) : (
            <ShieldAlert className="h-6 w-6 text-[var(--state-critical-text)] shrink-0" />
          )}
          <div className="min-w-0 space-y-0.5">
            <div
              className={cn(
                'text-[length:var(--text-sm)] font-semibold',
                verification.valid
                  ? 'text-[var(--state-positive-text)]'
                  : 'text-[var(--state-critical-text)]',
              )}
            >
              {verification.valid ? t.chainValid : t.chainBroken}
            </div>
            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
              {verification.entriesChecked} entrée(s) vérifiée(s) · algorithme SHA-256 · {activeTenant?.name ?? 'tenant'}
            </div>
            {!verification.valid && verification.brokenAt.length > 0 && (
              <div className="text-[length:var(--text-2xs)] text-[var(--state-critical-text)]">
                Rupture détectée à la séquence {verification.brokenAt[0].sequence}.
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement de la piste d'audit…
        </div>
      ) : (
        <Card flush>
          <DataTable>
            <thead>
              <tr>
                <Th className="pl-5">#</Th>
                <Th>Horodatage</Th>
                <Th>Action</Th>
                <Th>Entité</Th>
                <Th>Acteur</Th>
                <Th align="right" className="pr-5">Champs modifiés</Th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="p-6 text-center text-[length:var(--text-xs)] text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]"
                  >
                    Aucune entrée d'audit pour ce tenant.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <Tr key={entry.id} interactive>
                  <Td mono className="pl-5 text-[var(--text-tertiary)]">
                    {entry.sequence}
                  </Td>
                  <Td mono className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                    {entry.timestamp.replace('T', ' ').slice(0, 19)}
                  </Td>
                  <Td>
                    <Badge tone="neutral">{ACTION_LABELS[entry.action] ?? entry.action}</Badge>
                  </Td>
                  <Td>
                    <div className="font-semibold text-[var(--text-primary)]">{entry.entity}</div>
                    {entry.entityLabel && (
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                        {entry.entityLabel}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div className="text-[var(--text-secondary)]">{entry.actorEmail ?? entry.actorUserId}</div>
                    {entry.actorRole && (
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                        {entry.actorRole}
                      </div>
                    )}
                  </Td>
                  <Td align="right" className="pr-5">
                    {entry.diff.length > 0 ? (
                      <span className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                        {entry.diff.length} champ(s)
                      </span>
                    ) : (
                      <span className="text-[length:var(--text-2xs)] text-[var(--text-disabled)]">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}
    </div>
  );
}

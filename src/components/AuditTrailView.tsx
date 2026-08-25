import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { dbStore } from '../server/services/dbStore';
import { useSession } from '../state/SessionContext';
import type { AuditLog, AuditChainVerification } from '../server/types/db';

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
export function AuditTrailView() {
  const { activeTenant, user } = useSession();
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
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase mb-1">
          <ShieldCheck className="h-4 w-4" /> Sécurité & traçabilité
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Piste d'audit</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Journal immuable, chaîné par hash SHA-256 — chaque écriture financière est horodatée et attribuée.
        </p>
      </div>

      {/* Chain integrity banner */}
      {verification && (
        <div
          className={`rounded-2xl border p-4 flex items-center gap-3 ${
            verification.valid
              ? 'border-emerald-500/30 bg-emerald-950/20'
              : 'border-red-500/30 bg-red-950/20'
          }`}
        >
          {verification.valid ? (
            <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="h-6 w-6 text-red-400 shrink-0" />
          )}
          <div>
            <div className={`text-sm font-bold ${verification.valid ? 'text-emerald-300' : 'text-red-300'}`}>
              {verification.valid ? 'Chaîne d\'audit intègre' : 'Chaîne d\'audit corrompue'}
            </div>
            <div className="text-xs text-slate-400">
              {verification.entriesChecked} entrée(s) vérifiée(s) · algorithme SHA-256 · {activeTenant?.name ?? 'tenant'}
            </div>
            {!verification.valid && verification.brokenAt.length > 0 && (
              <div className="text-xs text-red-300 mt-1">
                Rupture détectée à la séquence {verification.brokenAt[0].sequence}.
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement de la piste d'audit…
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-5">#</th>
                  <th className="p-3">Horodatage</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Entité</th>
                  <th className="p-3">Acteur</th>
                  <th className="p-3 pr-5 text-right">Champs modifiés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      Aucune entrée d'audit pour ce tenant.
                    </td>
                  </tr>
                )}
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 pl-5 font-mono text-slate-500">{entry.sequence}</td>
                    <td className="p-3 font-mono text-[10px] text-slate-400">
                      {entry.timestamp.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                        {ACTION_LABELS[entry.action] ?? entry.action}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-200">{entry.entity}</div>
                      {entry.entityLabel && <div className="text-[10px] text-slate-500">{entry.entityLabel}</div>}
                    </td>
                    <td className="p-3">
                      <div className="text-slate-300">{entry.actorEmail ?? entry.actorUserId}</div>
                      {entry.actorRole && <div className="text-[10px] text-slate-500">{entry.actorRole}</div>}
                    </td>
                    <td className="p-3 pr-5 text-right">
                      {entry.diff.length > 0 ? (
                        <span className="text-[10px] text-slate-400">{entry.diff.length} champ(s)</span>
                      ) : (
                        <span className="text-[10px] text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

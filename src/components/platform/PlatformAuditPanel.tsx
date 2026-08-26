import { useCallback, useEffect, useState } from 'react';
import { Loader2, ScrollText, ShieldCheck, ShieldOff } from 'lucide-react';
import { dbStore } from '../../server/services/dbStore';
import type { PlatformAuditLog } from '../../server/types/db';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { DataTable, Th, Td, Tr } from '../ui/DataTable';
import { TableEmptyRow } from '../ui/EmptyState';

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(iso));

/** Immutable, hash-chained audit trail of every Super Admin action. */
export function PlatformAuditPanel() {
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<{ valid: boolean; entriesChecked: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const page = await dbStore.platform.listPlatformAudit({ limit: 200 });
    setLogs(page.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const verify = async () => {
    setVerifying(true);
    const result = await dbStore.platform.verifyPlatformChain();
    setVerdict({ valid: result.valid, entriesChecked: result.entriesChecked });
    setVerifying(false);
  };

  return (
    <Card flush>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-[var(--accent-solid)]" /> Journal d'audit plateforme
          </span>
        }
        description="Toute action Super Admin (création de firme, plan, impersonation) est chaînée SHA-256 et inviolable."
        actions={
          <Button variant="secondary" onClick={verify} disabled={verifying}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Vérifier la chaîne
          </Button>
        }
      />
      {verdict && (
        <div className={`px-4 py-2 text-[length:var(--text-xs)] border-b border-[var(--border-subtle)] flex items-center gap-2 ${verdict.valid ? 'text-[var(--state-positive-text)] bg-[var(--state-positive-bg)]' : 'text-[var(--state-critical-text)] bg-[var(--state-critical-bg)]'}`}>
          {verdict.valid ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          {verdict.valid
            ? `Chaîne d'audit valide — ${verdict.entriesChecked} entrée(s) vérifiée(s).`
            : 'Chaîne d\'audit CORROMPUE — falsification détectée.'}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Horodatage</Th>
              <Th>Acteur</Th>
              <Th>Action</Th>
              <Th>Entité</Th>
              <Th>Libellé</Th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <TableEmptyRow colSpan={6}>Aucune action plateforme enregistrée.</TableEmptyRow>}
            {logs.map((log) => (
              <Tr key={log.id}>
                <Td mono className="text-[var(--text-tertiary)]">{log.sequence}</Td>
                <Td mono className="text-[var(--text-tertiary)]">{fmtTime(log.timestamp)}</Td>
                <Td>{log.actorEmail ?? log.actorUserId}</Td>
                <Td><Badge tone="accent">{log.action}</Badge></Td>
                <Td mono>{log.entity}</Td>
                <Td className="text-[var(--text-tertiary)] truncate max-w-[16rem]">{log.entityLabel ?? log.entityId}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  );
}

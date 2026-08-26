import { useEffect, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { dbStore } from '../../server/services/dbStore';
import type { FirmMembership, User } from '../../server/types/db';
import { Card, CardHeader, CardBody } from '../ui/Card';
import { Badge } from '../ui/Badge';

const FIRM_ROLE_LABELS: Record<string, string> = {
  FIRM_ADMIN: 'Admin fiduciaire',
  PARTNER: 'Associé',
  SENIOR: 'Comptable senior',
  JUNIOR: 'Comptable junior',
  BOOKKEEPER: 'Comptable (encodage)',
  READONLY: 'Lecture seule',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  invited: 'Invité',
  suspended: 'Suspendu',
  revoked: 'Révoqué',
};

/** Firm team roster — visible only to the FIRM_ADMIN (admin fiduciaire). */
export function FirmTeamPanel({ firmId }: { firmId: string }) {
  const [rows, setRows] = useState<{ membership: FirmMembership; user: User | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const memberships = await dbStore.platform.listFirmMemberships(firmId);
      const enriched = await Promise.all(
        memberships.map(async (membership) => ({
          membership,
          user: await dbStore.users.findById(membership.userId),
        })),
      );
      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firmId]);

  return (
    <div data-testid="firm-team-panel">
      <Card flush>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2 text-[var(--accent-solid)] uppercase tracking-wide text-[length:var(--text-xs)]">
              <Users className="h-4 w-4" /> Équipe du cabinet
            </span>
          }
        />
        <CardBody>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">Aucun membre.</p>
          ) : (
            <div className="space-y-2">
              {rows.map(({ membership, user }) => (
                <div
                  key={membership.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-[length:var(--text-xs)]"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)] truncate">
                      {user?.displayName ?? membership.userId}
                    </div>
                    <div className="text-[var(--text-tertiary)] truncate">{user?.email}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone="positive" className="rounded-[var(--radius-full)] font-semibold">
                      {FIRM_ROLE_LABELS[membership.role] ?? membership.role}
                    </Badge>
                    <Badge tone="neutral" className="rounded-[var(--radius-full)]">
                      {STATUS_LABELS[membership.status] ?? membership.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

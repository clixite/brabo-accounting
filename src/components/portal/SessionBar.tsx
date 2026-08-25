import { ArrowLeft, BadgeCheck, Building2, Globe, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { useSession } from '../../state/SessionContext';
import type { Language } from '../../i18n/translations';
import { Badge } from '../ui/Badge';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Gérant',
  MANAGER: 'Manager',
  ACCOUNTANT_ITAA: 'Expert-comptable ITAA',
  AUDITOR: 'Réviseur (lecture seule)',
  EMPLOYEE: 'Employé',
};

/**
 * Slim session strip shown above every workspace. It makes the current
 * identity, role and the client's self-filing right explicit — the visible
 * proof of the client ↔ cabinet separation.
 */
export function SessionBar({ syncState }: { syncState?: 'idle' | 'syncing' | 'synced' | 'error' }) {
  const { user, activeRole, activeTenant, canSelfDeclare, mode, forceClientWorkspace, exitClientWorkspace, logout, lang, setLang } =
    useSession();

  const syncIndicator =
    syncState === 'syncing'
      ? { dot: 'bg-[var(--state-warning-solid)] animate-pulse', label: 'Synchronisation…', text: 'text-[var(--state-warning-text)]' }
      : syncState === 'synced'
        ? { dot: 'bg-[var(--state-positive-solid)]', label: 'Synchronisé', text: 'text-[var(--state-positive-text)]' }
        : syncState === 'error'
          ? { dot: 'bg-[var(--state-critical-solid)]', label: 'Erreur de synchro', text: 'text-[var(--state-critical-text)]' }
          : null;

  return (
    <div className="bg-[var(--bg-surface)] border-b border-[var(--border-subtle)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 text-[length:var(--text-xs)]">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] font-medium">
            <BadgeCheck className="h-3.5 w-3.5 text-[var(--accent-solid)] shrink-0" />
            <span className="truncate">{user?.displayName}</span>
          </span>
          <Badge tone="neutral" className="rounded-[var(--radius-full)] px-2 font-semibold">
            {activeRole ? ROLE_LABELS[activeRole] ?? activeRole : '—'}
          </Badge>

          {syncIndicator && (
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-[var(--radius-full)] ${syncIndicator.dot}`} />
              <span className={syncIndicator.text}>{syncIndicator.label}</span>
            </span>
          )}

          {activeTenant && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate max-w-[220px]">{activeTenant.name}</span>
              <span className="font-mono tnum text-[length:var(--text-2xs)] text-[var(--accent-solid)]">{activeTenant.bceDigits}</span>
            </span>
          )}

          {forceClientWorkspace && (
            <Badge tone="info" className="rounded-[var(--radius-full)] px-2">
              Inspection cabinet
            </Badge>
          )}

          {mode === 'client' && !forceClientWorkspace && (
            <Badge
              tone={canSelfDeclare ? 'positive' : 'neutral'}
              className="rounded-[var(--radius-full)] px-2"
            >
              <span
                className="inline-flex items-center gap-1.5"
                title="Droit de déclaration TVA autonome accordé par votre cabinet"
              >
                {canSelfDeclare ? (
                  <ShieldCheck className="h-3 w-3" />
                ) : (
                  <ShieldOff className="h-3 w-3" />
                )}
                {canSelfDeclare ? 'Déclaration TVA autonome' : 'TVA déposée par le cabinet'}
              </span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex items-center bg-[var(--bg-subtle)] rounded-[var(--radius-md)] p-0.5 border border-[var(--border-default)]">
            <Globe className="h-3.5 w-3.5 ml-1.5 text-[var(--text-tertiary)]" />
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
              className="bg-transparent text-[length:var(--text-xs)] text-[var(--text-primary)] font-medium pl-1 pr-2 py-1 outline-none cursor-pointer"
              aria-label="Langue"
            >
              <option value="fr" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">FR</option>
              <option value="nl" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">NL</option>
              <option value="en" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">EN</option>
            </select>
          </div>

          {forceClientWorkspace && (
            <button
              onClick={exitClientWorkspace}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-md)] text-[var(--state-info-text)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--state-info-border)] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour au cabinet
            </button>
          )}
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-md)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border-default)] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}

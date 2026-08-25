import { ArrowLeft, BadgeCheck, Building2, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { useSession } from '../../state/SessionContext';

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
  const { user, activeRole, activeTenant, canSelfDeclare, mode, forceClientWorkspace, exitClientWorkspace, logout } =
    useSession();

  const syncIndicator =
    syncState === 'syncing'
      ? { dot: 'bg-amber-400 animate-pulse', label: 'Synchronisation…', text: 'text-amber-300' }
      : syncState === 'synced'
        ? { dot: 'bg-emerald-400', label: 'Synchronisé', text: 'text-emerald-300' }
        : syncState === 'error'
          ? { dot: 'bg-red-400', label: 'Erreur de synchro', text: 'text-red-300' }
          : null;

  return (
    <div className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-1.5 text-slate-300 font-medium">
            <BadgeCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{user?.displayName}</span>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-semibold">
            {activeRole ? ROLE_LABELS[activeRole] ?? activeRole : '—'}
          </span>

          {syncIndicator && (
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${syncIndicator.dot}`} />
              <span className={syncIndicator.text}>{syncIndicator.label}</span>
            </span>
          )}

          {activeTenant && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-slate-400">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate max-w-[220px]">{activeTenant.name}</span>
              <span className="font-mono text-[10px] text-amber-400">{activeTenant.bceDigits}</span>
            </span>
          )}

          {forceClientWorkspace && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-sky-500/10 text-sky-300 border-sky-500/25">
              Inspection cabinet
            </span>
          )}

          {mode === 'client' && !forceClientWorkspace && (
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                canSelfDeclare
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Droit de déclaration TVA autonome accordé par votre cabinet"
            >
              {canSelfDeclare ? (
                <ShieldCheck className="h-3 w-3" />
              ) : (
                <ShieldOff className="h-3 w-3" />
              )}
              {canSelfDeclare ? 'Déclaration TVA autonome' : 'TVA déposée par le cabinet'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {forceClientWorkspace && (
            <button
              onClick={exitClientWorkspace}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sky-300 hover:text-white hover:bg-slate-800 border border-sky-500/30 hover:border-sky-500/60 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour au cabinet
            </button>
          )}
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent hover:border-slate-700 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}

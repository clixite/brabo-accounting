import { useState } from 'react';
import { Loader2, ShieldAlert, Undo2 } from 'lucide-react';
import { SessionProvider, useSession } from './state/SessionContext';
import { ToastProvider } from './state/ToastContext';
import { Toaster } from './components/ui/Toaster';
import { LoginView } from './components/auth/LoginView';
import { FirmPortalView } from './components/portal/FirmPortalView';
import { ClientWorkspace } from './ClientWorkspace';
import { PlatformAdminView } from './components/platform/PlatformAdminView';

/**
 * BRABO OS application shell.
 *
 * The whole app sits behind the multi-tier session layer: unauthenticated users
 * see the login / workspace selector, platform operators (Super Admin) land on
 * the platform console, cabinet members land on the firm portal, and company
 * members land on their client workspace.
 */
function ImpersonationBanner() {
  const { impersonation, exitImpersonation } = useSession();
  const [busy, setBusy] = useState(false);
  if (!impersonation) return null;

  const exit = async () => {
    setBusy(true);
    try {
      await exitImpersonation();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-between gap-3 px-4 py-2 text-[length:var(--text-xs)] bg-[var(--state-warning-bg)] border-b border-[var(--state-warning-border)] text-[var(--state-warning-text)]">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Impersonation active — vous consultez la plateforme en tant que{' '}
          <strong className="font-semibold">{impersonation.firmName}</strong> (Super Admin :{' '}
          {impersonation.impersonatorEmail})
        </span>
      </div>
      <button
        onClick={exit}
        disabled={busy}
        className="inline-flex items-center gap-1.5 shrink-0 rounded-[var(--radius-md)] border border-[var(--state-warning-border)] px-2.5 py-1 font-semibold hover:bg-[var(--bg-hover)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
        Revenir à la plateforme
      </button>
    </div>
  );
}

function WorkspaceRouter() {
  const { status, mode, forceClientWorkspace } = useSession();

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[var(--text-tertiary)] text-sm">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--accent-solid)] text-[var(--accent-text)] flex items-center justify-center font-black text-xl animate-pulse">
            B
          </div>
          <span>Chargement du coffre-fort comptable…</span>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <LoginView />;
  }

  // The cabinet has opened a client's full workspace: show it regardless of role.
  if (forceClientWorkspace) {
    return <ClientWorkspace />;
  }

  return (
    <>
      <ImpersonationBanner />
      {mode === 'platform' ? (
        <PlatformAdminView />
      ) : mode === 'cabinet' ? (
        <FirmPortalView />
      ) : (
        <ClientWorkspace />
      )}
    </>
  );
}

export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <WorkspaceRouter />
        <Toaster />
      </ToastProvider>
    </SessionProvider>
  );
}

export default App;

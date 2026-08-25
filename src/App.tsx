import { SessionProvider, useSession } from './state/SessionContext';
import { ToastProvider } from './state/ToastContext';
import { Toaster } from './components/ui/Toaster';
import { LoginView } from './components/auth/LoginView';
import { FirmPortalView } from './components/portal/FirmPortalView';
import { ClientWorkspace } from './ClientWorkspace';

/**
 * BRABO application shell.
 *
 * The whole app sits behind the multi-tenant session layer: unauthenticated
 * users see the login / workspace selector, cabinet members (ACCOUNTANT_ITAA)
 * land on the firm portal, and company members land on their client workspace.
 */
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

  if (mode === 'cabinet') {
    return <FirmPortalView />;
  }

  return <ClientWorkspace />;
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

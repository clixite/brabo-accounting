import { SessionProvider, useSession } from './state/SessionContext';
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400 text-sm">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center text-slate-950 font-black text-xl animate-pulse">
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
      <WorkspaceRouter />
    </SessionProvider>
  );
}

export default App;

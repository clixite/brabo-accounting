/**
 * BRABO — session & multi-tenant access layer (React).
 *
 * Wraps the production `dbStore` + `authService` so the UI can:
 *   - authenticate (demo identities + simulated itsme®),
 *   - switch between the client workspace and the cabinet (firm) portal,
 *   - expose the effective RBAC permission set of the active tenant,
 *   - let the accountant grant/revoke a client's self-filing right.
 *
 * Identity, roles and permissions all come from the append-only, hash-chained
 * multi-tenant store — never from the component tree — so the "secure, well
 * separated client ↔ cabinet" property is enforced at the data layer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { dbStore } from '../server/services/dbStore';
import { DEMO_USERS, resolveDemoUser, seedDemoData } from '../server/services/demoBootstrap';
import { PERMISSIONS, ROLES } from '../server/types/db';
import type { Membership, Permission, Role, Tenant, User } from '../server/types/db';
import type { Language } from '../i18n/translations';
import { apiLogin, apiRegister, clearJwt, type RegisterPayload } from '../services/apiClient';

export type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated';
export type SessionMode = 'client' | 'cabinet';

export interface SessionContextValue {
  status: SessionStatus;
  mode: SessionMode;
  lang: Language;
  setLang: (lang: Language) => void;
  user: User | null;
  memberships: Membership[];
  tenants: Tenant[];
  activeTenant: Tenant | null;
  activeRole: Role | null;
  permissions: Set<Permission>;
  canSelfDeclare: boolean;
  loginDemo: (kind: 'client' | 'cabinet') => Promise<void>;
  loginItsme: () => Promise<void>;
  /** Real backend auth (PostgreSQL): email + password → JWT session. */
  loginWithPassword: (email: string, password: string) => Promise<void>;
  /** Real backend auth: creates the user + company tenant on the VPS. */
  registerWithPassword: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => Promise<void>;
  /** True when the cabinet has opened a client's full workspace. */
  forceClientWorkspace: boolean;
  enterClientWorkspace: (tenantId: string) => Promise<void>;
  exitClientWorkspace: () => void;
  grantSelfDeclaration: (tenantId: string) => Promise<void>;
  revokeSelfDeclaration: (tenantId: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const SESSION_KEY = 'brabo.session.v1';
const TENANT_KEY = 'brabo.session.tenant.v1';

/** Determines whether the user is primarily a cabinet member or a client. */
function resolveMode(memberships: Membership[]): SessionMode {
  const hasOwn = memberships.some((m) => m.role === ROLES.OWNER || m.role === ROLES.MANAGER);
  const hasCabinet = memberships.some((m) => m.role === ROLES.ACCOUNTANT_ITAA);
  if (hasOwn) return 'client';
  if (hasCabinet) return 'cabinet';
  return 'client';
}

/** Picks the default tenant for a freshly authenticated user. */
function defaultTenantId(memberships: Membership[], mode: SessionMode): string | null {
  if (memberships.length === 0) return null;
  if (mode === 'client') {
    const owned = memberships.find((m) => m.role === ROLES.OWNER || m.role === ROLES.MANAGER);
    return owned?.tenantId ?? memberships[0].tenantId;
  }
  return memberships[0].tenantId;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [lang, setLang] = useState<Language>(() => {
    return (globalThis.localStorage?.getItem('brabo_lang') as Language) || 'fr';
  });
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [refreshTick, setRefreshTick] = useState(0);
  const [forceClientWorkspace, setForceClientWorkspace] = useState(false);

  // Persist the UI language preference.
  useEffect(() => {
    globalThis.localStorage?.setItem('brabo_lang', lang);
  }, [lang]);

  /** Recomputes the effective permission set for the active tenant. */
  const refreshPermissions = useCallback(async (userId: string, tenantId: string | null) => {
    if (!userId || !tenantId) {
      setPermissions(new Set());
      return;
    }
    const perms = await dbStore.effectivePermissions(userId, tenantId);
    setPermissions(perms);
  }, []);

  /** Activates an authenticated user: loads memberships + tenants + defaults. */
  const activateUser = useCallback(async (activated: User, preferredTenantId?: string) => {
    const members = await dbStore.memberships.listForUser(activated.id);
    const mode = resolveMode(members);
    const tenantList = await dbStore.tenants.listForUser(activated.id);
    const chosen =
      preferredTenantId && members.some((m) => m.tenantId === preferredTenantId)
        ? preferredTenantId
        : defaultTenantId(members, mode);

    setUser(activated);
    setMemberships(members);
    setTenants(tenantList);
    setActiveTenantId(chosen);
    setForceClientWorkspace(false);
    setStatus('authenticated');
    globalThis.localStorage?.setItem(SESSION_KEY, activated.email);
    if (chosen) globalThis.localStorage?.setItem(TENANT_KEY, chosen);
    await refreshPermissions(activated.id, chosen);
  }, [refreshPermissions]);

  // Bootstrap: init store, seed demo data, restore a persisted session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await dbStore.init();
        await seedDemoData();
        const storedEmail = globalThis.localStorage?.getItem(SESSION_KEY);
        const storedTenant = globalThis.localStorage?.getItem(TENANT_KEY) ?? undefined;
        if (storedEmail) {
          const restored = await dbStore.users.findByEmail(storedEmail);
          if (restored) {
            await activateUser(restored, storedTenant);
            if (!cancelled) return;
          }
        }
      } finally {
        if (!cancelled) setStatus((s) => (s === 'loading' ? 'unauthenticated' : s));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activateUser]);

  // Keep permissions fresh whenever the active tenant or memberships change.
  useEffect(() => {
    if (user && activeTenantId) {
      refreshPermissions(user.id, activeTenantId);
    }
  }, [user, activeTenantId, refreshTick, refreshPermissions]);

  const loginDemo = useCallback(
    async (kind: 'client' | 'cabinet') => {
      const email = kind === 'cabinet' ? DEMO_USERS.accountant : DEMO_USERS.ownerBrabo;
      const resolved = await resolveDemoUser(email);
      if (!resolved) throw new Error('Utilisateur de démonstration introuvable.');
      await activateUser(resolved);
    },
    [activateUser],
  );

  const loginItsme = useCallback(async () => {
    // Simulated itsme® Belgian Digital Identity — resolves to the Brabo gérant
    // for the demo (in production this is an eIDAS "high" OIDC flow).
    await loginDemo('client');
  }, [loginDemo]);

  /**
   * Real backend login (PostgreSQL). On success the JWT is stored and the user
   * enters the client workspace; the local per-tenant store keeps serving the
   * UI instantly while the API becomes the durable store for the tenant.
   */
  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const auth = await apiLogin(email.trim(), password);
      if (!auth) throw new Error('Connexion refusée : identifiants invalides ou API injoignable.');
      await loginDemo('client');
    },
    [loginDemo],
  );

  const registerWithPassword = useCallback(
    async (payload: RegisterPayload) => {
      const auth = await apiRegister(payload);
      if (!auth) throw new Error('Création de compte refusée : vérifiez vos informations.');
      await loginDemo('client');
    },
    [loginDemo],
  );

  const logout = useCallback(() => {
    clearJwt();
    setUser(null);
    setMemberships([]);
    setTenants([]);
    setActiveTenantId(null);
    setPermissions(new Set());
    setForceClientWorkspace(false);
    setStatus('unauthenticated');
    globalThis.localStorage?.removeItem(SESSION_KEY);
    globalThis.localStorage?.removeItem(TENANT_KEY);
  }, []);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      if (!user) return;
      setActiveTenantId(tenantId);
      globalThis.localStorage?.setItem(TENANT_KEY, tenantId);
      await refreshPermissions(user.id, tenantId);
    },
    [user, refreshPermissions],
  );

  /** The cabinet opens a client's full workspace (read inspection). */
  const enterClientWorkspace = useCallback(
    async (tenantId: string) => {
      await switchTenant(tenantId);
      setForceClientWorkspace(true);
    },
    [switchTenant],
  );

  const exitClientWorkspace = useCallback(() => {
    setForceClientWorkspace(false);
  }, []);

  /** The accountant toggles the client owner's self-filing right. */
  const setSelfDeclaration = useCallback(
    async (tenantId: string, grant: boolean) => {
      if (!user) return;
      const ctx = await dbStore.createContext(user.id, tenantId);
      const members = await dbStore.memberships.listForTenant(ctx);
      const owner = members.find((m) => m.role === ROLES.OWNER);
      if (!owner) throw new Error('Aucun membre gérant trouvé pour ce dossier.');
      await dbStore.memberships.setSelfDeclaration(
        ctx,
        owner.id,
        grant,
        grant ? 'Accès déclaration TVA accordé au client' : 'Accès déclaration TVA retiré au client',
      );
      setRefreshTick((t) => t + 1);
    },
    [user],
  );

  const grantSelfDeclaration = useCallback(
    (tenantId: string) => setSelfDeclaration(tenantId, true),
    [setSelfDeclaration],
  );
  const revokeSelfDeclaration = useCallback(
    (tenantId: string) => setSelfDeclaration(tenantId, false),
    [setSelfDeclaration],
  );

  const activeTenant = useMemo(
    () => tenants.find((t) => t.id === activeTenantId) ?? null,
    [tenants, activeTenantId],
  );
  const activeMembership = useMemo(
    () => memberships.find((m) => m.tenantId === activeTenantId) ?? null,
    [memberships, activeTenantId],
  );
  const activeRole = activeMembership?.role ?? null;
  const mode = useMemo(() => resolveMode(memberships), [memberships]);
  const canSelfDeclare = permissions.has(PERMISSIONS.VAT_SUBMIT);

  const value: SessionContextValue = {
    status,
    mode,
    lang,
    setLang,
    user,
    memberships,
    tenants,
    activeTenant,
    activeRole,
    permissions,
    canSelfDeclare,
    loginDemo,
    loginItsme,
    loginWithPassword,
    registerWithPassword,
    logout,
    switchTenant,
    forceClientWorkspace,
    enterClientWorkspace,
    exitClientWorkspace,
    grantSelfDeclaration,
    revokeSelfDeclaration,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider.');
  return ctx;
}

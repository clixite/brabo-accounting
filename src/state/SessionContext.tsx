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
import type { FirmRole, Membership, Permission, PlatformAdmin, Role, Tenant, User } from '../server/types/db';
import type { Language } from '../i18n/translations';
import { apiLogin, apiRegister, clearJwt, type RegisterPayload } from '../services/apiClient';

export type SessionStatus = 'loading' | 'unauthenticated' | 'authenticated';
export type SessionMode = 'client' | 'cabinet' | 'platform';

/** The four SaaS profiles reachable from the workspace selector. */
export type DemoProfile = 'client-admin' | 'client-membre' | 'admin-fiduciaire' | 'membre-fiduciaire';

/** State carried while a platform operator impersonates a firm. */
export interface FirmImpersonation {
  firmId: string;
  firmName: string;
  impersonatorEmail: string;
}

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
  /** Non-null when the authenticated user is a platform operator. */
  platformAdmin: PlatformAdmin | null;
  /** Non-null while the platform is impersonating a firm. */
  impersonation: FirmImpersonation | null;
  /** Non-null when the authenticated user belongs to an accounting firm. */
  firmRole: FirmRole | null;
  loginDemo: (profile: DemoProfile) => Promise<void>;
  loginPlatform: () => Promise<void>;
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
  /** Platform-only: assume a firm's FIRM_ADMIN session (audited). */
  impersonateFirm: (firmId: string) => Promise<void>;
  /** Platform-only: return to the platform console. */
  exitImpersonation: () => Promise<void>;
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
  const [platformAdmin, setPlatformAdmin] = useState<PlatformAdmin | null>(null);
  const [impersonation, setImpersonation] = useState<FirmImpersonation | null>(null);
  const [firmRole, setFirmRole] = useState<FirmRole | null>(null);

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

  /** Activates an authenticated user: platform, firm or client context. */
  const activateUser = useCallback(async (activated: User, preferredTenantId?: string) => {
    const platform = await dbStore.platform.findPlatformAdminForUser(activated.id);
    setPlatformAdmin(platform);

    // Platform operators have no tenant memberships: land on the platform console.
    if (platform) {
      setUser(activated);
      setMemberships([]);
      setTenants([]);
      setActiveTenantId(null);
      setPermissions(new Set());
      setForceClientWorkspace(false);
      setFirmRole(null);
      setStatus('authenticated');
      globalThis.localStorage?.setItem(SESSION_KEY, activated.email);
      globalThis.localStorage?.removeItem(TENANT_KEY);
      return;
    }

    const members = await dbStore.memberships.listForUser(activated.id);
    const mode = resolveMode(members);
    const tenantList = await dbStore.tenants.listForUser(activated.id);
    const firmMemberships = await dbStore.platform.listFirmMembershipsForUser(activated.id);
    const activeFirmRole = firmMemberships.find((m) => m.status === 'active')?.role ?? null;
    const chosen =
      preferredTenantId && members.some((m) => m.tenantId === preferredTenantId)
        ? preferredTenantId
        : defaultTenantId(members, mode);

    setUser(activated);
    setMemberships(members);
    setTenants(tenantList);
    setActiveTenantId(chosen);
    setForceClientWorkspace(false);
    setFirmRole(activeFirmRole);
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
    async (profile: DemoProfile) => {
      const emailMap: Record<DemoProfile, string> = {
        'client-admin': DEMO_USERS.ownerBrabo,
        'client-membre': DEMO_USERS.employeeBrabo,
        'admin-fiduciaire': DEMO_USERS.accountant,
        'membre-fiduciaire': DEMO_USERS.firmMember,
      };
      const email = emailMap[profile];
      const resolved = await resolveDemoUser(email);
      if (!resolved) throw new Error('Utilisateur de démonstration introuvable.');
      await activateUser(resolved);
    },
    [activateUser],
  );

  const loginItsme = useCallback(async () => {
    // Simulated itsme® Belgian Digital Identity — resolves to the Brabo gérant
    // for the demo (in production this is an eIDAS "high" OIDC flow).
    await loginDemo('client-admin');
  }, [loginDemo]);

  /** Super Admin login — lands on the platform console. */
  const loginPlatform = useCallback(async () => {
    const resolved = await resolveDemoUser(DEMO_USERS.platformAdmin);
    if (!resolved) throw new Error('Administrateur plateforme introuvable.');
    await activateUser(resolved);
  }, [activateUser]);

  /**
   * Real backend login (PostgreSQL). On success the JWT is stored and the user
   * enters the client workspace; the local per-tenant store keeps serving the
   * UI instantly while the API becomes the durable store for the tenant.
   */
  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const auth = await apiLogin(email.trim(), password);
      if (!auth) throw new Error('Connexion refusée : identifiants invalides ou API injoignable.');
      await loginDemo('client-admin');
    },
    [loginDemo],
  );

  const registerWithPassword = useCallback(
    async (payload: RegisterPayload) => {
      const auth = await apiRegister(payload);
      if (!auth) throw new Error('Création de compte refusée : vérifiez vos informations.');
      await loginDemo('client-admin');
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
    setPlatformAdmin(null);
    setImpersonation(null);
    setFirmRole(null);
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

  /** Platform-only: assume a firm's FIRM_ADMIN session (audited in the platform trail). */
  const impersonateFirm = useCallback(
    async (firmId: string) => {
      if (!user || !platformAdmin) throw new Error('Réservé à la plateforme.');
      const firm = await dbStore.platform.findFirmById(firmId);
      if (!firm) throw new Error('Firme introuvable.');
      const members = await dbStore.platform.listFirmMemberships(firmId);
      const adminMember = members.find((m) => m.role === 'FIRM_ADMIN' && m.status === 'active');
      if (!adminMember) throw new Error('Aucun administrateur actif pour cette firme.');
      const firmAdminUser = await dbStore.users.findById(adminMember.userId);
      if (!firmAdminUser) throw new Error('Administrateur de firme introuvable.');

      await dbStore.platform.appendPlatformAudit({
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: platformAdmin.role,
        action: 'READ_SENSITIVE',
        entity: 'Firm',
        entityId: firmId,
        entityLabel: firm.name,
        reason: 'Impersonation (connexion en tant que firme)',
      });

      setImpersonation({ firmId, firmName: firm.name, impersonatorEmail: user.email });
      await activateUser(firmAdminUser);
    },
    [user, platformAdmin, activateUser],
  );

  /** Platform-only: leave the impersonated firm and return to the platform console. */
  const exitImpersonation = useCallback(async () => {
    if (!impersonation) return;
    const impersonator = await dbStore.users.findByEmail(impersonation.impersonatorEmail);
    setImpersonation(null);
    if (impersonator) {
      await activateUser(impersonator);
    } else {
      logout();
    }
  }, [impersonation, activateUser, logout]);

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
  const mode = useMemo(() => {
    if (platformAdmin) return 'platform';
    if (impersonation) return 'cabinet';
    return resolveMode(memberships);
  }, [platformAdmin, impersonation, memberships]);
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
    platformAdmin,
    impersonation,
    firmRole,
    loginDemo,
    loginPlatform,
    loginItsme,
    loginWithPassword,
    registerWithPassword,
    logout,
    switchTenant,
    forceClientWorkspace,
    enterClientWorkspace,
    exitClientWorkspace,
    impersonateFirm,
    exitImpersonation,
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

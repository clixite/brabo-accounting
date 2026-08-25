/**
 * BRABO — Belgian Accounting Platform
 * Authentication & onboarding service (itsme® / eID / password).
 *
 * Implements the JWT session lifecycle + Belgian company onboarding on top of
 * the multi-tenant `dbStore`. The itsme® flow is simulated locally but keeps the
 * exact same claims contract as the real OIDC provider so swapping in a live
 * client later is a drop-in change.
 */

import { dbStore } from './dbStore';
import { AUTH_PROVIDERS, DbError, ROLES } from '../types/db';
import type {
  AuthProvider,
  ItsmeIdentity,
  Membership,
  Session,
  Tenant,
  User,
} from '../types/db';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp until which the access token is valid. */
  expiresAt: string;
}

export interface AuthenticatedSession {
  user: User;
  tokens: AuthTokens;
  session: Session;
  memberships: Membership[];
  activeTenant: Tenant | null;
}

export interface ItsmeAuthInput {
  /** Simulated itsme® authorization code. */
  authorizationCode: string;
  locale?: 'fr' | 'nl' | 'en';
}

export interface PasswordAuthInput {
  email: string;
  password: string;
}

export interface OnboardingInput {
  user: Pick<User, 'email' | 'firstName' | 'lastName'>;
  tenant: Omit<Tenant, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
  actorUserId: string;
}

/** Deterministic mock itsme® identity for a known test subject. */
function mockItsmeIdentity(): ItsmeIdentity {
  return {
    sub: 'itsme-be-' + Math.random().toString(36).slice(2, 12),
    givenName: 'Nicolas',
    familyName: 'Simon',
    nationalRegisterNumber: '82010112345',
    birthDate: '1982-01-01',
    loa: 'high',
    verifiedAt: new Date().toISOString(),
    legalRepresentativeOf: ['0789456175'],
  };
}

/** Minimal JWT-shaped token (demo; replace with signed JWT in production). */
function makeToken(prefix: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ iss: 'brabo', iat: Date.now(), jti: prefix + '-' + Math.random().toString(36).slice(2) }));
  const signature = btoa(prefix + '-' + Math.random().toString(36).slice(2, 10));
  return `${header}.${payload}.${signature}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionExpiry(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
}

/**
 * Resolves an existing user for an itsme® subject, or provisions a new one on
 * first login.
 */
async function resolveUserByItsme(identity: ItsmeIdentity): Promise<User> {
  const existing = await dbStore.users.findByItsmeSub(identity.sub);
  if (existing) {
    await dbStore.users.update(existing.id, {
      lastLoginAt: nowIso(),
      itsme: identity,
      emailVerified: true,
    });
    const refreshed = await dbStore.users.findById(existing.id);
    return refreshed as User;
  }

  return dbStore.users.create({
    email: `${identity.givenName}.${identity.familyName}@itsme.be`.toLowerCase().replace(/\s+/g, '.'),
    emailVerified: true,
    firstName: identity.givenName,
    lastName: identity.familyName,
    displayName: `${identity.givenName} ${identity.familyName}`,
    locale: 'fr-BE',
    authProvider: AUTH_PROVIDERS.ITSME,
    itsme: identity,
    mfaEnabled: false,
    status: 'active',
  });
}

async function completeSession(user: User, provider: AuthProvider, loa: ItsmeIdentity['loa']): Promise<AuthenticatedSession> {
  const memberships = await dbStore.memberships.listForUser(user.id);
  const activeTenantId = memberships[0]?.tenantId;
  const activeTenant = activeTenantId ? await dbStore.tenants.findById(activeTenantId) : null;

  const session = await dbStore.sessions.create({
    userId: user.id,
    activeTenantId,
    accessTokenId: makeToken('at').split('.')[2],
    refreshTokenId: makeToken('rt').split('.')[2],
    issuedAt: nowIso(),
    expiresAt: sessionExpiry(),
    provider,
    loa,
  });

  return {
    user,
    tokens: {
      accessToken: makeToken('access'),
      refreshToken: makeToken('refresh'),
      expiresAt: session.expiresAt,
    },
    session,
    memberships,
    activeTenant,
  };
}

/**
 * itsme® Belgian Digital Identity authentication (simulated).
 */
export async function authenticateWithItsme(input: ItsmeAuthInput): Promise<AuthenticatedSession> {
  if (!input.authorizationCode || input.authorizationCode.length < 4) {
    throw new DbError('UNAUTHENTICATED', 'Code d\'autorisation itsme® invalide.');
  }

  const identity = mockItsmeIdentity();
  const user = await resolveUserByItsme(identity);
  return completeSession(user, AUTH_PROVIDERS.ITSME, identity.loa);
}

/**
 * Password-based authentication (fallback for non-itsme® users).
 */
export async function authenticateWithPassword(input: PasswordAuthInput): Promise<AuthenticatedSession> {
  const user = await dbStore.users.findByEmail(input.email.toLowerCase().trim());
  if (!user) {
    throw new DbError('UNAUTHENTICATED', 'Identifiants invalides.');
  }
  await dbStore.users.update(user.id, { lastLoginAt: nowIso() });
  return completeSession(user, AUTH_PROVIDERS.PASSWORD, 'substantial');
}

/**
 * Onboards a new Belgian company: provisions the tenant and a membership with
 * the OWNER role for the acting user.
 */
export async function onboardCompany(input: OnboardingInput): Promise<{ tenant: Tenant; membership: Membership }> {
  const tenant = await dbStore.tenants.create(input.tenant, input.actorUserId);

  const ctx = {
    userId: input.actorUserId,
    tenantId: tenant.id,
    role: ROLES.OWNER,
  };

  const membership = await dbStore.memberships.create(ctx, {
    userId: input.actorUserId,
    role: ROLES.OWNER,
    status: 'active',
    extraPermissions: [],
    deniedPermissions: [],
    invitedAt: nowIso(),
    acceptedAt: nowIso(),
  });

  return { tenant, membership };
}

/**
 * Revokes the current session (logout).
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await dbStore.sessions.revoke(sessionId);
}

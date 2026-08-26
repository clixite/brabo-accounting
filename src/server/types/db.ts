/**
 * BRABO — Belgian Accounting Platform
 * Backend database model definitions (multi-tenant, production shape).
 *
 * Design constraints honoured here:
 *  - `verbatimModuleSyntax`: every type-only import/export uses `import type` / `export type`.
 *  - `erasableSyntaxOnly`: no `enum`, no namespaces, no parameter properties.
 *    Enumerations are modelled as `const` maps + derived union types, which erase cleanly.
 *  - Runtime target is the browser (Vite/DOM), so all identifiers are plain data.
 *
 * Legal references used for field semantics:
 *  - BCE/KBO (Banque-Carrefour des Entreprises) — modulo 97 enterprise number.
 *  - CSA / WVV (Code des sociétés et des associations, 2019) — legal forms SRL/BV, SA/NV…
 *  - AR n°1 (TVA), Code TVA art. 20, 21 §2, 39bis, 44, 56bis.
 *  - Peppol BIS Billing 3.0 / EN 16931 — e-invoicing (mandatory B2B in BE from 2026-01-01).
 *  - Febelfin CODA v2.x record types 0/1/2.1/2.2/2.3/3.x/8/9 and ISO 20022 CAMT.053.
 *  - Livre III C.D.E. + art. 315 CIR92 — 7/10-year immutable bookkeeping trail.
 *  - ITAA (Institut des Conseillers fiscaux et Experts-comptables) — fiduciary mandates.
 */

import type {
  BelgianVatRate,
  BelgianVatRegime,
  DocumentType,
  InvoiceStatus,
  PurchaseStatus,
} from '../../types/accounting';

/* -------------------------------------------------------------------------- */
/* Primitive aliases                                                          */
/* -------------------------------------------------------------------------- */

/** Opaque-ish branded identifier aliases (documentation value, zero runtime cost). */
export type ID = string;
export type TenantId = ID;
export type UserId = ID;

/** ISO-8601 calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** ISO-8601 instant with timezone, `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export type ISODateTime = string;

/** Lowercase hex-encoded SHA-256 digest (64 chars). */
export type Sha256Hex = string;

/** Monetary amount in EUR, rounded to 2 decimals by the service layer. */
export type Money = number;

/** Every persisted row carries these. */
export interface BaseRecord {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Soft-delete marker — financial rows are never hard-deleted (legal retention). */
  deletedAt?: ISODateTime;
}

/** Every tenant-owned row carries the isolation key. */
export interface TenantScoped extends BaseRecord {
  tenantId: TenantId;
}

/* -------------------------------------------------------------------------- */
/* Enumerations (erasable const-map + union pattern)                          */
/* -------------------------------------------------------------------------- */

/** Belgian legal forms under the CSA/WVV 2019 (FR + NL denominations). */
export const LEGAL_FORMS = {
  SRL: 'SRL',
  BV: 'BV',
  SA: 'SA',
  NV: 'NV',
  SC: 'SC',
  CV: 'CV',
  SNC: 'SNC',
  VOF: 'VOF',
  SComm: 'SComm',
  CommV: 'CommV',
  ASBL: 'ASBL',
  VZW: 'VZW',
  INDEPENDANT: 'Indépendant',
  EENMANSZAAK: 'Eenmanszaak',
} as const;
export type LegalForm = (typeof LEGAL_FORMS)[keyof typeof LEGAL_FORMS];

/** Seat of the Registre des Personnes Morales / Rechtspersonenregister. */
export const RPM_CITIES = {
  BRUXELLES: 'Bruxelles',
  ANTWERPEN: 'Antwerpen',
  GENT: 'Gent',
  LIEGE: 'Liège',
  CHARLEROI: 'Charleroi',
  MONS: 'Mons',
  NAMUR: 'Namur',
  LEUVEN: 'Leuven',
  BRUGGE: 'Brugge',
  HASSELT: 'Hasselt',
  NIVELLES: 'Nivelles',
  TOURNAI: 'Tournai',
  ARLON: 'Arlon',
  EUPEN: 'Eupen',
} as const;
export type RpmCity = (typeof RPM_CITIES)[keyof typeof RPM_CITIES];

/** VAT filing regime driving Intervat periodicity. */
export const VAT_REGIMES = {
  /** Déclarations mensuelles (turnover > 2.5 M€ or specific sectors). */
  MONTHLY: 'monthly',
  /** Déclarations trimestrielles (default SME regime). */
  QUARTERLY: 'quarterly',
  /** Régime de la franchise — art. 56bis, turnover ≤ 25.000 € (no VAT charged). */
  FRANCHISE: 'franchise_art56bis',
  /** Régime forfaitaire agricole — art. 57. */
  AGRICULTURAL: 'agricultural_art57',
  /** Non-assujetti / exempt entity. */
  EXEMPT: 'exempt',
} as const;
export type VatRegimeKind = (typeof VAT_REGIMES)[keyof typeof VAT_REGIMES];

/** Membership roles for RBAC. */
export const ROLES = {
  /** Company owner / gérant — full control including tenant deletion. */
  OWNER: 'OWNER',
  /** Operational manager — full financial CRUD, no tenant/billing admin. */
  MANAGER: 'MANAGER',
  /** External ITAA-certified accountant — books, closes, exports; cannot delete the tenant. */
  ACCOUNTANT_ITAA: 'ACCOUNTANT_ITAA',
  /** Réviseur d'entreprises / IBR auditor — strictly read-only, incl. the audit trail. */
  AUDITOR: 'AUDITOR',
  /** Internal employee — may submit expenses and read own records only. */
  EMPLOYEE: 'EMPLOYEE',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Ordered privilege ranking; higher wins. Used for "at least this role" checks. */
export const ROLE_RANK: Readonly<Record<Role, number>> = {
  OWNER: 50,
  MANAGER: 40,
  ACCOUNTANT_ITAA: 30,
  AUDITOR: 20,
  EMPLOYEE: 10,
};

export const MEMBERSHIP_STATUSES = {
  ACTIVE: 'active',
  INVITED: 'invited',
  SUSPENDED: 'suspended',
  REVOKED: 'revoked',
} as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[keyof typeof MEMBERSHIP_STATUSES];

/* -------------------------------------------------------------------------- */
/* Platform (Super Admin) & Firm (fiduciaire) roles — 3-tier SaaS hierarchy  */
/* -------------------------------------------------------------------------- */

/** Platform operators — the SaaS owner and its staff. */
export const PLATFORM_ROLES = {
  /** Platform owner: full control, incl. billing and other platform admins. */
  PLATFORM_OWNER: 'PLATFORM_OWNER',
  /** Platform admin: manages firms, plans and impersonation. */
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  /** Read-only support: inspects firms/health, cannot mutate. */
  PLATFORM_SUPPORT: 'PLATFORM_SUPPORT',
} as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES];

export const PLATFORM_ROLE_RANK: Readonly<Record<PlatformRole, number>> = {
  PLATFORM_OWNER: 60,
  PLATFORM_ADMIN: 50,
  PLATFORM_SUPPORT: 20,
};

/** Roles inside an accounting firm (fiduciaire). */
export const FIRM_ROLES = {
  /** Firm owner/admin: manages team, billing, and all client dossiers. */
  FIRM_ADMIN: 'FIRM_ADMIN',
  /** Partner: full access to assigned dossiers + billing visibility. */
  PARTNER: 'PARTNER',
  /** Senior accountant: reviews and files for assigned dossiers. */
  SENIOR: 'SENIOR',
  /** Junior accountant: encodes and prepares. */
  JUNIOR: 'JUNIOR',
  /** Bookkeeper: bank + expense encoding only. */
  BOOKKEEPER: 'BOOKKEEPER',
  /** Read-only collaborator. */
  READONLY: 'READONLY',
} as const;
export type FirmRole = (typeof FIRM_ROLES)[keyof typeof FIRM_ROLES];

/** Firm lifecycle status. */
export const FIRM_STATUSES = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
} as const;
export type FirmStatus = (typeof FIRM_STATUSES)[keyof typeof FIRM_STATUSES];

/** Subscription lifecycle status. */
export const SUBSCRIPTION_STATUSES = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

/** Granular permissions; roles expand into sets of these. */
export const PERMISSIONS = {
  TENANT_READ: 'tenant:read',
  TENANT_UPDATE: 'tenant:update',
  TENANT_DELETE: 'tenant:delete',
  MEMBER_READ: 'member:read',
  MEMBER_MANAGE: 'member:manage',
  /** Grants the accountant/firm the power to toggle a client's self-filing right. */
  MEMBER_GRANT_DECLARATION: 'member:grant_declaration',
  INVOICE_READ: 'invoice:read',
  INVOICE_WRITE: 'invoice:write',
  INVOICE_DELETE: 'invoice:delete',
  INVOICE_SEND_PEPPOL: 'invoice:send_peppol',
  EXPENSE_READ: 'expense:read',
  EXPENSE_WRITE: 'expense:write',
  EXPENSE_DELETE: 'expense:delete',
  EXPENSE_APPROVE: 'expense:approve',
  BANK_READ: 'bank:read',
  BANK_WRITE: 'bank:write',
  BANK_RECONCILE: 'bank:reconcile',
  VAT_READ: 'vat:read',
  VAT_SUBMIT: 'vat:submit',
  AUDIT_READ: 'audit:read',
  FIDUCIARY_READ: 'fiduciary:read',
  FIDUCIARY_MANAGE: 'fiduciary:manage',
  DOCUMENT_READ: 'document:read',
  DOCUMENT_WRITE: 'document:write',
  // Platform (Super Admin) permissions.
  PLATFORM_MANAGE: 'platform:manage',
  PLATFORM_BILLING: 'platform:billing',
  PLATFORM_IMPERSONATE: 'platform:impersonate',
  PLATFORM_AUDIT_READ: 'platform:audit_read',
  // Firm (fiduciaire) permissions.
  FIRM_MANAGE: 'firm:manage',
  FIRM_TEAM_MANAGE: 'firm:team_manage',
  FIRM_CLIENT_MANAGE: 'firm:client_manage',
  FIRM_BILLING: 'firm:billing',
  FIRM_ANALYTICS: 'firm:analytics',
} as const;
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Platform-role → permission matrix. Kept separate from tenant RBAC: platform
 * operations are global (they span firms), so they are asserted via
 * `assertPlatformRole` rather than the tenant `RequestContext`.
 */
export const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<PlatformRole, readonly Permission[]>> = {
  PLATFORM_OWNER: [
    'platform:manage', 'platform:billing', 'platform:impersonate', 'platform:audit_read',
  ],
  PLATFORM_ADMIN: [
    'platform:manage', 'platform:billing', 'platform:impersonate', 'platform:audit_read',
  ],
  PLATFORM_SUPPORT: ['platform:audit_read'],
};

/** Firm-role → permission matrix (inside the firm console). */
export const FIRM_ROLE_PERMISSIONS: Readonly<Record<FirmRole, readonly Permission[]>> = {
  FIRM_ADMIN: [
    'firm:manage', 'firm:team_manage', 'firm:client_manage', 'firm:billing', 'firm:analytics',
  ],
  PARTNER: ['firm:manage', 'firm:client_manage', 'firm:analytics'],
  SENIOR: ['firm:client_manage', 'firm:analytics'],
  JUNIOR: [],
  BOOKKEEPER: [],
  READONLY: [],
};

/** Authoritative role → permission matrix consumed by the RBAC helper. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  OWNER: [
    'tenant:read', 'tenant:update', 'tenant:delete',
    'member:read', 'member:manage', 'member:grant_declaration',
    'invoice:read', 'invoice:write', 'invoice:delete', 'invoice:send_peppol',
    'expense:read', 'expense:write', 'expense:delete', 'expense:approve',
    'bank:read', 'bank:write', 'bank:reconcile',
    'vat:read', 'vat:submit',
    'audit:read',
    'fiduciary:read', 'fiduciary:manage',
    'document:read', 'document:write',
  ],
  MANAGER: [
    'tenant:read',
    'member:read', 'member:grant_declaration',
    'invoice:read', 'invoice:write', 'invoice:delete', 'invoice:send_peppol',
    'expense:read', 'expense:write', 'expense:delete', 'expense:approve',
    'bank:read', 'bank:write', 'bank:reconcile',
    'vat:read',
    'audit:read',
    'fiduciary:read',
    'document:read', 'document:write',
  ],
  ACCOUNTANT_ITAA: [
    'tenant:read',
    'member:read', 'member:grant_declaration',
    'invoice:read', 'invoice:write', 'invoice:send_peppol',
    'expense:read', 'expense:write', 'expense:approve',
    'bank:read', 'bank:write', 'bank:reconcile',
    'vat:read', 'vat:submit',
    'audit:read',
    'fiduciary:read', 'fiduciary:manage',
    'document:read', 'document:write',
  ],
  AUDITOR: [
    'tenant:read',
    'member:read',
    'invoice:read',
    'expense:read',
    'bank:read',
    'vat:read',
    'audit:read',
    'fiduciary:read',
    'document:read',
  ],
  EMPLOYEE: [
    'tenant:read',
    'expense:read', 'expense:write',
    'invoice:read',
  ],
};

/* -------------------------------------------------------------------------- */
/* Value objects                                                              */
/* -------------------------------------------------------------------------- */

export interface PostalAddress {
  street: string;
  number: string;
  box?: string;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2, `BE` for Belgian entities. */
  countryCode: string;
  country: string;
}

/** A tenant bank account (Belgian IBAN, optionally CODA/PSD2 linked). */
export interface BankAccount {
  id: ID;
  label: string;
  iban: string;
  bic: string;
  bankName: string;
  currency: 'EUR';
  isPrimary: boolean;
  /** PCMN financial account, e.g. `550000` Établissements de crédit. */
  pcmnAccount: string;
  /** Febelfin CODA feed subscription active for this account. */
  codaEnabled: boolean;
  /** PSD2 / Open Banking consent identifier, when connected. */
  psd2ConsentId?: string;
  psd2ConsentExpiresAt?: ISODateTime;
  openingBalance: Money;
  currentBalance: Money;
  lastSyncedAt?: ISODateTime;
}

/** NACE-BEL 2008 activity code (5 digits) + label. */
export interface NaceBelActivity {
  code: string;
  label: string;
  isPrimary: boolean;
}

/* -------------------------------------------------------------------------- */
/* Tenant                                                                     */
/* -------------------------------------------------------------------------- */

export const TENANT_STATUSES = {
  ONBOARDING: 'onboarding',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
} as const;
export type TenantStatus = (typeof TENANT_STATUSES)[keyof typeof TENANT_STATUSES];

export const LOCALES = {
  FR_BE: 'fr-BE',
  NL_BE: 'nl-BE',
  DE_BE: 'de-BE',
  EN: 'en',
} as const;
export type Locale = (typeof LOCALES)[keyof typeof LOCALES];

/**
 * A Belgian enterprise. Root of every isolation boundary: **all** other tenant
 * data carries `tenantId` and the repository layer refuses cross-tenant reads.
 */
export interface Tenant extends BaseRecord {
  /** Commercial / legal name as registered at the BCE. */
  name: string;
  legalForm: LegalForm;
  /** Formatted BCE number, `BE 0123.456.789` (modulo-97 validated). */
  bceNumber: string;
  /** Normalised 10 digits, e.g. `0123456789` — the join key for BCE lookups. */
  bceDigits: string;
  /** VAT number, `BE0123456789`. Absent for non-assujettis. */
  vatNumber?: string;
  /** True once the VAT number is confirmed active via VIES. */
  vatNumberVerified: boolean;
  viesCheckedAt?: ISODateTime;
  /** Seat of the Registre des Personnes Morales. */
  rpmCity: RpmCity;
  /** Registered seat address (siège social). */
  registeredAddress: PostalAddress;
  /** Operational address when it differs from the registered seat. */
  operationalAddress?: PostalAddress;
  vatRegime: VatRegimeKind;
  /** Quarterly VAT prepayment (acompte) obligation — art. 19 AR n°1. */
  vatPrepaymentRequired: boolean;
  naceBelActivities: NaceBelActivity[];
  bankAccounts: BankAccount[];
  /** Peppol Participant ID, scheme 0208 (BE BCE), e.g. `0208:0123456789`. */
  peppolEndpointId?: string;
  peppolEnabled: boolean;
  peppolAccessPointName?: string;
  /** Fiscal year boundaries as `MM-DD` (Belgian default 01-01 → 12-31). */
  fiscalYearStart: string;
  fiscalYearEnd: string;
  /** Company incorporation date as published in the Moniteur Belge. */
  incorporationDate?: ISODate;
  email: string;
  phone?: string;
  website?: string;
  locale: Locale;
  status: TenantStatus;
  /** Managing accounting firm (fiduciaire). Set once the firm owns the dossier. */
  firmId?: ID;
  /** Free-form settings bag for feature flags per tenant. */
  settings: Record<string, string | number | boolean>;
}

/* -------------------------------------------------------------------------- */
/* User & Membership                                                          */
/* -------------------------------------------------------------------------- */

export const AUTH_PROVIDERS = {
  /** itsme® Belgian Digital Identity (eIDAS "high" assurance). */
  ITSME: 'itsme',
  /** Belgian eID card + card reader (CSAM). */
  EID: 'eid',
  /** Local password credentials. */
  PASSWORD: 'password',
} as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[keyof typeof AUTH_PROVIDERS];

/** Identity attributes released by the itsme® OIDC userinfo endpoint. */
export interface ItsmeIdentity {
  /** Stable itsme® subject identifier (pseudonymous, per relying party). */
  sub: string;
  givenName: string;
  familyName: string;
  /** Belgian National Register Number (RRN/NISS), 11 digits — GDPR-sensitive. */
  nationalRegisterNumber?: string;
  birthDate?: ISODate;
  /** eIDAS Level of Assurance actually reached. */
  loa: 'low' | 'substantial' | 'high';
  verifiedAt: ISODateTime;
  /** Legal-representative claim linking the person to a BCE-registered company. */
  legalRepresentativeOf?: string[];
}

export interface User extends BaseRecord {
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  displayName: string;
  phone?: string;
  locale: Locale;
  authProvider: AuthProvider;
  /** Populated after a successful itsme® authentication. */
  itsme?: ItsmeIdentity;
  /** Argon2id/bcrypt digest — never returned by the repository layer. */
  passwordHash?: string;
  /** ITAA member number when the user is a certified accountant. */
  itaaMemberNumber?: string;
  mfaEnabled: boolean;
  lastLoginAt?: ISODateTime;
  status: 'active' | 'suspended' | 'deleted';
}

/**
 * Join table binding a `User` to a `Tenant` with a role. A user may belong to
 * many tenants (typical for an ITAA accountant serving dozens of clients).
 */
export interface Membership extends TenantScoped {
  userId: UserId;
  role: Role;
  status: MembershipStatus;
  /** Extra permissions granted beyond the role matrix. */
  extraPermissions: Permission[];
  /** Permissions explicitly revoked despite the role matrix (deny wins). */
  deniedPermissions: Permission[];
  invitedByUserId?: UserId;
  invitedAt?: ISODateTime;
  acceptedAt?: ISODateTime;
  revokedAt?: ISODateTime;
  /** Mandate end date for temporary ITAA/audit engagements. */
  expiresAt?: ISODateTime;
  /** Set when the membership stems from a `FiduciaryConnection`. */
  fiduciaryConnectionId?: ID;
}

/* -------------------------------------------------------------------------- */
/* Platform & Firm entities (3-tier SaaS hierarchy)                           */
/* -------------------------------------------------------------------------- */

/** White-label branding owned by a firm. */
export interface FirmBrand {
  /** URL-safe slug used for the firm's subdomain/vanity URL. */
  slug: string;
  logoUrl?: string;
  primaryColor?: string;
  emailFooter?: string;
}

/**
 * An accounting firm (fiduciaire / boekhoudkantoor) — the SaaS customer that
 * owns many client tenants. Rows are NOT tenant-scoped: the platform is the
 * isolation owner, enforced by dedicated platform/firm repositories.
 */
export interface Firm extends BaseRecord {
  name: string;
  /** ITAA firm registration number. */
  itaaFirmNumber?: string;
  bceDigits: string;
  vatNumber?: string;
  address: PostalAddress;
  brand: FirmBrand;
  status: FirmStatus;
  planId?: ID;
  trialEndsAt?: ISODateTime;
  createdByPlatformAdminId?: UserId;
}

/** A commercial plan (subscription tier) sold to firms. */
export interface Plan extends BaseRecord {
  slug: string;
  name: string;
  /** EUR per month, 2 decimals. */
  priceMonthlyEur: number;
  /** EUR per extra dossier per month, 2 decimals. */
  pricePerDossierEur: number;
  /** Included dossiers; `null` = unlimited. */
  maxDossiers: number | null;
  maxUsers: number;
  features: string[];
  isActive: boolean;
}

/** Binds a user to a firm with a firm-scoped role. */
export interface FirmMembership extends BaseRecord {
  firmId: ID;
  userId: UserId;
  role: FirmRole;
  status: MembershipStatus;
  extraPermissions: Permission[];
  deniedPermissions: Permission[];
  invitedAt?: ISODateTime;
  acceptedAt?: ISODateTime;
}

/** The subscription a firm holds (mirrors a Stripe subscription in prod). */
export interface FirmSubscription extends BaseRecord {
  firmId: ID;
  planId: ID;
  status: SubscriptionStatus;
  currentPeriodStart?: ISODate;
  currentPeriodEnd?: ISODate;
  dossierCount: number;
  overageDossiers: number;
  providerRef?: string;
}

/** A user elevated to a platform operator role. */
export interface PlatformAdmin extends BaseRecord {
  userId: UserId;
  role: PlatformRole;
  status: 'active' | 'suspended';
}

/**
 * Append-only, hash-chained audit trail for platform-level actions (firm
 * creation, plan edits, impersonation…). Independent from the per-tenant
 * chain so a tenant can never see platform operations.
 */
export interface PlatformAuditLog {
  id: ID;
  sequence: number;
  timestamp: ISODateTime;
  actorUserId: UserId | 'system';
  actorEmail?: string;
  actorRole?: PlatformRole;
  actorIp?: string;
  userAgent?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: ID;
  entityLabel?: string;
  before: JsonValue | null;
  after: JsonValue | null;
  previousHash: Sha256Hex;
  hash: Sha256Hex;
  hashAlgorithm: 'SHA-256';
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/* Invoice & InvoiceLine                                                      */
/* -------------------------------------------------------------------------- */

export const PEPPOL_STATUSES = {
  NOT_SENT: 'not_sent',
  QUEUED: 'queued',
  SENT: 'sent',
  ACCEPTED: 'ACCEPTED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  FAILED: 'failed',
} as const;
export type PeppolTransmissionStatus = (typeof PEPPOL_STATUSES)[keyof typeof PEPPOL_STATUSES];

/**
 * Peppol BIS Billing 3.0 / EN 16931 transmission envelope.
 * Belgium mandates structured B2B e-invoicing from 1 January 2026.
 */
export interface PeppolMetadata {
  /** `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0` */
  customizationId: string;
  /** `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` */
  profileId: string;
  /** Sender participant ID, e.g. `0208:0123456789`. */
  senderEndpointId: string;
  senderSchemeId: string;
  /** Receiver participant ID resolved through the SML/SMP lookup. */
  receiverEndpointId: string;
  receiverSchemeId: string;
  /** UBL document type code: 380 invoice, 381 credit note. */
  documentTypeCode: '380' | '381';
  status: PeppolTransmissionStatus;
  /** AS4 message identifier returned by the Access Point. */
  messageId?: string;
  /** Business-level MLR/Invoice Response conversation id. */
  conversationId?: string;
  accessPointName?: string;
  /** SMP capability lookup outcome for the receiver. */
  smpLookupSucceeded?: boolean;
  smpLookupAt?: ISODateTime;
  sentAt?: ISODateTime;
  deliveredAt?: ISODateTime;
  /** Business response per Peppol MLR: AB acknowledged, AP accepted, RE rejected. */
  responseCode?: 'AB' | 'AP' | 'RE' | 'CA' | 'PD';
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  /** Serialized UBL 2.1 payload, retained for the legal archive. */
  ublXml?: string;
  /** SHA-256 of `ublXml`, proving the archived payload is untouched. */
  ublSha256?: Sha256Hex;
}

/** One VAT rate/regime bucket of an invoice — feeds Intervat grids. */
export interface VatBreakdownEntry {
  rate: BelgianVatRate;
  regime: BelgianVatRegime;
  /** UBL/EN 16931 tax category: S, Z, E, AE (reverse charge), K (intra-EU), G (export). */
  taxCategoryCode: 'S' | 'Z' | 'E' | 'AE' | 'K' | 'G' | 'O';
  baseAmount: Money;
  vatAmount: Money;
  /** Legal mention printed on the invoice when the VAT is not charged. */
  exemptionReason?: string;
}

export interface InvoiceLineRecord extends TenantScoped {
  invoiceId: ID;
  lineNumber: number;
  description: string;
  /** PCMN revenue account, e.g. `700000`, `705000`. */
  pcmnAccount: string;
  quantity: number;
  /** UN/ECE Rec. 20 unit code, e.g. `C62` (piece), `HUR` (hour), `DAY`. */
  unitCode: string;
  unitPrice: Money;
  discountPercent: number;
  vatRate: BelgianVatRate;
  vatRegime: BelgianVatRegime;
  totalExclVat: Money;
  vatAmount: Money;
  totalInclVat: Money;
  /** Analytical / cost-centre dimension for management reporting. */
  costCenter?: string;
}

/** Immutable log entry for every payment applied to an invoice. */
export interface PaymentLog extends TenantScoped {
  invoiceId?: ID;
  expenseId?: ID;
  paidAt: ISODateTime;
  valueDate: ISODate;
  amount: Money;
  currency: 'EUR';
  method: 'bank_transfer' | 'direct_debit' | 'card' | 'cash' | 'payconiq' | 'bancontact' | 'offset';
  /** OGM used by the payer, when structured. */
  structuredCommunication?: string;
  counterpartyIban?: string;
  counterpartyName?: string;
  /** Link to the reconciled bank transaction. */
  bankTransactionId?: ID;
  /** True for a partial settlement. */
  isPartial: boolean;
  /** Remaining balance after this payment. */
  remainingBalance: Money;
  recordedByUserId: UserId;
  note?: string;
}

/** Counterparty snapshot embedded on the invoice (immutable at issue time). */
export interface PartySnapshot {
  clientId?: ID;
  name: string;
  bceNumber: string;
  vatNumber: string;
  peppolEndpointId?: string;
  isPeppolEnabled: boolean;
  address: PostalAddress;
  email: string;
  phone?: string;
  iban?: string;
  bic?: string;
}

export interface Invoice extends TenantScoped {
  type: DocumentType;
  /** Sequential, gap-free numbering required by Belgian VAT law, e.g. `2026-0042`. */
  invoiceNumber: string;
  /** Numbering series discriminator (`INV`, `CN`, `QUO`). */
  series: string;
  sequenceNumber: number;
  fiscalYear: number;
  referenceQuoteId?: ID;
  /** For a credit note: the invoice being corrected. */
  correctsInvoiceId?: ID;
  issueDate: ISODate;
  /** Date of supply / chargeable event (date de la prestation). */
  supplyDate?: ISODate;
  dueDate: ISODate;
  paymentTermsDays: number;
  client: PartySnapshot;
  lines: InvoiceLineRecord[];
  subtotalExclVat: Money;
  discountTotal: Money;
  vatBreakdown: VatBreakdownEntry[];
  totalVatAmount: Money;
  totalInclVat: Money;
  amountPaid: Money;
  amountDue: Money;
  currency: 'EUR';
  /** Belgian structured communication, `+++123/4567/89012+++`. */
  structuredCommunication: string;
  /** Raw 12 digits of the OGM — the reconciliation index key. */
  ogmDigits: string;
  status: InvoiceStatus;
  peppol?: PeppolMetadata;
  paymentLogs: PaymentLog[];
  /** Late-payment interest regime — loi du 02/08/2002 on B2B payment delays. */
  latePaymentInterestRate?: number;
  latePaymentFixedFee?: Money;
  remindersSent: number;
  lastReminderAt?: ISODateTime;
  notes?: string;
  /** PDF archive reference + digest for the 10-year retention duty. */
  pdfStorageKey?: string;
  pdfSha256?: Sha256Hex;
  sentAt?: ISODateTime;
  paidAt?: ISODateTime;
  cancelledAt?: ISODateTime;
  createdByUserId: UserId;
  /** Set once exported to the fiduciary's bookkeeping package. */
  exportedToFiduciaryAt?: ISODateTime;
  /** Locked rows are immutable: the accounting period is closed. */
  isLocked: boolean;
}

/* -------------------------------------------------------------------------- */
/* PurchaseExpense & ExpenseReceipt                                           */
/* -------------------------------------------------------------------------- */

/**
 * Belgian fiscal deductibility percentages (CIR92 art. 53, 66).
 * Car costs follow the CO₂ gramme-based formula since 2020.
 */
export const DEDUCTIBILITY_RATES = {
  /** Ordinary professional expense. */
  FULL: 100,
  /** Vehicle costs — legacy flat rate, superseded by the CO₂ formula. */
  VEHICLE: 75,
  /** Restaurant expenses — art. 53, 8°bis. */
  RESTAURANT: 69,
  /** Business gifts & reception costs — art. 53, 8°. */
  RECEPTION: 50,
  /** Fines, penalties, non-professional share. */
  NONE: 0,
} as const;
export type DeductibilityRate = (typeof DEDUCTIBILITY_RATES)[keyof typeof DEDUCTIBILITY_RATES];

/** OCR extraction envelope produced by the receipt scanning pipeline. */
export interface OcrMetadata {
  engine: string;
  engineVersion: string;
  processedAt: ISODateTime;
  /** Global confidence 0..1. */
  confidence: number;
  /** Per-field confidences 0..1. */
  fieldConfidence: {
    supplierName?: number;
    supplierBce?: number;
    invoiceNumber?: number;
    date?: number;
    totalInclVat?: number;
    vatAmount?: number;
    structuredCommunication?: number;
  };
  supplierRecognized: boolean;
  bceValidated: boolean;
  vatDetected?: Money;
  /** Raw OCR text, kept for re-parsing without re-scanning. */
  rawText?: string;
  /** Fields a human corrected after extraction. */
  manuallyCorrectedFields: string[];
  /** True when a human validated the extraction. */
  humanReviewed: boolean;
  reviewedByUserId?: UserId;
  reviewedAt?: ISODateTime;
}

export interface ExpenseReceipt extends TenantScoped {
  expenseId?: ID;
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** Object-storage key (S3/Blob) or IndexedDB blob key. */
  storageKey: string;
  /** SHA-256 of the binary — integrity proof for the fiscal archive. */
  sha256: Sha256Hex;
  /** Original upload channel. */
  source: 'upload' | 'email_inbox' | 'mobile_scan' | 'peppol' | 'fiduciary';
  uploadedByUserId: UserId;
  uploadedAt: ISODateTime;
  ocr?: OcrMetadata;
  /** Pipeline state of the document. */
  processingStatus: 'pending' | 'processing' | 'extracted' | 'matched' | 'failed';
  processingError?: string;
  pageCount?: number;
}

export interface PurchaseExpense extends TenantScoped {
  supplierName: string;
  supplierBce: string;
  supplierVatNumber?: string;
  supplierIban?: string;
  supplierAddress?: PostalAddress;
  /** Supplier's own document number. */
  invoiceNumber: string;
  /** Internal sequential booking number in the purchase journal. */
  bookingNumber?: string;
  invoiceDate: ISODate;
  dueDate: ISODate;
  fiscalYear: number;
  /** VAT period this expense is deducted in, `2026-Q1` or `2026-03`. */
  vatPeriod: string;
  category: string;
  /** PCMN charge/asset account, e.g. `611000`, `614100`, `240000`. */
  pcmnAccount: string;
  description: string;
  amountExclVat: Money;
  vatRate: BelgianVatRate;
  vatRegime: BelgianVatRegime;
  vatAmount: Money;
  amountInclVat: Money;
  currency: 'EUR';
  /** Income-tax deductibility of the charge, 0..100 (CIR92). */
  deductibilityRate: number;
  /** Share of input VAT recoverable, 0..100 (Code TVA art. 45 — 50 % cap on cars). */
  deductibleVatRate: number;
  deductibleAmount: Money;
  nonDeductibleAmount: Money;
  deductibleVat: Money;
  /** Non-deductible VAT — booked as an extra charge, not recovered from the State. */
  nonDeductibleVat: Money;
  /** CO₂-based car deductibility inputs, when applicable. */
  vehicleCo2Grams?: number;
  vehicleFuelType?: 'diesel' | 'petrol' | 'hybrid' | 'electric' | 'lpg' | 'cng';
  /** True for capital expenditure to be depreciated (grid 83). */
  isInvestment: boolean;
  depreciationYears?: number;
  /** True when the reverse charge applies (art. 20 AR n°1 / intra-EU acquisition). */
  isReverseCharge: boolean;
  structuredCommunication?: string;
  ogmDigits?: string;
  status: PurchaseStatus;
  amountPaid: Money;
  amountDue: Money;
  paymentLogs: PaymentLog[];
  receipts: ExpenseReceipt[];
  /** Convenience mirror of the primary receipt's OCR block. */
  ocr?: OcrMetadata;
  approvedByUserId?: UserId;
  approvedAt?: ISODateTime;
  createdByUserId: UserId;
  exportedToFiduciaryAt?: ISODateTime;
  isLocked: boolean;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* BankStatement & BankTransaction (CODA / CAMT.053)                          */
/* -------------------------------------------------------------------------- */

/**
 * Febelfin CODA v2.x record types.
 * `0` header, `1` old balance, `2.1/2.2/2.3` movement lines,
 * `3.1/3.2/3.3` information lines, `4` free communication,
 * `8` new balance, `9` trailer.
 */
export const CODA_RECORD_TYPES = {
  HEADER: '0',
  OLD_BALANCE: '1',
  MOVEMENT_1: '2.1',
  MOVEMENT_2: '2.2',
  MOVEMENT_3: '2.3',
  INFORMATION_1: '3.1',
  INFORMATION_2: '3.2',
  INFORMATION_3: '3.3',
  FREE_COMMUNICATION: '4',
  NEW_BALANCE: '8',
  TRAILER: '9',
} as const;
export type CodaRecordType = (typeof CODA_RECORD_TYPES)[keyof typeof CODA_RECORD_TYPES];

export const STATEMENT_FORMATS = {
  CODA: 'CODA',
  CAMT053: 'CAMT.053',
  MT940: 'MT940',
  CSV: 'CSV',
  MANUAL: 'MANUAL',
} as const;
export type StatementFormat = (typeof STATEMENT_FORMATS)[keyof typeof STATEMENT_FORMATS];

/** Parsed CODA header (record type 0). */
export interface CodaHeaderRecord {
  recordType: '0';
  creationDate: ISODate;
  /** Bank identification number (3 digits). */
  bankIdentificationNumber: string;
  /** Duplicate flag `D`. */
  isDuplicate: boolean;
  /** Account holder reference / file reference. */
  fileReference: string;
  addressee: string;
  bic?: string;
  /** Company BCE number carried in the header. */
  accountHolderBce?: string;
  /** Transaction reference of the sending bank. */
  transactionReference?: string;
  relatedReference?: string;
  versionCode: string;
}

/** Parsed CODA balance records (types 1 and 8). */
export interface CodaBalanceRecord {
  recordType: '1' | '8';
  /** Statement sequence number for the account. */
  statementSequenceNumber: string;
  accountNumber: string;
  currency: string;
  countryCode: string;
  /** Signed balance in EUR. */
  balance: Money;
  balanceDate: ISODate;
  accountHolderName?: string;
  accountDescription?: string;
}

/** Parsed CODA trailer (record type 9) with control totals. */
export interface CodaTrailerRecord {
  recordType: '9';
  numberOfRecords: number;
  debitTotal: Money;
  creditTotal: Money;
  /** True when the recomputed totals match the trailer. */
  controlTotalsMatch: boolean;
}

/** Movement detail lines 2.1 / 2.2 / 2.3 kept verbatim for auditability. */
export interface CodaMovementRecord {
  recordType: '2.1' | '2.2' | '2.3';
  sequenceNumber: number;
  detailNumber: number;
  /** `0` normal, `1` globalisation. */
  globalisationCode?: string;
  /** Bank transaction code: family + transaction + category (Febelfin). */
  transactionCode?: string;
  transactionFamily?: string;
  /** Communication structure flag: `0` free, `1` structured. */
  communicationType?: '0' | '1';
  /** Structured communication type, `101` = Belgian OGM. */
  structuredCommunicationType?: string;
  /** Raw 128-char CODA line, retained unaltered. */
  rawLine: string;
}

/** ISO 20022 CAMT.053 envelope metadata. */
export interface Camt053Metadata {
  /** `<GrpHdr><MsgId>` */
  messageId: string;
  creationDateTime: ISODateTime;
  /** `<Stmt><Id>` */
  statementId: string;
  electronicSequenceNumber?: number;
  legalSequenceNumber?: number;
  fromDateTime: ISODateTime;
  toDateTime: ISODateTime;
  /** Namespace actually parsed, e.g. `urn:iso:std:iso:20022:tech:xsd:camt.053.001.02`. */
  namespace: string;
  /** `<Ntry><BkTxCd><Domn>` domain/family/subfamily codes. */
  bankTransactionDomain?: string;
}

export const RECONCILIATION_METHODS = {
  /** OGM matched exactly against the invoice index. */
  OGM_EXACT: 'OGM_EXACT',
  /** Amount + counterparty name heuristic. */
  AMOUNT_NAME_MATCH: 'AMOUNT_NAME_MATCH',
  /** Amount + IBAN heuristic. */
  AMOUNT_IBAN_MATCH: 'AMOUNT_IBAN_MATCH',
  /** Free-text communication contained the invoice number. */
  REFERENCE_MATCH: 'REFERENCE_MATCH',
  MANUAL: 'MANUAL',
  /** Machine-learning suggestion accepted by a user. */
  ML_SUGGESTION: 'ML_SUGGESTION',
} as const;
export type ReconciliationMethod = (typeof RECONCILIATION_METHODS)[keyof typeof RECONCILIATION_METHODS];

export interface BankStatement extends TenantScoped {
  bankAccountId: ID;
  accountIban: string;
  accountBic?: string;
  format: StatementFormat;
  /** Statement number as issued by the bank. */
  statementNumber: string;
  sequenceNumber: number;
  statementDate: ISODate;
  periodFrom: ISODate;
  periodTo: ISODate;
  currency: 'EUR';
  openingBalance: Money;
  closingBalance: Money;
  /** Sum of credits and debits, used to verify the trailer. */
  totalCredit: Money;
  totalDebit: Money;
  transactionCount: number;
  /** Parsed CODA structure — present when `format === 'CODA'`. */
  coda?: {
    header: CodaHeaderRecord;
    oldBalance: CodaBalanceRecord;
    newBalance: CodaBalanceRecord;
    trailer: CodaTrailerRecord;
    /** Every movement line, keyed for traceability back to the raw file. */
    movements: CodaMovementRecord[];
    versionCode: string;
  };
  /** Parsed CAMT.053 structure — present when `format === 'CAMT.053'`. */
  camt053?: Camt053Metadata;
  /** Raw file payload, retained for the legal archive. */
  rawContent?: string;
  rawSha256?: Sha256Hex;
  fileName?: string;
  importedByUserId: UserId;
  importedAt: ISODateTime;
  /** True once every transaction is reconciled. */
  isFullyReconciled: boolean;
  reconciledCount: number;
  /** Guards against importing the same statement twice. */
  isDuplicateImport: boolean;
  isLocked: boolean;
}

export interface BankTransaction extends TenantScoped {
  statementId: ID;
  bankAccountId: ID;
  statementNumber: string;
  sequenceNumber: number;
  detailNumber: number;
  /** Booking date. */
  executionDate: ISODate;
  /** Value date (date valeur) driving interest calculation. */
  valutaDate: ISODate;
  /** Positive = credit (money in), negative = debit (money out). */
  amount: Money;
  currency: 'EUR';
  direction: 'credit' | 'debit';
  counterpartyName: string;
  counterpartyIban: string;
  counterpartyBic?: string;
  counterpartyAddress?: string;
  /** Free-text or structured communication as printed. */
  communication: string;
  isStructured: boolean;
  /** Formatted OGM, `+++123/4567/89012+++`. */
  structuredCommunication?: string;
  /**
   * Normalised 12-digit OGM. This is the **matching index key**: the store keeps
   * a `Map<ogmDigits, …>` so invoice reconciliation is O(1) instead of O(n).
   */
  ogmDigits?: string;
  /** Febelfin transaction code (family/transaction/category). */
  transactionCode?: string;
  transactionFamily?: string;
  /** CODA record type this movement was built from. */
  codaRecordType?: CodaRecordType;
  /** CAMT.053 `<Ntry><BkTxCd>` proprietary/domain code. */
  camtBankTransactionCode?: string;
  /** Raw source lines/XML fragment for audit traceability. */
  rawRecords?: string[];
  matchedInvoiceId?: ID;
  matchedExpenseId?: ID;
  matchedPaymentLogId?: ID;
  reconciled: boolean;
  reconciliationMethod?: ReconciliationMethod;
  /** Matcher confidence 0..1 for non-exact methods. */
  reconciliationConfidence?: number;
  reconciledByUserId?: UserId;
  reconciledAt?: ISODateTime;
  /** Suggested PCMN account for the automatic booking proposal. */
  suggestedPcmnAccount?: string;
  isLocked: boolean;
}

/* -------------------------------------------------------------------------- */
/* AuditLog — immutable Belgian legal accounting trail                        */
/* -------------------------------------------------------------------------- */

export const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  SOFT_DELETE: 'SOFT_DELETE',
  RESTORE: 'RESTORE',
  READ_SENSITIVE: 'READ_SENSITIVE',
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  EXPORT: 'EXPORT',
  PEPPOL_SEND: 'PEPPOL_SEND',
  VAT_SUBMIT: 'VAT_SUBMIT',
  RECONCILE: 'RECONCILE',
  APPROVE: 'APPROVE',
  LOCK_PERIOD: 'LOCK_PERIOD',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
  ACCESS_DENIED: 'ACCESS_DENIED',
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ENTITIES = {
  TENANT: 'Tenant',
  USER: 'User',
  MEMBERSHIP: 'Membership',
  INVOICE: 'Invoice',
  INVOICE_LINE: 'InvoiceLine',
  PAYMENT_LOG: 'PaymentLog',
  PURCHASE_EXPENSE: 'PurchaseExpense',
  EXPENSE_RECEIPT: 'ExpenseReceipt',
  BANK_STATEMENT: 'BankStatement',
  BANK_TRANSACTION: 'BankTransaction',
  FIDUCIARY_CONNECTION: 'FiduciaryConnection',
  VAT_DECLARATION: 'VatDeclaration',
  SHARED_DOCUMENT: 'SharedDocument',
  SESSION: 'Session',
  // Platform / firm (3-tier SaaS) entities.
  FIRM: 'Firm',
  FIRM_MEMBERSHIP: 'FirmMembership',
  FIRM_SUBSCRIPTION: 'FirmSubscription',
  PLAN: 'Plan',
  PLATFORM_ADMIN: 'PlatformAdmin',
  PLATFORM_AUDIT: 'PlatformAudit',
} as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[keyof typeof AUDIT_ENTITIES];

/** Arbitrary JSON snapshot value. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A single changed field, for compact diff rendering. */
export interface FieldDiff {
  field: string;
  before: JsonValue;
  after: JsonValue;
}

/**
 * Append-only audit record. Entries are chained: `hash = SHA256(prevHash || payload)`,
 * so any retro-active edit breaks every subsequent link and is detectable by
 * `verifyAuditChain()`. This satisfies the Belgian requirement of an
 * unalterable accounting trail (Livre III C.D.E., art. 315 CIR92).
 */
export interface AuditLog {
  id: ID;
  tenantId: TenantId;
  /** Monotonic position in the tenant's chain, starting at 1. */
  sequence: number;
  timestamp: ISODateTime;
  actorUserId: UserId | 'system';
  actorEmail?: string;
  actorRole?: Role;
  /** Source IP, when the platform runs server-side behind a proxy. */
  actorIp?: string;
  userAgent?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: ID;
  /** Human-readable label, e.g. the invoice number. */
  entityLabel?: string;
  /** Full snapshot before the change (`null` on CREATE). */
  before: JsonValue | null;
  /** Full snapshot after the change (`null` on DELETE). */
  after: JsonValue | null;
  /** Field-level diff derived from `before`/`after`. */
  diff: FieldDiff[];
  /** Digest of the previous entry in this tenant's chain; genesis uses 64 zeros. */
  previousHash: Sha256Hex;
  /** `SHA256(previousHash | sequence | timestamp | actor | action | entity | entityId | before | after)`. */
  hash: Sha256Hex;
  /** Algorithm tag, allowing future rotation without breaking verification. */
  hashAlgorithm: 'SHA-256';
  /** Optional free-text reason supplied by the user (required for corrections). */
  reason?: string;
  /** Correlates every log emitted within one logical operation. */
  correlationId?: string;
}

/** Result of a chain integrity verification pass. */
export interface AuditChainVerification {
  valid: boolean;
  entriesChecked: number;
  /** Entries whose recomputed hash differs from the stored one. */
  brokenAt: {
    id: ID;
    sequence: number;
    expectedHash: Sha256Hex;
    actualHash: Sha256Hex;
    reason: 'hash_mismatch' | 'broken_link' | 'sequence_gap';
  }[];
  verifiedAt: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/* FiduciaryConnection                                                        */
/* -------------------------------------------------------------------------- */

export const FIDUCIARY_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  TERMINATED: 'terminated',
} as const;
export type FiduciaryStatus = (typeof FIDUCIARY_STATUSES)[keyof typeof FIDUCIARY_STATUSES];

export const FIDUCIARY_SCOPES = {
  INVOICES_READ: 'invoices:read',
  INVOICES_WRITE: 'invoices:write',
  EXPENSES_READ: 'expenses:read',
  EXPENSES_WRITE: 'expenses:write',
  BANK_READ: 'bank:read',
  BANK_RECONCILE: 'bank:reconcile',
  VAT_PREPARE: 'vat:prepare',
  VAT_SUBMIT: 'vat:submit',
  ANNUAL_ACCOUNTS: 'annual_accounts:file',
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_WRITE: 'documents:write',
  AUDIT_READ: 'audit:read',
} as const;
export type FiduciaryScope = (typeof FIDUCIARY_SCOPES)[keyof typeof FIDUCIARY_SCOPES];

/** A document folder shared between the company and its accounting firm. */
export interface SharedDocumentFolder {
  id: ID;
  name: string;
  /** Virtual path, e.g. `/2026/Q1/achats`. */
  path: string;
  /** Storage provider backing the folder. */
  provider: 'internal' | 'sharepoint' | 'google_drive' | 'dropbox' | 'sftp';
  externalFolderId?: string;
  /** Who may write into the folder. */
  writeAccess: 'tenant' | 'fiduciary' | 'both';
  documentCount: number;
  totalSizeBytes: number;
  /** Automatic retention in years — 10 for Belgian accounting records. */
  retentionYears: number;
  lastSyncedAt?: ISODateTime;
  createdAt: ISODateTime;
}

/**
 * Mandate linking a tenant to its ITAA-registered accounting firm (fiduciaire /
 * boekhoudkantoor). The mandate defines exactly which data the firm may reach.
 */
export interface FiduciaryConnection extends TenantScoped {
  /** Registered name of the accounting firm. */
  firmName: string;
  /** ITAA firm registration number (numéro d'agrément ITAA/ITAA-erkenningsnummer). */
  itaaFirmNumber: string;
  /** BCE number of the firm itself. */
  firmBceNumber: string;
  /** ITAA quality: expert-comptable certifié, conseiller fiscal certifié, comptable. */
  itaaQuality:
    | 'expert_comptable_certifie'
    | 'conseiller_fiscal_certifie'
    | 'comptable_fiscaliste'
    | 'reviseur_entreprises_ibr';
  /** Individual ITAA member handling the file. */
  contactName: string;
  contactItaaNumber?: string;
  contactEmail: string;
  contactPhone?: string;
  firmAddress?: PostalAddress;
  /** Signed engagement letter reference (lettre de mission — mandatory since 2019). */
  engagementLetterReference: string;
  engagementLetterSignedAt?: ISODate;
  engagementLetterStorageKey?: string;
  /** Mandate validity window. */
  mandateStartDate: ISODate;
  mandateEndDate?: ISODate;
  status: FiduciaryStatus;
  /** Exactly what the firm may do inside this tenant. */
  scopes: FiduciaryScope[];
  /** Memberships auto-provisioned for the firm's staff. */
  linkedMembershipIds: ID[];
  sharedFolders: SharedDocumentFolder[];
  /** Automatic export of bookings to the firm's software. */
  autoExportEnabled: boolean;
  exportFormat?: 'winbooks' | 'exact_online' | 'yuki' | 'octopus' | 'popsy' | 'csv' | 'ubl';
  exportFrequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  lastExportAt?: ISODateTime;
  nextExportDueAt?: ISODateTime;
  /** Whether the firm files the VAT returns on the tenant's behalf via Intervat. */
  handlesVatFiling: boolean;
  handlesAnnualAccounts: boolean;
  handlesPayroll: boolean;
  /** Mandate reference registered at the SPF Finances (mandat Intervat/Biztax). */
  spfMandateReference?: string;
  approvedByUserId?: UserId;
  approvedAt?: ISODateTime;
  terminatedAt?: ISODateTime;
  terminationReason?: string;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/* SharedDocument — cabinet ↔ client document register                        */
/* -------------------------------------------------------------------------- */

/**
 * A document shared between the company and its accounting firm (GED). Metadata
 * only: the binary payload lives in object storage (S3/Blob) keyed by
 * `storageKey`, so this row stays lightweight and IndexedDB-friendly.
 */
export interface SharedDocument extends TenantScoped {
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** Free-form category, e.g. "Déclarations", "Contrats", "Reçus". */
  category: string;
  note?: string;
  uploadedByUserId: UserId;
  /** Object-storage key (or a synthetic reference in the demo). */
  storageKey: string;
}

/* -------------------------------------------------------------------------- */
/* Auth session records                                                       */
/* -------------------------------------------------------------------------- */

export interface Session extends BaseRecord {
  userId: UserId;
  /** Tenant currently selected in the UI. */
  activeTenantId?: TenantId;
  accessTokenId: ID;
  refreshTokenId: ID;
  issuedAt: ISODateTime;
  expiresAt: ISODateTime;
  provider: AuthProvider;
  /** eIDAS assurance level of the authentication event. */
  loa?: 'low' | 'substantial' | 'high';
  ipAddress?: string;
  userAgent?: string;
  revokedAt?: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/* Repository contracts                                                       */
/* -------------------------------------------------------------------------- */

/** Caller identity threaded through every repository call for RBAC + audit. */
export interface RequestContext {
  userId: UserId | 'system';
  tenantId: TenantId;
  role: Role;
  email?: string;
  /** Correlates all audit entries produced by one logical operation. */
  correlationId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ListOptions<T> {
  offset?: number;
  limit?: number;
  sortBy?: keyof T & string;
  sortDir?: 'asc' | 'desc';
  /** Include soft-deleted rows (auditors and accountants only). */
  includeDeleted?: boolean;
}

/** Fields the store manages itself and callers must not supply. */
export type ManagedFields = 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt';

/** Shape accepted when creating a tenant-scoped entity. */
export type CreateInput<T extends TenantScoped> = Omit<T, ManagedFields> &
  Partial<Pick<T, 'id'>>;

/** Shape accepted when updating a tenant-scoped entity. */
export type UpdateInput<T extends TenantScoped> = Partial<Omit<T, ManagedFields>>;

/** Generic tenant-isolated CRUD contract. Every method audits and RBAC-checks. */
export interface Repository<T extends TenantScoped> {
  findById(ctx: RequestContext, id: ID): Promise<T | null>;
  list(ctx: RequestContext, options?: ListOptions<T>): Promise<Page<T>>;
  find(ctx: RequestContext, predicate: (row: T) => boolean, options?: ListOptions<T>): Promise<Page<T>>;
  create(ctx: RequestContext, input: CreateInput<T>): Promise<T>;
  update(ctx: RequestContext, id: ID, patch: UpdateInput<T>, reason?: string): Promise<T>;
  /** Soft-delete: the row is flagged, never removed (legal retention). */
  remove(ctx: RequestContext, id: ID, reason?: string): Promise<T>;
  count(ctx: RequestContext, predicate?: (row: T) => boolean): Promise<number>;
}

export interface InvoiceRepository extends Repository<Invoice> {
  findByNumber(ctx: RequestContext, invoiceNumber: string): Promise<Invoice | null>;
  /** O(1) lookup through the OGM index — the core of bank reconciliation. */
  findByOgm(ctx: RequestContext, ogmDigits: string): Promise<Invoice | null>;
  listOverdue(ctx: RequestContext, asOf?: ISODate): Promise<Invoice[]>;
  nextInvoiceNumber(ctx: RequestContext, series: string, fiscalYear: number): Promise<string>;
  registerPayment(
    ctx: RequestContext,
    invoiceId: ID,
    payment: Omit<PaymentLog, ManagedFields | 'invoiceId' | 'remainingBalance' | 'isPartial'>,
  ): Promise<Invoice>;
  recordPeppolTransmission(ctx: RequestContext, invoiceId: ID, peppol: PeppolMetadata): Promise<Invoice>;
}

export interface PurchaseExpenseRepository extends Repository<PurchaseExpense> {
  findByOgm(ctx: RequestContext, ogmDigits: string): Promise<PurchaseExpense | null>;
  listByVatPeriod(ctx: RequestContext, vatPeriod: string): Promise<PurchaseExpense[]>;
  approve(ctx: RequestContext, expenseId: ID, reason?: string): Promise<PurchaseExpense>;
  attachReceipt(
    ctx: RequestContext,
    expenseId: ID,
    receipt: CreateInput<ExpenseReceipt>,
  ): Promise<PurchaseExpense>;
}

export interface BankTransactionRepository extends Repository<BankTransaction> {
  findByOgm(ctx: RequestContext, ogmDigits: string): Promise<BankTransaction[]>;
  listUnreconciled(ctx: RequestContext): Promise<BankTransaction[]>;
  reconcile(
    ctx: RequestContext,
    transactionId: ID,
    target: { invoiceId?: ID; expenseId?: ID },
    method: ReconciliationMethod,
    confidence?: number,
  ): Promise<BankTransaction>;
  /** Runs OGM-first auto-matching across all unreconciled rows. */
  autoReconcile(ctx: RequestContext): Promise<{ matched: number; reviewed: number }>;
}

export interface AuditLogRepository {
  append(
    ctx: RequestContext,
    entry: Omit<
      AuditLog,
      'id' | 'tenantId' | 'sequence' | 'timestamp' | 'previousHash' | 'hash' | 'hashAlgorithm' | 'diff'
    > & { diff?: FieldDiff[] },
  ): Promise<AuditLog>;
  list(ctx: RequestContext, options?: ListOptions<AuditLog>): Promise<Page<AuditLog>>;
  listForEntity(ctx: RequestContext, entity: AuditEntity, entityId: ID): Promise<AuditLog[]>;
  verifyChain(ctx: RequestContext): Promise<AuditChainVerification>;
  /** Chain head digest, cheap tamper-evidence probe. */
  latestHash(tenantId: TenantId): Promise<Sha256Hex>;
}

/** The whole persistence surface exposed to the application layer. */
export interface DatabaseStore {
  tenants: {
    findById(id: TenantId): Promise<Tenant | null>;
    findByBce(bceDigits: string): Promise<Tenant | null>;
    listForUser(userId: UserId): Promise<Tenant[]>;
    create(input: Omit<Tenant, ManagedFields> & Partial<Pick<Tenant, 'id'>>, actorUserId: UserId): Promise<Tenant>;
    update(ctx: RequestContext, patch: Partial<Omit<Tenant, ManagedFields>>, reason?: string): Promise<Tenant>;
  };
  users: {
    findById(id: UserId): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findByItsmeSub(sub: string): Promise<User | null>;
    create(input: Omit<User, ManagedFields> & Partial<Pick<User, 'id'>>): Promise<User>;
    update(id: UserId, patch: Partial<Omit<User, ManagedFields>>): Promise<User>;
  };
  memberships: {
    findById(id: ID): Promise<Membership | null>;
    listForUser(userId: UserId): Promise<Membership[]>;
    listForTenant(ctx: RequestContext): Promise<Membership[]>;
    findFor(userId: UserId, tenantId: TenantId): Promise<Membership | null>;
    create(ctx: RequestContext, input: CreateInput<Membership>): Promise<Membership>;
    update(ctx: RequestContext, id: ID, patch: UpdateInput<Membership>): Promise<Membership>;
    revoke(ctx: RequestContext, id: ID, reason?: string): Promise<Membership>;
    /**
     * Grants or revokes the client's right to file VAT returns autonomously.
     * Requires `member:grant_declaration` (OWNER/MANAGER/ACCOUNTANT_ITAA).
     */
    setSelfDeclaration(ctx: RequestContext, id: ID, grant: boolean, reason?: string): Promise<Membership>;
  };
  invoices: InvoiceRepository;
  expenses: PurchaseExpenseRepository;
  receipts: Repository<ExpenseReceipt>;
  statements: Repository<BankStatement>;
  transactions: BankTransactionRepository;
  fiduciaries: Repository<FiduciaryConnection>;
  documents: Repository<SharedDocument>;
  sessions: {
    findById(id: ID): Promise<Session | null>;
    listForUser(userId: UserId): Promise<Session[]>;
    create(input: Omit<Session, ManagedFields> & Partial<Pick<Session, 'id'>>): Promise<Session>;
    revoke(id: ID): Promise<void>;
  };
  audit: AuditLogRepository;
  /** Platform (Super Admin) repositories — global, not tenant-scoped. */
  platform: {
    /** Lists every firm (platform operators only). */
    listFirms(options?: ListOptions<Firm>): Promise<Page<Firm>>;
    findFirmById(id: ID): Promise<Firm | null>;
    findFirmBySlug(slug: string): Promise<Firm | null>;
    createFirm(input: Omit<Firm, ManagedFields> & Partial<Pick<Firm, 'id'>>, actorUserId: UserId): Promise<Firm>;
    updateFirm(id: ID, patch: Partial<Omit<Firm, ManagedFields>>, actorUserId: UserId, reason?: string): Promise<Firm>;
    setFirmStatus(id: ID, status: FirmStatus, actorUserId: UserId, reason?: string): Promise<Firm>;
    /** Counts client tenants belonging to a firm. */
    countFirmClients(firmId: ID): Promise<number>;
    listFirmClients(firmId: ID): Promise<Tenant[]>;

    listPlans(): Promise<Plan[]>;
    findPlanById(id: ID): Promise<Plan | null>;
    findPlanBySlug(slug: string): Promise<Plan | null>;
    createPlan(input: Omit<Plan, ManagedFields> & Partial<Pick<Plan, 'id'>>, actorUserId: UserId): Promise<Plan>;
    updatePlan(id: ID, patch: Partial<Omit<Plan, ManagedFields>>, actorUserId: UserId): Promise<Plan>;

    listFirmMemberships(firmId: ID): Promise<FirmMembership[]>;
    listFirmMembershipsForUser(userId: UserId): Promise<FirmMembership[]>;
    createFirmMembership(input: Omit<FirmMembership, ManagedFields> & Partial<Pick<FirmMembership, 'id'>>, actorUserId: UserId): Promise<FirmMembership>;
    updateFirmMembership(id: ID, patch: Partial<Omit<FirmMembership, ManagedFields>>, actorUserId: UserId): Promise<FirmMembership>;
    revokeFirmMembership(id: ID, actorUserId: UserId, reason?: string): Promise<FirmMembership>;

    listFirmSubscriptions(firmId: ID): Promise<FirmSubscription[]>;
    createFirmSubscription(input: Omit<FirmSubscription, ManagedFields> & Partial<Pick<FirmSubscription, 'id'>>, actorUserId: UserId): Promise<FirmSubscription>;
    updateFirmSubscription(id: ID, patch: Partial<Omit<FirmSubscription, ManagedFields>>, actorUserId: UserId): Promise<FirmSubscription>;

    /** Platform-administrator membership of a user (global role). */
    findPlatformAdminForUser(userId: UserId): Promise<PlatformAdmin | null>;
    listPlatformAdmins(): Promise<PlatformAdmin[]>;
    createPlatformAdmin(input: Omit<PlatformAdmin, ManagedFields> & Partial<Pick<PlatformAdmin, 'id'>>, actorUserId: UserId): Promise<PlatformAdmin>;
    updatePlatformAdmin(id: ID, patch: Partial<Omit<PlatformAdmin, ManagedFields>>, actorUserId: UserId): Promise<PlatformAdmin>;

    /** Hash-chained platform audit. */
    appendPlatformAudit(entry: {
      actorUserId: UserId | 'system';
      actorEmail?: string;
      actorRole?: PlatformRole;
      action: AuditAction;
      entity: AuditEntity;
      entityId: ID;
      entityLabel?: string;
      before?: JsonValue | null;
      after?: JsonValue | null;
      reason?: string;
    }): Promise<PlatformAuditLog>;
    listPlatformAudit(options?: ListOptions<PlatformAuditLog>): Promise<Page<PlatformAuditLog>>;
    verifyPlatformChain(): Promise<{ valid: boolean; entriesChecked: number; brokenAt: { sequence: number; reason: string }[] }>;
  };
  /** Flush pending writes to the configured persistence adapter. */
  flush(): Promise<void>;
  /** Load state from the persistence adapter; idempotent. */
  init(): Promise<void>;
  /** Wipe everything (test/demo only). */
  reset(): Promise<void>;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type DbErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CROSS_TENANT_ACCESS'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'PERIOD_LOCKED'
  | 'AUDIT_CHAIN_BROKEN'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED';

/** Error carrying a machine-readable code; `erasableSyntaxOnly`-safe (no param properties). */
export class DbError extends Error {
  readonly code: DbErrorCode;
  readonly details?: Record<string, JsonValue>;

  constructor(code: DbErrorCode, message: string, details?: Record<string, JsonValue>) {
    super(message);
    this.name = 'DbError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, DbError.prototype);
  }
}

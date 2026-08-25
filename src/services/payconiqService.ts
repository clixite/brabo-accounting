import QRCode from 'qrcode';
import type { Invoice, BankTransaction, CompanyProfile } from '../types/accounting';
import { generateEpcQrString } from '../utils/epcQrCode';
import { formatOGM, validateOGM } from '../utils/belgianAccounting';

/**
 * ============================================================================
 *  PAYCONIQ BY BANCONTACT — API CLIENT & SIMULATOR
 * ----------------------------------------------------------------------------
 *  Implements the Payconiq "Merchant / Payments API v3" surface used by Belgian
 *  merchants (Bancontact Payconiq Company NV/SA), including:
 *
 *   - Payment request creation (POST /v3/payments)
 *   - Deep links            payconiq://pay?t=<token>  (native app hand-off)
 *   - Universal links       https://payconiq.com/pay/2/<token>
 *   - QR payloads           https://payconiq.com/l/1/<merchantId>/<token>
 *   - EPC / SEPA QR fallback (EPC069-12) for non-Payconiq banking apps
 *   - Webhook callbacks     PAYMENT_SUCCEEDED | PAYMENT_EXPIRED | PAYMENT_CANCELLED
 *   - Instant reconciliation of the resulting bank movement against the invoice
 *
 *  This module is a deterministic *simulator*: no network calls are performed.
 *  Swap `PayconiqClient.transport` for a real `fetch` implementation to go live.
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type PayconiqEnvironment = 'EXT' | 'PROD';

export type PayconiqPaymentStatus =
  | 'PENDING'
  | 'IDENTIFIED'
  | 'AUTHORIZED'
  | 'AUTHORIZATION_FAILED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export type PayconiqWebhookEventType =
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_EXPIRED'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_FAILED';

export type PayconiqQrFormat = 'PNG' | 'SVG';
export type PayconiqQrSize = 'S' | 'M' | 'L' | 'XL';
export type PayconiqQrColor = 'magenta' | 'black';

/** Point-of-interaction: how the payer initiates the Payconiq payment. */
export type PayconiqPosProfile =
  | 'INVOICE'
  | 'ONLINE'
  | 'INSTORE'
  | 'RECEIPT'
  | 'TOP_UP';

export interface PayconiqMerchantConfig {
  /** Payconiq Merchant Profile ID (e.g. "6543210987654321fedcba98"). */
  merchantId: string;
  /** Payment Profile ID tied to the merchant's Bancontact contract. */
  paymentProfileId: string;
  /** API key issued in the Payconiq Merchant Portal (Bearer token). */
  apiKey: string;
  /** Merchant display name shown in the Payconiq app. */
  merchantName: string;
  /** Payout IBAN — the account credited by Payconiq (Belgian merchant account). */
  payoutIban: string;
  payoutBic: string;
  environment: PayconiqEnvironment;
  /** HTTPS endpoint receiving the asynchronous status callbacks. */
  callbackUrl: string;
  /** Shared secret used to sign/verify the Payconiq webhook JWS signature. */
  webhookSecret: string;
}

export interface PayconiqCreatePaymentInput {
  /** Amount in EUR (major units). Converted to cents for the API. */
  amount: number;
  /** Free-text description shown in the Payconiq app (max 140 chars). */
  description?: string;
  /** Merchant-side reference — typically the invoice number. */
  reference?: string;
  /** Belgian structured communication (OGM/VCS) `+++123/4567/89012+++`. */
  structuredCommunication?: string;
  /** Time-to-live in seconds before the request auto-expires. */
  ttlSeconds?: number;
  posProfile?: PayconiqPosProfile;
  /** Bank-app deep-link return URL after the payer completes the flow. */
  returnUrl?: string;
  /** Invoice this payment settles — enables instant reconciliation. */
  invoiceId?: string;
}

export interface PayconiqLinks {
  /** Native app deep link: `payconiq://pay?t=<token>`. */
  deeplink: string;
  /** Universal/App link opening either the app or the web checkout. */
  universalLink: string;
  /** Raw QR payload encoded inside the Payconiq QR image. */
  qrPayload: string;
  /** Hosted Payconiq QR image URL (portal-generated). */
  qrUrl: string;
  /** EPC069-12 SEPA payload for generic Belgian banking apps. */
  epcQrPayload: string;
  /** REST resource for polling the payment status. */
  selfUrl: string;
  /** REST resource for cancelling the payment. */
  cancelUrl: string;
}

export interface PayconiqPayment {
  /** Payconiq payment identifier (24 hex chars, Mongo-style ObjectId). */
  paymentId: string;
  /** Single-use payment token embedded in the deep link and QR. */
  paymentToken: string;
  merchantId: string;
  paymentProfileId: string;
  status: PayconiqPaymentStatus;
  /** Amount in cents, as returned by the Payconiq API. */
  amountInCents: number;
  /** Convenience: amount in EUR major units. */
  amount: number;
  currency: 'EUR';
  description: string;
  reference: string;
  structuredCommunication?: string;
  posProfile: PayconiqPosProfile;
  createdAt: string;
  expiresAt: string;
  succeededAt?: string;
  cancelledAt?: string;
  expiredAt?: string;
  /** Masked payer IBAN, only present once the payer is identified. */
  debtorIban?: string;
  debtorName?: string;
  creditorIban: string;
  creditorBic: string;
  creditorName: string;
  invoiceId?: string;
  links: PayconiqLinks;
}

export interface PayconiqWebhookEvent {
  /** Unique callback id — used for idempotent webhook processing. */
  eventId: string;
  eventType: PayconiqWebhookEventType;
  /** RFC3339 timestamp of the event emission. */
  timestamp: string;
  paymentId: string;
  paymentToken: string;
  status: PayconiqPaymentStatus;
  amountInCents: number;
  currency: 'EUR';
  reference: string;
  description: string;
  structuredCommunication?: string;
  debtorIban?: string;
  debtorName?: string;
  creditorIban: string;
  /** Simulated JWS detached signature (`Payconiq-Signature` header). */
  signature: string;
}

export interface PayconiqReconciliationResult {
  matched: boolean;
  method: 'PAYCONIQ_INSTANT' | 'OGM_EXACT' | 'AMOUNT_NAME_MATCH' | 'NONE';
  confidence: number;
  paymentId: string;
  invoiceId?: string;
  /** Synthetic bank movement created from the Payconiq settlement. */
  bankTransaction?: BankTransaction;
  /** Invoice with `status: 'paid'` and `paidAt` applied. */
  updatedInvoice?: Invoice;
  /** Human-readable audit trail (FR) for the reconciliation journal. */
  auditTrail: string[];
}

export interface PayconiqApiError {
  code: string;
  message: string;
  traceId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYCONIQ_BASE_URL: Record<PayconiqEnvironment, string> = {
  EXT: 'https://api.ext.payconiq.com',
  PROD: 'https://api.payconiq.com',
};

const PAYCONIQ_PORTAL_URL: Record<PayconiqEnvironment, string> = {
  EXT: 'https://portal.ext.payconiq.com',
  PROD: 'https://portal.payconiq.com',
};

/** Default time-to-live of a Payconiq invoice payment request (2 hours). */
export const PAYCONIQ_DEFAULT_TTL_SECONDS = 7200;

/** Payconiq caps a single consumer payment at 1 500,00 € (Bancontact rule). */
export const PAYCONIQ_MAX_AMOUNT_EUR = 1500;
export const PAYCONIQ_MIN_AMOUNT_EUR = 0.01;

export const DEFAULT_PAYCONIQ_CONFIG: PayconiqMerchantConfig = {
  merchantId: '6543210987654321fedcba98',
  paymentProfileId: 'a1b2c3d4e5f60718293a4b5c',
  apiKey: 'ext_sk_brabo_5f3a9c7d1e8b4a26_demo',
  merchantName: 'BRABO DIGITAL SOLUTIONS SRL',
  payoutIban: 'BE68 0012 3456 7890',
  payoutBic: 'GEBABEBB',
  environment: 'EXT',
  callbackUrl: 'https://brabo.be/api/webhooks/payconiq',
  webhookSecret: 'whsec_brabo_payconiq_demo_2026',
};

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helpers (stable simulator output)
// ---------------------------------------------------------------------------

const HEX_ALPHABET = '0123456789abcdef';
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** FNV-1a 32-bit hash — stable across runs, used to seed the simulator. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG — deterministic sequence from a numeric seed. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomFromAlphabet(rng: () => number, alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet.charAt(Math.floor(rng() * alphabet.length));
  }
  return out;
}

/** Payconiq payment ids are 24-char lowercase hex (ObjectId shaped). */
function generatePaymentId(seed: string): string {
  return randomFromAlphabet(createRng(fnv1a(`pid:${seed}`)), HEX_ALPHABET, 24);
}

/** Payconiq payment tokens are opaque high-entropy strings (~44 chars). */
function generatePaymentToken(seed: string): string {
  return randomFromAlphabet(createRng(fnv1a(`tok:${seed}`)), TOKEN_ALPHABET, 44);
}

function generateEventId(seed: string): string {
  const rng = createRng(fnv1a(`evt:${seed}`));
  const hex = (n: number) => randomFromAlphabet(rng, HEX_ALPHABET, n);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/** Simulated JWS detached signature carried in the `Payconiq-Signature` header. */
function signWebhookPayload(payload: string, secret: string): string {
  const header = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpPU0UifQ';
  const digest = fnv1a(`${secret}.${payload}`).toString(16).padStart(8, '0');
  const salt = fnv1a(`${payload}.${secret}`).toString(16).padStart(8, '0');
  const body = randomFromAlphabet(createRng(fnv1a(digest + salt)), TOKEN_ALPHABET, 43);
  return `${header}..${digest}${salt}${body}`;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toCents(amountEur: number): number {
  return Math.round((amountEur + Number.EPSILON) * 100);
}

function fromCents(cents: number): number {
  return roundCurrency(cents / 100);
}

function isoAt(base: Date, offsetSeconds: number): string {
  return new Date(base.getTime() + offsetSeconds * 1000).toISOString();
}

function cleanIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/** Masks a payer IBAN the way Payconiq does: `BE** **** **** 1234`. */
function maskIban(iban: string): string {
  const clean = cleanIban(iban);
  if (clean.length < 8) return clean;
  return `${clean.substring(0, 4)}${'*'.repeat(clean.length - 8)}${clean.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface PayconiqValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a payment request against the Payconiq / Bancontact business rules
 * before the API call is issued (fail fast, avoid a 400 round-trip).
 */
export function validatePayconiqRequest(
  input: PayconiqCreatePaymentInput
): PayconiqValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Number.isFinite(input.amount)) {
    errors.push('Le montant est invalide (valeur non numérique).');
  } else if (input.amount < PAYCONIQ_MIN_AMOUNT_EUR) {
    errors.push(`Le montant minimum Payconiq est de ${PAYCONIQ_MIN_AMOUNT_EUR.toFixed(2)} €.`);
  } else if (input.amount > PAYCONIQ_MAX_AMOUNT_EUR) {
    errors.push(
      `Le montant dépasse le plafond Payconiq by Bancontact de ${PAYCONIQ_MAX_AMOUNT_EUR.toFixed(2)} € (paiement à scinder ou virement SEPA classique).`
    );
  }

  if (input.description && input.description.length > 140) {
    warnings.push('La description dépasse 140 caractères et sera tronquée par Payconiq.');
  }

  if (input.reference && input.reference.length > 35) {
    warnings.push('La référence marchand dépasse 35 caractères et sera tronquée.');
  }

  if (input.structuredCommunication) {
    const ogmCheck = validateOGM(input.structuredCommunication);
    if (!ogmCheck.isValid) {
      errors.push(`Communication structurée invalide : ${ogmCheck.error ?? 'format inconnu'}`);
    }
  }

  if (input.ttlSeconds !== undefined) {
    if (input.ttlSeconds < 60) {
      errors.push('La durée de validité minimale d’une demande Payconiq est de 60 secondes.');
    } else if (input.ttlSeconds > 86400) {
      warnings.push('Payconiq limite généralement la validité d’une facture à 24 heures.');
    }
  }

  if (input.returnUrl && !input.returnUrl.startsWith('https://')) {
    errors.push('L’URL de retour doit utiliser le protocole HTTPS.');
  }

  return { isValid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// Link / QR builders
// ---------------------------------------------------------------------------

/**
 * Builds the Payconiq native deep link: `payconiq://pay?t=<token>`.
 * Opening this URL hands the payment over to the Payconiq / Bancontact app.
 */
export function buildPayconiqDeepLink(paymentToken: string, returnUrl?: string): string {
  const base = `payconiq://pay?t=${encodeURIComponent(paymentToken)}`;
  return returnUrl ? `${base}&returnUrl=${encodeURIComponent(returnUrl)}` : base;
}

/**
 * Builds the Payconiq universal link, which opens the app when installed and
 * falls back to the hosted web checkout otherwise.
 */
export function buildPayconiqUniversalLink(
  paymentToken: string,
  environment: PayconiqEnvironment = 'EXT'
): string {
  const host = environment === 'PROD' ? 'payconiq.com' : 'ext.payconiq.com';
  return `https://${host}/pay/2/${encodeURIComponent(paymentToken)}`;
}

/**
 * Builds the raw payload encoded inside a Payconiq QR code.
 * Scanning it with any Belgian banking app routes to the Payconiq checkout.
 */
export function buildPayconiqQrPayload(
  merchantId: string,
  paymentToken: string,
  environment: PayconiqEnvironment = 'EXT'
): string {
  const host = environment === 'PROD' ? 'payconiq.com' : 'ext.payconiq.com';
  return `https://${host}/l/1/${encodeURIComponent(merchantId)}/${encodeURIComponent(paymentToken)}`;
}

export interface PayconiqQrOptions {
  format?: PayconiqQrFormat;
  size?: PayconiqQrSize;
  color?: PayconiqQrColor;
}

/**
 * Builds the hosted Payconiq QR image URL (`portal.payconiq.com/qrcode?...`),
 * matching the branded magenta Payconiq QR used on Belgian invoices.
 */
export function buildPayconiqQrUrl(
  qrPayload: string,
  environment: PayconiqEnvironment = 'EXT',
  options: PayconiqQrOptions = {}
): string {
  const params = new URLSearchParams({
    c: qrPayload,
    f: options.format ?? 'PNG',
    s: options.size ?? 'L',
    cl: options.color ?? 'magenta',
  });
  return `${PAYCONIQ_PORTAL_URL[environment]}/qrcode?${params.toString()}`;
}

/**
 * Renders the Payconiq QR locally as a Base64 PNG data URL, so invoices and
 * PDFs stay renderable offline (no dependency on the Payconiq portal CDN).
 */
export async function generatePayconiqQrDataUrl(
  payment: PayconiqPayment,
  size = 220
): Promise<string> {
  return await QRCode.toDataURL(payment.links.qrPayload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: size,
    color: { dark: '#FF4785', light: '#ffffff' },
  });
}

// ---------------------------------------------------------------------------
// Payconiq client / simulator
// ---------------------------------------------------------------------------

export class PayconiqService {
  private readonly config: PayconiqMerchantConfig;
  private readonly payments = new Map<string, PayconiqPayment>();
  private readonly tokenIndex = new Map<string, string>();
  private readonly processedEvents = new Set<string>();
  private sequence = 0;

  constructor(config: Partial<PayconiqMerchantConfig> = {}) {
    this.config = { ...DEFAULT_PAYCONIQ_CONFIG, ...config };
  }

  /** Base REST URL of the targeted Payconiq environment. */
  get baseUrl(): string {
    return PAYCONIQ_BASE_URL[this.config.environment];
  }

  /** Headers a real `fetch` call would carry (Bearer + idempotency). */
  buildRequestHeaders(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return headers;
  }

  /**
   * Creates a Payconiq payment request (simulates `POST /v3/payments`).
   * Returns a fully-linked payment: deep link, universal link, QR and EPC QR.
   */
  createPayment(input: PayconiqCreatePaymentInput, now: Date = new Date()): PayconiqPayment {
    const validation = validatePayconiqRequest(input);
    if (!validation.isValid) {
      throw new Error(`Payconiq — requête refusée : ${validation.errors.join(' | ')}`);
    }

    this.sequence += 1;
    const seed = `${this.config.merchantId}:${input.reference ?? 'no-ref'}:${toCents(input.amount)}:${this.sequence}`;

    const paymentId = generatePaymentId(seed);
    const paymentToken = generatePaymentToken(seed);
    const ttl = input.ttlSeconds ?? PAYCONIQ_DEFAULT_TTL_SECONDS;
    const amountInCents = toCents(input.amount);

    const structured = input.structuredCommunication
      ? formatOGM(input.structuredCommunication)
      : undefined;

    const description = (input.description ?? `Facture ${input.reference ?? ''}`.trim()).substring(0, 140);
    const reference = (input.reference ?? paymentId).substring(0, 35);

    const qrPayload = buildPayconiqQrPayload(this.config.merchantId, paymentToken, this.config.environment);

    const epcQrPayload = generateEpcQrString({
      bic: this.config.payoutBic,
      name: this.config.merchantName,
      iban: this.config.payoutIban,
      amount: fromCents(amountInCents),
      structuredCommunication: structured,
      unstructuredCommunication: structured ? undefined : description,
      information: 'Payconiq by Bancontact',
    });

    const payment: PayconiqPayment = {
      paymentId,
      paymentToken,
      merchantId: this.config.merchantId,
      paymentProfileId: this.config.paymentProfileId,
      status: 'PENDING',
      amountInCents,
      amount: fromCents(amountInCents),
      currency: 'EUR',
      description,
      reference,
      structuredCommunication: structured,
      posProfile: input.posProfile ?? 'INVOICE',
      createdAt: now.toISOString(),
      expiresAt: isoAt(now, ttl),
      creditorIban: this.config.payoutIban,
      creditorBic: this.config.payoutBic,
      creditorName: this.config.merchantName,
      invoiceId: input.invoiceId,
      links: {
        deeplink: buildPayconiqDeepLink(paymentToken, input.returnUrl),
        universalLink: buildPayconiqUniversalLink(paymentToken, this.config.environment),
        qrPayload,
        qrUrl: buildPayconiqQrUrl(qrPayload, this.config.environment),
        epcQrPayload,
        selfUrl: `${this.baseUrl}/v3/payments/${paymentId}`,
        cancelUrl: `${this.baseUrl}/v3/payments/${paymentId}`,
      },
    };

    this.payments.set(paymentId, payment);
    this.tokenIndex.set(paymentToken, paymentId);
    return payment;
  }

  /** Creates a Payconiq request directly from a BRABO invoice. */
  createPaymentForInvoice(
    invoice: Invoice,
    company?: CompanyProfile,
    now: Date = new Date()
  ): PayconiqPayment {
    if (company) {
      this.config.merchantName = company.name;
      this.config.payoutIban = company.iban;
      this.config.payoutBic = company.bic;
    }
    return this.createPayment(
      {
        amount: invoice.totalInclVat,
        description: `${invoice.type === 'credit_note' ? 'Note de crédit' : 'Facture'} ${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        structuredCommunication: invoice.structuredCommunication,
        posProfile: 'INVOICE',
        invoiceId: invoice.id,
      },
      now
    );
  }

  /** Simulates `GET /v3/payments/{paymentId}`. */
  getPayment(paymentId: string): PayconiqPayment | undefined {
    return this.payments.get(paymentId);
  }

  getPaymentByToken(paymentToken: string): PayconiqPayment | undefined {
    const id = this.tokenIndex.get(paymentToken);
    return id ? this.payments.get(id) : undefined;
  }

  listPayments(): PayconiqPayment[] {
    return Array.from(this.payments.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Expires any pending payment whose TTL elapsed and emits the matching
   * `PAYMENT_EXPIRED` callbacks — mirrors the Payconiq server-side sweeper.
   */
  sweepExpiredPayments(now: Date = new Date()): PayconiqWebhookEvent[] {
    const events: PayconiqWebhookEvent[] = [];
    for (const payment of this.payments.values()) {
      const isOpen = payment.status === 'PENDING' || payment.status === 'IDENTIFIED';
      if (isOpen && new Date(payment.expiresAt).getTime() <= now.getTime()) {
        events.push(this.simulateExpiry(payment.paymentId, new Date(payment.expiresAt)));
      }
    }
    return events;
  }

  // -------------------------------------------------------------------------
  // Lifecycle simulation → webhook events
  // -------------------------------------------------------------------------

  /**
   * Simulates a successful payer authorisation and emits `PAYMENT_SUCCEEDED`.
   */
  simulateSuccess(
    paymentId: string,
    payer: { name: string; iban: string } = { name: 'JAN JANSSENS', iban: 'BE72 0630 1234 5678' },
    now: Date = new Date()
  ): PayconiqWebhookEvent {
    const payment = this.requirePayment(paymentId);
    this.assertOpen(payment);

    payment.status = 'SUCCEEDED';
    payment.succeededAt = now.toISOString();
    payment.debtorName = payer.name;
    payment.debtorIban = maskIban(payer.iban);

    return this.emitWebhook(payment, 'PAYMENT_SUCCEEDED', now);
  }

  /** Simulates TTL exhaustion and emits `PAYMENT_EXPIRED`. */
  simulateExpiry(paymentId: string, now: Date = new Date()): PayconiqWebhookEvent {
    const payment = this.requirePayment(paymentId);
    this.assertOpen(payment);

    payment.status = 'EXPIRED';
    payment.expiredAt = now.toISOString();

    return this.emitWebhook(payment, 'PAYMENT_EXPIRED', now);
  }

  /** Simulates a payer- or merchant-side cancellation → `PAYMENT_CANCELLED`. */
  simulateCancellation(paymentId: string, now: Date = new Date()): PayconiqWebhookEvent {
    const payment = this.requirePayment(paymentId);
    this.assertOpen(payment);

    payment.status = 'CANCELLED';
    payment.cancelledAt = now.toISOString();

    return this.emitWebhook(payment, 'PAYMENT_CANCELLED', now);
  }

  /** Simulates a bank refusal (insufficient funds, limit) → `PAYMENT_FAILED`. */
  simulateFailure(paymentId: string, now: Date = new Date()): PayconiqWebhookEvent {
    const payment = this.requirePayment(paymentId);
    this.assertOpen(payment);

    payment.status = 'FAILED';
    return this.emitWebhook(payment, 'PAYMENT_FAILED', now);
  }

  /** Simulates `DELETE /v3/payments/{paymentId}` (merchant cancels the request). */
  cancelPayment(paymentId: string, now: Date = new Date()): PayconiqWebhookEvent {
    return this.simulateCancellation(paymentId, now);
  }

  private requirePayment(paymentId: string): PayconiqPayment {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error(`Payconiq — paiement introuvable : ${paymentId}`);
    }
    return payment;
  }

  private assertOpen(payment: PayconiqPayment): void {
    const isOpen =
      payment.status === 'PENDING' ||
      payment.status === 'IDENTIFIED' ||
      payment.status === 'AUTHORIZED';
    if (!isOpen) {
      throw new Error(
        `Payconiq — transition impossible : le paiement ${payment.paymentId} est déjà au statut ${payment.status}.`
      );
    }
  }

  private emitWebhook(
    payment: PayconiqPayment,
    eventType: PayconiqWebhookEventType,
    now: Date
  ): PayconiqWebhookEvent {
    const timestamp = now.toISOString();
    const eventId = generateEventId(`${payment.paymentId}:${eventType}:${timestamp}`);

    const body = JSON.stringify({
      paymentId: payment.paymentId,
      status: payment.status,
      amount: payment.amountInCents,
      eventType,
      timestamp,
    });

    return {
      eventId,
      eventType,
      timestamp,
      paymentId: payment.paymentId,
      paymentToken: payment.paymentToken,
      status: payment.status,
      amountInCents: payment.amountInCents,
      currency: 'EUR',
      reference: payment.reference,
      description: payment.description,
      structuredCommunication: payment.structuredCommunication,
      debtorIban: payment.debtorIban,
      debtorName: payment.debtorName,
      creditorIban: payment.creditorIban,
      signature: signWebhookPayload(body, this.config.webhookSecret),
    };
  }

  // -------------------------------------------------------------------------
  // Webhook intake + instant reconciliation
  // -------------------------------------------------------------------------

  /** Verifies the simulated `Payconiq-Signature` header of an inbound webhook. */
  verifyWebhookSignature(event: PayconiqWebhookEvent): boolean {
    const body = JSON.stringify({
      paymentId: event.paymentId,
      status: event.status,
      amount: event.amountInCents,
      eventType: event.eventType,
      timestamp: event.timestamp,
    });
    return signWebhookPayload(body, this.config.webhookSecret) === event.signature;
  }

  /**
   * Handles an inbound Payconiq webhook end-to-end:
   *  1. verifies the JWS signature,
   *  2. enforces idempotency (Payconiq retries callbacks up to 5 times),
   *  3. on `PAYMENT_SUCCEEDED`, books the movement and reconciles the invoice.
   */
  handleWebhook(
    event: PayconiqWebhookEvent,
    invoices: Invoice[] = [],
    now: Date = new Date()
  ): PayconiqReconciliationResult {
    const auditTrail: string[] = [];

    if (!this.verifyWebhookSignature(event)) {
      auditTrail.push('❌ Signature JWS Payconiq invalide — callback rejeté.');
      return {
        matched: false,
        method: 'NONE',
        confidence: 0,
        paymentId: event.paymentId,
        auditTrail,
      };
    }
    auditTrail.push(`✅ Signature JWS vérifiée (event ${event.eventId}).`);

    if (this.processedEvents.has(event.eventId)) {
      auditTrail.push('♻️ Callback déjà traité — ignoré par idempotence.');
      return {
        matched: false,
        method: 'NONE',
        confidence: 0,
        paymentId: event.paymentId,
        auditTrail,
      };
    }
    this.processedEvents.add(event.eventId);

    const payment = this.payments.get(event.paymentId);
    if (payment) {
      payment.status = event.status;
    }

    if (event.eventType !== 'PAYMENT_SUCCEEDED') {
      const reason =
        event.eventType === 'PAYMENT_EXPIRED'
          ? 'Demande de paiement expirée (délai dépassé) — facture toujours ouverte.'
          : event.eventType === 'PAYMENT_CANCELLED'
            ? 'Paiement annulé par le payeur — facture toujours ouverte.'
            : 'Paiement refusé par la banque du payeur — facture toujours ouverte.';
      auditTrail.push(`⚠️ ${event.eventType} : ${reason}`);
      return {
        matched: false,
        method: 'NONE',
        confidence: 0,
        paymentId: event.paymentId,
        invoiceId: payment?.invoiceId,
        auditTrail,
      };
    }

    return this.reconcileSucceededPayment(event, payment, invoices, now, auditTrail);
  }

  /**
   * Instant reconciliation: converts a succeeded Payconiq payment into a
   * `BankTransaction` and flags the matching invoice as paid.
   *
   * Matching cascade:
   *   1. explicit `invoiceId` captured at payment creation  → 100 %
   *   2. structured communication (OGM) exact match         →  99 %
   *   3. invoice number carried in the merchant reference   →  95 %
   *   4. unique amount match on an open invoice             →  78 %
   */
  private reconcileSucceededPayment(
    event: PayconiqWebhookEvent,
    payment: PayconiqPayment | undefined,
    invoices: Invoice[],
    now: Date,
    auditTrail: string[]
  ): PayconiqReconciliationResult {
    const amount = fromCents(event.amountInCents);
    auditTrail.push(`💶 Paiement Payconiq confirmé : ${amount.toFixed(2)} € de ${event.debtorName ?? 'payeur inconnu'}.`);

    let matchedInvoice: Invoice | undefined;
    let confidence = 0;
    let method: PayconiqReconciliationResult['method'] = 'NONE';

    const linkedId = payment?.invoiceId;
    if (linkedId) {
      matchedInvoice = invoices.find((inv) => inv.id === linkedId);
      if (matchedInvoice) {
        confidence = 100;
        method = 'PAYCONIQ_INSTANT';
        auditTrail.push(`🔗 Rapprochement direct via le lien Payconiq → facture ${matchedInvoice.invoiceNumber}.`);
      }
    }

    if (!matchedInvoice && event.structuredCommunication) {
      const target = event.structuredCommunication.replace(/[^0-9]/g, '');
      matchedInvoice = invoices.find(
        (inv) => inv.structuredCommunication.replace(/[^0-9]/g, '') === target
      );
      if (matchedInvoice) {
        confidence = 99;
        method = 'OGM_EXACT';
        auditTrail.push(`🎯 Communication structurée ${event.structuredCommunication} → facture ${matchedInvoice.invoiceNumber}.`);
      }
    }

    if (!matchedInvoice && event.reference) {
      matchedInvoice = invoices.find((inv) => inv.invoiceNumber === event.reference);
      if (matchedInvoice) {
        confidence = 95;
        method = 'PAYCONIQ_INSTANT';
        auditTrail.push(`🧾 Référence marchand "${event.reference}" → facture ${matchedInvoice.invoiceNumber}.`);
      }
    }

    if (!matchedInvoice) {
      const candidates = invoices.filter(
        (inv) =>
          inv.type !== 'quote' &&
          inv.status !== 'paid' &&
          inv.status !== 'cancelled' &&
          Math.abs(inv.totalInclVat - amount) < 0.01
      );
      if (candidates.length === 1) {
        matchedInvoice = candidates[0];
        confidence = 78;
        method = 'AMOUNT_NAME_MATCH';
        auditTrail.push(`≈ Montant unique ${amount.toFixed(2)} € → facture ${matchedInvoice.invoiceNumber} (à confirmer).`);
      } else if (candidates.length > 1) {
        auditTrail.push(`❓ ${candidates.length} factures ouvertes au même montant — rapprochement manuel requis.`);
      }
    }

    const bankTransaction: BankTransaction = {
      id: `pcq-${event.paymentId.substring(0, 12)}`,
      statementNumber: 'PCQ',
      date: event.timestamp.substring(0, 10),
      valutaDate: event.timestamp.substring(0, 10),
      amount,
      currency: 'EUR',
      counterpartyName: event.debtorName ?? 'Payconiq by Bancontact',
      counterpartyIban: event.debtorIban ?? 'BE** **** **** ****',
      counterpartyBic: 'PCQBBEBB',
      communication:
        event.structuredCommunication ?? `Payconiq ${event.reference} — ${event.description}`,
      isStructured: Boolean(event.structuredCommunication),
      structuredCommunication: event.structuredCommunication,
      matchedInvoiceId: matchedInvoice?.id,
      reconciled: Boolean(matchedInvoice) && confidence >= 95,
      reconciliationMethod:
        method === 'PAYCONIQ_INSTANT'
          ? 'OGM_EXACT'
          : method === 'NONE'
            ? undefined
            : method,
    };

    let updatedInvoice: Invoice | undefined;
    if (matchedInvoice && confidence >= 95) {
      updatedInvoice = {
        ...matchedInvoice,
        status: 'paid',
        paidAt: now.toISOString(),
      };
      auditTrail.push(`🏦 Écriture générée : 550000 Banque / 400000 Clients — ${amount.toFixed(2)} € (lettrage instantané).`);
      auditTrail.push(`✔️ Facture ${matchedInvoice.invoiceNumber} passée au statut "payée".`);
    } else if (matchedInvoice) {
      auditTrail.push('🕵️ Rapprochement proposé sous le seuil de 95 % — validation utilisateur nécessaire.');
    } else {
      auditTrail.push('📥 Mouvement enregistré en attente d’affectation (compte 499000 — à imputer).');
    }

    return {
      matched: Boolean(matchedInvoice),
      method,
      confidence,
      paymentId: event.paymentId,
      invoiceId: matchedInvoice?.id,
      bankTransaction,
      updatedInvoice,
      auditTrail,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Shared singleton used by the BRABO UI layer. */
export const payconiqService = new PayconiqService();

/** Human-readable, localisable label for a Payconiq status (FR). */
export function describePayconiqStatus(status: PayconiqPaymentStatus): string {
  switch (status) {
    case 'PENDING':
      return 'En attente de scan';
    case 'IDENTIFIED':
      return 'Payeur identifié';
    case 'AUTHORIZED':
      return 'Autorisé par la banque';
    case 'AUTHORIZATION_FAILED':
      return 'Autorisation refusée';
    case 'SUCCEEDED':
      return 'Paiement réussi';
    case 'FAILED':
      return 'Paiement échoué';
    case 'CANCELLED':
      return 'Annulé par le payeur';
    case 'EXPIRED':
      return 'Demande expirée';
    default:
      return 'Statut inconnu';
  }
}

/** Remaining validity of a payment request, in whole seconds (never negative). */
export function getPayconiqTimeToLive(payment: PayconiqPayment, now: Date = new Date()): number {
  const remaining = Math.floor((new Date(payment.expiresAt).getTime() - now.getTime()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Full happy-path demo: creates the request, simulates the payer's scan and
 * returns the payment, the webhook event and the reconciliation outcome.
 * Used by the "Payconiq sandbox" training screen.
 */
export function simulatePayconiqRoundTrip(
  invoice: Invoice,
  company: CompanyProfile,
  outcome: 'SUCCEEDED' | 'EXPIRED' | 'CANCELLED' = 'SUCCEEDED',
  now: Date = new Date()
): {
  payment: PayconiqPayment;
  event: PayconiqWebhookEvent;
  reconciliation: PayconiqReconciliationResult;
} {
  const service = new PayconiqService({
    merchantName: company.name,
    payoutIban: company.iban,
    payoutBic: company.bic,
  });

  const payment = service.createPaymentForInvoice(invoice, company, now);
  const settledAt = new Date(now.getTime() + 42_000);

  const event =
    outcome === 'SUCCEEDED'
      ? service.simulateSuccess(
          payment.paymentId,
          { name: invoice.client.name.toUpperCase(), iban: invoice.client.iban ?? 'BE72 0630 1234 5678' },
          settledAt
        )
      : outcome === 'EXPIRED'
        ? service.simulateExpiry(payment.paymentId, settledAt)
        : service.simulateCancellation(payment.paymentId, settledAt);

  const reconciliation = service.handleWebhook(event, [invoice], settledAt);

  return { payment, event, reconciliation };
}

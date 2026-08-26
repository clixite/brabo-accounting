-- BRABO — Belgian Accounting Platform
-- PostgreSQL schema (multi-tenant, mirrors src/server/types/db.ts)
-- PostgreSQL 16+

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenants (Belgian enterprises)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  legal_form    TEXT NOT NULL DEFAULT 'SRL',
  bce_digits    TEXT UNIQUE NOT NULL,          -- 10 digits, modulo-97 validated upstream
  vat_number    TEXT,
  rpm_city      TEXT,
  street        TEXT,
  number        TEXT,
  box           TEXT,
  postal_code   TEXT,
  city          TEXT,
  country       TEXT NOT NULL DEFAULT 'Belgique',
  iban          TEXT,
  bic           TEXT,
  bank_name     TEXT,
  peppol_endpoint_id TEXT,
  email         TEXT,
  phone         TEXT,
  vat_regime    TEXT NOT NULL DEFAULT 'quarterly',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  display_name  TEXT,
  password_hash TEXT,
  locale        TEXT NOT NULL DEFAULT 'fr-BE',
  auth_provider TEXT NOT NULL DEFAULT 'password',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Memberships (tenant ↔ user + role)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'OWNER',
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Invoices & invoice lines
-- Business documents use TEXT ids mirroring the client state (inv-2026-001…)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id            TEXT PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL DEFAULT 'invoice',   -- invoice | quote | credit_note
  invoice_number TEXT NOT NULL,
  issue_date    DATE NOT NULL,
  due_date      DATE NOT NULL,
  client_name   TEXT NOT NULL,
  client_bce    TEXT,
  client_vat    TEXT,
  client_peppol TEXT,
  client_street TEXT,
  client_number TEXT,
  client_postal TEXT,
  client_city   TEXT,
  client_email  TEXT,
  subtotal_excl NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_incl    NUMERIC(14,2) NOT NULL DEFAULT 0,
  ogm           TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  peppol_status JSONB,
  payment_terms INT NOT NULL DEFAULT 30,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description   TEXT NOT NULL DEFAULT '',
  pcmn_account  TEXT NOT NULL DEFAULT '705000',
  quantity      NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate      NUMERIC(5,2) NOT NULL DEFAULT 21,
  vat_regime    TEXT NOT NULL DEFAULT 'standard_21',
  total_excl    NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_incl    NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- ---------------------------------------------------------------------------
-- Counterparty master data (clients / suppliers) — enriched from VIES + KBO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id            TEXT PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  vat_country   TEXT,                     -- BE / FR / DE … (VIES)
  vat_number    TEXT,                     -- national VAT (e.g. BE0202239951)
  bce_digits    TEXT,                     -- 10-digit Belgian BCE when BE
  street        TEXT, number TEXT, box TEXT, postal_code TEXT, city TEXT,
  country       TEXT NOT NULL DEFAULT 'Belgique',
  email         TEXT,
  peppol_endpoint_id TEXT,
  registry_status TEXT,                   -- active / ceased / unknown (public registry)
  legal_form    TEXT,
  risk_score    INT,                       -- 0..100 (public-register counterparty risk)
  risk_flags    JSONB NOT NULL DEFAULT '[]'::jsonb,
  kyc_level     TEXT NOT NULL DEFAULT 'none',  -- none | basic | verified
  enriched_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id, name);

-- ---------------------------------------------------------------------------
-- Purchases / expenses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  supplier_bce  TEXT,
  invoice_number TEXT NOT NULL,
  expense_date  DATE NOT NULL,
  category      TEXT,
  pcmn_account  TEXT NOT NULL DEFAULT '616100',
  description   TEXT,
  amount_excl   NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate      NUMERIC(5,2) NOT NULL DEFAULT 21,
  vat_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_incl   NUMERIC(14,2) NOT NULL DEFAULT 0,
  deductibility_rate NUMERIC(5,2) NOT NULL DEFAULT 100,
  deductible_vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'approved',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON purchases(tenant_id);

-- ---------------------------------------------------------------------------
-- Bank transactions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  statement_number TEXT,
  tx_date       DATE NOT NULL,
  valuta_date   DATE,
  amount        NUMERIC(14,2) NOT NULL,
  counterparty_name TEXT,
  counterparty_iban TEXT,
  communication TEXT,
  is_structured BOOLEAN NOT NULL DEFAULT false,
  ogm           TEXT,
  matched_invoice_id TEXT,
  reconciled    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id);

-- ---------------------------------------------------------------------------
-- Immutable audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Platform — firms (fiduciaires), plans, subscriptions, platform admins
-- ---------------------------------------------------------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS firm_id UUID;

CREATE TABLE IF NOT EXISTS firms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  itaa_firm_number TEXT,
  bce_digits TEXT UNIQUE NOT NULL,
  vat_number TEXT,
  street TEXT, number TEXT, box TEXT, postal_code TEXT, city TEXT,
  country TEXT NOT NULL DEFAULT 'Belgique',
  brand JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'trial',
  plan_id UUID,
  trial_ends_at TIMESTAMPTZ,
  created_by_platform_admin_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_firms_status ON firms(status);

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price_monthly_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_per_dossier_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_dossiers INT,
  max_users INT NOT NULL DEFAULT 5,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS firm_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'FIRM_ADMIN',
  status TEXT NOT NULL DEFAULT 'active',
  extra_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  denied_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (firm_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_firm_memberships_firm ON firm_memberships(firm_id);

CREATE TABLE IF NOT EXISTS firm_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'trialing',
  current_period_start DATE,
  current_period_end DATE,
  dossier_count INT NOT NULL DEFAULT 0,
  overage_dossiers INT NOT NULL DEFAULT 0,
  provider_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_firm_subscriptions_firm ON firm_subscriptions(firm_id);

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'PLATFORM_ADMIN',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence INT NOT NULL,
  actor_user_id UUID,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  before JSONB,
  after JSONB,
  previous_hash TEXT,
  hash TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_seq ON platform_audit_logs(sequence DESC);
CREATE INDEX IF NOT EXISTS idx_tenants_firm ON tenants(firm_id);

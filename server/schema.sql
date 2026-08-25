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

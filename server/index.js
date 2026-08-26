/**
 * BRABO — Backend API (Express + PostgreSQL)
 * Multi-tenant ledger persistence + identity (JWT) + audit trail.
 *
 * Endpoints:
 *   GET  /health                          → liveness
 *   POST /api/auth/register               → user + tenant + membership → JWT
 *   POST /api/auth/login                  → JWT
 *   GET  /api/ledger/:tenantId            → { company, invoices, purchases, transactions }
 *   PUT  /api/ledger/:tenantId            → replace whole ledger (write-through)
 *   GET  /api/backup/:bce                 → full ledger JSON backup
 *   GET/POST /api/ocr/*                   → proxied to the OCR microservice (FastAPI)
 *
 * Auth: shared token (X-BRABO-Token) OR JWT (Authorization: Bearer). /api/auth is public.
 */
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import http from 'node:http';
import { hashPassword, verifyPassword, signJwt, verifyJwt, authMiddleware } from './identity.js';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 4000;
const TOKEN = process.env.BRABO_API_TOKEN || 'brabo-dev-token';
const JWT_SECRET = process.env.BRABO_JWT_SECRET || TOKEN + '-jwt';
/** Internal OCR microservice (FastAPI + PaddleOCR) — never exposed publicly. */
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8000';
/** Shared secret for the internal OCR endpoint (defense in depth). */
const OCR_SERVICE_TOKEN = process.env.OCR_SERVICE_TOKEN || '';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Auth: shared token OR JWT; /api/auth/* is public.
app.use('/api', authMiddleware(TOKEN, JWT_SECRET));

// JWT firm-scope enrichment (after shared-token auth, before route handlers):
// exposes req.jwtRole / req.jwtFirmId for the platform & firm APIs.
app.use('/api', (req, _res, next) => {
  const auth = req.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = token ? verifyJwt(token, JWT_SECRET) : null;
  if (payload) {
    req.jwtRole = payload.role;
    req.jwtFirmId = payload.firmId || null;
  }
  next();
});

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', ts: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down', error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// OCR proxy — /api/ocr/* -> ocr-server (FastAPI), behind auth.
// ---------------------------------------------------------------------------
app.use('/api/ocr', (req, res) => {
  const target = new URL(OCR_SERVICE_URL);
  const path = req.originalUrl.replace(/^\/api/, '');
  const proxyReq = http.request(
    {
      host: target.hostname,
      port: target.port || 80,
      path,
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
        ...(OCR_SERVICE_TOKEN ? { 'x-ocr-token': OCR_SERVICE_TOKEN } : {}),
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.setTimeout(200_000, () => proxyReq.destroy(new Error('OCR timeout')));
  proxyReq.on('error', (e) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `OCR service injoignable: ${e.message}` });
    } else {
      res.end();
    }
  });
  req.pipe(proxyReq);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function findTenantByBce(client, bceDigits) {
  const r = await client.query('SELECT * FROM tenants WHERE bce_digits = $1', [bceDigits]);
  return r.rows[0] || null;
}

function formatBce(digits) {
  const d = String(digits).padStart(10, '0');
  return `BE ${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7, 10)}`;
}

function tenantToCompany(t) {
  return {
    id: t.id,
    name: t.name,
    legalForm: t.legal_form,
    bceNumber: formatBce(t.bce_digits),
    vatNumber: t.vat_number || 'BE' + t.bce_digits,
    rpmCity: t.rpm_city || 'Bruxelles',
    street: t.street || '',
    number: t.number || '',
    box: t.box || '',
    postalCode: t.postal_code || '',
    city: t.city || '',
    country: t.country || 'Belgique',
    iban: t.iban || '',
    bic: t.bic || '',
    bankName: t.bank_name || '',
    peppolEndpointId: t.peppol_endpoint_id || `0208:${t.bce_digits}`,
    email: t.email || '',
    phone: t.phone || '',
    website: '',
    vatRegime: t.vat_regime || 'quarterly',
    naceBelCode: '',
    fiduciaryName: '',
    fiduciaryItaaNumber: '',
    fiduciaryEmail: '',
  };
}

function requireRole(prefix) {
  return (req, res, next) => {
    if (!req.jwtRole || !req.jwtRole.startsWith(prefix)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Firm routes: require a JWT carrying firmId (role FIRM_* or firm-scoped token).
// A plain shared-token request without a JWT is rejected (403).
function requireFirmAccess(req, res, next) {
  const firmRole = req.jwtRole && req.jwtRole.startsWith('FIRM_');
  if (!firmRole && !req.jwtFirmId) return res.status(403).json({ error: 'Forbidden' });
  if (!req.jwtFirmId) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ---------------------------------------------------------------------------
// Identity — register & login
// ---------------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName, company } = req.body || {};
  if (!email || !password || !company?.bceNumber) {
    return res.status(400).json({ error: 'email, password et company.bceNumber requis' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bceDigits = String(company.bceNumber).replace(/[^0-9]/g, '');
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    let userId = existing.rows[0]?.id;
    if (!userId) {
      const ins = await client.query(
        `INSERT INTO users (email, first_name, last_name, display_name, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [email.toLowerCase().trim(), firstName || '', lastName || '', `${firstName || ''} ${lastName || ''}`.trim(), hashPassword(password)],
      );
      userId = ins.rows[0].id;
    }
    let tenant = await findTenantByBce(client, bceDigits);
    if (!tenant) {
      const t = await client.query(
        `INSERT INTO tenants (name, legal_form, bce_digits, vat_number, country, email, vat_regime) VALUES ($1,'SRL',$2,$3,'Belgique',$4,'quarterly') RETURNING id`,
        [company.name || 'Nouvelle société', bceDigits, company.vatNumber || 'BE' + bceDigits, email],
      );
      tenant = { id: t.rows[0].id };
    }
    await client.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'OWNER') ON CONFLICT DO NOTHING`, [tenant.id, userId]);
    await client.query('COMMIT');
    res.json({ token: signJwt({ sub: userId, tenantId: tenant.id, role: 'OWNER' }, JWT_SECRET), userId, tenantId: tenant.id, role: 'OWNER' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email et password requis' });
  try {
    const r = await pool.query('SELECT * FROM users WHERE email = $1 AND status = $2', [email.toLowerCase().trim(), 'active']);
    const user = r.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    const m = await pool.query('SELECT * FROM memberships WHERE user_id = $1 LIMIT 1', [user.id]);
    const membership = m.rows[0];
    res.json({
      token: signJwt({ sub: user.id, tenantId: membership?.tenant_id, role: membership?.role || 'OWNER' }, JWT_SECRET),
      userId: user.id,
      tenantId: membership?.tenant_id || null,
      role: membership?.role || 'OWNER',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// Backup export
// ---------------------------------------------------------------------------
app.get('/api/backup/:bce', async (req, res) => {
  const client = await pool.connect();
  try {
    const tenant = await findTenantByBce(client, req.params.bce);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });
    const [i, p, t] = await Promise.all([
      client.query('SELECT * FROM invoices WHERE tenant_id=$1', [tenant.id]),
      client.query('SELECT * FROM purchases WHERE tenant_id=$1', [tenant.id]),
      client.query('SELECT * FROM transactions WHERE tenant_id=$1', [tenant.id]),
    ]);
    res.json({
      app: 'BRABO',
      version: 1,
      exportedAt: new Date().toISOString(),
      company: tenantToCompany(tenant),
      invoices: i.rows,
      purchases: p.rows,
      transactions: t.rows,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Ledger — GET
// ---------------------------------------------------------------------------
function invoiceRowToInvoice(r) {
  return {
    id: r.id,
    type: r.doc_type,
    invoiceNumber: r.invoice_number,
    date: r.issue_date,
    dueDate: r.due_date,
    client: {
      id: 'client-' + r.id,
      name: r.client_name,
      bceNumber: r.client_bce || '',
      vatNumber: r.client_vat || '',
      peppolEndpointId: r.client_peppol || '',
      isPeppolEnabled: !!r.client_peppol,
      street: r.client_street || '',
      number: r.client_number || '',
      postalCode: r.client_postal || '',
      city: r.client_city || '',
      country: 'Belgique',
      email: r.client_email || '',
    },
    lines: r.lines || [],
    subtotalExclVat: Number(r.subtotal_excl),
    vatBreakdown: [],
    totalVatAmount: Number(r.vat_amount),
    totalInclVat: Number(r.total_incl),
    structuredCommunication: r.ogm || '',
    status: r.status,
    peppolStatus: r.peppol_status,
    paymentTermsDays: r.payment_terms,
    createdAt: r.created_at,
  };
}

app.get('/api/ledger/:tenantId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { tenantId } = req.params;
    const tenant = await findTenantByBce(client, tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });

    const [invRes, purRes, txRes] = await Promise.all([
      client.query(
        `SELECT i.*, COALESCE(json_agg(json_build_object(
          'id', l.id, 'description', l.description, 'pcmnAccount', l.pcmn_account,
          'quantity', l.quantity, 'unitPrice', l.unit_price, 'vatRate', l.vat_rate,
          'vatRegime', l.vat_regime, 'totalExclVat', l.total_excl, 'vatAmount', l.vat_amount, 'totalInclVat', l.total_incl
        ) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]') AS lines
         FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id = i.id
         WHERE i.tenant_id = $1 GROUP BY i.id ORDER BY i.issue_date DESC`,
        [tenant.id],
      ),
      client.query('SELECT * FROM purchases WHERE tenant_id = $1 ORDER BY expense_date DESC', [tenant.id]),
      client.query('SELECT * FROM transactions WHERE tenant_id = $1 ORDER BY tx_date DESC', [tenant.id]),
    ]);

    res.json({
      company: tenantToCompany(tenant),
      invoices: invRes.rows.map(invoiceRowToInvoice),
      purchases: purRes.rows.map((r) => ({
        id: r.id,
        supplierName: r.supplier_name,
        supplierBce: r.supplier_bce || '',
        invoiceNumber: r.invoice_number,
        date: r.expense_date,
        dueDate: r.expense_date,
        category: r.category || '',
        pcmnAccount: r.pcmn_account,
        description: r.description || '',
        amountExclVat: Number(r.amount_excl),
        vatRate: Number(r.vat_rate),
        vatAmount: Number(r.vat_amount),
        amountInclVat: Number(r.amount_incl),
        deductibilityRate: Number(r.deductibility_rate),
        deductibleVat: Number(r.deductible_vat),
        nonDeductibleAmount: 0,
        deductibleAmount: Number(r.amount_excl) * (Number(r.deductibility_rate) / 100),
        deductibleVatRate: Number(r.deductibility_rate),
        nonDeductibleVat: 0,
        status: r.status,
      })),
      transactions: txRes.rows.map((r) => ({
        id: r.id,
        statementNumber: r.statement_number || '',
        date: r.tx_date,
        valutaDate: r.valuta_date || r.tx_date,
        amount: Number(r.amount),
        currency: 'EUR',
        counterpartyName: r.counterparty_name || '',
        counterpartyIban: r.counterparty_iban || '',
        communication: r.communication || '',
        isStructured: r.is_structured,
        structuredCommunication: r.ogm || undefined,
        matchedInvoiceId: r.matched_invoice_id || undefined,
        reconciled: r.reconciled,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Ledger — PUT (replace whole tenant ledger, with audit trail)
// ---------------------------------------------------------------------------
app.put('/api/ledger/:tenantId', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { tenantId } = req.params;
    const { company, invoices = [], purchases = [], transactions = [] } = req.body;

    if (!company || !company.bceNumber) {
      return res.status(400).json({ error: 'company.bceNumber requis' });
    }
    const bceDigits = String(company.bceNumber).replace(/[^0-9]/g, '');
    let tenant = await findTenantByBce(client, bceDigits);
    if (tenant && tenant.id !== tenantId && tenantId !== bceDigits) {
      throw new Error('Le numéro BCE ne correspond pas au tenant demandé.');
    }
    if (!tenant) {
      const ins = await client.query(
        `INSERT INTO tenants (name, legal_form, bce_digits, vat_number, rpm_city, street, number, box,
           postal_code, city, country, iban, bic, bank_name, peppol_endpoint_id, email, phone, vat_regime)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [company.name, company.legalForm || 'SRL', bceDigits, company.vatNumber, company.rpmCity,
         company.street, company.number, company.box, company.postalCode, company.city,
         company.country || 'Belgique', company.iban, company.bic, company.bankName,
         company.peppolEndpointId, company.email, company.phone, company.vatRegime || 'quarterly'],
      );
      tenant = { id: ins.rows[0].id };
    } else {
      await client.query(
        `UPDATE tenants SET name=$2, legal_form=$3, vat_number=$4, rpm_city=$5, street=$6, number=$7, box=$8,
           postal_code=$9, city=$10, country=$11, iban=$12, bic=$13, bank_name=$14, peppol_endpoint_id=$15,
           email=$16, phone=$17, vat_regime=$18, updated_at=now() WHERE id=$1`,
        [tenant.id, company.name, company.legalForm || 'SRL', company.vatNumber, company.rpmCity,
         company.street, company.number, company.box, company.postalCode, company.city,
         company.country || 'Belgique', company.iban, company.bic, company.bankName,
         company.peppolEndpointId, company.email, company.phone, company.vatRegime || 'quarterly'],
      );
    }
    const tenantIdDb = tenant.id;

    await client.query('DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id=$1)', [tenantIdDb]);
    await client.query('DELETE FROM invoices WHERE tenant_id=$1', [tenantIdDb]);
    for (const inv of invoices) {
      const ins = await client.query(
        `INSERT INTO invoices (tenant_id, doc_type, invoice_number, issue_date, due_date,
           client_name, client_bce, client_vat, client_peppol, client_street, client_number, client_postal, client_city, client_email,
           subtotal_excl, vat_amount, total_incl, ogm, status, peppol_status, payment_terms, id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
        [tenantIdDb, inv.type || 'invoice', inv.invoiceNumber, inv.date, inv.dueDate,
         inv.client?.name || '', inv.client?.bceNumber || '', inv.client?.vatNumber || '', inv.client?.peppolEndpointId || '',
         inv.client?.street || '', inv.client?.number || '', inv.client?.postalCode || '', inv.client?.city || '', inv.client?.email || '',
         inv.subtotalExclVat, inv.totalVatAmount, inv.totalInclVat, inv.structuredCommunication,
         inv.status, JSON.stringify(inv.peppolStatus || null), inv.paymentTermsDays || 30, inv.id],
      );
      const invoiceId = ins.rows[0].id;
      for (const line of inv.lines || []) {
        await client.query(
          `INSERT INTO invoice_lines (invoice_id, description, pcmn_account, quantity, unit_price, vat_rate, vat_regime, total_excl, vat_amount, total_incl, id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [invoiceId, line.description || '', line.pcmnAccount || '705000', line.quantity ?? 1,
           line.unitPrice ?? 0, line.vatRate ?? 21, line.vatRegime || 'standard_21',
           line.totalExclVat ?? 0, line.vatAmount ?? 0, line.totalInclVat ?? 0, line.id],
        );
      }
    }

    await client.query('DELETE FROM purchases WHERE tenant_id=$1', [tenantIdDb]);
    for (const p of purchases) {
      await client.query(
        `INSERT INTO purchases (id, tenant_id, supplier_name, supplier_bce, invoice_number, expense_date, category,
           pcmn_account, description, amount_excl, vat_rate, vat_amount, amount_incl, deductibility_rate, deductible_vat, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [p.id, tenantIdDb, p.supplierName || '', p.supplierBce || '', p.invoiceNumber || '', p.date,
         p.category || '', p.pcmnAccount || '616100', p.description || '',
         p.amountExclVat ?? 0, p.vatRate ?? 21, p.vatAmount ?? 0, p.amountInclVat ?? 0,
         p.deductibilityRate ?? 100, p.deductibleVat ?? 0, p.status || 'approved'],
      );
    }

    await client.query('DELETE FROM transactions WHERE tenant_id=$1', [tenantIdDb]);
    for (const t of transactions) {
      await client.query(
        `INSERT INTO transactions (id, tenant_id, statement_number, tx_date, valuta_date, amount,
           counterparty_name, counterparty_iban, communication, is_structured, ogm, matched_invoice_id, reconciled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [t.id, tenantIdDb, t.statementNumber || '', t.date, t.valutaDate || t.date, t.amount ?? 0,
         t.counterpartyName || '', t.counterpartyIban || '', t.communication || '',
         !!t.isStructured, t.structuredCommunication || null, t.matchedInvoiceId || null, !!t.reconciled],
      );
    }

    await client.query('COMMIT');

    // Immutable audit trail (Belgian 7-year bookkeeping evidence)
    try {
      await client.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, payload)
         VALUES ($1, $2, 'LEDGER_REPLACE', 'ledger', $3, $4)`,
        [tenantIdDb, req.userId || null, String(tenantIdDb), JSON.stringify({ invoices: invoices.length, purchases: purchases.length, transactions: transactions.length })],
      );
    } catch (auditErr) {
      console.error('audit', auditErr);
    }

    res.json({ ok: true, tenantId: tenantIdDb, counts: { invoices: invoices.length, purchases: purchases.length, transactions: transactions.length } });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Platform API — firms (fiduciaires), plans, subscriptions, audit (Super Admin)
// All platform routes require a JWT whose role starts with 'PLATFORM_'.
// ---------------------------------------------------------------------------
app.get('/api/platform/overview', requireRole('PLATFORM_'), async (req, res) => {
  const client = await pool.connect();
  try {
    const [firms, clients, mrr] = await Promise.all([
      client.query('SELECT status, COUNT(*)::int AS n FROM firms GROUP BY status'),
      client.query('SELECT COUNT(*)::int AS n FROM tenants WHERE firm_id IS NOT NULL'),
      client.query(
        `SELECT COALESCE(SUM(p.price_monthly_eur), 0)::numeric AS total
         FROM firms f JOIN plans p ON p.id = f.plan_id
         WHERE f.status = 'active'`,
      ),
    ]);
    const byStatus = {};
    for (const r of firms.rows) byStatus[r.status] = r.n;
    res.json({
      firmsTotal: firms.rows.reduce((s, r) => s + r.n, 0),
      firmsActive: byStatus.active || 0,
      firmsTrial: byStatus.trial || 0,
      clientsTotal: clients.rows[0].n,
      mrrEstimate: Number(mrr.rows[0].total),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.get('/api/platform/firms', requireRole('PLATFORM_'), async (req, res) => {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT f.*, p.name AS plan_name, COALESCE(tc.client_count, 0) AS client_count
       FROM firms f
       LEFT JOIN plans p ON p.id = f.plan_id
       LEFT JOIN (SELECT firm_id, COUNT(*)::int AS client_count FROM tenants WHERE firm_id IS NOT NULL GROUP BY firm_id) tc ON tc.firm_id = f.id
       ORDER BY f.created_at DESC`,
    );
    res.json({ firms: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.post('/api/platform/firms', requireRole('PLATFORM_'), async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.bceDigits) {
    return res.status(400).json({ error: 'name et bceDigits requis' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO firms (name, itaa_firm_number, bce_digits, vat_number, street, number, box, postal_code, city,
         country, brand, plan_id, trial_ends_at, created_by_platform_admin_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Belgique',$10,$11,$12,$13) RETURNING *`,
      [b.name, b.itaaFirmNumber || null, b.bceDigits, b.vatNumber || null,
       b.address?.street || null, b.address?.number || null, b.address?.box || null,
       b.address?.postalCode || null, b.address?.city || null,
       JSON.stringify(b.brand || {}), b.planId || null,
       b.trialDays ? new Date(Date.now() + Number(b.trialDays) * 86400000) : null,
       req.userId || null],
    );
    const firm = ins.rows[0];
    let adminUserId = null;
    if (b.adminEmail) {
      const email = String(b.adminEmail).toLowerCase().trim();
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows[0]) {
        adminUserId = existing.rows[0].id;
      } else {
        const u = await client.query(
          `INSERT INTO users (email, first_name, last_name, display_name) VALUES ($1,$2,$3,$4) RETURNING id`,
          [email, b.adminFirstName || '', b.adminLastName || '', `${b.adminFirstName || ''} ${b.adminLastName || ''}`.trim()],
        );
        adminUserId = u.rows[0].id;
      }
      await client.query(
        `INSERT INTO firm_memberships (firm_id, user_id, role) VALUES ($1,$2,'FIRM_ADMIN') ON CONFLICT DO NOTHING`,
        [firm.id, adminUserId],
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ firm, adminUserId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.get('/api/platform/firms/:id', requireRole('PLATFORM_'), async (req, res) => {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT f.*, p.name AS plan_name, COALESCE(tc.client_count, 0) AS client_count
       FROM firms f
       LEFT JOIN plans p ON p.id = f.plan_id
       LEFT JOIN (SELECT firm_id, COUNT(*)::int AS client_count FROM tenants WHERE firm_id IS NOT NULL GROUP BY firm_id) tc ON tc.firm_id = f.id
       WHERE f.id = $1`,
      [req.params.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Firm introuvable' });
    res.json({ firm: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.patch('/api/platform/firms/:id', requireRole('PLATFORM_'), async (req, res) => {
  const b = req.body || {};
  const client = await pool.connect();
  try {
    const cur = await client.query('SELECT * FROM firms WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Firm introuvable' });
    const firm = cur.rows[0];
    const sets = [];
    const values = [];
    if (b.name !== undefined) { sets.push(`name = $${sets.length + 1}`); values.push(b.name); }
    if (b.brand !== undefined) {
      sets.push(`brand = $${sets.length + 1}`);
      values.push(JSON.stringify({ ...(firm.brand || {}), ...b.brand }));
    }
    if (b.status !== undefined) { sets.push(`status = $${sets.length + 1}`); values.push(b.status); }
    if (b.planId !== undefined) { sets.push(`plan_id = $${sets.length + 1}`); values.push(b.planId); }
    if (sets.length === 0) return res.json({ firm });
    sets.push('updated_at = now()');
    const r = await client.query(
      `UPDATE firms SET ${sets.join(', ')} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, req.params.id],
    );
    res.json({ firm: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.post('/api/platform/firms/:id/status', requireRole('PLATFORM_'), async (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status requis' });
  const client = await pool.connect();
  try {
    const r = await client.query(
      'UPDATE firms SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [req.params.id, status],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Firm introuvable' });
    res.json({ firm: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.get('/api/platform/plans', requireRole('PLATFORM_'), async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM plans ORDER BY price_monthly_eur ASC, created_at ASC');
    res.json({ plans: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/platform/plans', requireRole('PLATFORM_'), async (req, res) => {
  const b = req.body || {};
  if (!b.slug || !b.name) return res.status(400).json({ error: 'slug et name requis' });
  try {
    const r = await pool.query(
      `INSERT INTO plans (slug, name, price_monthly_eur, price_per_dossier_eur, max_dossiers, max_users, features)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.slug, b.name, b.priceMonthlyEur ?? 0, b.pricePerDossierEur ?? 0,
       b.maxDossiers ?? null, b.maxUsers ?? 5, JSON.stringify(b.features || [])],
    );
    res.status(201).json({ plan: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.patch('/api/platform/plans/:id', requireRole('PLATFORM_'), async (req, res) => {
  const b = req.body || {};
  const client = await pool.connect();
  try {
    const cur = await client.query('SELECT * FROM plans WHERE id = $1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Plan introuvable' });
    const sets = [];
    const values = [];
    if (b.slug !== undefined) { sets.push(`slug = $${sets.length + 1}`); values.push(b.slug); }
    if (b.name !== undefined) { sets.push(`name = $${sets.length + 1}`); values.push(b.name); }
    if (b.priceMonthlyEur !== undefined) { sets.push(`price_monthly_eur = $${sets.length + 1}`); values.push(b.priceMonthlyEur); }
    if (b.pricePerDossierEur !== undefined) { sets.push(`price_per_dossier_eur = $${sets.length + 1}`); values.push(b.pricePerDossierEur); }
    if (b.maxDossiers !== undefined) { sets.push(`max_dossiers = $${sets.length + 1}`); values.push(b.maxDossiers); }
    if (b.maxUsers !== undefined) { sets.push(`max_users = $${sets.length + 1}`); values.push(b.maxUsers); }
    if (b.features !== undefined) { sets.push(`features = $${sets.length + 1}`); values.push(JSON.stringify(b.features)); }
    if (b.isActive !== undefined) { sets.push(`is_active = $${sets.length + 1}`); values.push(b.isActive); }
    if (sets.length === 0) return res.json({ plan: cur.rows[0] });
    sets.push('updated_at = now()');
    const r = await client.query(
      `UPDATE plans SET ${sets.join(', ')} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, req.params.id],
    );
    res.json({ plan: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.get('/api/platform/firms/:id/subscriptions', requireRole('PLATFORM_'), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.*, p.name AS plan_name FROM firm_subscriptions s
       JOIN plans p ON p.id = s.plan_id
       WHERE s.firm_id = $1 ORDER BY s.created_at DESC`,
      [req.params.id],
    );
    res.json({ subscriptions: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/platform/firms/:id/subscriptions', requireRole('PLATFORM_'), async (req, res) => {
  const { planId, dossierCount } = req.body || {};
  if (!planId) return res.status(400).json({ error: 'planId requis' });
  const client = await pool.connect();
  try {
    const plan = await client.query('SELECT id FROM plans WHERE id = $1', [planId]);
    if (!plan.rows[0]) return res.status(404).json({ error: 'Plan introuvable' });
    const firm = await client.query('SELECT id FROM firms WHERE id = $1', [req.params.id]);
    if (!firm.rows[0]) return res.status(404).json({ error: 'Firm introuvable' });
    const r = await client.query(
      `INSERT INTO firm_subscriptions (firm_id, plan_id, status, dossier_count, current_period_start, current_period_end)
       VALUES ($1,$2,'trialing',$3, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month') RETURNING *`,
      [req.params.id, planId, dossierCount ?? 0],
    );
    res.status(201).json({ subscription: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

app.get('/api/platform/audit', requireRole('PLATFORM_'), async (_req, res) => {
  try {
    const r = await pool.query('SELECT * FROM platform_audit_logs ORDER BY sequence DESC LIMIT 200');
    res.json({ logs: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/platform/health', requireRole('PLATFORM_'), async (_req, res) => {
  try {
    const [f, p, c] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM firms'),
      pool.query('SELECT COUNT(*)::int AS n FROM plans'),
      pool.query('SELECT COUNT(*)::int AS n FROM tenants WHERE firm_id IS NOT NULL'),
    ]);
    res.json({ ok: true, firms: f.rows[0].n, plans: p.rows[0].n, clients: c.rows[0].n });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// ---------------------------------------------------------------------------
// Firm API — team & clients (fiduciaire scope, firmId from JWT payload)
// ---------------------------------------------------------------------------
app.get('/api/firm/team', requireFirmAccess, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT fm.id, fm.firm_id, fm.role, fm.status, fm.extra_permissions, fm.denied_permissions,
              u.id AS user_id, u.email, u.display_name, u.first_name, u.last_name
       FROM firm_memberships fm
       JOIN users u ON u.id = fm.user_id
       WHERE fm.firm_id = $1
       ORDER BY fm.created_at ASC`,
      [req.jwtFirmId],
    );
    res.json({ team: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.get('/api/firm/clients', requireFirmAccess, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM tenants WHERE firm_id = $1 ORDER BY created_at DESC', [req.jwtFirmId]);
    res.json({ clients: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/firm/clients', requireFirmAccess, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.bceDigits) {
    return res.status(400).json({ error: 'name et bceDigits requis' });
  }
  const client = await pool.connect();
  try {
    const dup = await client.query('SELECT id FROM tenants WHERE bce_digits = $1', [b.bceDigits]);
    if (dup.rows[0]) return res.status(409).json({ error: 'Un client avec ce numéro BCE existe déjà' });
    await client.query('BEGIN');
    const t = await client.query(
      `INSERT INTO tenants (name, legal_form, bce_digits, vat_number, vat_regime, city, postal_code, firm_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.name, b.legalForm || 'SRL', b.bceDigits, b.vatNumber || null, b.vatRegime || 'quarterly',
       b.city || null, b.postalCode || null, req.jwtFirmId],
    );
    const tenant = t.rows[0];
    if (b.ownerEmail) {
      const email = String(b.ownerEmail).toLowerCase().trim();
      const u = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      let userId = u.rows[0]?.id;
      if (!userId) {
        const ins = await client.query(
          `INSERT INTO users (email, first_name, last_name, display_name) VALUES ($1,$2,$3,$4) RETURNING id`,
          [email, b.ownerFirstName || '', b.ownerLastName || '', `${b.ownerFirstName || ''} ${b.ownerLastName || ''}`.trim()],
        );
        userId = ins.rows[0].id;
      }
      await client.query(
        `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'OWNER') ON CONFLICT DO NOTHING`,
        [tenant.id, userId],
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ client: tenant });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// VIES — real intra-EU VAT validation (European Commission SOAP, public, no key)
// ---------------------------------------------------------------------------
const VIES_ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';

async function callVies(countryCode, vatNumber) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${countryCode.toUpperCase()}</urn:countryCode>
      <urn:vatNumber>${vatNumber}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`;

  const resp = await fetch(VIES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: envelope,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await resp.text();
  if (!resp.ok) return { ok: false, error: `VIES HTTP ${resp.status}` };

  // Namespace-agnostic extraction: tags arrive as <ns2:valid>, <urn:valid> or <valid>.
  const grab = (tag) =>
    (text.match(new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([^<]*)<`, 'i')) || [])[1]?.trim() || null;
  const rawValid = grab('valid');
  return {
    ok: true,
    isValid: rawValid === 'true' || rawValid === '1',
    name: grab('name'),
    address: grab('address'),
    countryCode: (grab('countryCode') || countryCode).toUpperCase(),
    vatNumber: grab('vatNumber') || vatNumber,
    requestDate: grab('requestDate'),
    error: grab('faultstring'),
  };
}

app.post('/api/vies/validate', async (req, res) => {
  const { countryCode, vatNumber } = req.body || {};
  if (!countryCode || !vatNumber) {
    return res.status(400).json({ error: 'countryCode et vatNumber requis' });
  }
  try {
    const result = await callVies(String(countryCode), String(vatNumber));
    if (!result.ok) return res.status(502).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: `VIES injoignable: ${e.message}` });
  }
});

// ---------------------------------------------------------------------------
// Counterparty master (clients/suppliers enriched from VIES + KBO)
// ---------------------------------------------------------------------------
app.get('/api/clients/:tenantId', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const tenant = await findTenantByBce(client, req.params.tenantId);
      if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });
      const r = await client.query(
        'SELECT * FROM clients WHERE tenant_id = $1 ORDER BY updated_at DESC',
        [tenant.id],
      );
      res.json({ clients: r.rows });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.post('/api/clients', async (req, res) => {
  const { tenantId, client: c } = req.body || {};
  if (!tenantId || !c?.name) return res.status(400).json({ error: 'tenantId et client.name requis' });
  const conn = await pool.connect();
  try {
    const tenant = await findTenantByBce(conn, String(tenantId));
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });

    const vat = (c.vatNumber || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const bce = (c.bceNumber || '').replace(/\D/g, '');
    // Upsert on (tenant_id, bce_digits or vat_number).
    let existing = null;
    if (bce) {
      const dup = await conn.query(
        'SELECT id FROM clients WHERE tenant_id = $1 AND bce_digits = $2',
        [tenant.id, bce],
      );
      existing = dup.rows[0]?.id;
    } else if (vat) {
      const dup = await conn.query(
        'SELECT id FROM clients WHERE tenant_id = $1 AND vat_number = $2',
        [tenant.id, vat],
      );
      existing = dup.rows[0]?.id;
    }

    const fields = [
      c.name, tenant.id, c.country || 'Belgique', vat || null, bce || null,
      c.street || null, c.number || null, c.box || null, c.postalCode || null,
      c.city || null, c.email || null, c.peppolEndpointId || null,
      c.registryStatus || null, c.legalForm || null,
      Number.isFinite(c.riskScore) ? c.riskScore : null,
      JSON.stringify(c.riskFlags || []),
      c.kycLevel || 'none',
    ];
    let row;
    if (existing) {
      await conn.query('BEGIN');
      const upd = await conn.query(
        `UPDATE clients SET name=$1, country=$2, vat_number=$3, bce_digits=$4, street=$5, number=$6,
           box=$7, postal_code=$8, city=$9, email=$10, peppol_endpoint_id=$11, registry_status=$12,
           legal_form=$13, risk_score=$14, risk_flags=$15, kyc_level=$16, enriched_at=now(), updated_at=now()
         WHERE tenant_id=$17 AND id=$18 RETURNING *`,
        [...fields, tenant.id, existing],
      );
      row = upd.rows[0];
      await conn.query('COMMIT');
    } else {
      await conn.query('BEGIN');
      const id = 'cli-' + Date.now();
      const ins = await conn.query(
        `INSERT INTO clients (id, name, tenant_id, country, vat_number, bce_digits, street, number, box,
           postal_code, city, email, peppol_endpoint_id, registry_status, legal_form, risk_score, risk_flags, kyc_level, enriched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now()) RETURNING *`,
        [id, ...fields],
      );
      row = ins.rows[0];
      await conn.query('COMMIT');
    }
    res.status(existing ? 200 : 201).json({ client: row });
  } catch (e) {
    await conn.query('ROLLBACK').catch(() => {});
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    conn.release();
  }
});

app.listen(PORT, () => {
  console.log(`BRABO API listening on :${PORT}`);
});

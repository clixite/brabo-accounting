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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Auth: shared token OR JWT; /api/auth/* is public.
app.use('/api', authMiddleware(TOKEN, JWT_SECRET));

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
      headers: { ...req.headers, host: target.host },
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

app.listen(PORT, () => {
  console.log(`BRABO API listening on :${PORT}`);
});

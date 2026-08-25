/**
 * BRABO — Backend API (Express + PostgreSQL)
 * Multi-tenant ledger persistence for the accounting platform.
 *
 * Endpoints:
 *   GET  /health                     → liveness
 *   GET  /api/ledger/:tenantId       → { company, invoices, purchases, transactions }
 *   PUT  /api/ledger/:tenantId       → replace whole ledger (write-through from the client)
 *
 * Auth: shared bearer token (BRABO_API_TOKEN env). Real itsme® OIDC is a later phase.
 */
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 4000;
const TOKEN = process.env.BRABO_API_TOKEN || 'brabo-dev-token';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Minimal shared-token auth.
app.use('/api', (req, res, next) => {
  const provided = req.get('x-brabo-token') || '';
  if (provided !== TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' });
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

const COMPANY_FIELDS = `
  id, name, legal_form, bce_digits, vat_number, rpm_city,
  street, number, box, postal_code, city, country, iban, bic, bank_name,
  peppol_endpoint_id, email, phone, vat_regime, status
`;

async function findTenantByBce(client, bceDigits) {
  const r = await client.query('SELECT * FROM tenants WHERE bce_digits = $1', [bceDigits]);
  return r.rows[0] || null;
}

/** Maps a tenant row to the frontend CompanyProfile shape. */
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

function formatBce(digits) {
  const d = String(digits).padStart(10, '0');
  return `BE ${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7, 10)}`;
}

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

function purchaseRowToPurchase(r) {
  return {
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
  };
}

function txRowToTx(r) {
  return {
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
  };
}

// ---------------------------------------------------------------------------
// GET ledger
// ---------------------------------------------------------------------------
app.get('/api/ledger/:tenantId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { tenantId } = req.params;
    const tenant = await findTenantByBce(client, tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant introuvable' });
    }

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
      purchases: purRes.rows.map(purchaseRowToPurchase),
      transactions: txRes.rows.map(txRowToTx),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// PUT ledger (replace whole tenant ledger — write-through from the client)
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

    // Replace invoices (+ lines)
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

    // Replace purchases
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

    // Replace transactions
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

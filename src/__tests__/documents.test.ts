import { beforeAll, describe, expect, it } from 'vitest';
import { dbStore } from '../server/services/dbStore';
import { DEMO_USERS, seedDemoData } from '../server/services/demoBootstrap';
import { ROLES } from '../server/types/db';

function docInput(overrides: Record<string, unknown> = {}) {
  return {
    fileName: 'declaration-tva-q1.pdf',
    mimeType: 'application/pdf',
    fileSize: 128_000,
    category: 'Déclarations',
    note: 'Déclaration TVA T1 2026 signée',
    uploadedByUserId: 'user-1',
    storageKey: 'demo://declaration-tva-q1.pdf',
    ...overrides,
  };
}

describe('Shared documents (GED) — tenant-scoped', () => {
  beforeAll(async () => {
    await dbStore.reset();
    await seedDemoData();
  });

  it('lets the accountant create and list a document in a client tenant', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const bois = tenants.find((t) => t.bceDigits === '0821567891')!;
    const ctx = await dbStore.createContext(accountant!.id, bois.id);

    const created = await dbStore.documents.create(ctx, docInput({ uploadedByUserId: accountant!.id }));
    expect(created.fileName).toBe('declaration-tva-q1.pdf');

    const page = await dbStore.documents.list(ctx, { limit: 100 });
    expect(page.items.length).toBe(1);
    expect(page.items[0].tenantId).toBe(bois.id);
  });

  it('isolates documents between tenants (cross-tenant read is a miss)', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const bois = tenants.find((t) => t.bceDigits === '0821567891')!;
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;

    const boisCtx = await dbStore.createContext(accountant!.id, bois.id);
    const boisDocs = await dbStore.documents.list(boisCtx, { limit: 100 });
    const foreignId = boisDocs.items[0].id;

    const braboCtx = await dbStore.createContext(accountant!.id, brabo.id);
    const leaked = await dbStore.documents.findById(braboCtx, foreignId);
    expect(leaked).toBeNull();
  });

  it('rejects a role without document:write', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const tenants = await dbStore.tenants.listForUser(accountant!.id);
    const brabo = tenants.find((t) => t.bceDigits === '0789456175')!;
    const ctx = await dbStore.createContext(accountant!.id, brabo.id);

    const employeeCtx = { ...ctx, role: ROLES.EMPLOYEE };
    await expect(dbStore.documents.create(employeeCtx, docInput())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

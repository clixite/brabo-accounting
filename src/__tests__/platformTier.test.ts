import { beforeAll, describe, expect, it } from 'vitest';
import { dbStore } from '../server/services/dbStore';
import { DEMO_FIRM_SLUG, DEMO_USERS, seedDemoData } from '../server/services/demoBootstrap';
import { PLATFORM_ROLES } from '../server/types/db';

/**
 * Platform → firm → client 3-tier SaaS contract.
 * Exercises the platform repository: firm/plan provisioning, firm↔client
 * linkage, platform-operator RBAC, and the hash-chained platform audit trail.
 */

beforeAll(async () => {
  await dbStore.reset();
  await seedDemoData();
});

describe('3-tier SaaS hierarchy (platform → firm → client)', () => {
  it('seeds a platform owner, three plans and a demo firm', async () => {
    const admin = await dbStore.users.findByEmail(DEMO_USERS.platformAdmin);
    expect(admin).not.toBeNull();

    const platformAdmin = await dbStore.platform.findPlatformAdminForUser(admin!.id);
    expect(platformAdmin?.role).toBe(PLATFORM_ROLES.PLATFORM_OWNER);

    const plans = await dbStore.platform.listPlans();
    expect(plans.length).toBe(3);
    expect(plans.map((p) => p.slug)).toContain('pro');

    const firm = await dbStore.platform.findFirmBySlug(DEMO_FIRM_SLUG);
    expect(firm).not.toBeNull();
  });

  it('links the demo firm to its three client tenants', async () => {
    const firm = await dbStore.platform.findFirmBySlug(DEMO_FIRM_SLUG);
    const clients = await dbStore.platform.listFirmClients(firm!.id);
    expect(clients.length).toBe(3);
    expect(clients.every((t) => t.firmId === firm!.id)).toBe(true);
    expect(await dbStore.platform.countFirmClients(firm!.id)).toBe(3);
  });

  it('binds the demo accountant to the firm as FIRM_ADMIN', async () => {
    const firm = await dbStore.platform.findFirmBySlug(DEMO_FIRM_SLUG);
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    const members = await dbStore.platform.listFirmMemberships(firm!.id);
    expect(members.some((m) => m.userId === accountant!.id && m.role === 'FIRM_ADMIN')).toBe(true);
  });

  it('forbids a non-platform user from creating a firm', async () => {
    const accountant = await dbStore.users.findByEmail(DEMO_USERS.accountant);
    await expect(
      dbStore.platform.createFirm(
        {
          name: 'Cabinet Pirate',
          bceDigits: '0123456789',
          address: { street: '', number: '', postalCode: '1000', city: 'Bruxelles', countryCode: 'BE', country: 'Belgique' },
          brand: { slug: 'pirate' },
          status: 'active',
        },
        accountant!.id,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets a platform admin create a firm and a plan (audited)', async () => {
    const admin = await dbStore.users.findByEmail(DEMO_USERS.platformAdmin);

    const firm = await dbStore.platform.createFirm(
      {
        name: 'Fiduciaire du Nord',
        itaaFirmNumber: '99.888.777',
        bceDigits: '0987654321',
        address: { street: '', number: '', postalCode: '2000', city: 'Antwerpen', countryCode: 'BE', country: 'Belgique' },
        brand: { slug: 'nord', primaryColor: '#22c55e' },
        status: 'trial',
        createdByPlatformAdminId: admin!.id,
      },
      admin!.id,
    );
    expect(firm.bceDigits).toBe('0987654321');
    expect(firm.status).toBe('trial');

    const plan = await dbStore.platform.createPlan(
      {
        slug: 'scale-test',
        name: 'Scale (test)',
        priceMonthlyEur: 399,
        pricePerDossierEur: 12,
        maxDossiers: null,
        maxUsers: 50,
        features: ['Dossiers illimités'],
        isActive: true,
      },
      admin!.id,
    );
    expect(plan.maxDossiers).toBeNull();

    const firmMembership = await dbStore.platform.createFirmMembership(
      {
        firmId: firm.id,
        userId: admin!.id,
        role: 'FIRM_ADMIN',
        status: 'active',
        extraPermissions: [],
        deniedPermissions: [],
      },
      admin!.id,
    );
    expect(firmMembership.firmId).toBe(firm.id);
  });

  it('suspends and reactivates a firm through the platform', async () => {
    const admin = await dbStore.users.findByEmail(DEMO_USERS.platformAdmin);
    const firm = await dbStore.platform.findFirmBySlug(DEMO_FIRM_SLUG);

    const suspended = await dbStore.platform.setFirmStatus(firm!.id, 'suspended', admin!.id);
    expect(suspended.status).toBe('suspended');

    const reactivated = await dbStore.platform.setFirmStatus(firm!.id, 'active', admin!.id);
    expect(reactivated.status).toBe('active');
  });

  it('keeps the platform audit chain intact after all mutations', async () => {
    const page = await dbStore.platform.listPlatformAudit({ limit: 100 });
    expect(page.items.length).toBeGreaterThan(0);
    const verification = await dbStore.platform.verifyPlatformChain();
    expect(verification.valid).toBe(true);
    expect(verification.entriesChecked).toBe(page.items.length);
  });
});

import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Profil 4 — Client membre (EMPLOYEE)', () => {
  test('accède uniquement au périmètre du moindre privilège', async ({ page }) => {
    await loginAs(page, 'client-membre');

    // Identité : employé.
    await expect(page.getByTestId('session-role')).toHaveText(/Employé/);
    // Il peut consulter les factures et déclarer ses dépenses.
    await expect(page.getByTestId('nav-invoicing')).toBeVisible();
    await expect(page.getByTestId('nav-expenses')).toBeVisible();

    // Fonctions sensibles masquées.
    await expect(page.getByTestId('nav-settings')).toHaveCount(0);
    await expect(page.getByTestId('nav-taxCenter')).toHaveCount(0);
    await expect(page.getByTestId('nav-banking')).toHaveCount(0);
    await expect(page.getByTestId('nav-audit')).toHaveCount(0);
  });
});

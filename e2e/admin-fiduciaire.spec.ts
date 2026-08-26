import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Profil 1 — Admin fiduciaire (FIRM_ADMIN)', () => {
  test('atterrit sur le portail cabinet et pilote tous les dossiers clients', async ({ page }) => {
    await loginAs(page, 'admin-fiduciaire');

    // Portail cabinet.
    await expect(page.getByRole('heading', { name: 'Pilotage des dossiers clients' })).toBeVisible();
    // Identité de firme : administrateur.
    await expect(page.getByTestId('session-firm-role')).toHaveText(/Admin fiduciaire/);
    // Les 3 dossiers clients sont pilotés (présence des lignes dossier).
    await expect(page.getByTestId('firm-team-panel')).toBeVisible();
    // L'admin peut accorder/retirer la déclaration TVA autonome.
    await expect(page.getByTestId('toggle-declaration').first()).toBeVisible();
  });
});

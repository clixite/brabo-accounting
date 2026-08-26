import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Profil 3 — Client Admin (OWNER / gérant)', () => {
  test('dispose de l’espace client complet', async ({ page }) => {
    await loginAs(page, 'client-admin');

    // Identité : gérant de la société.
    await expect(page.getByTestId('session-role')).toHaveText(/Gérant/);
    // Accès complet : TVA & fiscalité, paramètres.
    await expect(page.getByTestId('nav-taxCenter')).toBeVisible();
    await expect(page.getByTestId('nav-settings')).toBeVisible();
  });
});

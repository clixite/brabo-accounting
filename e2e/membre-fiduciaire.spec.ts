import { test, expect } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Profil 2 — Membre fiduciaire (SENIOR)', () => {
  test('consulte les dossiers sans accès à l’administration de la firme', async ({ page }) => {
    await loginAs(page, 'membre-fiduciaire');

    // Même portail cabinet, mais rôle de firme collaborateur.
    await expect(page.getByRole('heading', { name: 'Pilotage des dossiers clients' })).toBeVisible();
    await expect(page.getByTestId('session-firm-role')).toHaveText(/Comptable senior/);

    // Aucune administration d'équipe, aucun droit de basculer la déclaration.
    await expect(page.getByTestId('firm-team-panel')).toHaveCount(0);
    await expect(page.getByTestId('toggle-declaration')).toHaveCount(0);
  });
});

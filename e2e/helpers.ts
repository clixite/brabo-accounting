import { expect, type Page } from '@playwright/test';

/** The 4 SaaS profiles under test (plus the platform operator). */
export type Profile =
  | 'admin-fiduciaire'
  | 'membre-fiduciaire'
  | 'client-admin'
  | 'client-membre'
  | 'super-admin';

/** Opens the app and waits for the login / workspace selector. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /BRABO/ })).toBeVisible();
}

/** Clicks the profile's login card on the workspace selector. */
export async function loginAs(page: Page, profile: Profile): Promise<void> {
  await openApp(page);
  await page.getByTestId(`login-${profile}`).click();
}

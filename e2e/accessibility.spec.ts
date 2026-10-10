import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './helpers';

async function audit(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow, `${name} scrolls horizontally`).toBe(false);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious.map((violation) => `${name}: ${violation.id} ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('teacher and admin pages are accessible and responsive', async ({ page }, testInfo) => {
  await signIn(page, 'admin@cloudattend.local');
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
  await audit(page, 'admin dashboard');
  await page.goto('/admin/users');
  await expect(page.getByRole('table')).toBeVisible();
  await audit(page, 'admin users');
  await page.goto('/settings');
  await audit(page, 'settings');

  await page.getByRole('button', { name: 'Toggle navigation' }).isVisible();
  await page.goto('/');
  await signInAsTeacher(page);
  await page.getByRole('link', { name: /Open CS101/ }).click();
  for (const tab of ['Sessions', 'Roster', 'Report']) {
    await page.getByRole('tab', { name: tab }).click();
    await audit(page, `course ${tab}`);
  }
  await page.getByRole('button', { name: 'Start attendance' }).click();
  await page.getByRole('button', { name: 'Start and show QR code' }).click();
  await expect(page.getByTestId('qr-code')).toBeVisible();
  await audit(page, 'live session');
  await page.screenshot({ path: testInfo.outputPath('live-session.png'), fullPage: true });
});

async function signInAsTeacher(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/sign-in');
  await signIn(page, 'teacher@cloudattend.local');
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
}

test('student pages are accessible and responsive, in both themes', async ({ page }, testInfo) => {
  await signIn(page, 'student@cloudattend.local');
  await expect(page.getByRole('heading', { name: 'Hi, Sam' })).toBeVisible();
  await audit(page, 'student dashboard');
  await page.goto('/attendance');
  await audit(page, 'my attendance');
  await page.goto('/scan');
  await page.getByRole('button', { name: 'Enter code manually' }).click();
  await audit(page, 'scan');
  await page.goto('/settings');
  await page.getByRole('combobox', { name: 'Theme' }).click();
  await page.getByRole('option', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.goto('/');
  await audit(page, 'student dashboard (dark)');
  await page.screenshot({ path: testInfo.outputPath('student-dark.png'), fullPage: true });
});

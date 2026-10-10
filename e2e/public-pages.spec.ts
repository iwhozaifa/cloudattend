import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const [pagePath, heading] of [['/sign-in', 'Welcome back'], ['/sign-up', 'Create your student account'], ['/forgot-password', 'Reset your password']]) {
  test(`${pagePath} is responsive and accessible`, async ({ page }, testInfo) => {
    await page.goto(pagePath);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${pagePath.slice(1)}.png`), fullPage: true });
  });
}

test('legacy auth URLs redirect to the new pages', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/register');
  await expect(page).toHaveURL(/\/sign-up$/);
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const pagePath of ['/login', '/register']) {
  test(`${pagePath} is responsive and accessible`, async ({ page }, testInfo) => {
    await page.goto(pagePath);
    await expect(page.getByRole('heading')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${pagePath.slice(1)}.png`), fullPage: true });
  });
}

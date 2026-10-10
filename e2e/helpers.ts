import { expect, test as base, type Page } from '@playwright/test';

export const LOCAL_API = 'http://127.0.0.1:8787';
export const PASSWORD = 'CloudAttend#2026';
export const CODE = '123456';
export const accounts = {
  admin: 'admin@cloudattend.local',
  teacher: 'teacher@cloudattend.local',
  student: 'student@cloudattend.local',
  riley: 'riley@cloudattend.local'
};

/** Every test starts from the seeded demo data. */
export const test = base.extend<{ resetData: void }>({
  resetData: [async ({ request }, use) => {
    expect((await request.post(`${LOCAL_API}/__reset`)).status()).toBe(204);
    await use();
  }, { auto: true }]
});
export { expect };

export async function signIn(page: Page, email: string, password = PASSWORD) {
  if (!page.url().includes('/sign-in')) await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Opens the account menu (inside the mobile sheet on small screens) and signs out. */
export async function signOut(page: Page) {
  const trigger = page.getByRole('button', { name: 'Toggle navigation' });
  if (!(await page.getByRole('button', { name: 'Account menu' }).isVisible())) await trigger.click();
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in/);
}

export async function fillCode(page: Page, label: string, code = CODE) {
  await page.getByLabel(label, { exact: true }).fill(code);
}

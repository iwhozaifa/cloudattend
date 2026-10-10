import { expect, signIn, signOut, test } from './helpers';

test('an administrator promotes a student to teacher', async ({ page }) => {
  await signIn(page, 'admin@cloudattend.local');
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users & roles' })).toBeVisible();
  await page.getByLabel('Search users').fill('riley');
  await page.getByRole('button', { name: 'Make teacher: Riley Learner' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Make teacher' }).click();
  await expect(page.getByText('Riley Learner is now a teacher')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make student: Riley Learner' })).toBeVisible();
  await signOut(page);

  await signIn(page, 'riley@cloudattend.local');
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New course' }).first()).toBeVisible();
});

test('the settings page changes the password', async ({ page }) => {
  await signIn(page, 'student@cloudattend.local');
  await page.goto('/settings');
  await page.getByLabel('Current password', { exact: true }).fill('CloudAttend#2026');
  await page.getByLabel('New password', { exact: true }).fill('Changed#Pass2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Changed#Pass2026');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  await signOut(page);
  await signIn(page, 'student@cloudattend.local', 'Changed#Pass2026');
  await expect(page.getByRole('heading', { name: 'Hi, Sam' })).toBeVisible();
});

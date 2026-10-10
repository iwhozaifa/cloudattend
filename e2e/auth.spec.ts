import { CODE, expect, fillCode, PASSWORD, signIn, signOut, test } from './helpers';

test('a new student signs up, verifies their email, and signs in', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Jordan New');
  await page.getByLabel('Roll number').fill('cs-2026-050');
  await page.getByLabel('Email').fill('jordan@example.edu');
  await page.getByLabel('Password', { exact: true }).fill('weak');
  await expect(page.getByText('A symbol (not met)')).toBeAttached();
  await page.getByLabel('Password', { exact: true }).fill('Jordan#Pass2026');
  await page.getByLabel('Confirm password', { exact: true }).fill('Jordan#Pass2026');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend code in/ })).toBeDisabled();
  await fillCode(page, 'Verification code', '000000');
  await page.getByRole('button', { name: 'Verify email' }).click();
  await expect(page.getByText('That code is incorrect')).toBeVisible();
  await fillCode(page, 'Verification code', CODE);
  await page.getByRole('button', { name: 'Verify email' }).click();

  await expect(page.getByText('Email verified. Sign in to continue.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('jordan@example.edu');
  await page.getByLabel('Password', { exact: true }).fill('Jordan#Pass2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Jordan' })).toBeVisible();
  await expect(page.getByText('CS-2026-050')).toBeVisible();
});

test('duplicate roll numbers are rejected at sign-up', async ({ page }) => {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Copy Cat');
  await page.getByLabel('Roll number').fill('CS-2026-001');
  await page.getByLabel('Email').fill('copy@example.edu');
  await page.getByLabel('Password', { exact: true }).fill('Copy#Cat20261');
  await page.getByLabel('Confirm password', { exact: true }).fill('Copy#Cat20261');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('This roll number is already registered.');
});

test('wrong passwords fail and a forgotten password can be reset', async ({ page }) => {
  await signIn(page, 'student@cloudattend.local', 'Wrong#Password1');
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');

  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByLabel('Email')).toHaveValue('student@cloudattend.local');
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await expect(page.getByText(/If an account exists for student@cloudattend.local/)).toBeVisible();
  await fillCode(page, 'Reset code');
  await page.getByLabel('New password', { exact: true }).fill('Reset#Pass2026');
  await page.getByLabel('Confirm new password', { exact: true }).fill('Reset#Pass2026');
  await page.getByRole('button', { name: 'Reset password' }).click();

  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password.');
  await page.getByLabel('Password', { exact: true }).fill('Reset#Pass2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Sam' })).toBeVisible();
});

test('protected pages require sign-in and return afterwards; sign-out ends the session', async ({ page }) => {
  await page.goto('/attendance');
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fattendance/);
  await signIn(page, 'student@cloudattend.local');
  await expect(page.getByRole('heading', { name: 'My attendance' })).toBeVisible();
  await signOut(page);
  await page.goto('/attendance');
  await expect(page).toHaveURL(/\/sign-in/);
});

test('an off-site returnTo is ignored after sign-in', async ({ page }) => {
  await page.goto('/sign-in?returnTo=https%3A%2F%2Fevil.example%2F');
  await signIn(page, 'student@cloudattend.local');
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);
});

test('students cannot open teacher pages', async ({ page }) => {
  await signIn(page, 'student@cloudattend.local');
  await expect(page.getByRole('heading', { name: 'Hi, Sam' })).toBeVisible();
  await page.goto('/admin/users');
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
});

import { expect, signIn, test } from './helpers';

test('teacher runs a full attendance session and a student checks in', async ({ page, browser }) => {
  // Teacher creates a course and enrolls a student by email.
  await signIn(page, 'teacher@cloudattend.local');
  await expect(page.getByRole('heading', { name: 'My courses' })).toBeVisible();
  await page.getByRole('button', { name: 'New course' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Course code').fill('net210');
  await dialog.getByLabel('Section').fill('B');
  await dialog.getByLabel('Course name').fill('Computer Networks');
  await dialog.getByLabel('Semester').fill('Fall 2026');
  await dialog.getByRole('button', { name: 'Create course' }).click();
  await page.getByRole('link', { name: 'Open NET210 Computer Networks' }).click();
  await expect(page.getByRole('heading', { name: 'Computer Networks' })).toBeVisible();

  await page.getByRole('tab', { name: 'Roster' }).click();
  await page.getByLabel('Email or roll number').fill('student@cloudattend.local');
  await page.getByRole('button', { name: 'Add to roster' }).click();
  await expect(page.getByRole('cell', { name: 'Sam Student', exact: true })).toBeVisible();
  await page.getByLabel('Email or roll number').fill('CS-2026-002');
  await page.getByRole('button', { name: 'Add to roster' }).click();
  await expect(page.getByRole('cell', { name: 'Riley Learner', exact: true })).toBeVisible();

  // Teacher starts the session; the QR code appears.
  await page.getByRole('button', { name: 'Start attendance' }).click();
  await page.getByRole('button', { name: 'Start and show QR code' }).click();
  await expect(page.getByRole('heading', { name: 'NET210 attendance' })).toBeVisible();
  const token = await page.getByTestId('qr-code').getAttribute('data-token');
  expect(token).toMatch(/^[\w-]+\.[\w-]+$/);

  // The student follows the QR link from a phone camera while signed out.
  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await student.goto(`/check-in?token=${encodeURIComponent(token!)}`);
  await expect(student).toHaveURL(/\/sign-in\?returnTo=/);
  await signIn(student, 'student@cloudattend.local');
  await expect(student.getByText('Attendance recorded')).toBeVisible();
  await expect(student.getByText('NET210 · Computer Networks')).toBeVisible();
  await expect(student).toHaveURL(/\/check-in$/);

  // Re-using the same code is reported as a duplicate.
  await student.goto(`/check-in?token=${encodeURIComponent(token!)}`);
  await expect(student.getByText('Already checked in')).toBeVisible();

  // The teacher sees the check-in live, then closes the session.
  await expect(page.getByRole('list', { name: 'Checked-in students' }).getByText('Sam Student')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Close session' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close session' }).click();
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();

  // After closing, the code no longer works.
  await student.goto(`/check-in?token=${encodeURIComponent(token!)}`);
  await expect(student.getByText(/already been recorded|has closed/)).toBeVisible();

  // Report and CSV export.
  await page.getByRole('link', { name: 'NET210' }).click();
  await page.getByRole('tab', { name: 'Report' }).click();
  await expect(page.getByRole('row', { name: /Sam Student/ })).toContainText('100%');
  await expect(page.getByRole('row', { name: /Riley Learner/ })).toContainText('Below threshold');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('NET210-attendance.csv');
  const csv = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(csv).toString()).toContain('CS-2026-001,Sam Student,student@cloudattend.local,1,1,100,no');

  // The student's history reflects the check-in.
  await student.goto('/attendance');
  await expect(student.getByRole('region', { name: 'NET210 attendance' })).toContainText('1 of 1 sessions');
  await studentContext.close();
});

test('a student checks in by pasting the code when the camera is unavailable', async ({ page, browser }) => {
  await signIn(page, 'teacher@cloudattend.local');
  await page.getByRole('link', { name: /Open CS101/ }).click();
  await page.getByRole('button', { name: 'Start attendance' }).click();
  await page.getByRole('button', { name: 'Start and show QR code' }).click();
  const token = await page.getByTestId('qr-code').getAttribute('data-token');

  const context = await browser.newContext();
  const student = await context.newPage();
  await signIn(student, 'student@cloudattend.local');
  await student.getByRole('link', { name: 'Scan QR code' }).first().click();
  await expect(student.getByRole('heading', { name: 'Scan QR code' })).toBeVisible();
  await student.getByRole('button', { name: 'Enter code manually' }).click();
  await student.getByLabel('Check-in code or link').fill('not-a-code');
  await student.getByRole('button', { name: 'Check in' }).click();
  await expect(student.getByText('That is not a CloudAttend check-in code or link.')).toBeVisible();
  await student.getByLabel('Check-in code or link').fill(`http://127.0.0.1:4173/check-in?token=${token}`);
  await student.getByRole('button', { name: 'Check in' }).click();
  await expect(student.getByText('Attendance recorded')).toBeVisible();
  await context.close();
});

test('a student who is not enrolled is told so', async ({ page, browser }) => {
  await signIn(page, 'teacher@cloudattend.local');
  await page.getByRole('link', { name: /Open CS101/ }).click();
  await page.getByRole('button', { name: 'Start attendance' }).click();
  await page.getByRole('button', { name: 'Start and show QR code' }).click();
  const token = await page.getByTestId('qr-code').getAttribute('data-token');
  const context = await browser.newContext();
  const riley = await context.newPage();
  await signIn(riley, 'riley@cloudattend.local');
  await expect(riley.getByText("You're not enrolled in any courses yet")).toBeVisible();
  await riley.goto(`/check-in?token=${encodeURIComponent(token!)}`);
  await expect(riley.getByText('You are not enrolled in this course.')).toBeVisible();
  await context.close();
});

test('teacher edits and deletes a course', async ({ page }) => {
  await signIn(page, 'teacher@cloudattend.local');
  await page.getByRole('link', { name: /Open CS101/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByLabel('Course name').fill('Cloud Computing II');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Cloud Computing II' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete course' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete course' }).click();
  await expect(page.getByText('No courses yet')).toBeVisible();
});

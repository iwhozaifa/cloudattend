import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/auth/guards';
import { fakeAdapter, renderWithApp, serveMe, student } from '@/test/render';
import { SettingsPage } from './settings';

async function change(current: string, next: string) {
  await userEvent.type(await screen.findByLabelText('Current password'), current);
  await userEvent.type(screen.getByLabelText('New password'), next);
  await userEvent.type(screen.getByLabelText('Confirm new password'), next);
  await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
}

describe('SettingsPage', () => {
  it('shows the profile and changes the password', async () => {
    serveMe(student);
    const adapter = fakeAdapter(true);
    renderWithApp(<RequireAuth><SettingsPage /></RequireAuth>, { adapter, path: '/', route: '/' });
    expect(await screen.findByText(student.email)).toBeVisible();
    await change('Old#Password12', 'New#Password12');
    expect(adapter.changePassword).toHaveBeenCalledWith('Old#Password12', 'New#Password12');
    expect(await screen.findByText('Password changed')).toBeVisible();
  });

  it('marks a wrong current password on the field', async () => {
    serveMe(student);
    const adapter = fakeAdapter(true);
    adapter.changePassword.mockRejectedValue(Object.assign(new Error('Incorrect username or password.'), { name: 'NotAuthorizedException' }));
    renderWithApp(<RequireAuth><SettingsPage /></RequireAuth>, { adapter, path: '/', route: '/' });
    await change('Wrong#Password1', 'New#Password12');
    expect(await screen.findByText('Your current password is incorrect.')).toBeVisible();
  });

  it('switches the theme', async () => {
    serveMe(student);
    renderWithApp(<RequireAuth><SettingsPage /></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    await userEvent.click(await screen.findByRole('combobox', { name: 'Theme' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass('dark');
  });
});

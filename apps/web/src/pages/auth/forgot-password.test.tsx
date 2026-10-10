import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { fakeAdapter, renderWithApp, serveMe } from '@/test/render';
import { ForgotPasswordPage } from './forgot-password';
import { SignInPage } from './sign-in';

describe('ForgotPasswordPage', () => {
  it('requests a code without revealing whether the account exists, then resets', async () => {
    serveMe(null);
    const { adapter } = renderWithApp(<ForgotPasswordPage />, { path: '/forgot-password', route: '/forgot-password', extraRoutes: <Route path="/sign-in" element={<SignInPage />} /> });
    await userEvent.type(await screen.findByLabelText('Email'), 'SAM@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    expect(await screen.findByText('If an account exists for sam@example.com, we sent it a 6-digit reset code.')).toBeVisible();
    expect(adapter.forgotPassword).toHaveBeenCalledWith('sam@example.com');

    await userEvent.type(screen.getByLabelText('Reset code'), '123456');
    await userEvent.type(screen.getByLabelText('New password'), 'Fresh#Password9');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Fresh#Password9');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText('Password updated. Sign in with your new password.')).toBeVisible();
    expect(adapter.confirmForgotPassword).toHaveBeenCalledWith('sam@example.com', '123456', 'Fresh#Password9');
  });

  it('shows expired-code errors and lets the user start over', async () => {
    serveMe(null);
    const adapter = fakeAdapter();
    adapter.confirmForgotPassword.mockRejectedValue(Object.assign(new Error('x'), { name: 'ExpiredCodeException' }));
    renderWithApp(<ForgotPasswordPage />, { adapter, path: '/forgot-password', route: '/forgot-password' });
    await userEvent.type(await screen.findByLabelText('Email'), 'sam@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset code' }));
    await userEvent.type(await screen.findByLabelText('Reset code'), '654321');
    await userEvent.type(screen.getByLabelText('New password'), 'Fresh#Password9');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Fresh#Password9');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    expect(await screen.findByText('That code has expired. Request a new one.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  });
});

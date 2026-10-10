import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { fakeAdapter, LocationProbe, renderWithApp, serveMe, student } from '@/test/render';
import { ForgotPasswordPage } from './forgot-password';
import { SignInPage } from './sign-in';
import { SignUpPage } from './sign-up';

const extraRoutes = <>
  <Route path="/sign-up" element={<><SignUpPage /><LocationProbe /></>} />
  <Route path="/forgot-password" element={<><ForgotPasswordPage /><LocationProbe /></>} />
</>;

async function fillAndSubmit(password = 'Secret#Password1') {
  await userEvent.type(screen.getByLabelText('Email'), 'Sam@Example.com ');
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('SignInPage', () => {
  it('signs in with a normalised email and returns to the requested page', async () => {
    serveMe(student);
    const { adapter } = renderWithApp(<SignInPage />, { path: '/sign-in', route: '/sign-in?returnTo=%2Fcheck-in%3Ftoken%3Dabc' });
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/check-in?token=abc'));
    expect(adapter.signIn).toHaveBeenCalledWith('sam@example.com', 'Secret#Password1');
  });

  it('ignores an off-site returnTo (open redirect)', async () => {
    serveMe(student);
    renderWithApp(<SignInPage />, { path: '/sign-in', route: '/sign-in?returnTo=https%3A%2F%2Fevil.example' });
    await fillAndSubmit();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  it('validates before calling Cognito', async () => {
    serveMe(null);
    const { adapter } = renderWithApp(<SignInPage />, { path: '/sign-in', route: '/sign-in' });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeVisible();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    expect(adapter.signIn).not.toHaveBeenCalled();
  });

  it('shows a friendly error for wrong credentials', async () => {
    serveMe(null);
    const adapter = fakeAdapter();
    adapter.signIn.mockRejectedValue(Object.assign(new Error('Incorrect username or password.'), { name: 'NotAuthorizedException' }));
    renderWithApp(<SignInPage />, { adapter, path: '/sign-in', route: '/sign-in' });
    await fillAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  it('sends unverified users to the code step with a fresh code', async () => {
    serveMe(null);
    const adapter = fakeAdapter();
    adapter.signIn.mockResolvedValue('CONFIRM_SIGN_UP');
    renderWithApp(<SignInPage />, { adapter, path: '/sign-in', route: '/sign-in', extraRoutes });
    await fillAndSubmit();
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeVisible();
    expect(screen.getByText(/not verified yet/)).toBeVisible();
    expect(adapter.resendSignUpCode).toHaveBeenCalledWith('sam@example.com');
  });

  it('sends users who must reset to the reset step', async () => {
    serveMe(null);
    const adapter = fakeAdapter();
    adapter.signIn.mockResolvedValue('RESET_PASSWORD');
    renderWithApp(<SignInPage />, { adapter, path: '/sign-in', route: '/sign-in', extraRoutes });
    await fillAndSubmit();
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    expect(adapter.forgotPassword).toHaveBeenCalledWith('sam@example.com');
  });

  it('completes the new-password challenge for admin-created accounts', async () => {
    serveMe(null);
    const adapter = fakeAdapter();
    adapter.signIn.mockResolvedValue('NEW_PASSWORD_REQUIRED');
    renderWithApp(<SignInPage />, { adapter, path: '/sign-in', route: '/sign-in' });
    await fillAndSubmit();
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeVisible();
    serveMe(student);
    await userEvent.type(screen.getByLabelText('New password'), 'Brand#NewPass1');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Brand#NewPass1');
    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(adapter.confirmNewPassword).toHaveBeenCalledWith('Brand#NewPass1');
  });

  it('shows the notice passed from another auth step', async () => {
    serveMe(null);
    renderWithApp(<SignInPage />, { path: '/sign-in', route: { pathname: '/sign-in', state: { email: 'sam@example.com', notice: 'Email verified. Sign in to continue.' } } });
    expect(await screen.findByText('Email verified. Sign in to continue.')).toBeVisible();
    expect(screen.getByLabelText('Email')).toHaveValue('sam@example.com');
  });
});

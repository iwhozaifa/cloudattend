import { act, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { fakeAdapter, renderWithApp, serveMe } from '@/test/render';
import { SignInPage } from './sign-in';
import { SignUpPage } from './sign-up';

const extraRoutes = <Route path="/sign-in" element={<SignInPage />} />;

async function fillDetails(password = 'Strong#Pass123', confirm = password) {
  await userEvent.type(await screen.findByLabelText('Full name'), 'Sam Student');
  await userEvent.type(screen.getByLabelText('Roll number'), 'cs-2026-009');
  await userEvent.type(screen.getByLabelText('Email'), 'sam@example.com');
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.type(screen.getByLabelText('Confirm password'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignUpPage', () => {
  it('shows the live password checklist that mirrors the Cognito policy', async () => {
    serveMe(null);
    renderWithApp(<SignUpPage />, { path: '/sign-up', route: '/sign-up' });
    await userEvent.type(await screen.findByLabelText('Password'), 'abc');
    const list = screen.getByRole('list', { name: 'Password requirements' });
    expect(list).toHaveTextContent('A lowercase letter (met)');
    expect(list).toHaveTextContent('A symbol (not met)');
  });

  it('blocks weak or mismatched passwords before Cognito', async () => {
    serveMe(null);
    const { adapter } = renderWithApp(<SignUpPage />, { path: '/sign-up', route: '/sign-up' });
    await fillDetails('weakpassword', 'different');
    expect(await screen.findByText('Choose a password that meets every requirement.')).toBeVisible();
    expect(screen.getByText('Passwords do not match.')).toBeVisible();
    expect(adapter.signUp).not.toHaveBeenCalled();
  });

  it('registers, verifies the emailed code, and lands on sign in', async () => {
    serveMe(null);
    const { adapter } = renderWithApp(<SignUpPage />, { path: '/sign-up', route: '/sign-up', extraRoutes });
    await fillDetails();
    expect(adapter.signUp).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'Strong#Pass123', name: 'Sam Student', rollNo: 'CS-2026-009' });
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeVisible();
    await userEvent.type(screen.getByLabelText('Verification code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByText('Email verified. Sign in to continue.')).toBeVisible();
    expect(adapter.confirmSignUp).toHaveBeenCalledWith('sam@example.com', '123456');
  });

  it('rejects a short code and surfaces a wrong code', async () => {
    serveMe(null);
    const adapter = fakeAdapter();
    adapter.confirmSignUp.mockRejectedValue(Object.assign(new Error('x'), { name: 'CodeMismatchException' }));
    renderWithApp(<SignUpPage />, { adapter, path: '/sign-up', route: '/sign-up' });
    await fillDetails();
    await userEvent.type(await screen.findByLabelText('Verification code'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByText('Enter the 6-digit code from the email.')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Verification code'), '3456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(await screen.findByText('That code is incorrect. Check the email and try again.')).toBeVisible();
  });

  it('rate-limits resending the code', async () => {
    serveMe(null);
    const { adapter } = renderWithApp(<SignUpPage />, { path: '/sign-up', route: '/sign-up' });
    await fillDetails();
    expect(await screen.findByRole('button', { name: /Resend code in 30s/ })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: /Resend code in 2[0-9]s/ })).toBeDisabled(), { timeout: 2500 });
    expect(adapter.resendSignUpCode).not.toHaveBeenCalled();
  });

  it('shows a duplicate roll number from the PreSignUp trigger', async () => {
    serveMe(null);
    const adapter = fakeAdapter();
    adapter.signUp.mockRejectedValue(Object.assign(new Error('PreSignUp failed with error This roll number is already registered..'), { name: 'UserLambdaValidationException' }));
    renderWithApp(<SignUpPage />, { adapter, path: '/sign-up', route: '/sign-up' });
    await act(async () => { await fillDetails(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('This roll number is already registered.');
  });
});

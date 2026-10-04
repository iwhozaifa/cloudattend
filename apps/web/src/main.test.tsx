import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Login, Register, friendlyError } from './main.js';

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock('@aws-amplify/auth', async () => ({
  signIn: auth.signIn, signUp: auth.signUp, signOut: vi.fn(), confirmSignUp: vi.fn(), fetchAuthSession: vi.fn(), getCurrentUser: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());
afterEach(() => document.body.replaceChildren());

describe('authentication forms', () => {
  it('renders labeled required login controls', () => {
    render(<MemoryRouter><Login/></MemoryRouter>);
    expect(screen.getByRole('textbox', { name: /email/i })).toBeRequired();
    expect(screen.getByLabelText(/password/i)).toBeRequired();
  });
  it('submits valid login credentials', async () => {
    auth.signIn.mockResolvedValue({ isSignedIn: true });
    render(<MemoryRouter><Login/></MemoryRouter>);
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'student.sandbox@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'SandboxPass123!');
    fireEvent.submit(screen.getByRole('button', { name: /sign in/i }).closest('form')!);
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith({ username: 'student.sandbox@example.com', password: 'SandboxPass123!' }));
  });
  it('rejects registration password mismatch before Cognito', async () => {
    render(<MemoryRouter><Register/></MemoryRouter>);
    await userEvent.type(screen.getByLabelText(/full name/i), 'Sbx Student');
    await userEvent.type(screen.getByLabelText(/roll number/i), 'sbx-001');
    await userEvent.type(screen.getByRole('textbox', { name: /email/i }), 'student.sandbox@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'SandboxPass123!');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'DifferentPass123!');
    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});

describe('check-in errors', () => {
  it.each([
    ['QR_EXPIRED', 'expired'], ['ATTENDANCE_ALREADY_RECORDED', 'already been recorded'],
    ['NOT_ENROLLED', 'not enrolled'], ['SESSION_CLOSED', 'has closed'], [undefined, "could not contact"]
  ])('maps %s to useful copy', (code, text) => expect(friendlyError(code)).toMatch(new RegExp(text, 'i')));
});

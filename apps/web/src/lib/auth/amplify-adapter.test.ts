import { beforeEach, describe, expect, it, vi } from 'vitest';

const amplify = vi.hoisted(() => ({
  signIn: vi.fn(), signOut: vi.fn(), confirmSignIn: vi.fn(), signUp: vi.fn(), confirmSignUp: vi.fn(), resendSignUpCode: vi.fn(),
  resetPassword: vi.fn(), confirmResetPassword: vi.fn(), updatePassword: vi.fn(), fetchAuthSession: vi.fn()
}));
vi.mock('@aws-amplify/auth', () => amplify);
const { amplifyAdapter } = await import('./amplify-adapter');
const step = (signInStep: string) => ({ isSignedIn: signInStep === 'DONE', nextStep: { signInStep } });

beforeEach(() => vi.clearAllMocks());

describe('amplifyAdapter', () => {
  it.each([
    ['DONE', 'DONE'], ['CONFIRM_SIGN_UP', 'CONFIRM_SIGN_UP'],
    ['CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED', 'NEW_PASSWORD_REQUIRED'], ['RESET_PASSWORD', 'RESET_PASSWORD']
  ])('maps sign-in step %s', async (signInStep, expected) => {
    amplify.signIn.mockResolvedValue(step(signInStep));
    await expect(amplifyAdapter.signIn('a@example.com', 'pw')).resolves.toBe(expected);
    expect(amplify.signIn).toHaveBeenCalledWith({ username: 'a@example.com', password: 'pw' });
  });
  it('rejects MFA steps the pool does not support', async () => {
    amplify.signIn.mockResolvedValue(step('CONFIRM_SIGN_IN_WITH_TOTP_CODE'));
    await expect(amplifyAdapter.signIn('a@example.com', 'pw')).rejects.toThrow('Unsupported');
  });
  it('clears a stale session and retries once', async () => {
    amplify.signIn.mockRejectedValueOnce(Object.assign(new Error('already'), { name: 'UserAlreadyAuthenticatedException' })).mockResolvedValueOnce(step('DONE'));
    await expect(amplifyAdapter.signIn('a@example.com', 'pw')).resolves.toBe('DONE');
    expect(amplify.signOut).toHaveBeenCalledOnce();
    expect(amplify.signIn).toHaveBeenCalledTimes(2);
  });
  it('sends sign-up attributes including the roll number', async () => {
    amplify.signUp.mockResolvedValue({ nextStep: { signUpStep: 'CONFIRM_SIGN_UP' } });
    await expect(amplifyAdapter.signUp({ email: 'a@example.com', password: 'pw', name: 'A B', rollNo: 'R-1' })).resolves.toBe('CONFIRM_SIGN_UP');
    expect(amplify.signUp).toHaveBeenCalledWith({ username: 'a@example.com', password: 'pw', options: { userAttributes: { email: 'a@example.com', name: 'A B', 'custom:rollNo': 'R-1' } } });
  });
  it('wires the password reset and new-password flows', async () => {
    amplify.confirmSignIn.mockResolvedValue(step('DONE'));
    await amplifyAdapter.forgotPassword('a@example.com');
    await amplifyAdapter.confirmForgotPassword('a@example.com', '123456', 'New#Password1');
    await amplifyAdapter.confirmNewPassword('New#Password1');
    expect(amplify.resetPassword).toHaveBeenCalledWith({ username: 'a@example.com' });
    expect(amplify.confirmResetPassword).toHaveBeenCalledWith({ username: 'a@example.com', confirmationCode: '123456', newPassword: 'New#Password1' });
    expect(amplify.confirmSignIn).toHaveBeenCalledWith({ challengeResponse: 'New#Password1' });
  });
  it('returns the ID token, or undefined when there is no session', async () => {
    amplify.fetchAuthSession.mockResolvedValueOnce({ tokens: { idToken: { toString: () => 'id-token' } } });
    await expect(amplifyAdapter.getToken()).resolves.toBe('id-token');
    amplify.fetchAuthSession.mockRejectedValueOnce(new Error('no session'));
    await expect(amplifyAdapter.getToken()).resolves.toBeUndefined();
  });
});

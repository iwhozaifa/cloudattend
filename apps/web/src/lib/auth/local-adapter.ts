import type { AuthAdapter, SignInNext } from './types';

const TOKEN_KEY = 'cloudattend.local.token';

function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; }
}
function writeToken(token: string | undefined) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable: session lasts for this page only */ }
}

/**
 * Talks to the local development server's Cognito emulation (`apps/api/src/local-server.ts`).
 * Only loaded in `--mode demo` / `--mode e2e`; never part of a production bundle.
 */
export function createLocalAdapter(apiUrl: string): AuthAdapter {
  let memoryToken = readToken();
  async function call<T = Record<string, unknown>>(action: string, body: unknown = {}): Promise<T> {
    const response = await fetch(`${apiUrl}/local-auth/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(memoryToken ? { authorization: `Bearer ${memoryToken}` } : {}) },
      body: JSON.stringify(body)
    });
    const data = await response.json() as T & { error?: { code: string; message: string } };
    if (!response.ok) {
      const error = new Error(data.error?.message ?? 'Request failed');
      error.name = data.error?.code ?? 'Error';
      throw error;
    }
    return data;
  }
  return {
    async signIn(email, password) {
      const result = await call<{ nextStep: SignInNext; token?: string }>('sign-in', { email, password });
      if (result.token) { memoryToken = result.token; writeToken(result.token); }
      return result.nextStep;
    },
    async confirmNewPassword() {
      return 'DONE';
    },
    async signUp(input) {
      return (await call<{ nextStep: 'CONFIRM_SIGN_UP' }>('sign-up', input)).nextStep;
    },
    async confirmSignUp(email, code) { await call('confirm-sign-up', { email, code }); },
    async resendSignUpCode(email) { await call('resend-code', { email }); },
    async forgotPassword(email) { await call('forgot-password', { email }); },
    async confirmForgotPassword(email, code, password) { await call('confirm-forgot-password', { email, code, password }); },
    async changePassword(oldPassword, newPassword) { await call('change-password', { oldPassword, newPassword }); },
    async signOut() {
      try { await call('sign-out'); } finally { memoryToken = undefined; writeToken(undefined); }
    },
    async getToken() { return memoryToken; }
  };
}

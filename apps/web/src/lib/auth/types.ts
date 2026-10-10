export type SignInNext = 'DONE' | 'CONFIRM_SIGN_UP' | 'NEW_PASSWORD_REQUIRED' | 'RESET_PASSWORD';
export type SignUpInput = { email: string; password: string; name: string; rollNo: string };

/** The authentication operations the UI needs; implemented by Amplify (Cognito) and by the local dev server. */
export interface AuthAdapter {
  signIn(email: string, password: string): Promise<SignInNext>;
  /** Completes the NEW_PASSWORD_REQUIRED challenge for administrator-created accounts. */
  confirmNewPassword(newPassword: string): Promise<SignInNext>;
  signUp(input: SignUpInput): Promise<'CONFIRM_SIGN_UP' | 'DONE'>;
  confirmSignUp(email: string, code: string): Promise<void>;
  resendSignUpCode(email: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  /** Returns the ID token for API calls, or undefined when signed out. */
  getToken(options?: { forceRefresh?: boolean }): Promise<string | undefined>;
}

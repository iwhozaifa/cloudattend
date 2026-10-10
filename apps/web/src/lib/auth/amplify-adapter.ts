import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
  type SignInOutput
} from '@aws-amplify/auth';
import type { AuthAdapter, SignInNext } from './types';

function nextStep(output: SignInOutput): SignInNext {
  switch (output.nextStep.signInStep) {
    case 'DONE': return 'DONE';
    case 'CONFIRM_SIGN_UP': return 'CONFIRM_SIGN_UP';
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED': return 'NEW_PASSWORD_REQUIRED';
    case 'RESET_PASSWORD': return 'RESET_PASSWORD';
    default: {
      // MFA and custom challenges are not enabled on the user pool.
      const error = new Error(`Unsupported sign-in step ${output.nextStep.signInStep}`);
      error.name = 'UnsupportedSignInStep';
      throw error;
    }
  }
}

/** Cognito via AWS Amplify Auth (SRP sign-in; tokens kept by Amplify's token store). */
export const amplifyAdapter: AuthAdapter = {
  async signIn(email, password) {
    try {
      return nextStep(await signIn({ username: email, password }));
    } catch (error) {
      // A stale session (e.g. another tab) blocks a new sign-in; clear it and retry once.
      if (error instanceof Error && error.name === 'UserAlreadyAuthenticatedException') {
        await signOut();
        return nextStep(await signIn({ username: email, password }));
      }
      throw error;
    }
  },
  async confirmNewPassword(newPassword) {
    return nextStep(await confirmSignIn({ challengeResponse: newPassword }));
  },
  async signUp({ email, password, name, rollNo }) {
    const result = await signUp({ username: email, password, options: { userAttributes: { email, name, 'custom:rollNo': rollNo } } });
    return result.nextStep.signUpStep === 'CONFIRM_SIGN_UP' ? 'CONFIRM_SIGN_UP' : 'DONE';
  },
  async confirmSignUp(email, code) {
    await confirmSignUp({ username: email, confirmationCode: code });
  },
  async resendSignUpCode(email) {
    await resendSignUpCode({ username: email });
  },
  async forgotPassword(email) {
    await resetPassword({ username: email });
  },
  async confirmForgotPassword(email, code, newPassword) {
    await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
  },
  async changePassword(oldPassword, newPassword) {
    await updatePassword({ oldPassword, newPassword });
  },
  async signOut() {
    await signOut();
  },
  async getToken(options) {
    try {
      const session = await fetchAuthSession({ forceRefresh: options?.forceRefresh });
      return session.tokens?.idToken?.toString();
    } catch {
      return undefined;
    }
  }
};

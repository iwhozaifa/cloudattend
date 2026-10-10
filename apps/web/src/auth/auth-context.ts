import { createContext, useContext } from 'react';
import type { Me } from '@cloudattend/shared';
import type { AuthAdapter } from '@/lib/auth/types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'error';
export type AuthContextValue = {
  adapter: AuthAdapter;
  status: AuthStatus;
  me: Me | null;
  error: unknown;
  /** True after the user chose to sign out, so the next sign-in does not resume their last page. */
  signedOutByUser: boolean;
  /** Re-reads the profile after sign-in or a role change. */
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}

export function useMe() {
  const { me } = useAuth();
  if (!me) throw new Error('useMe must be used inside <RequireAuth>.');
  return me;
}

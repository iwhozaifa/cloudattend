import { useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Me } from '@cloudattend/shared';
import { api, ApiError } from '@/lib/api';
import type { AuthAdapter } from '@/lib/auth/types';
import { AuthContext, type AuthContextValue } from './auth-context';

export const ME_QUERY_KEY = ['me'] as const;

export function AuthProvider({ adapter, children }: { adapter: AuthAdapter; children: ReactNode }) {
  const queryClient = useQueryClient();
  const loadMe = useCallback(async (): Promise<Me | null> => {
    if (!(await adapter.getToken())) return null;
    try {
      return await api<Me>('/me');
    } catch (error) {
      // Only an authentication failure means "signed out"; anything else is shown as an error.
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  }, [adapter]);
  const query = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: loadMe,
    staleTime: 5 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2
  });

  const refresh = useCallback(() => queryClient.fetchQuery({ queryKey: ME_QUERY_KEY, queryFn: loadMe, staleTime: 0 }), [queryClient, loadMe]);
  const signOut = useCallback(async () => {
    try {
      await adapter.signOut();
    } finally {
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    }
  }, [adapter, queryClient]);

  const value = useMemo<AuthContextValue>(() => ({
    adapter,
    status: query.isPending ? 'loading' : query.isError ? 'error' : query.data ? 'signedIn' : 'signedOut',
    me: query.data ?? null,
    error: query.error,
    refresh,
    signOut
  }), [adapter, query.isPending, query.isError, query.data, query.error, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import type { Me } from '@cloudattend/shared';
import { configureApi } from '@/lib/api';
import type { AuthAdapter } from '@/lib/auth/types';
import { createQueryClient, Providers } from '@/providers';
import { API, server } from './server';

export const student: Me = { userId: '33333333-3333-4333-8333-333333333333', email: 'sam@example.com', name: 'Sam Student', rollNo: 'CS-1', role: 'STUDENT', isAdmin: false, createdAt: '', updatedAt: '' };
export const teacher: Me = { userId: '11111111-1111-4111-8111-111111111111', email: 'tess@example.com', name: 'Tess Teacher', role: 'TEACHER', isAdmin: false, createdAt: '', updatedAt: '' };
export const admin: Me = { ...teacher, userId: '88888888-8888-4888-8888-888888888888', email: 'avery@example.com', name: 'Avery Admin', isAdmin: true };

export type FakeAdapter = { [K in keyof AuthAdapter]: ReturnType<typeof vi.fn> & AuthAdapter[K] };

/** An in-memory AuthAdapter whose sign-in state follows `signedInAs`. */
export function fakeAdapter(signedIn = false): FakeAdapter & { setSignedIn(value: boolean): void } {
  let token: string | undefined = signedIn ? 'token' : undefined;
  return {
    setSignedIn(value: boolean) { token = value ? 'token' : undefined; },
    signIn: vi.fn(async () => { token = 'token'; return 'DONE' as const; }),
    confirmNewPassword: vi.fn(async () => { token = 'token'; return 'DONE' as const; }),
    signUp: vi.fn(async () => 'CONFIRM_SIGN_UP' as const),
    confirmSignUp: vi.fn(async () => undefined),
    resendSignUpCode: vi.fn(async () => undefined),
    forgotPassword: vi.fn(async () => undefined),
    confirmForgotPassword: vi.fn(async () => undefined),
    changePassword: vi.fn(async () => undefined),
    signOut: vi.fn(async () => { token = undefined; }),
    getToken: vi.fn(async () => token)
  } as never;
}

/** Serves GET /me as `me` (or 401 when null). */
export function serveMe(me: Me | null) {
  server.use(http.get(`${API}/me`, () => me ? HttpResponse.json(me) : HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })));
}

export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

/** Renders `ui` inside the real providers and a router positioned at `route`. */
export function renderWithApp(ui: ReactElement, { adapter = fakeAdapter(), route = '/', path = '*', extraRoutes }: { adapter?: AuthAdapter; route?: string | { pathname: string; search?: string; state?: unknown }; path?: string; extraRoutes?: ReactElement } = {}) {
  configureApi({ apiUrl: API, getToken: () => adapter.getToken() });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } });
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <Providers adapter={adapter} queryClient={queryClient}>
        <Routes>
          <Route path={path} element={ui} />
          {extraRoutes}
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </Providers>
    </MemoryRouter>
  );
  return { ...result, adapter, queryClient };
}

import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fakeAdapter, renderWithApp, serveMe, student, teacher } from '@/test/render';
import { API, server } from '@/test/server';
import { PublicOnly, RequireAuth, RequireRole } from './guards';

describe('route guards', () => {
  it('sends signed-out users to sign in with a return path', async () => {
    renderWithApp(<RequireAuth><p>secret</p></RequireAuth>, { path: '/courses/:id', route: '/courses/abc?tab=report' });
    expect(await screen.findByTestId('location')).toHaveTextContent('/sign-in?returnTo=%2Fcourses%2Fabc%3Ftab%3Dreport');
  });

  it('treats an expired API session (401) as signed out', async () => {
    serveMe(null);
    renderWithApp(<RequireAuth><p>secret</p></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    expect(await screen.findByTestId('location')).toHaveTextContent('/sign-in');
  });

  it('shows a retryable error instead of looping to sign-in when the API fails', async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, { status: 500 })));
    renderWithApp(<RequireAuth><p>secret</p></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    expect(await screen.findByText('We could not load your account', {}, { timeout: 4000 })).toBeVisible();
    serveMe(student);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('secret')).toBeVisible();
  });

  it('enforces roles and the admin flag', async () => {
    serveMe(student);
    renderWithApp(<RequireAuth><RequireRole role="TEACHER"><p>teacher only</p></RequireRole></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    expect(await screen.findByText("You don't have access to this page")).toBeVisible();
    expect(screen.queryByText('teacher only')).toBeNull();
  });

  it('lets admins through admin-only routes', async () => {
    serveMe({ ...teacher, isAdmin: true });
    renderWithApp(<RequireAuth><RequireRole admin><p>admin area</p></RequireRole></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    expect(await screen.findByText('admin area')).toBeVisible();
  });

  it('redirects signed-in users away from auth pages to a safe destination', async () => {
    serveMe(student);
    renderWithApp(<PublicOnly><p>sign in form</p></PublicOnly>, { adapter: fakeAdapter(true), path: '/sign-in', route: '/sign-in?returnTo=//evil.example' });
    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/$/);
  });
});

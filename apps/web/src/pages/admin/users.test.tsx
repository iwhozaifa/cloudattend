import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/auth/guards';
import { admin, fakeAdapter, renderWithApp, serveMe } from '@/test/render';
import { API, server } from '@/test/server';
import { AdminUsersPage } from './users';

describe('AdminUsersPage', () => {
  it('filters users and promotes a student after confirmation', async () => {
    serveMe(admin);
    const users = [
      { userId: admin.userId, name: 'Avery Admin', email: 'avery@example.com', role: 'TEACHER' },
      { userId: 'u2', name: 'Riley Learner', email: 'riley@example.com', rollNo: 'CS-2', role: 'STUDENT' },
      { userId: 'u3', name: 'Sam Student', email: 'sam@example.com', rollNo: 'CS-1', role: 'STUDENT' }
    ];
    const changes: unknown[] = [];
    server.use(
      http.get(`${API}/admin/users`, () => HttpResponse.json(users)),
      http.post(`${API}/admin/users/:userId/role`, async ({ params, request }) => {
        const body = await request.json() as { role: string };
        changes.push([params.userId, body.role]);
        const user = users.find((candidate) => candidate.userId === params.userId)!;
        user.role = body.role;
        return HttpResponse.json(user);
      })
    );
    renderWithApp(<RequireAuth><AdminUsersPage /></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    expect(await screen.findByText('You')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Search users'), 'riley');
    expect(screen.queryByText('Sam Student')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Make teacher: Riley Learner' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Make teacher' }));
    await waitFor(() => expect(changes).toEqual([['u2', 'TEACHER']]));
    expect(await screen.findByRole('button', { name: 'Make student: Riley Learner' })).toBeVisible();
    await userEvent.clear(screen.getByLabelText('Search users'));
    await userEvent.click(screen.getByRole('tab', { name: 'Students' }));
    expect(screen.getByText('Sam Student')).toBeVisible();
    expect(screen.queryByText('Riley Learner')).toBeNull();
  });
});

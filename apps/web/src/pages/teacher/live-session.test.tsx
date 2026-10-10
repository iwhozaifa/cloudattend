import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fakeAdapter, renderWithApp, serveMe, teacher } from '@/test/render';
import { API, server } from '@/test/server';
import { checkInUrl, LiveSessionPage } from './live-session';

const SESSION = '66666666-6666-4666-8666-666666666666';
const course = { courseId: 'c1', courseCode: 'CS101', courseName: 'Cloud', semester: 'Fall', section: 'A', attendanceThreshold: 75, teacherId: teacher.userId, createdAt: '', updatedAt: '' };
function session(status: 'OPEN' | 'CLOSED') {
  return { sessionId: SESSION, courseId: 'c1', teacherId: teacher.userId, status, startTime: new Date().toISOString(), scheduledEndTime: new Date(Date.now() + 600_000).toISOString(), tokenLifetimeSeconds: 45, createdAt: '', course };
}

describe('LiveSessionPage', () => {
  it('rotates the QR token before it expires and lists check-ins live', async () => {
    serveMe(teacher);
    let tokens = 0;
    let state: 'OPEN' | 'CLOSED' = 'OPEN';
    server.use(
      http.get(`${API}/sessions/${SESSION}`, () => HttpResponse.json(session(state))),
      // Expiring in 5 s means the refresh margin is already reached, so the next fetch is scheduled ~1 s out.
      http.get(`${API}/sessions/${SESSION}/qr-token`, () => { tokens += 1; const now = Math.floor(Date.now() / 1000); return HttpResponse.json({ token: `tok${tokens}.sig`, issuedAt: now, expiresAt: now + 5 }); }),
      http.get(`${API}/sessions/${SESSION}/attendance`, () => HttpResponse.json([{ sessionId: SESSION, studentId: 's1', courseId: 'c1', teacherId: teacher.userId, checkInTime: new Date().toISOString(), status: 'PRESENT', createdAt: '', name: 'Sam Student', rollNo: 'CS-1' }])),
      http.post(`${API}/sessions/${SESSION}/close`, () => { state = 'CLOSED'; return HttpResponse.json({ ...session('CLOSED') }); })
    );
    renderWithApp(<LiveSessionPage />, { adapter: fakeAdapter(true), path: '/sessions/:sessionId/live', route: `/sessions/${SESSION}/live` });
    expect(await screen.findByTestId('qr-code')).toHaveAttribute('data-token', 'tok1.sig');
    await waitFor(() => expect(screen.getByTestId('qr-code')).toHaveAttribute('data-token', 'tok2.sig'), { timeout: 3000 });
    expect(within(await screen.findByRole('list', { name: 'Checked-in students' })).getByText('Sam Student')).toBeVisible();
    expect(screen.getByTestId('present-count')).toHaveTextContent('1');

    await userEvent.click(screen.getByRole('button', { name: 'Close session' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Close session' }));
    expect(await screen.findByText('Closed')).toBeVisible();
    expect(screen.queryByTestId('qr-code')).toBeNull();
  });

  it('encodes the token into a same-origin check-in link', () => {
    expect(checkInUrl('a.b+c', 'https://attend.example.edu')).toBe('https://attend.example.edu/check-in?token=a.b%2Bc');
  });
});

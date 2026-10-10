import { StrictMode } from 'react';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fakeAdapter, renderWithApp, serveMe, student } from '@/test/render';
import { API, server } from '@/test/server';
import { CheckInPage } from './check-in';

const result = { sessionId: 's', studentId: student.userId, courseId: 'c', teacherId: 't', checkInTime: '2026-10-10T09:00:00.000Z', status: 'PRESENT', createdAt: '', courseCode: 'CS101', courseName: 'Cloud Computing' };

describe('CheckInPage', () => {
  it('submits the token exactly once under StrictMode and strips it from the URL', async () => {
    serveMe(student);
    const bodies: unknown[] = [];
    server.use(http.post(`${API}/attendance/check-in`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(result, { status: 201 }); }));
    renderWithApp(<StrictMode><CheckInPage /></StrictMode>, { adapter: fakeAdapter(true), path: '/check-in', route: '/check-in?token=abc.def' });
    expect(await screen.findByText('Attendance recorded')).toBeVisible();
    expect(screen.getByText('CS101 · Cloud Computing')).toBeVisible();
    expect(bodies).toEqual([{ token: 'abc.def' }]);
  });

  it('explains a duplicate check-in without calling it a failure', async () => {
    serveMe(student);
    server.use(http.post(`${API}/attendance/check-in`, () => HttpResponse.json({ error: { code: 'ATTENDANCE_ALREADY_RECORDED', message: 'Attendance already recorded.' } }, { status: 409 })));
    renderWithApp(<CheckInPage />, { adapter: fakeAdapter(true), path: '/check-in', route: '/check-in?token=abc.def' });
    expect(await screen.findByText('Already checked in')).toBeVisible();
    expect(screen.getByText('Your attendance for this class has already been recorded.')).toBeVisible();
  });

  it.each([
    ['QR_EXPIRED', /has expired/],
    ['NOT_ENROLLED', /not enrolled/],
    ['SESSION_CLOSED', /has closed/]
  ])('shows a helpful message for %s', async (code, text) => {
    serveMe(student);
    server.use(http.post(`${API}/attendance/check-in`, () => HttpResponse.json({ error: { code, message: 'x' } }, { status: 400 })));
    renderWithApp(<CheckInPage />, { adapter: fakeAdapter(true), path: '/check-in', route: '/check-in?token=abc.def' });
    expect(await screen.findByText('Check-in failed')).toBeVisible();
    expect(screen.getByText(text)).toBeVisible();
  });

  it('offers the scanner when there is no valid token', async () => {
    serveMe(student);
    renderWithApp(<CheckInPage />, { adapter: fakeAdapter(true), path: '/check-in', route: '/check-in?token=not%20a%20token' });
    expect(await screen.findByText('No check-in code')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open scanner' })).toHaveAttribute('href', '/scan');
  });
});

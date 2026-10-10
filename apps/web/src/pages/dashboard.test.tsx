import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/auth/guards';
import { fakeAdapter, renderWithApp, serveMe, student, teacher } from '@/test/render';
import { API, server } from '@/test/server';
import { DashboardPage } from './dashboard';

describe('DashboardPage', () => {
  it('lets a teacher create their first course', async () => {
    serveMe(teacher);
    const courses: object[] = [];
    server.use(
      http.get(`${API}/courses`, () => HttpResponse.json(courses)),
      http.post(`${API}/courses`, async ({ request }) => { const course = { ...(await request.json() as object), courseId: 'c1', teacherId: teacher.userId }; courses.push(course); return HttpResponse.json(course, { status: 201 }); })
    );
    renderWithApp(<RequireAuth><DashboardPage /></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    expect(await screen.findByText('No courses yet')).toBeVisible();
    await userEvent.click(screen.getAllByRole('button', { name: 'New course' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Course code'), 'cs101');
    await userEvent.type(within(dialog).getByLabelText('Section'), 'A');
    await userEvent.type(within(dialog).getByLabelText('Course name'), 'Cloud Computing');
    await userEvent.type(within(dialog).getByLabelText('Semester'), 'Fall 2026');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create course' }));
    expect(await screen.findByRole('link', { name: 'Open CS101 Cloud Computing' })).toHaveAttribute('href', '/courses/c1');
  });

  it('shows a student their enrollment and attendance rate', async () => {
    serveMe(student);
    server.use(http.get(`${API}/me/attendance`, () => HttpResponse.json([{
      course: { courseId: 'c1', courseCode: 'CS101', courseName: 'Cloud Computing', semester: 'Fall', section: 'A', attendanceThreshold: 75 },
      totalSessions: 4, attended: 2, percentage: 50, belowThreshold: true, records: []
    }])));
    renderWithApp(<RequireAuth><DashboardPage /></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    expect(await screen.findByText('50%')).toBeVisible();
    expect(screen.getByText('Below 75%')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Scan QR code' })).toHaveAttribute('href', '/scan');
  });

  it('tells an unenrolled student what to give their teacher', async () => {
    serveMe(student);
    server.use(http.get(`${API}/me/attendance`, () => HttpResponse.json([])));
    renderWithApp(<RequireAuth><DashboardPage /></RequireAuth>, { adapter: fakeAdapter(true), path: '/', route: '/' });
    await waitFor(() => expect(screen.getByText(/not enrolled in any courses/)).toBeVisible());
    expect(screen.getByText(student.rollNo!)).toBeVisible();
  });
});

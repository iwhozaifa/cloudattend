import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fakeAdapter, renderWithApp, serveMe, teacher } from '@/test/render';
import { API, server } from '@/test/server';
import { CourseDetailPage, enrollmentBody } from './course-detail';

const COURSE = '55555555-5555-4555-8555-555555555555';
const course = { courseId: COURSE, courseCode: 'CS101', courseName: 'Cloud Computing', semester: 'Fall 2026', section: 'A', attendanceThreshold: 75, teacherId: teacher.userId, createdAt: '', updatedAt: '' };

function serveCourse() {
  const roster = [{ courseId: COURSE, studentId: 's1', enrolledAt: '', name: 'Sam Student', email: 'sam@example.com', rollNo: 'CS-1' }];
  const calls: { enroll: unknown[]; removed: string[]; updated: unknown[] } = { enroll: [], removed: [], updated: [] };
  serveMe(teacher);
  server.use(
    http.get(`${API}/courses/${COURSE}`, () => HttpResponse.json(course)),
    http.put(`${API}/courses/${COURSE}`, async ({ request }) => { const body = await request.json() as object; calls.updated.push(body); return HttpResponse.json({ ...course, ...body }); }),
    http.get(`${API}/courses/${COURSE}/sessions`, () => HttpResponse.json([
      { sessionId: 'x1', courseId: COURSE, status: 'CLOSED', startTime: '2026-10-01T09:00:00.000Z', scheduledEndTime: '2026-10-01T09:10:00.000Z', presentCount: 12 }
    ])),
    http.get(`${API}/courses/${COURSE}/students`, () => HttpResponse.json(roster)),
    http.post(`${API}/courses/${COURSE}/students`, async ({ request }) => {
      const body = await request.json() as Record<string, string>;
      calls.enroll.push(body);
      if (body.rollNo === 'NOPE') return HttpResponse.json({ error: { code: 'STUDENT_NOT_FOUND', message: 'No student account matches that detail. Ask the student to register first.' } }, { status: 404 });
      roster.push({ courseId: COURSE, studentId: 's2', enrolledAt: '', name: 'Riley Learner', email: 'riley@example.com', rollNo: 'CS-2' });
      return HttpResponse.json(roster.at(-1), { status: 201 });
    }),
    http.delete(`${API}/courses/${COURSE}/students/:studentId`, ({ params }) => { calls.removed.push(String(params.studentId)); roster.splice(0, 1); return HttpResponse.json({ removed: true }); }),
    http.get(`${API}/courses/${COURSE}/report`, () => HttpResponse.json({ course, totalSessions: 4, rows: [
      { studentId: 's1', name: 'Sam Student', rollNo: 'CS-1', attended: 4, totalSessions: 4, percentage: 100, belowThreshold: false },
      { studentId: 's2', name: 'Riley Learner', rollNo: 'CS-2', attended: 1, totalSessions: 4, percentage: 25, belowThreshold: true }
    ] }))
  );
  return calls;
}
const open = (tab = 'sessions') => renderWithApp(<CourseDetailPage />, { adapter: fakeAdapter(true), path: '/courses/:courseId', route: `/courses/${COURSE}?tab=${tab}` });

describe('CourseDetailPage', () => {
  it('shows course details and session history', async () => {
    serveCourse();
    open();
    expect(await screen.findByRole('heading', { name: 'Cloud Computing' })).toBeVisible();
    expect(await screen.findByRole('cell', { name: '12' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start attendance' })).toBeVisible();
  });

  it('adds students by email or roll number and reports unknown students inline', async () => {
    const calls = serveCourse();
    open('roster');
    const input = await screen.findByLabelText('Email or roll number');
    await userEvent.type(input, 'Riley@Example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add to roster' }));
    expect(await screen.findByRole('cell', { name: 'Riley Learner' })).toBeVisible();
    await userEvent.type(input, 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Add to roster' }));
    expect(await screen.findByText(/Ask the student to register first/)).toBeVisible();
    expect(calls.enroll).toEqual([{ email: 'riley@example.com' }, { rollNo: 'NOPE' }]);
  });

  it('confirms before removing a student', async () => {
    const calls = serveCourse();
    open('roster');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sam Student' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls.removed).toEqual(['s1']));
  });

  it('summarises the report and flags students below the threshold', async () => {
    serveCourse();
    open('report');
    expect(await screen.findByText('62.5%')).toBeVisible();
    expect(screen.getByText('Below threshold', { selector: '[data-slot=badge]' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeEnabled();
  });

  it('edits the course through the dialog with validation', async () => {
    const calls = serveCourse();
    open();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    const threshold = within(dialog).getByLabelText('Attendance threshold (%)');
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '150');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('Use 1–100.')).toBeVisible();
    await userEvent.clear(threshold);
    await userEvent.type(threshold, '80');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(calls.updated).toEqual([expect.objectContaining({ attendanceThreshold: 80, courseCode: 'CS101' })]));
  });

  it('parses the enroll box as email or roll number', () => {
    expect(enrollmentBody(' A@B.edu ')).toEqual({ email: 'a@b.edu' });
    expect(enrollmentBody('cs-2026-1')).toEqual({ rollNo: 'CS-2026-1' });
    expect(() => enrollmentBody('bad@')).toThrow();
  });
});

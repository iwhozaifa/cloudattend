import { describe, expect, it, vi } from 'vitest';
import { csvCell, identity, route, type UserDirectory } from '../src/core.js';
import { clock, COURSE, cfg, event, NOW, openStore, OTHER_STUDENT, OTHER_TEACHER, parsed, SESSION, STUDENT, TEACHER, token } from './fixtures.js';

const ADMIN = '88888888-8888-4888-8888-888888888888';

function seededStore() {
  const store = openStore();
  store.seed('users', { userId: STUDENT, role: 'STUDENT', name: 'Ada Student', email: 'ada@example.com', rollNo: 'SBX-001' });
  store.seed('users', { userId: OTHER_STUDENT, role: 'STUDENT', name: 'Bo Other', email: 'bo@example.com', rollNo: 'SBX-002' });
  store.seed('users', { userId: TEACHER, role: 'TEACHER', name: 'Tess Teacher', email: 'tess@example.com' });
  store.seed('users', { userId: 'ROLL#SBX-001', itemType: 'ROLL_CLAIM', claimedBy: STUDENT });
  store.seed('courses', { courseId: COURSE, teacherId: TEACHER, courseCode: 'SBX101', courseName: 'Sandbox', semester: 'Fall', section: 'A', attendanceThreshold: 75 });
  store.seed('enrollments', { courseId: COURSE, studentId: STUDENT, enrolledAt: '2026-09-01T00:00:00.000Z' });
  return store;
}

describe('identity claims', () => {
  it('parses the bracketed space-separated form API Gateway sends for array claims', () => {
    expect(identity(event('GET', '/', '[TEACHER ADMIN]', TEACHER)).groups).toEqual(['TEACHER', 'ADMIN']);
    expect(identity(event('GET', '/', '[STUDENT]')).groups).toEqual(['STUDENT']);
  });
  it('treats ADMIN as additive and reports it on /me', async () => {
    const result = await route(event('GET', '/me', ['TEACHER', 'ADMIN'], TEACHER), seededStore(), cfg, clock);
    expect(parsed(result)).toMatchObject({ userId: TEACHER, role: 'TEACHER', isAdmin: true });
  });
});

describe('courses', () => {
  it('lists a student\'s courses with full course details', async () => {
    const result = await route(event('GET', '/courses', 'STUDENT', STUDENT), seededStore(), cfg, clock);
    expect(parsed(result)).toEqual([expect.objectContaining({ courseId: COURSE, courseCode: 'SBX101', courseName: 'Sandbox', enrolledAt: '2026-09-01T00:00:00.000Z' })]);
  });
  it('lists only the teacher\'s own courses', async () => {
    const store = seededStore();
    store.seed('courses', { courseId: '99999999-9999-4999-8999-999999999999', teacherId: OTHER_TEACHER, courseCode: 'OTH100' });
    const result = await route(event('GET', '/courses', 'TEACHER', TEACHER), store, cfg, clock);
    expect(parsed(result).map((course: { courseCode: string }) => course.courseCode)).toEqual(['SBX101']);
  });
  it('deletes a course and its enrollments, but not while a session is open', async () => {
    const store = seededStore();
    await route(event('POST', `/courses/${COURSE}/sessions`, 'TEACHER', TEACHER, { durationMinutes: 5 }), store, cfg, clock);
    const blocked = await route(event('DELETE', `/courses/${COURSE}`, 'TEACHER', TEACHER), store, cfg, clock);
    expect(parsed(blocked).error.code).toBe('SESSION_OPEN');
    const later = { ...clock, now: () => NOW + 6 * 60_000 };
    const removed = await route(event('DELETE', `/courses/${COURSE}`, 'TEACHER', TEACHER), store, cfg, later);
    expect(removed.statusCode).toBe(200);
    expect(await store.get('courses', { courseId: COURSE })).toBeUndefined();
    expect(await store.query('enrollments', undefined, 'courseId', COURSE)).toEqual([]);
  });
  it('blocks deleting another teacher\'s course', async () => {
    expect((await route(event('DELETE', `/courses/${COURSE}`, 'TEACHER', OTHER_TEACHER), seededStore(), cfg, clock)).statusCode).toBe(403);
  });
});

describe('roster and enrollment', () => {
  it.each([
    ['email', { email: ' BO@example.com ' }],
    ['roll number', { rollNo: 'sbx-002' }],
    ['student id', { studentId: OTHER_STUDENT }]
  ])('enrolls a student by %s', async (_name, body) => {
    const store = seededStore();
    const result = await route(event('POST', `/courses/${COURSE}/students`, 'TEACHER', TEACHER, body), store, cfg, clock);
    expect(result.statusCode).toBe(201);
    expect(parsed(result)).toMatchObject({ studentId: OTHER_STUDENT, name: 'Bo Other' });
  });
  it('refuses to enroll a teacher or an unknown person', async () => {
    const teacher = await route(event('POST', `/courses/${COURSE}/students`, 'TEACHER', TEACHER, { email: 'tess@example.com' }), seededStore(), cfg, clock);
    expect(parsed(teacher).error.code).toBe('STUDENT_NOT_FOUND');
    const unknown = await route(event('POST', `/courses/${COURSE}/students`, 'TEACHER', TEACHER, { rollNo: 'NOPE-1' }), seededStore(), cfg, clock);
    expect(unknown.statusCode).toBe(404);
  });
  it('rejects ambiguous enrollment bodies', async () => {
    const result = await route(event('POST', `/courses/${COURSE}/students`, 'TEACHER', TEACHER, { email: 'bo@example.com', rollNo: 'SBX-002' }), seededStore(), cfg, clock);
    expect(result.statusCode).toBe(422);
  });
  it('returns the roster with names and emails', async () => {
    const result = await route(event('GET', `/courses/${COURSE}/students`, 'TEACHER', TEACHER), seededStore(), cfg, clock);
    expect(parsed(result)).toEqual([expect.objectContaining({ studentId: STUDENT, name: 'Ada Student', email: 'ada@example.com', rollNo: 'SBX-001' })]);
  });
  it('removes an enrollment and reports a missing one', async () => {
    const store = seededStore();
    expect((await route(event('DELETE', `/courses/${COURSE}/students/${STUDENT}`, 'TEACHER', TEACHER), store, cfg, clock)).statusCode).toBe(200);
    expect(parsed(await route(event('DELETE', `/courses/${COURSE}/students/${STUDENT}`, 'TEACHER', TEACHER), store, cfg, clock)).error.code).toBe('ENROLLMENT_NOT_FOUND');
  });
});

describe('sessions, live attendance, and reports', () => {
  async function withCheckIn() {
    const store = seededStore();
    store.seed('sessions', { sessionId: SESSION, courseId: COURSE, teacherId: TEACHER, status: 'OPEN', startTime: new Date(NOW - 60_000).toISOString(), scheduledEndTime: new Date(NOW + 60_000).toISOString() });
    store.seed('sessions', { sessionId: '12121212-1212-4121-8121-121212121212', courseId: COURSE, teacherId: TEACHER, status: 'OPEN', startTime: new Date(NOW - 86_400_000).toISOString(), scheduledEndTime: new Date(NOW - 86_000_000).toISOString() });
    await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token() }), store, cfg, clock);
    return store;
  }

  it('returns check-in confirmation with the course name', async () => {
    const result = await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token() }), seededStore(), cfg, clock);
    expect(parsed(result)).toMatchObject({ courseCode: 'SBX101', courseName: 'Sandbox', status: 'PRESENT' });
  });
  it('lists session history newest first with effective status and counts', async () => {
    const result = parsed(await route(event('GET', `/courses/${COURSE}/sessions`, 'TEACHER', TEACHER), await withCheckIn(), cfg, clock));
    expect(result.map((session: { status: string; presentCount: number }) => [session.status, session.presentCount])).toEqual([['OPEN', 1], ['CLOSED', 0]]);
  });
  it('returns one session with its course for the live view', async () => {
    const result = parsed(await route(event('GET', `/sessions/${SESSION}`, 'TEACHER', TEACHER), await withCheckIn(), cfg, clock));
    expect(result).toMatchObject({ sessionId: SESSION, status: 'OPEN', course: { courseCode: 'SBX101' } });
  });
  it('lists live attendees with names', async () => {
    const result = parsed(await route(event('GET', `/sessions/${SESSION}/attendance`, 'TEACHER', TEACHER), await withCheckIn(), cfg, clock));
    expect(result).toEqual([expect.objectContaining({ studentId: STUDENT, name: 'Ada Student', status: 'PRESENT' })]);
  });
  it.each([
    ['GET', `/sessions/${SESSION}`], ['GET', `/sessions/${SESSION}/attendance`], ['GET', `/courses/${COURSE}/sessions`], ['GET', `/courses/${COURSE}/report`]
  ])('blocks other teachers and students from %s %s', async (method, path) => {
    const store = await withCheckIn();
    expect((await route(event(method, path, 'TEACHER', OTHER_TEACHER), store, cfg, clock)).statusCode).toBe(403);
    expect((await route(event(method, path, 'STUDENT', STUDENT), store, cfg, clock)).statusCode).toBe(403);
  });
  it('reports per-student percentages against the course threshold', async () => {
    const store = await withCheckIn();
    store.seed('enrollments', { courseId: COURSE, studentId: OTHER_STUDENT, enrolledAt: '2026-09-02T00:00:00.000Z' });
    const result = parsed(await route(event('GET', `/courses/${COURSE}/report`, 'TEACHER', TEACHER), store, cfg, clock));
    expect(result.totalSessions).toBe(2);
    expect(result.rows).toEqual([
      expect.objectContaining({ name: 'Ada Student', attended: 1, percentage: 50, belowThreshold: true }),
      expect.objectContaining({ name: 'Bo Other', attended: 0, percentage: 0, belowThreshold: true })
    ]);
  });
  it('exports the report as CSV with formula injection neutralised', async () => {
    const store = await withCheckIn();
    store.seed('users', { userId: STUDENT, role: 'STUDENT', name: '=HYPERLINK("http://evil")', email: 'ada@example.com', rollNo: 'SBX-001' });
    const result = await route(event('GET', `/courses/${COURSE}/report`, 'TEACHER', TEACHER, undefined, { format: 'csv' }), store, cfg, clock);
    expect(result.headers?.['content-type']).toContain('text/csv');
    expect(result.headers?.['content-disposition']).toContain('SBX101-attendance.csv');
    const lines = String(result.body).trim().split('\r\n');
    expect(lines[0]).toBe('Roll number,Name,Email,Attended,Total sessions,Percentage,Below threshold');
    expect(lines[1]).toBe('SBX-001,"\'=HYPERLINK(""http://evil"")",ada@example.com,1,2,50,yes');
  });
  it('gives students their own attendance summary only', async () => {
    const store = await withCheckIn();
    const mine = parsed(await route(event('GET', '/me/attendance', 'STUDENT', STUDENT), store, cfg, clock));
    expect(mine).toEqual([expect.objectContaining({ course: expect.objectContaining({ courseCode: 'SBX101' }), attended: 1, totalSessions: 2, percentage: 50, belowThreshold: true })]);
    expect(mine[0].records).toHaveLength(1);
    const other = parsed(await route(event('GET', '/me/attendance', 'STUDENT', OTHER_STUDENT), store, cfg, clock));
    expect(other).toEqual([]);
    expect((await route(event('GET', '/me/attendance', 'TEACHER', TEACHER), store, cfg, clock)).statusCode).toBe(403);
  });
});

describe('csvCell', () => {
  it.each([
    ['plain', 'plain'], ['a,b', '"a,b"'], ['say "hi"', '"say ""hi"""'], ['=1+1', "'=1+1"], ['+1', "'+1"], ['-1', "'-1"], ['@SUM', "'@SUM"], [undefined, ''], [42, '42']
  ])('encodes %j', (input, expected) => expect(csvCell(input)).toBe(expected));
});

describe('admin user management', () => {
  const directory = (): UserDirectory & { setRole: ReturnType<typeof vi.fn> } => ({ setRole: vi.fn().mockResolvedValue(undefined) });

  it('lists users by role and hides roll-claim records', async () => {
    const result = parsed(await route(event('GET', '/admin/users', ['TEACHER', 'ADMIN'], ADMIN), seededStore(), cfg, clock));
    expect(result.map((user: { email: string }) => user.email)).toEqual(['ada@example.com', 'bo@example.com', 'tess@example.com']);
    const teachers = parsed(await route(event('GET', '/admin/users', ['TEACHER', 'ADMIN'], ADMIN, undefined, { role: 'TEACHER' }), seededStore(), cfg, clock));
    expect(teachers).toHaveLength(1);
  });
  it('promotes a student through the directory and updates the profile', async () => {
    const store = seededStore();
    const dir = directory();
    const result = await route(event('POST', `/admin/users/${STUDENT}/role`, ['TEACHER', 'ADMIN'], ADMIN, { role: 'TEACHER' }), store, cfg, { ...clock, directory: dir });
    expect(result.statusCode).toBe(200);
    expect(dir.setRole).toHaveBeenCalledWith(STUDENT, 'TEACHER');
    expect((await store.get('users', { userId: STUDENT }))?.role).toBe('TEACHER');
  });
  it('is a no-op when the role is unchanged', async () => {
    const dir = directory();
    await route(event('POST', `/admin/users/${STUDENT}/role`, ['TEACHER', 'ADMIN'], ADMIN, { role: 'STUDENT' }), seededStore(), cfg, { ...clock, directory: dir });
    expect(dir.setRole).not.toHaveBeenCalled();
  });
  it.each([
    ['non-admin teacher', 'TEACHER', TEACHER, 403],
    ['non-admin student', 'STUDENT', STUDENT, 403]
  ])('rejects a %s', async (_name, groups, id, status) => {
    expect((await route(event('GET', '/admin/users', groups, id), seededStore(), cfg, clock)).statusCode).toBe(status);
    expect((await route(event('POST', `/admin/users/${OTHER_STUDENT}/role`, groups, id, { role: 'TEACHER' }), seededStore(), cfg, { ...clock, directory: directory() })).statusCode).toBe(status);
  });
  it('rejects self-change, roll-claim targets, and invalid roles', async () => {
    const admin = ['STUDENT', 'ADMIN'];
    expect(parsed(await route(event('POST', `/admin/users/${STUDENT}/role`, admin, STUDENT, { role: 'TEACHER' }), seededStore(), cfg, { ...clock, directory: directory() })).error.code).toBe('CANNOT_CHANGE_SELF');
    expect((await route(event('POST', `/admin/users/${STUDENT}/role`, admin, ADMIN, { role: 'ADMIN' }), seededStore(), cfg, { ...clock, directory: directory() })).statusCode).toBe(422);
    expect((await route(event('GET', '/admin/users', admin, ADMIN, undefined, { role: 'ADMIN' }), seededStore(), cfg, clock)).statusCode).toBe(422);
  });
});

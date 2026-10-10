import { describe, expect, it } from 'vitest';
import { identity, requireRole, route, verifyQr } from '../src/core.js';
import { clock, COURSE, cfg, event, NOW, openStore, OTHER_STUDENT, OTHER_TEACHER, parsed, SECRET, SESSION, STUDENT, TEACHER, token } from './fixtures.js';

describe('auth and RBAC', () => {
  it('identifies string and array group claims', () => {
    expect(identity(event('GET', '/', 'STUDENT')).groups).toEqual(['STUDENT']);
    expect(identity(event('GET', '/', ['TEACHER'], TEACHER)).groups).toEqual(['TEACHER']);
  });
  it.each([undefined, [], ['STUDENT', 'TEACHER'], 42])('rejects missing, ambiguous, or malformed groups: %j', (groups) => {
    const candidate = event('GET', '/', groups as string | string[] | undefined);
    expect(() => requireRole(candidate, 'STUDENT')).toThrow();
  });
  it('rejects the opposite role on both protected operation types', async () => {
    expect((await route(event('POST', '/courses', 'STUDENT', STUDENT, {}), openStore(), cfg, clock)).statusCode).toBe(403);
    expect((await route(event('POST', '/attendance/check-in', 'TEACHER', TEACHER, { token: token() }), openStore(), cfg, clock)).statusCode).toBe(403);
  });
});

describe('QR tokens', () => {
  it('round-trips the complete payload', () => expect(verifyQr(token(), SECRET, NOW / 1000)).toMatchObject({ sessionId: SESSION, courseId: COURSE, jti: 'sbx-jti' }));
  it.each([
    ['', 'empty'], ['a.b.c', 'extra segment'], ['not-base64!.sig', 'wrong encoding'],
    [token().slice(0, -1), 'modified signature'], [`${token().split('.')[0].slice(1)}.${token().split('.')[1]}`, 'modified payload']
  ])('rejects %s (%s)', (candidate) => expect(() => verifyQr(candidate, SECRET, NOW / 1000)).toThrow());
  it('rejects a different signing secret', () => expect(() => verifyQr(token(), 'different-secret', NOW / 1000)).toThrow());
  it('rejects expiry exactly on the boundary', () => expect(() => verifyQr(token({ exp: NOW / 1000 }), SECRET, NOW / 1000)).toThrowError(/expired/i));
  it('rejects an issued-at time beyond 30-second clock skew', () => expect(() => verifyQr(token({ iat: NOW / 1000 + 31 }), SECRET, NOW / 1000)).toThrowError(/not yet valid/i));
  it('cannot accept none-style algorithm confusion', () => expect(() => verifyQr('eyJhbGciOiJub25lIn0.e30.', SECRET, NOW / 1000)).toThrow());
});

describe('check-in validation and concurrency', () => {
  it('stores identity and ownership fields derived from JWT/session', async () => {
    const store = openStore();
    const result = await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token(), studentId: OTHER_STUDENT, role: 'TEACHER', courseId: 'attacker' }), store, cfg, clock);
    expect(result.statusCode).toBe(422);
    const valid = await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token() }), store, cfg, clock);
    expect(valid.statusCode).toBe(201);
    expect(await store.get('attendance', { sessionId: SESSION, studentId: STUDENT })).toMatchObject({ studentId: STUDENT, courseId: COURSE, teacherId: TEACHER });
  });
  it.each([
    ['unenrolled', (s: MemoryStore) => s.rows.delete(`enrollments:${COURSE}:${STUDENT}`), 403, 'NOT_ENROLLED'],
    ['missing session', (s: MemoryStore) => s.rows.delete(`sessions:${SESSION}`), 404, 'SESSION_NOT_FOUND'],
    ['closed session', (s: MemoryStore) => { s.seed('sessions', { sessionId: SESSION, courseId: COURSE, teacherId: TEACHER, status: 'CLOSED', scheduledEndTime: new Date(NOW + 60_000).toISOString() }); }, 400, 'SESSION_CLOSED'],
    ['past window', (s: MemoryStore) => { s.seed('sessions', { sessionId: SESSION, courseId: COURSE, teacherId: TEACHER, status: 'OPEN', scheduledEndTime: new Date(NOW).toISOString() }); }, 400, 'SESSION_CLOSED']
  ])('rejects %s', async (_name, mutate, status, code) => {
    const store = openStore(); mutate(store);
    const result = await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token() }), store, cfg, clock);
    expect(result.statusCode).toBe(status); expect(parsed(result).error.code).toBe(code);
  });
  it('rejects a token whose signed course does not match the session', async () => {
    const result = await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token({ courseId: OTHER_TEACHER }) }), openStore(), cfg, clock);
    expect(parsed(result).error.code).toBe('INVALID_QR');
  });
  it('returns the documented duplicate error without SDK leakage', async () => {
    const store = openStore();
    await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token() }), store, cfg, clock);
    const duplicate = await route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token() }), store, cfg, clock);
    expect(duplicate.statusCode).toBe(409);
    expect(parsed(duplicate)).toEqual({ error: { code: 'ATTENDANCE_ALREADY_RECORDED', message: 'Attendance already recorded.' } });
    expect(String(duplicate.body)).not.toContain('ConditionalCheckFailedException');
  });
  it('allows exactly one of 20 concurrent check-ins', async () => {
    const store = openStore();
    const results = await Promise.all(Array.from({ length: 20 }, () => route(event('POST', '/attendance/check-in', 'STUDENT', STUDENT, { token: token() }), store, cfg, clock)));
    expect(results.filter((result) => result.statusCode === 201)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(19);
  });
});

describe('ownership, state, and validation', () => {
  it.each([
    ['GET', `/courses/${COURSE}`, undefined],
    ['PUT', `/courses/${COURSE}`, { courseName: 'Attack' }],
    ['GET', `/courses/${COURSE}/students`, undefined],
    ['POST', `/courses/${COURSE}/students`, { studentId: OTHER_STUDENT }],
    ['POST', `/courses/${COURSE}/sessions`, { durationMinutes: 10 }],
    ['GET', `/sessions/${SESSION}/qr-token`, undefined],
    ['POST', `/sessions/${SESSION}/close`, undefined]
  ])('blocks teacher IDOR: %s %s', async (method, path, body) => {
    const result = await route(event(method, path, 'TEACHER', OTHER_TEACHER, body), openStore(), cfg, clock);
    expect(result.statusCode).toBe(403);
  });
  it('handles closing an already closed session cleanly', async () => {
    const store = openStore();
    await route(event('POST', `/sessions/${SESSION}/close`, 'TEACHER', TEACHER), store, cfg, clock);
    const again = await route(event('POST', `/sessions/${SESSION}/close`, 'TEACHER', TEACHER), store, cfg, clock);
    expect(again.statusCode).toBe(409); expect(parsed(again).error.code).toBe('SESSION_ALREADY_CLOSED');
  });
  it('closes an expired session even after a newer session took the course lock', async () => {
    const store = openStore();
    store.seed('sessions', { sessionId: SESSION, courseId: COURSE, teacherId: TEACHER, status: 'OPEN', scheduledEndTime: new Date(NOW - 60_000).toISOString() });
    const started = await route(event('POST', `/courses/${COURSE}/sessions`, 'TEACHER', TEACHER, { durationMinutes: 10 }), store, cfg, clock);
    expect(started.statusCode).toBe(201);
    const closed = await route(event('POST', `/sessions/${SESSION}/close`, 'TEACHER', TEACHER), store, cfg, clock);
    expect(closed.statusCode).toBe(200);
    expect(parsed(closed).status).toBe('CLOSED');
    expect(store.rows.get(`sessions:ACTIVE#${COURSE}`)?.openSessionId).toBe(parsed(started).sessionId);
  });
  it('maps a concurrent close race to 409 instead of 500', async () => {
    const store = openStore();
    const results = await Promise.all([1, 2].map(() => route(event('POST', `/sessions/${SESSION}/close`, 'TEACHER', TEACHER), store, cfg, clock)));
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
  });
  it('allows exactly one of 20 concurrent session starts', async () => {
    const store = openStore();
    store.rows.delete(`sessions:${SESSION}`);
    let sequence = 0;
    const concurrentClock = { now: () => NOW, uuid: () => `77777777-7777-4777-8777-${String(sequence++).padStart(12, '0')}` };
    const results = await Promise.all(Array.from({ length: 20 }, () => route(event('POST', `/courses/${COURSE}/sessions`, 'TEACHER', TEACHER, { durationMinutes: 10 }), store, cfg, concurrentClock)));
    expect(results.filter((result) => result.statusCode === 201)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(19);
  });
  it('rejects unknown properties and malformed JSON', async () => {
    const extra = await route(event('POST', '/courses', 'TEACHER', TEACHER, { courseCode: 'SBX101', courseName: 'Sandbox', semester: 'Fall 2026', section: 'A', attendanceThreshold: 75, teacherId: OTHER_TEACHER }), openStore(), cfg, clock);
    expect(extra.statusCode).toBe(422);
    const malformed = event('POST', '/courses', 'TEACHER', TEACHER); malformed.body = '{';
    const result = await route(malformed, openStore(), cfg, clock);
    expect(parsed(result)).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.' } });
  });
  it('rejects oversized and wrong-type input before storage', async () => {
    const store = openStore();
    const result = await route(event('POST', '/courses', 'TEACHER', TEACHER, { courseCode: 'X'.repeat(1000), courseName: { $ne: null }, semester: "' OR 1=1", section: '\0', attendanceThreshold: '75' }), store, cfg, clock);
    expect(result.statusCode).toBe(422);
    expect(await store.query('courses', undefined, 'teacherId', TEACHER)).toHaveLength(1);
  });
});

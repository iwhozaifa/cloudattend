import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { identity, requireRole, route, signQr, verifyQr, type Config, type RecordItem, type Store } from '../src/core.js';

const TEACHER = '11111111-1111-4111-8111-111111111111';
const OTHER_TEACHER = '22222222-2222-4222-8222-222222222222';
const STUDENT = '33333333-3333-4333-8333-333333333333';
const OTHER_STUDENT = '44444444-4444-4444-8444-444444444444';
const COURSE = '55555555-5555-4555-8555-555555555555';
const SESSION = '66666666-6666-4666-8666-666666666666';
const NOW = Date.parse('2026-10-04T10:00:00.000Z');
const SECRET = 'sandbox-secret-with-enough-entropy';
const cfg: Config = { users: 'users', courses: 'courses', enrollments: 'enrollments', sessions: 'sessions', attendance: 'attendance', qrSecret: SECRET };
const clock = { now: () => NOW, uuid: () => '77777777-7777-4777-8777-777777777777' };

function event(method: string, path: string, role?: string | string[], id = STUDENT, body?: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '', headers: {},
    requestContext: {
      accountId: 'sandbox', apiId: 'sandbox', domainName: 'sandbox', domainPrefix: 'sandbox', http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      requestId: 'sbx-request', routeKey: '$default', stage: '$default', time: '', timeEpoch: NOW,
      authorizer: role ? { jwt: { claims: { sub: id, 'cognito:groups': role }, scopes: [] } } : undefined
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

class MemoryStore implements Store {
  rows = new Map<string, RecordItem>();
  private key(table: string, item: RecordItem) {
    if (table === 'enrollments') return `${table}:${item.courseId}:${item.studentId}`;
    if (table === 'attendance') return `${table}:${item.sessionId}:${item.studentId}`;
    const id = table === 'users' ? item.userId : table === 'courses' ? item.courseId : item.sessionId;
    return `${table}:${id}`;
  }
  seed(table: string, item: RecordItem) { this.rows.set(this.key(table, item), { ...item }); }
  async get(table: string, key: RecordItem) { return this.rows.get(this.key(table, key)); }
  async put(table: string, item: RecordItem, condition?: 'absent') {
    const key = this.key(table, item);
    if (condition && this.rows.has(key)) throw conditionalError();
    this.rows.set(key, { ...item });
  }
  async update(table: string, key: RecordItem, values: RecordItem) {
    const old = this.rows.get(this.key(table, key));
    if (!old) throw new Error('missing');
    const updated = { ...old, ...values };
    this.rows.set(this.key(table, key), updated);
    return updated;
  }
  async delete(table: string, key: RecordItem, condition?: 'exists') {
    const resolved = this.key(table, key);
    if (condition && !this.rows.has(resolved)) throw conditionalError();
    this.rows.delete(resolved);
  }
  async query(table: string, _index: string | undefined, key: string, value: string) {
    return [...this.rows.entries()].filter(([mapKey, item]) => mapKey.startsWith(`${table}:`) && item[key] === value).map(([, item]) => item);
  }
  async createSession(table: string, session: RecordItem, nowEpochSeconds: number) {
    const lockKey = `${table}:ACTIVE#${session.courseId}`;
    const lock = this.rows.get(lockKey);
    if (lock && Number(lock.expiresAt) > nowEpochSeconds) throw conditionalError();
    this.rows.set(lockKey, { sessionId: `ACTIVE#${session.courseId}`, openSessionId: session.sessionId, expiresAt: Date.parse(String(session.scheduledEndTime)) / 1000 });
    this.rows.set(this.key(table, session), { ...session });
  }
  async closeSession(table: string, sessionId: string, courseId: string, values: RecordItem) {
    const updated = await this.update(table, { sessionId }, values);
    this.rows.delete(`${table}:ACTIVE#${courseId}`);
    return updated;
  }
}
function conditionalError() { const error = new Error('internal database detail'); error.name = 'ConditionalCheckFailedException'; return error; }
function openStore() {
  const store = new MemoryStore();
  store.seed('users', { userId: STUDENT, role: 'STUDENT', name: 'Sbx Student' });
  store.seed('users', { userId: OTHER_STUDENT, role: 'STUDENT', name: 'Sbx Other' });
  store.seed('courses', { courseId: COURSE, teacherId: TEACHER, courseCode: 'SBX101' });
  store.seed('enrollments', { courseId: COURSE, studentId: STUDENT });
  store.seed('sessions', { sessionId: SESSION, courseId: COURSE, teacherId: TEACHER, status: 'OPEN', scheduledEndTime: new Date(NOW + 60_000).toISOString() });
  return store;
}
function token(overrides: RecordItem = {}) {
  return signQr({ sessionId: SESSION, courseId: COURSE, iat: NOW / 1000, exp: NOW / 1000 + 45, jti: 'sbx-jti', ...overrides }, SECRET);
}
function parsed(result: Awaited<ReturnType<typeof route>>) { return JSON.parse(String(result.body)); }

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

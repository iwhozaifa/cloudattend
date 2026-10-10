import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { route, signQr, type Config, type RecordItem } from '../src/core.js';
import { defaultKeySchema, MemoryStore } from '../src/memory-store.js';

export const TEACHER = '11111111-1111-4111-8111-111111111111';
export const OTHER_TEACHER = '22222222-2222-4222-8222-222222222222';
export const STUDENT = '33333333-3333-4333-8333-333333333333';
export const OTHER_STUDENT = '44444444-4444-4444-8444-444444444444';
export const COURSE = '55555555-5555-4555-8555-555555555555';
export const SESSION = '66666666-6666-4666-8666-666666666666';
export const NOW = Date.parse('2026-10-04T10:00:00.000Z');
export const SECRET = 'sandbox-secret-with-enough-entropy';
export const cfg: Config = { users: 'users', courses: 'courses', enrollments: 'enrollments', sessions: 'sessions', attendance: 'attendance', qrSecret: SECRET };
export const clock = { now: () => NOW, uuid: () => '77777777-7777-4777-8777-777777777777' };

export function event(method: string, path: string, role?: string | string[], id = STUDENT, body?: unknown, query?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '', headers: {}, queryStringParameters: query,
    requestContext: {
      accountId: 'sandbox', apiId: 'sandbox', domainName: 'sandbox', domainPrefix: 'sandbox', http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' },
      requestId: 'sbx-request', routeKey: '$default', stage: '$default', time: '', timeEpoch: NOW,
      authorizer: role ? { jwt: { claims: { sub: id, 'cognito:groups': role }, scopes: [] } } : undefined
    } as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

export function openStore() {
  const store = new MemoryStore(defaultKeySchema(cfg));
  store.seed('users', { userId: STUDENT, role: 'STUDENT', name: 'Sbx Student' });
  store.seed('users', { userId: OTHER_STUDENT, role: 'STUDENT', name: 'Sbx Other' });
  store.seed('courses', { courseId: COURSE, teacherId: TEACHER, courseCode: 'SBX101' });
  store.seed('enrollments', { courseId: COURSE, studentId: STUDENT });
  store.seed('sessions', { sessionId: SESSION, courseId: COURSE, teacherId: TEACHER, status: 'OPEN', scheduledEndTime: new Date(NOW + 60_000).toISOString() });
  return store;
}
export function token(overrides: RecordItem = {}) {
  return signQr({ sessionId: SESSION, courseId: COURSE, iat: NOW / 1000, exp: NOW / 1000 + 45, jti: 'sbx-jti', ...overrides }, SECRET);
}
export function parsed(result: Awaited<ReturnType<typeof route>>) { return JSON.parse(String(result.body)); }


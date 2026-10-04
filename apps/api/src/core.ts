import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  CheckInSchema,
  CreateCourseSchema,
  EnrollStudentSchema,
  QR_TOKEN_LIFETIME_SECONDS,
  StartSessionSchema,
  UpdateCourseSchema
} from '@cloudattend/shared';

export type RecordItem = Record<string, unknown>;
export interface Store {
  get(table: string, key: RecordItem): Promise<RecordItem | undefined>;
  put(table: string, item: RecordItem, condition?: 'absent'): Promise<void>;
  update(table: string, key: RecordItem, values: RecordItem): Promise<RecordItem>;
  delete(table: string, key: RecordItem, condition?: 'exists'): Promise<void>;
  query(table: string, index: string | undefined, key: string, value: string): Promise<RecordItem[]>;
  createSession(table: string, session: RecordItem, nowEpochSeconds: number): Promise<void>;
  closeSession(table: string, sessionId: string, courseId: string, values: RecordItem): Promise<RecordItem>;
}
export type Config = {
  users: string;
  courses: string;
  enrollments: string;
  sessions: string;
  attendance: string;
  qrSecret: string;
  reportsBucket?: string;
};
export type Runtime = { now: () => number; uuid: () => string };
const runtime: Runtime = { now: Date.now, uuid: randomUUID };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const QrPayloadSchema = z.object({
  sessionId: z.string().min(1).max(128),
  courseId: z.string().min(1).max(128),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  jti: z.string().min(1).max(128)
}).strict();
const identifier = z.string().uuid();
const response = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});

function claims(event: APIGatewayProxyEventV2): Record<string, unknown> {
  const context = event.requestContext as APIGatewayProxyEventV2['requestContext'] & {
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
  return context.authorizer?.jwt?.claims ?? {};
}

export function identity(event: APIGatewayProxyEventV2) {
  const jwtClaims = claims(event);
  const rawGroups = jwtClaims['cognito:groups'];
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((group): group is string => typeof group === 'string')
    : typeof rawGroups === 'string'
      ? rawGroups.split(',').map((group) => group.trim()).filter(Boolean)
      : [];
  return { id: typeof jwtClaims.sub === 'string' ? jwtClaims.sub : '', groups };
}

export function requireRole(event: APIGatewayProxyEventV2, role: 'STUDENT' | 'TEACHER') {
  const user = identity(event);
  if (!user.id) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.');
  const applicationGroups = user.groups.filter((group) => group === 'STUDENT' || group === 'TEACHER');
  if (applicationGroups.length !== 1 || applicationGroups[0] !== role) {
    throw new ApiError(403, 'FORBIDDEN', 'You are not authorized for this action.');
  }
  return user;
}

function requireAuthenticated(event: APIGatewayProxyEventV2) {
  const user = identity(event);
  if (!user.id) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.');
  const applicationGroups = user.groups.filter((group) => group === 'STUDENT' || group === 'TEACHER');
  if (applicationGroups.length !== 1) throw new ApiError(403, 'FORBIDDEN', 'You are not authorized for this action.');
  return { ...user, role: applicationGroups[0] as 'STUDENT' | 'TEACHER' };
}

export function signQr(payload: Record<string, unknown>, secret: string) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyQr(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const segments = token.split('.');
  if (segments.length !== 2 || segments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new ApiError(400, 'INVALID_QR', 'This QR code is invalid.');
  }
  const [data, signature] = segments;
  const wanted = createHmac('sha256', secret).update(data).digest('base64url');
  const suppliedBytes = Buffer.from(signature, 'utf8');
  const wantedBytes = Buffer.from(wanted, 'utf8');
  if (suppliedBytes.length !== wantedBytes.length || !timingSafeEqual(suppliedBytes, wantedBytes)) {
    throw new ApiError(400, 'INVALID_QR', 'This QR code is invalid.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_QR', 'This QR code is invalid.');
  }
  const parsed = QrPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new ApiError(400, 'INVALID_QR', 'This QR code is invalid.');
  if (parsed.data.iat > nowSeconds + 30) throw new ApiError(400, 'INVALID_QR', 'This QR code is not yet valid.');
  if (parsed.data.exp <= nowSeconds) {
    throw new ApiError(400, 'QR_EXPIRED', 'This QR code has expired. Please scan the current code displayed by your instructor.');
  }
  return parsed.data;
}

export async function route(
  event: APIGatewayProxyEventV2,
  store: Store,
  config: Config,
  dependencies: Runtime = runtime
): Promise<APIGatewayProxyResultV2> {
  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    const body = parseBody(event.body);
    const timestamp = () => new Date(dependencies.now()).toISOString();

    if (method === 'GET' && path === '/health') return response(200, { status: 'ok' });

    if (method === 'GET' && path === '/me') {
      const user = requireAuthenticated(event);
      const record = await store.get(config.users, { userId: user.id });
      if (!record) throw new ApiError(404, 'USER_NOT_FOUND', 'User profile was not found.');
      return response(200, record);
    }

    if (method === 'POST' && path === '/courses') {
      const user = requireRole(event, 'TEACHER');
      const input = CreateCourseSchema.parse(body);
      const course = { ...input, courseId: dependencies.uuid(), teacherId: user.id, createdAt: timestamp(), updatedAt: timestamp() };
      await store.put(config.courses, course);
      return response(201, course);
    }

    if (method === 'GET' && path === '/courses') {
      const user = requireAuthenticated(event);
      const records = user.role === 'TEACHER'
        ? await store.query(config.courses, 'teacherId-index', 'teacherId', user.id)
        : await store.query(config.enrollments, 'studentId-index', 'studentId', user.id);
      return response(200, records);
    }

    const courseMatch = path.match(/^\/courses\/([^/]+)$/);
    if (courseMatch && method === 'GET') {
      const user = requireAuthenticated(event);
      const courseId = identifier.parse(courseMatch[1]);
      const course = await getCourse(store, config, courseId);
      if (user.role === 'TEACHER' && course.teacherId !== user.id) throw forbiddenCourse();
      if (user.role === 'STUDENT' && !(await store.get(config.enrollments, { courseId, studentId: user.id }))) throw forbiddenCourse();
      return response(200, course);
    }
    if (courseMatch && method === 'PUT') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(courseMatch[1]);
      await ownedCourse(store, config, courseId, user.id);
      const updated = await store.update(config.courses, { courseId }, { ...UpdateCourseSchema.strict().parse(body), updatedAt: timestamp() });
      return response(200, updated);
    }

    const roster = path.match(/^\/courses\/([^/]+)\/students$/);
    if (roster) {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(roster[1]);
      await ownedCourse(store, config, courseId, user.id);
      if (method === 'GET') return response(200, await store.query(config.enrollments, undefined, 'courseId', courseId));
      if (method === 'POST') {
        const { studentId } = EnrollStudentSchema.parse(body);
        const student = await store.get(config.users, { userId: studentId });
        if (!student || student.role !== 'STUDENT') throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student was not found.');
        try {
          await store.put(config.enrollments, { courseId, studentId, enrolledAt: timestamp() }, 'absent');
        } catch (error) {
          if (conditionalFailure(error)) throw new ApiError(409, 'ALREADY_ENROLLED', 'Student is already enrolled.');
          throw error;
        }
        return response(201, { courseId, studentId, enrolledAt: timestamp() });
      }
    }

    const enrollment = path.match(/^\/courses\/([^/]+)\/students\/([^/]+)$/);
    if (enrollment && method === 'DELETE') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(enrollment[1]);
      const studentId = identifier.parse(enrollment[2]);
      await ownedCourse(store, config, courseId, user.id);
      try {
        await store.delete(config.enrollments, { courseId, studentId }, 'exists');
      } catch (error) {
        if (conditionalFailure(error)) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment was not found.');
        throw error;
      }
      return response(200, { removed: true });
    }

    const sessionStart = path.match(/^\/courses\/([^/]+)\/sessions$/);
    if (sessionStart && method === 'POST') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(sessionStart[1]);
      await ownedCourse(store, config, courseId, user.id);
      const input = StartSessionSchema.parse(body);
      const start = dependencies.now();
      const session = {
        sessionId: dependencies.uuid(), courseId, teacherId: user.id,
        startTime: new Date(start).toISOString(),
        scheduledEndTime: new Date(start + input.durationMinutes * 60_000).toISOString(),
        status: 'OPEN', tokenLifetimeSeconds: QR_TOKEN_LIFETIME_SECONDS,
        createdAt: new Date(start).toISOString()
      };
      try {
        await store.createSession(config.sessions, session, Math.floor(start / 1000));
      } catch (error) {
        if (conditionalFailure(error)) throw new ApiError(409, 'SESSION_ALREADY_OPEN', 'This course already has an open attendance session.');
        throw error;
      }
      return response(201, session);
    }

    const qr = path.match(/^\/sessions\/([^/]+)\/qr-token$/);
    if (qr && method === 'GET') {
      const user = requireRole(event, 'TEACHER');
      const session = await getSession(store, config, identifier.parse(qr[1]));
      if (session.teacherId !== user.id) throw new ApiError(403, 'FORBIDDEN', 'You do not own this session.');
      assertOpen(session, dependencies.now());
      const issuedAt = Math.floor(dependencies.now() / 1000);
      const expiresAt = issuedAt + QR_TOKEN_LIFETIME_SECONDS;
      const token = signQr({ sessionId: session.sessionId, courseId: session.courseId, iat: issuedAt, exp: expiresAt, jti: dependencies.uuid() }, config.qrSecret);
      return response(200, { token, issuedAt, expiresAt });
    }

    const close = path.match(/^\/sessions\/([^/]+)\/close$/);
    if (close && method === 'POST') {
      const user = requireRole(event, 'TEACHER');
      const sessionId = identifier.parse(close[1]);
      const session = await getSession(store, config, sessionId);
      if (session.teacherId !== user.id) throw new ApiError(403, 'FORBIDDEN', 'You do not own this session.');
      if (session.status === 'CLOSED') throw new ApiError(409, 'SESSION_ALREADY_CLOSED', 'This attendance session has already closed.');
      return response(200, await store.closeSession(config.sessions, sessionId, String(session.courseId), { status: 'CLOSED', actualEndTime: timestamp() }));
    }

    if (method === 'POST' && path === '/attendance/check-in') {
      const user = requireRole(event, 'STUDENT');
      const token = CheckInSchema.parse(body).token;
      const qrPayload = verifyQr(token, config.qrSecret, Math.floor(dependencies.now() / 1000));
      const session = await getSession(store, config, qrPayload.sessionId);
      if (session.courseId !== qrPayload.courseId) throw new ApiError(400, 'INVALID_QR', 'This QR code does not match the attendance session.');
      assertOpen(session, dependencies.now());
      if (!(await store.get(config.enrollments, { courseId: session.courseId, studentId: user.id }))) {
        throw new ApiError(403, 'NOT_ENROLLED', 'You are not enrolled in this course.');
      }
      const attendance = {
        sessionId: session.sessionId, studentId: user.id, courseId: session.courseId,
        teacherId: session.teacherId, checkInTime: timestamp(), status: 'PRESENT', createdAt: timestamp()
      };
      try {
        await store.put(config.attendance, attendance, 'absent');
      } catch (error) {
        if (conditionalFailure(error)) throw new ApiError(409, 'ATTENDANCE_ALREADY_RECORDED', 'Attendance already recorded.');
        throw error;
      }
      return response(201, attendance);
    }

    return response(404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  } catch (error) {
    if (error instanceof ApiError) return response(error.status, { error: { code: error.code, message: error.message } });
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return response(422, { error: { code: 'VALIDATION_ERROR', message: 'Invalid request.' } });
    }
    console.error(JSON.stringify({ operation: 'route', requestId: event.requestContext.requestId, errorCode: 'INTERNAL_ERROR' }));
    return response(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  }
}

function parseBody(body: string | undefined) {
  return body ? JSON.parse(body) as unknown : {};
}
function conditionalFailure(error: unknown) {
  return error instanceof Error && (error.name === 'ConditionalCheckFailedException' || error.name === 'TransactionCanceledException');
}
function forbiddenCourse() {
  return new ApiError(403, 'FORBIDDEN', 'You do not have access to this course.');
}
async function getCourse(store: Store, config: Config, courseId: string) {
  const course = await store.get(config.courses, { courseId });
  if (!course) throw new ApiError(404, 'COURSE_NOT_FOUND', 'Course was not found.');
  return course;
}
async function ownedCourse(store: Store, config: Config, courseId: string, teacherId: string) {
  const course = await getCourse(store, config, courseId);
  if (course.teacherId !== teacherId) throw forbiddenCourse();
  return course;
}
async function getSession(store: Store, config: Config, sessionId: string) {
  const session = await store.get(config.sessions, { sessionId });
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session was not found.');
  return session;
}
function assertOpen(session: RecordItem, nowMilliseconds: number) {
  if (session.status !== 'OPEN' || Date.parse(String(session.scheduledEndTime)) <= nowMilliseconds) {
    throw new ApiError(400, 'SESSION_CLOSED', 'This attendance session has closed.');
  }
}

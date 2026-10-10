import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  ADMIN_GROUP,
  attendancePercentage,
  CheckInSchema,
  CreateCourseSchema,
  effectiveStatus,
  EnrollStudentSchema,
  QR_TOKEN_LIFETIME_SECONDS,
  RoleSchema,
  SetRoleSchema,
  StartSessionSchema,
  UpdateCourseSchema,
  type Role
} from '@cloudattend/shared';

export type RecordItem = Record<string, unknown>;
export interface Store {
  get(table: string, key: RecordItem): Promise<RecordItem | undefined>;
  /** Missing keys are skipped; order of the result is not guaranteed. */
  batchGet(table: string, keys: RecordItem[]): Promise<RecordItem[]>;
  /** `ifAbsent` names the partition-key attribute that must not already exist. */
  put(table: string, item: RecordItem, options?: { ifAbsent: string }): Promise<void>;
  update(table: string, key: RecordItem, values: RecordItem): Promise<RecordItem>;
  /** `ifExists` names the partition-key attribute that must already exist. */
  delete(table: string, key: RecordItem, options?: { ifExists: string }): Promise<void>;
  query(table: string, index: string | undefined, key: string, value: string): Promise<RecordItem[]>;
  createSession(table: string, session: RecordItem, nowEpochSeconds: number): Promise<void>;
  /** Closes an OPEN session (conditional) and releases the course's open-session lock if it still points at it. */
  closeSession(table: string, sessionId: string, courseId: string, values: RecordItem): Promise<RecordItem>;
}
/** Changes a user's Cognito groups. Only needed by the admin routes. */
export interface UserDirectory {
  setRole(userId: string, role: Role): Promise<void>;
}
export type Config = {
  users: string;
  courses: string;
  enrollments: string;
  sessions: string;
  attendance: string;
  qrSecret: string;
};
export type Runtime = { now: () => number; uuid: () => string; directory?: UserDirectory };
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
  // HTTP API JWT authorizers flatten array claims to "[A B]" strings; accept that, comma lists, and arrays.
  const groups = Array.isArray(rawGroups)
    ? rawGroups.filter((group): group is string => typeof group === 'string')
    : typeof rawGroups === 'string'
      ? rawGroups.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean)
      : [];
  return { id: typeof jwtClaims.sub === 'string' ? jwtClaims.sub : '', groups };
}

export function requireRole(event: APIGatewayProxyEventV2, role: Role) {
  const user = requireAuthenticated(event);
  if (user.role !== role) throw new ApiError(403, 'FORBIDDEN', 'You are not authorized for this action.');
  return user;
}

function requireAuthenticated(event: APIGatewayProxyEventV2) {
  const user = identity(event);
  if (!user.id) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.');
  const applicationGroups = user.groups.filter((group) => group === 'STUDENT' || group === 'TEACHER');
  if (applicationGroups.length !== 1) throw new ApiError(403, 'FORBIDDEN', 'You are not authorized for this action.');
  return { ...user, role: applicationGroups[0] as Role, isAdmin: user.groups.includes(ADMIN_GROUP) };
}

function requireAdmin(event: APIGatewayProxyEventV2) {
  const user = requireAuthenticated(event);
  if (!user.isAdmin) throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  return user;
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

/** Prevents spreadsheet formula injection (CWE-1236) and quotes fields per RFC 4180. */
export function csvCell(value: unknown) {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    const withStatus = (session: RecordItem): RecordItem => ({ ...session, status: effectiveStatus(session as { status: string; scheduledEndTime: string }, dependencies.now()) });

    if (method === 'GET' && path === '/health') return response(200, { status: 'ok' });

    if (method === 'GET' && path === '/me') {
      const user = requireAuthenticated(event);
      const record = await store.get(config.users, { userId: user.id });
      if (!record) throw new ApiError(404, 'USER_NOT_FOUND', 'User profile was not found.');
      return response(200, { ...record, role: user.role, isAdmin: user.isAdmin });
    }

    if (method === 'GET' && path === '/me/attendance') {
      const user = requireRole(event, 'STUDENT');
      const enrollments = await store.query(config.enrollments, 'studentId-index', 'studentId', user.id);
      const courses = await store.batchGet(config.courses, enrollments.map((row) => ({ courseId: row.courseId })));
      const mine = await store.query(config.attendance, 'studentId-index', 'studentId', user.id);
      const summaries = await Promise.all(courses.map(async (course) => {
        const totalSessions = (await store.query(config.sessions, 'courseId-index', 'courseId', String(course.courseId))).length;
        const records = mine.filter((row) => row.courseId === course.courseId)
          .map((row) => ({ sessionId: row.sessionId, checkInTime: row.checkInTime }))
          .sort((a, b) => String(b.checkInTime).localeCompare(String(a.checkInTime)));
        const percentage = attendancePercentage(records.length, totalSessions);
        return { course, totalSessions, attended: records.length, percentage, belowThreshold: percentage < Number(course.attendanceThreshold ?? 75), records };
      }));
      return response(200, summaries.sort((a, b) => String(a.course.courseCode).localeCompare(String(b.course.courseCode))));
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
      if (user.role === 'TEACHER') {
        const courses = await store.query(config.courses, 'teacherId-index', 'teacherId', user.id);
        return response(200, courses.sort((a, b) => String(a.courseCode).localeCompare(String(b.courseCode))));
      }
      const enrollments = await store.query(config.enrollments, 'studentId-index', 'studentId', user.id);
      const enrolledAt = new Map(enrollments.map((row) => [row.courseId, row.enrolledAt]));
      const courses = await store.batchGet(config.courses, enrollments.map((row) => ({ courseId: row.courseId })));
      return response(200, courses.map((course): RecordItem => ({ ...course, enrolledAt: enrolledAt.get(course.courseId) }))
        .sort((a, b) => String(a.courseCode).localeCompare(String(b.courseCode))));
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
    if (courseMatch && method === 'DELETE') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(courseMatch[1]);
      await ownedCourse(store, config, courseId, user.id);
      const lock = await store.get(config.sessions, { sessionId: `ACTIVE#${courseId}` });
      if (lock && Number(lock.expiresAt) * 1000 > dependencies.now()) {
        throw new ApiError(409, 'SESSION_OPEN', 'Close the open attendance session before deleting this course.');
      }
      const enrollments = await store.query(config.enrollments, undefined, 'courseId', courseId);
      await Promise.all(enrollments.map((row) => store.delete(config.enrollments, { courseId, studentId: row.studentId })));
      await store.delete(config.courses, { courseId });
      return response(200, { removed: true });
    }

    const roster = path.match(/^\/courses\/([^/]+)\/students$/);
    if (roster && (method === 'GET' || method === 'POST')) {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(roster[1]);
      await ownedCourse(store, config, courseId, user.id);
      if (method === 'GET') {
        const enrollments = await store.query(config.enrollments, undefined, 'courseId', courseId);
        return response(200, await withStudents(store, config, enrollments, (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''))));
      }
      const input = EnrollStudentSchema.parse(body);
      const student = 'studentId' in input
        ? await store.get(config.users, { userId: input.studentId })
        : 'email' in input
          ? (await store.query(config.users, 'email-index', 'email', input.email))[0]
          : (await store.query(config.users, 'rollNo-index', 'rollNo', input.rollNo))[0];
      if (!student || student.role !== 'STUDENT') throw new ApiError(404, 'STUDENT_NOT_FOUND', 'No student account matches that detail. Ask the student to register first.');
      const studentId = String(student.userId);
      const enrollment = { courseId, studentId, enrolledAt: timestamp() };
      try {
        await store.put(config.enrollments, enrollment, { ifAbsent: 'courseId' });
      } catch (error) {
        if (conditionalFailure(error)) throw new ApiError(409, 'ALREADY_ENROLLED', 'Student is already enrolled.');
        throw error;
      }
      return response(201, { ...enrollment, name: student.name, email: student.email, rollNo: student.rollNo });
    }

    const enrollment = path.match(/^\/courses\/([^/]+)\/students\/([^/]+)$/);
    if (enrollment && method === 'DELETE') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(enrollment[1]);
      const studentId = identifier.parse(enrollment[2]);
      await ownedCourse(store, config, courseId, user.id);
      try {
        await store.delete(config.enrollments, { courseId, studentId }, { ifExists: 'courseId' });
      } catch (error) {
        if (conditionalFailure(error)) throw new ApiError(404, 'ENROLLMENT_NOT_FOUND', 'Enrollment was not found.');
        throw error;
      }
      return response(200, { removed: true });
    }

    const courseSessions = path.match(/^\/courses\/([^/]+)\/sessions$/);
    if (courseSessions && method === 'GET') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(courseSessions[1]);
      await ownedCourse(store, config, courseId, user.id);
      const sessions = await store.query(config.sessions, 'courseId-index', 'courseId', courseId);
      const counts = countBy(await store.query(config.attendance, 'courseId-index', 'courseId', courseId), 'sessionId');
      return response(200, sessions
        .map((session): RecordItem => ({ ...withStatus(session), presentCount: counts.get(session.sessionId) ?? 0 }))
        .sort((a, b) => String(b.startTime).localeCompare(String(a.startTime))));
    }
    if (courseSessions && method === 'POST') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(courseSessions[1]);
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

    const report = path.match(/^\/courses\/([^/]+)\/report$/);
    if (report && method === 'GET') {
      const user = requireRole(event, 'TEACHER');
      const courseId = identifier.parse(report[1]);
      const course = await ownedCourse(store, config, courseId, user.id);
      const totalSessions = (await store.query(config.sessions, 'courseId-index', 'courseId', courseId)).length;
      const counts = countBy(await store.query(config.attendance, 'courseId-index', 'courseId', courseId), 'studentId');
      const students = await withStudents(store, config, await store.query(config.enrollments, undefined, 'courseId', courseId), (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
      const threshold = Number(course.attendanceThreshold ?? 75);
      const rows = students.map((student) => {
        const attended = counts.get(student.studentId) ?? 0;
        const percentage = attendancePercentage(attended, totalSessions);
        return { studentId: student.studentId, name: student.name, email: student.email, rollNo: student.rollNo, attended, totalSessions, percentage, belowThreshold: percentage < threshold };
      });
      if (event.queryStringParameters?.format === 'csv') {
        const header = ['Roll number', 'Name', 'Email', 'Attended', 'Total sessions', 'Percentage', 'Below threshold'];
        const lines = [header, ...rows.map((row) => [row.rollNo, row.name, row.email, row.attended, row.totalSessions, row.percentage, row.belowThreshold ? 'yes' : 'no'])]
          .map((cells) => cells.map(csvCell).join(','));
        return {
          statusCode: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="${String(course.courseCode).replace(/[^A-Z0-9_-]/gi, '_')}-attendance.csv"`,
            'cache-control': 'no-store'
          },
          body: `${lines.join('\r\n')}\r\n`
        };
      }
      return response(200, { course, totalSessions, rows });
    }

    const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (sessionMatch && method === 'GET') {
      const user = requireRole(event, 'TEACHER');
      const session = await ownedSession(store, config, identifier.parse(sessionMatch[1]), user.id);
      const course = await getCourse(store, config, String(session.courseId));
      return response(200, { ...withStatus(session), course });
    }

    const sessionAttendance = path.match(/^\/sessions\/([^/]+)\/attendance$/);
    if (sessionAttendance && method === 'GET') {
      const user = requireRole(event, 'TEACHER');
      const sessionId = identifier.parse(sessionAttendance[1]);
      await ownedSession(store, config, sessionId, user.id);
      const rows = await store.query(config.attendance, undefined, 'sessionId', sessionId);
      return response(200, await withStudents(store, config, rows, (a, b) => String(b.checkInTime).localeCompare(String(a.checkInTime))));
    }

    const qr = path.match(/^\/sessions\/([^/]+)\/qr-token$/);
    if (qr && method === 'GET') {
      const user = requireRole(event, 'TEACHER');
      const session = await ownedSession(store, config, identifier.parse(qr[1]), user.id);
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
      const session = await ownedSession(store, config, sessionId, user.id);
      if (session.status === 'CLOSED') throw new ApiError(409, 'SESSION_ALREADY_CLOSED', 'This attendance session has already closed.');
      try {
        return response(200, await store.closeSession(config.sessions, sessionId, String(session.courseId), { status: 'CLOSED', actualEndTime: timestamp() }));
      } catch (error) {
        if (conditionalFailure(error)) throw new ApiError(409, 'SESSION_ALREADY_CLOSED', 'This attendance session has already closed.');
        throw error;
      }
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
        await store.put(config.attendance, attendance, { ifAbsent: 'sessionId' });
      } catch (error) {
        if (conditionalFailure(error)) throw new ApiError(409, 'ATTENDANCE_ALREADY_RECORDED', 'Attendance already recorded.');
        throw error;
      }
      const course = await store.get(config.courses, { courseId: session.courseId });
      return response(201, { ...attendance, courseCode: course?.courseCode, courseName: course?.courseName });
    }

    if (method === 'GET' && path === '/admin/users') {
      requireAdmin(event);
      const roleFilter = event.queryStringParameters?.role;
      const wanted = roleFilter ? [RoleSchema.parse(roleFilter)] : RoleSchema.options;
      const users = (await Promise.all(wanted.map((role) => store.query(config.users, 'role-index', 'role', role)))).flat();
      return response(200, users.sort((a, b) => String(a.email).localeCompare(String(b.email))));
    }

    const adminRole = path.match(/^\/admin\/users\/([^/]+)\/role$/);
    if (adminRole && method === 'POST') {
      const admin = requireAdmin(event);
      const userId = identifier.parse(adminRole[1]);
      const { role } = SetRoleSchema.parse(body);
      if (userId === admin.id) throw new ApiError(400, 'CANNOT_CHANGE_SELF', 'Ask another administrator to change your own role.');
      const user = await store.get(config.users, { userId });
      if (!user || user.itemType) throw new ApiError(404, 'USER_NOT_FOUND', 'User was not found.');
      if (user.role === role) return response(200, user);
      if (!dependencies.directory) throw new Error('User directory is not configured');
      await dependencies.directory.setRole(userId, role);
      return response(200, await store.update(config.users, { userId }, { role, updatedAt: timestamp() }));
    }

    return response(404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  } catch (error) {
    if (error instanceof ApiError) return response(error.status, { error: { code: error.code, message: error.message } });
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return response(422, { error: { code: 'VALIDATION_ERROR', message: 'Invalid request.' } });
    }
    console.error(JSON.stringify({ operation: 'route', requestId: event.requestContext.requestId, errorCode: 'INTERNAL_ERROR', errorName: error instanceof Error ? error.name : 'Unknown' }));
    return response(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  }
}

type StudentFields = { studentId: string; name?: string; email?: string; rollNo?: string };

function parseBody(body: string | undefined) {
  return body ? JSON.parse(body) as unknown : {};
}
function conditionalFailure(error: unknown) {
  return error instanceof Error && (error.name === 'ConditionalCheckFailedException' || error.name === 'TransactionCanceledException');
}
function forbiddenCourse() {
  return new ApiError(403, 'FORBIDDEN', 'You do not have access to this course.');
}
function countBy(rows: RecordItem[], key: string) {
  const counts = new Map<unknown, number>();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return counts;
}
/** Joins name, email, and roll number from the Users table onto rows that carry a `studentId`. */
async function withStudents(store: Store, config: Config, rows: RecordItem[], compare: (a: RecordItem & StudentFields, b: RecordItem & StudentFields) => number) {
  const users = await store.batchGet(config.users, [...new Set(rows.map((row) => row.studentId))].map((userId) => ({ userId })));
  const byId = new Map(users.map((user) => [user.userId, user]));
  return rows.map((row) => {
    const user = byId.get(row.studentId);
    return { ...row, studentId: String(row.studentId), name: user?.name as string | undefined, email: user?.email as string | undefined, rollNo: user?.rollNo as string | undefined };
  }).sort(compare);
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
async function ownedSession(store: Store, config: Config, sessionId: string, teacherId: string) {
  const session = await getSession(store, config, sessionId);
  if (session.teacherId !== teacherId) throw new ApiError(403, 'FORBIDDEN', 'You do not own this session.');
  return session;
}
function assertOpen(session: RecordItem, nowMilliseconds: number) {
  if (session.status !== 'OPEN' || Date.parse(String(session.scheduledEndTime)) <= nowMilliseconds) {
    throw new ApiError(400, 'SESSION_CLOSED', 'This attendance session has closed.');
  }
}

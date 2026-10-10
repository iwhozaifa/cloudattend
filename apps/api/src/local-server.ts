/**
 * Local development and end-to-end test server. NOT deployed: CDK bundles only handler.ts and
 * the Cognito triggers.
 *
 * It runs the real API router (`route`) against an in-memory store and emulates the Cognito
 * flows the web app needs (sign-up, confirmation code, sign-in, forgot/reset/change password).
 * The server binds to 127.0.0.1 only, accepts no production environment, and logs
 * verification codes to the console.
 */
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { EmailSchema, PasswordSchema, RollNoSchema, type Role } from '@cloudattend/shared';
import { z } from 'zod';
import { route, type Config } from './core.js';
import { defaultKeySchema, MemoryStore } from './memory-store.js';

if (process.env.NODE_ENV === 'production') throw new Error('The local server must never run in production.');

const PORT = Number(process.env.LOCAL_API_PORT ?? 8787);
const HOST = '127.0.0.1';
const ALLOWED_ORIGINS = new Set((process.env.LOCAL_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173').split(','));
/** Fixed verification code so the local flow and the e2e tests can confirm accounts. */
export const LOCAL_CODE = '123456';
export const DEMO_PASSWORD = 'CloudAttend#2026';

const config: Config = { users: 'users', courses: 'courses', enrollments: 'enrollments', sessions: 'sessions', attendance: 'attendance', qrSecret: randomBytes(32).toString('hex') };

class InvalidParameter extends Error {}

type Account = { userId: string; email: string; name: string; rollNo?: string; passwordHash: string; confirmed: boolean; groups: Set<string>; resetPending?: boolean };

export function createLocalApp() {
  const store = new MemoryStore(defaultKeySchema(config));
  const accounts = new Map<string, Account>();
  const sessions = new Map<string, string>();
  // Local demo accounts only; real password storage is Cognito's responsibility.
  const hash = (password: string) => createHash('sha256').update(password).digest('hex');
  const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  function addAccount(input: { email: string; name: string; rollNo?: string; password: string; role: Role; admin?: boolean }) {
    const userId = randomUUID();
    const timestamp = new Date().toISOString();
    accounts.set(input.email, { userId, email: input.email, name: input.name, rollNo: input.rollNo, passwordHash: hash(input.password), confirmed: true, groups: new Set([input.role, ...(input.admin ? ['ADMIN'] : [])]) });
    store.seed(config.users, { userId, email: input.email, name: input.name, ...(input.rollNo ? { rollNo: input.rollNo } : {}), role: input.role, createdAt: timestamp, updatedAt: timestamp });
    if (input.rollNo) store.seed(config.users, { userId: `ROLL#${input.rollNo}`, itemType: 'ROLL_CLAIM', status: 'CONFIRMED', claimedBy: userId });
    return userId;
  }

  function seed() {
    addAccount({ email: 'admin@cloudattend.local', name: 'Avery Admin', password: DEMO_PASSWORD, role: 'TEACHER', admin: true });
    const teacher = addAccount({ email: 'teacher@cloudattend.local', name: 'Taylor Teacher', password: DEMO_PASSWORD, role: 'TEACHER' });
    const student = addAccount({ email: 'student@cloudattend.local', name: 'Sam Student', rollNo: 'CS-2026-001', password: DEMO_PASSWORD, role: 'STUDENT' });
    addAccount({ email: 'riley@cloudattend.local', name: 'Riley Learner', rollNo: 'CS-2026-002', password: DEMO_PASSWORD, role: 'STUDENT' });
    const courseId = randomUUID();
    const timestamp = new Date().toISOString();
    store.seed(config.courses, { courseId, teacherId: teacher, courseCode: 'CS101', courseName: 'Introduction to Cloud Computing', semester: 'Fall 2026', section: 'A', attendanceThreshold: 75, createdAt: timestamp, updatedAt: timestamp });
    store.seed(config.enrollments, { courseId, studentId: student, enrolledAt: timestamp });
  }
  seed();

  const directory = {
    async setRole(userId: string, role: Role) {
      const account = [...accounts.values()].find((candidate) => candidate.userId === userId);
      if (!account) throw new Error('Local user not found');
      account.groups.delete(role === 'TEACHER' ? 'STUDENT' : 'TEACHER');
      account.groups.add(role);
      for (const [token, owner] of sessions) if (owner === account.email) sessions.delete(token);
    }
  };

  const fail = (status: number, code: string, message: string) => ({ status, body: { error: { code, message } } });
  const SignUp = z.object({ email: EmailSchema, password: PasswordSchema, name: z.string().trim().min(2).max(100), rollNo: RollNoSchema }).strict();
  const Credentials = z.object({ email: EmailSchema, password: z.string().min(1).max(128) }).strict();
  const Confirm = z.object({ email: EmailSchema, code: z.string() }).strict();
  const Reset = z.object({ email: EmailSchema, code: z.string(), password: PasswordSchema }).strict();
  const Change = z.object({ oldPassword: z.string(), newPassword: PasswordSchema }).strict();

  /** Mirrors the Cognito behaviours the web app relies on, including user-existence-error prevention. */
  function auth(action: string, body: unknown, bearer: string | undefined): { status: number; body: unknown } {
    try {
      return authAction(action, body, bearer);
    } catch (error) {
      if (error instanceof InvalidParameter) return fail(400, 'InvalidParameterException', error.message);
      throw error;
    }
  }

  function authAction(action: string, body: unknown, bearer: string | undefined): { status: number; body: unknown } {
    const parsed = (schema: z.ZodTypeAny) => {
      const result = schema.safeParse(body);
      if (!result.success) throw new InvalidParameter(result.error.issues[0]?.message ?? 'Invalid request.');
      return result.data;
    };
    switch (action) {
      case 'sign-up': {
        const input = parsed(SignUp);
        if (accounts.has(input.email)) return fail(400, 'UsernameExistsException', 'An account with the given email already exists.');
        if ([...accounts.values()].some((account) => account.rollNo === input.rollNo)) return fail(400, 'UserLambdaValidationException', 'PreSignUp failed with error This roll number is already registered..');
        accounts.set(input.email, { userId: randomUUID(), email: input.email, name: input.name, rollNo: input.rollNo, passwordHash: hash(input.password), confirmed: false, groups: new Set() });
        console.log(`[local-auth] verification code for ${input.email}: ${LOCAL_CODE}`);
        return { status: 200, body: { nextStep: 'CONFIRM_SIGN_UP' } };
      }
      case 'resend-code': {
        const { email } = parsed(z.object({ email: EmailSchema }).strict());
        console.log(`[local-auth] verification code for ${email}: ${LOCAL_CODE}`);
        return { status: 200, body: {} };
      }
      case 'confirm-sign-up': {
        const input = parsed(Confirm);
        const account = accounts.get(input.email);
        if (!account || input.code !== LOCAL_CODE) return fail(400, 'CodeMismatchException', 'Invalid verification code provided, please try again.');
        if (!account.confirmed) {
          account.confirmed = true;
          account.groups.add('STUDENT');
          const timestamp = new Date().toISOString();
          store.seed(config.users, { userId: account.userId, email: account.email, name: account.name, rollNo: account.rollNo, role: 'STUDENT', createdAt: timestamp, updatedAt: timestamp });
        }
        return { status: 200, body: {} };
      }
      case 'sign-in': {
        const input = parsed(Credentials);
        const account = accounts.get(input.email);
        if (!account || !same(account.passwordHash, hash(input.password))) return fail(400, 'NotAuthorizedException', 'Incorrect username or password.');
        if (!account.confirmed) return { status: 200, body: { nextStep: 'CONFIRM_SIGN_UP' } };
        if (account.resetPending) return { status: 200, body: { nextStep: 'RESET_PASSWORD' } };
        const token = randomBytes(24).toString('base64url');
        sessions.set(token, account.email);
        return { status: 200, body: { nextStep: 'DONE', token } };
      }
      case 'forgot-password': {
        const { email } = parsed(z.object({ email: EmailSchema }).strict());
        // Like Cognito with PreventUserExistenceErrors, answer identically for unknown emails.
        if (accounts.has(email)) console.log(`[local-auth] password reset code for ${email}: ${LOCAL_CODE}`);
        return { status: 200, body: { nextStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE' } };
      }
      case 'confirm-forgot-password': {
        const input = parsed(Reset);
        const account = accounts.get(input.email);
        if (!account || input.code !== LOCAL_CODE) return fail(400, 'CodeMismatchException', 'Invalid verification code provided, please try again.');
        account.passwordHash = hash(input.password);
        account.resetPending = false;
        return { status: 200, body: {} };
      }
      case 'change-password': {
        const email = bearer && sessions.get(bearer);
        const account = email ? accounts.get(email) : undefined;
        if (!account) return fail(401, 'NotAuthorizedException', 'Access Token has been revoked');
        const input = parsed(Change);
        if (!same(account.passwordHash, hash(input.oldPassword))) return fail(400, 'NotAuthorizedException', 'Incorrect username or password.');
        account.passwordHash = hash(input.newPassword);
        return { status: 200, body: {} };
      }
      case 'sign-out': {
        if (bearer) sessions.delete(bearer);
        return { status: 200, body: {} };
      }
      case 'session': {
        const email = bearer && sessions.get(bearer);
        const account = email ? accounts.get(email) : undefined;
        if (!account) return fail(401, 'NotAuthorizedException', 'Not signed in');
        return { status: 200, body: { userId: account.userId, email: account.email, groups: [...account.groups] } };
      }
      default:
        return fail(404, 'NOT_FOUND', 'Route not found.');
    }
  }

  async function api(method: string, path: string, query: Record<string, string>, body: string | undefined, bearer: string | undefined): Promise<APIGatewayProxyStructuredResultV2> {
    const email = bearer && sessions.get(bearer);
    const account = email ? accounts.get(email) : undefined;
    const requestContext = {
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: HOST, userAgent: 'local' },
      requestId: randomUUID(),
      ...(account ? { authorizer: { jwt: { claims: { sub: account.userId, 'cognito:groups': `[${[...account.groups].join(' ')}]` }, scopes: [] } } } : {})
    };
    // The deployed API Gateway rejects unauthenticated calls before Lambda; mirror that here.
    if (!account && path !== '/health') return { statusCode: 401, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Unauthorized' }) };
    const event = { version: '2.0', rawPath: path, rawQueryString: '', headers: {}, queryStringParameters: query, requestContext, isBase64Encoded: false, body } as unknown as APIGatewayProxyEventV2;
    return await route(event, store, config, { now: Date.now, uuid: randomUUID, directory }) as APIGatewayProxyStructuredResultV2;
  }

  return { store, accounts, auth, api, reset: () => { store.rows.clear(); accounts.clear(); sessions.clear(); seed(); } };
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
}

export function startLocalServer(port = PORT) {
  const app = createLocalApp();
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const origin = request.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('vary', 'origin');
      response.setHeader('access-control-allow-headers', 'authorization, content-type');
      response.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.setHeader('access-control-expose-headers', 'content-disposition');
    }
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
    try {
      const url = new URL(request.url ?? '/', `http://${HOST}`);
      const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, '') || undefined;
      const body = await readBody(request);
      if (url.pathname === '/__reset' && request.method === 'POST') {
        app.reset();
        response.writeHead(204).end();
        return;
      }
      if (url.pathname.startsWith('/local-auth/') && request.method === 'POST') {
        let payload: unknown = {};
        try { payload = body ? JSON.parse(body) : {}; } catch { /* handled by schema validation */ }
        const result = app.auth(url.pathname.slice('/local-auth/'.length), payload, bearer);
        response.writeHead(result.status, { 'content-type': 'application/json' }).end(JSON.stringify(result.body));
        return;
      }
      const result = await app.api(request.method ?? 'GET', url.pathname, Object.fromEntries(url.searchParams), body, bearer);
      response.writeHead(result.statusCode ?? 200, result.headers as Record<string, string>).end(result.body);
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid request.' } }));
    }
  });
  server.listen(port, HOST, () => {
    console.log(`[local-api] listening on http://${HOST}:${port}`);
    console.log(`[local-api] demo accounts (password ${DEMO_PASSWORD}): admin@cloudattend.local, teacher@cloudattend.local, student@cloudattend.local, riley@cloudattend.local`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startLocalServer();


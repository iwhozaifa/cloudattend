import { describe, expect, it } from 'vitest';
import { createLocalApp, DEMO_PASSWORD, LOCAL_CODE } from '../src/local-server.js';

const ok = (result: { status: number; body: unknown }) => { expect(result.status).toBe(200); return result.body as Record<string, unknown>; };

describe('local development server', () => {
  it('runs sign-up → confirm → sign-in → API with the real router', async () => {
    const app = createLocalApp();
    expect(ok(app.auth('sign-up', { email: 'new@example.com', password: 'Str0ng#Password', name: 'New Student', rollNo: 'new-1' }, undefined)).nextStep).toBe('CONFIRM_SIGN_UP');
    expect(app.auth('sign-in', { email: 'new@example.com', password: 'Str0ng#Password' }, undefined).body).toEqual({ nextStep: 'CONFIRM_SIGN_UP' });
    expect(app.auth('confirm-sign-up', { email: 'new@example.com', code: '000000' }, undefined).status).toBe(400);
    ok(app.auth('confirm-sign-up', { email: 'new@example.com', code: LOCAL_CODE }, undefined));
    const { token } = ok(app.auth('sign-in', { email: 'new@example.com', password: 'Str0ng#Password' }, undefined)) as { token: string };
    const me = await app.api('GET', '/me', {}, undefined, token);
    expect(JSON.parse(String(me.body))).toMatchObject({ email: 'new@example.com', role: 'STUDENT', rollNo: 'NEW-1', isAdmin: false });
  });

  it('rejects weak passwords, duplicate emails, and duplicate roll numbers like Cognito', () => {
    const app = createLocalApp();
    expect(app.auth('sign-up', { email: 'x@example.com', password: 'short', name: 'X Y', rollNo: 'X-1' }, undefined).status).toBe(400);
    expect(app.auth('sign-up', { email: 'student@cloudattend.local', password: 'Str0ng#Password', name: 'X Y', rollNo: 'X-1' }, undefined).status).toBe(400);
    expect(JSON.stringify(app.auth('sign-up', { email: 'y@example.com', password: 'Str0ng#Password', name: 'X Y', rollNo: 'cs-2026-001' }, undefined).body)).toContain('roll number is already registered');
  });

  it('resets a password without revealing whether the email exists', () => {
    const app = createLocalApp();
    expect(ok(app.auth('forgot-password', { email: 'nobody@example.com' }, undefined))).toEqual(ok(app.auth('forgot-password', { email: 'student@cloudattend.local' }, undefined)));
    ok(app.auth('confirm-forgot-password', { email: 'student@cloudattend.local', code: LOCAL_CODE, password: 'N3w#Password!!' }, undefined));
    expect(app.auth('sign-in', { email: 'student@cloudattend.local', password: DEMO_PASSWORD }, undefined).status).toBe(400);
    ok(app.auth('sign-in', { email: 'student@cloudattend.local', password: 'N3w#Password!!' }, undefined));
  });

  it('rejects API calls without a session, as the API Gateway authorizer does', async () => {
    expect((await createLocalApp().api('GET', '/courses', {}, undefined, undefined)).statusCode).toBe(401);
  });

  it('applies admin role changes to the emulated groups and revokes sessions', async () => {
    const app = createLocalApp();
    const { token: adminToken } = ok(app.auth('sign-in', { email: 'admin@cloudattend.local', password: DEMO_PASSWORD }, undefined)) as { token: string };
    const { token: studentToken } = ok(app.auth('sign-in', { email: 'riley@cloudattend.local', password: DEMO_PASSWORD }, undefined)) as { token: string };
    const riley = app.accounts.get('riley@cloudattend.local')!;
    const result = await app.api('POST', `/admin/users/${riley.userId}/role`, {}, JSON.stringify({ role: 'TEACHER' }), adminToken);
    expect(result.statusCode).toBe(200);
    expect([...riley.groups]).toEqual(['TEACHER']);
    expect((await app.api('GET', '/me', {}, undefined, studentToken)).statusCode).toBe(401);
  });
});

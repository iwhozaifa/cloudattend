import { AdminAddUserToGroupCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBDocumentClient, GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { PostConfirmationTriggerEvent, PreSignUpTriggerEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { handler as postConfirmation } from '../src/post-confirmation.js';
import { handler as preSignUp } from '../src/pre-sign-up.js';

const db = mockClient(DynamoDBDocumentClient);
const cognito = mockClient(CognitoIdentityProviderClient);
process.env.USERS_TABLE = 'users';
const SUB = '33333333-3333-4333-8333-333333333333';

function postEvent(triggerSource: string, attributes: Record<string, string> = { sub: SUB, email: 'Student@Example.com', name: 'Sbx Student', 'custom:rollNo': ' sbx-001 ' }) {
  return { triggerSource, userPoolId: 'pool', userName: 'user-name', request: { userAttributes: attributes }, response: {} } as unknown as PostConfirmationTriggerEvent;
}
function preEvent(rollNo?: string, triggerSource = 'PreSignUp_SignUp') {
  return { triggerSource, userPoolId: 'pool', userName: 'user-name', request: { userAttributes: rollNo === undefined ? {} : { 'custom:rollNo': rollNo } }, response: {} } as unknown as PreSignUpTriggerEvent;
}
const invoke = <E>(fn: (event: E, context: never, callback: never) => unknown, event: E) => fn(event, {} as never, (() => undefined) as never) as Promise<E>;
function named(name: string) { const error = new Error(name); error.name = name; return error; }

beforeEach(() => { db.reset(); cognito.reset(); });

describe('post-confirmation trigger', () => {
  it('provisions a new student profile, roll claim, and STUDENT group', async () => {
    db.on(GetCommand).resolves({});
    db.on(TransactWriteCommand).resolves({});
    cognito.on(AdminAddUserToGroupCommand).resolves({});
    await invoke(postConfirmation, postEvent('PostConfirmation_ConfirmSignUp'));
    const items = db.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(items[0].Put!.Item).toMatchObject({ userId: 'ROLL#SBX-001', status: 'CONFIRMED', claimedBy: SUB });
    expect(items[1].Put!.Item).toMatchObject({ userId: SUB, email: 'student@example.com', rollNo: 'SBX-001', role: 'STUDENT' });
    expect(cognito.commandCalls(AdminAddUserToGroupCommand)[0].args[0].input).toMatchObject({ GroupName: 'STUDENT', Username: 'user-name' });
  });

  it('does nothing after a forgotten-password confirmation (teacher stays a teacher)', async () => {
    await invoke(postConfirmation, postEvent('PostConfirmation_ConfirmForgotPassword', { sub: SUB, email: 'teacher@example.com', name: 'Teacher' }));
    expect(db.calls()).toHaveLength(0);
    expect(cognito.calls()).toHaveLength(0);
  });

  it('fails with a clear message when the roll number was taken concurrently', async () => {
    db.on(GetCommand).resolves({});
    db.on(TransactWriteCommand).rejects(named('TransactionCanceledException'));
    await expect(invoke(postConfirmation, postEvent('PostConfirmation_ConfirmSignUp'))).rejects.toThrow('already registered');
    expect(cognito.calls()).toHaveLength(0);
  });

  it('rejects a missing roll number instead of crashing', async () => {
    db.on(GetCommand).resolves({});
    await expect(invoke(postConfirmation, postEvent('PostConfirmation_ConfirmSignUp', { sub: SUB, email: 'a@example.com', name: 'A' }))).rejects.toThrow('roll number');
  });
});

describe('pre-sign-up trigger', () => {
  it('reserves a normalised roll number for the new user', async () => {
    db.on(PutCommand).resolves({});
    await invoke(preSignUp, preEvent(' sbx-002 '));
    const input = db.commandCalls(PutCommand)[0].args[0].input;
    expect(input.Item).toMatchObject({ userId: 'ROLL#SBX-002', status: 'PENDING', claimedBy: 'user-name' });
    expect(input.ConditionExpression).toContain('attribute_not_exists(userId)');
  });

  it('rejects a duplicate roll number before the account is created', async () => {
    db.on(PutCommand).rejects(named('ConditionalCheckFailedException'));
    await expect(invoke(preSignUp, preEvent('SBX-002'))).rejects.toThrow('This roll number is already registered.');
  });

  it.each([undefined, '', 'x', 'y'.repeat(65)])('rejects an invalid roll number %j', async (rollNo) => {
    await expect(invoke(preSignUp, preEvent(rollNo))).rejects.toThrow('valid roll number');
  });

  it('ignores admin-created users', async () => {
    await invoke(preSignUp, preEvent(undefined, 'PreSignUp_AdminCreateUser'));
    expect(db.calls()).toHaveLength(0);
  });
});

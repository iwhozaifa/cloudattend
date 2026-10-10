import { randomUUID } from 'node:crypto';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createCognitoDirectory } from './cognito-directory.js';
import { route } from './core.js';
import { createDynamoStore } from './dynamo-store.js';

const store = createDynamoStore();
const directory = createCognitoDirectory(process.env.USER_POOL_ID!);
const secrets = new SecretsManagerClient({});
let cachedQrSecret: string | undefined;

async function qrSecret() {
  if (!cachedQrSecret) {
    const result = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.QR_SECRET_ARN! }));
    if (!result.SecretString) throw new Error('QR signing secret is unavailable');
    cachedQrSecret = result.SecretString;
  }
  return cachedQrSecret;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => route(event, store, {
  users: process.env.USERS_TABLE!,
  courses: process.env.COURSES_TABLE!,
  enrollments: process.env.ENROLLMENTS_TABLE!,
  sessions: process.env.SESSIONS_TABLE!,
  attendance: process.env.ATTENDANCE_TABLE!,
  qrSecret: await qrSecret()
}, { now: Date.now, uuid: randomUUID, directory });

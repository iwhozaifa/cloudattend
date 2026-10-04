import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { route, type Store } from './core.js';
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});
let cachedQrSecret: string | undefined;
const store: Store = { get: async (TableName, Key) => (await db.send(new GetCommand({ TableName, Key }))).Item, put: async (TableName, Item, condition) => { await db.send(new PutCommand({ TableName, Item, ConditionExpression: condition ? 'attribute_not_exists(#pk)' : undefined, ExpressionAttributeNames: condition ? { '#pk': Object.keys(Item)[0] } : undefined })); }, update: async (TableName, Key, values) => { const names: Record<string,string> = {}; const vals: Record<string,unknown> = {}; const sets = Object.keys(values).map((k, i) => { names[`#n${i}`]=k; vals[`:v${i}`]=values[k]; return `#n${i} = :v${i}`; }); return (await db.send(new UpdateCommand({ TableName, Key, UpdateExpression: `SET ${sets.join(', ')}`, ExpressionAttributeNames:names, ExpressionAttributeValues:vals, ReturnValues:'ALL_NEW' }))).Attributes!; }, delete: async (TableName, Key, condition) => { await db.send(new DeleteCommand({ TableName, Key, ConditionExpression: condition ? 'attribute_exists(#pk)' : undefined, ExpressionAttributeNames: condition ? { '#pk': Object.keys(Key)[0] } : undefined })); }, query: async (TableName, IndexName, key, value) => (await db.send(new QueryCommand({ TableName, IndexName, KeyConditionExpression: '#k = :v', ExpressionAttributeNames:{'#k':key}, ExpressionAttributeValues:{':v':value} }))).Items ?? [], createSession: async (TableName, session, nowEpochSeconds) => { await db.send(new TransactWriteCommand({ TransactItems: [{ Put: { TableName, Item: { sessionId: `ACTIVE#${session.courseId}`, openSessionId: session.sessionId, expiresAt: Math.floor(Date.parse(String(session.scheduledEndTime)) / 1000) }, ConditionExpression: 'attribute_not_exists(sessionId) OR expiresAt <= :now', ExpressionAttributeValues: { ':now': nowEpochSeconds } } }, { Put: { TableName, Item: session, ConditionExpression: 'attribute_not_exists(sessionId)' } }] })); }, closeSession: async (TableName, sessionId, courseId, values) => { const names: Record<string,string> = {}; const vals: Record<string,unknown> = {}; const sets = Object.keys(values).map((key, index) => { names[`#n${index}`] = key; vals[`:v${index}`] = values[key]; return `#n${index} = :v${index}`; }); await db.send(new TransactWriteCommand({ TransactItems: [{ Update: { TableName, Key: { sessionId }, UpdateExpression: `SET ${sets.join(', ')}`, ExpressionAttributeNames: names, ExpressionAttributeValues: vals } }, { Delete: { TableName, Key: { sessionId: `ACTIVE#${courseId}` }, ConditionExpression: 'openSessionId = :sessionId', ExpressionAttributeValues: { ':sessionId': sessionId } } }] })); return { ...(await db.send(new GetCommand({ TableName, Key: { sessionId } }))).Item! }; } };
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
  reportsBucket: process.env.REPORTS_BUCKET!,
  qrSecret: await qrSecret()
});

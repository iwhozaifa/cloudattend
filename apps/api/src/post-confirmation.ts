import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { PostConfirmationTriggerHandler } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const attributes = event.request.userAttributes;
  const tableName = process.env.USERS_TABLE!;
  const existing = await db.send(new GetCommand({ TableName: tableName, Key: { userId: attributes.sub } }));
  if (!existing.Item) {
    const timestamp = new Date().toISOString();
    const rollNo = attributes['custom:rollNo'].trim().toUpperCase();
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: tableName, Item: { userId: `ROLL#${rollNo}`, itemType: 'ROLL_CLAIM', claimedBy: attributes.sub }, ConditionExpression: 'attribute_not_exists(userId)' } },
      { Put: { TableName: tableName, Item: { userId: attributes.sub, email: attributes.email.toLowerCase(), name: attributes.name, rollNo, role: 'STUDENT', createdAt: timestamp, updatedAt: timestamp }, ConditionExpression: 'attribute_not_exists(userId)' } }
    ] }));
  }
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: event.userPoolId, Username: event.userName, GroupName: 'STUDENT' }));
  return event;
};

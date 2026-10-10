import { AdminAddUserToGroupCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { normalizeRollNo, rollClaimKey } from './roll-claims.js';

const cognito = new CognitoIdentityProviderClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: PostConfirmationTriggerHandler = async (event) => {
  // Cognito also fires this trigger after ConfirmForgotPassword. Provisioning must only run for
  // a new sign-up, otherwise a teacher who resets their password would be added to STUDENT too.
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;

  const attributes = event.request.userAttributes;
  const tableName = process.env.USERS_TABLE!;
  const existing = await db.send(new GetCommand({ TableName: tableName, Key: { userId: attributes.sub } }));
  if (!existing.Item) {
    const rollNo = normalizeRollNo(attributes['custom:rollNo']);
    if (!rollNo) throw new Error('A valid roll number is required.');
    const timestamp = new Date().toISOString();
    try {
      await db.send(new TransactWriteCommand({ TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: { userId: rollClaimKey(rollNo), itemType: 'ROLL_CLAIM', status: 'CONFIRMED', claimedBy: attributes.sub },
            ConditionExpression: 'attribute_not_exists(userId) OR claimedBy = :userName',
            ExpressionAttributeValues: { ':userName': event.userName }
          }
        },
        {
          Put: {
            TableName: tableName,
            Item: { userId: attributes.sub, email: attributes.email.toLowerCase(), name: attributes.name, rollNo, role: 'STUDENT', createdAt: timestamp, updatedAt: timestamp },
            ConditionExpression: 'attribute_not_exists(userId)'
          }
        }
      ] }));
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') throw new Error('This roll number is already registered.');
      throw error;
    }
  }
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: event.userPoolId, Username: event.userName, GroupName: 'STUDENT' }));
  return event;
};

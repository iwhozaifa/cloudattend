import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PreSignUpTriggerHandler } from 'aws-lambda';
import { normalizeRollNo, ROLL_CLAIM_PENDING_SECONDS, rollClaimKey } from './roll-claims.js';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Reserves the student's roll number before Cognito creates the account, so a duplicate
 * roll number is rejected up front instead of leaving a confirmed user without a profile.
 * A pending reservation expires if the account is never confirmed.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  if (event.triggerSource !== 'PreSignUp_SignUp') return event;
  const rollNo = normalizeRollNo(event.request.userAttributes['custom:rollNo']);
  if (!rollNo) throw new Error('A valid roll number is required.');
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.send(new PutCommand({
      TableName: process.env.USERS_TABLE!,
      Item: { userId: rollClaimKey(rollNo), itemType: 'ROLL_CLAIM', status: 'PENDING', claimedBy: event.userName, expiresAt: now + ROLL_CLAIM_PENDING_SECONDS },
      ConditionExpression: 'attribute_not_exists(userId) OR claimedBy = :userName OR (#status = :pending AND expiresAt < :now)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':userName': event.userName, ':pending': 'PENDING', ':now': now }
    }));
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') throw new Error('This roll number is already registered.');
    throw error;
  }
  return event;
};

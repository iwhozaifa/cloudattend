import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { RecordItem, Store } from './core.js';

function setExpression(values: RecordItem) {
  const names: Record<string, string> = {};
  const vals: Record<string, unknown> = {};
  const sets = Object.keys(values).map((key, index) => {
    names[`#n${index}`] = key;
    vals[`:v${index}`] = values[key];
    return `#n${index} = :v${index}`;
  });
  return { expression: `SET ${sets.join(', ')}`, names, vals };
}

function isConditionalFailure(error: unknown) {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

export function createDynamoStore(db = DynamoDBDocumentClient.from(new DynamoDBClient({}))): Store {
  return {
    async get(TableName, Key) {
      return (await db.send(new GetCommand({ TableName, Key }))).Item;
    },
    async batchGet(TableName, keys) {
      const items: RecordItem[] = [];
      for (let offset = 0; offset < keys.length; offset += 100) {
        let pending: RecordItem[] | undefined = keys.slice(offset, offset + 100);
        for (let attempt = 0; pending?.length; attempt++) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 25));
          if (attempt > 5) throw new Error('BatchGet did not complete after retries');
          const result = await db.send(new BatchGetCommand({ RequestItems: { [TableName]: { Keys: pending } } }));
          items.push(...(result.Responses?.[TableName] ?? []));
          pending = result.UnprocessedKeys?.[TableName]?.Keys as RecordItem[] | undefined;
        }
      }
      return items;
    },
    async put(TableName, Item, options) {
      await db.send(new PutCommand({
        TableName, Item,
        ...(options ? { ConditionExpression: 'attribute_not_exists(#pk)', ExpressionAttributeNames: { '#pk': options.ifAbsent } } : {})
      }));
    },
    async update(TableName, Key, values) {
      const { expression, names, vals } = setExpression(values);
      const result = await db.send(new UpdateCommand({ TableName, Key, UpdateExpression: expression, ExpressionAttributeNames: names, ExpressionAttributeValues: vals, ReturnValues: 'ALL_NEW' }));
      return result.Attributes ?? {};
    },
    async delete(TableName, Key, options) {
      await db.send(new DeleteCommand({
        TableName, Key,
        ...(options ? { ConditionExpression: 'attribute_exists(#pk)', ExpressionAttributeNames: { '#pk': options.ifExists } } : {})
      }));
    },
    async query(TableName, IndexName, key, value) {
      const items: RecordItem[] = [];
      let ExclusiveStartKey: RecordItem | undefined;
      do {
        const page = await db.send(new QueryCommand({ TableName, IndexName, KeyConditionExpression: '#k = :v', ExpressionAttributeNames: { '#k': key }, ExpressionAttributeValues: { ':v': value }, ExclusiveStartKey }));
        items.push(...(page.Items ?? []));
        ExclusiveStartKey = page.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      return items;
    },
    async createSession(TableName, session, nowEpochSeconds) {
      await db.send(new TransactWriteCommand({ TransactItems: [
        {
          Put: {
            TableName,
            Item: { sessionId: `ACTIVE#${session.courseId}`, itemType: 'ACTIVE_LOCK', openSessionId: session.sessionId, expiresAt: Math.floor(Date.parse(String(session.scheduledEndTime)) / 1000) },
            ConditionExpression: 'attribute_not_exists(sessionId) OR expiresAt <= :now',
            ExpressionAttributeValues: { ':now': nowEpochSeconds }
          }
        },
        { Put: { TableName, Item: session, ConditionExpression: 'attribute_not_exists(sessionId)' } }
      ] }));
    },
    async closeSession(TableName, sessionId, courseId, values) {
      const { expression, names, vals } = setExpression(values);
      const result = await db.send(new UpdateCommand({
        TableName, Key: { sessionId },
        UpdateExpression: expression,
        ConditionExpression: '#status = :open',
        ExpressionAttributeNames: { ...names, '#status': 'status' },
        ExpressionAttributeValues: { ...vals, ':open': 'OPEN' },
        ReturnValues: 'ALL_NEW'
      }));
      // An expired session's lock may already belong to a newer session; only release our own.
      try {
        await db.send(new DeleteCommand({ TableName, Key: { sessionId: `ACTIVE#${courseId}` }, ConditionExpression: 'openSessionId = :sessionId', ExpressionAttributeValues: { ':sessionId': sessionId } }));
      } catch (error) {
        if (!isConditionalFailure(error)) throw error;
      }
      return result.Attributes ?? {};
    }
  };
}

import type { RecordItem, Store } from './core.js';

/** Primary-key attributes per logical table name, matching the DynamoDB tables in infra. */
export type KeySchema = Record<string, readonly string[]>;
export const defaultKeySchema = (tables: { users: string; courses: string; enrollments: string; sessions: string; attendance: string }): KeySchema => ({
  [tables.users]: ['userId'],
  [tables.courses]: ['courseId'],
  [tables.enrollments]: ['courseId', 'studentId'],
  [tables.sessions]: ['sessionId'],
  [tables.attendance]: ['sessionId', 'studentId']
});

function conditionalError() {
  const error = new Error('The conditional request failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

/**
 * An in-process implementation of {@link Store} with the same conditional-write semantics as the
 * DynamoDB store. Used by the unit tests and by the local development server; never deployed.
 * Index names are ignored: a query matches any row whose attribute equals the value.
 */
export class MemoryStore implements Store {
  rows = new Map<string, RecordItem>();
  constructor(private readonly keySchema: KeySchema) {}

  private key(table: string, item: RecordItem) {
    const attributes = this.keySchema[table];
    if (!attributes) throw new Error(`Unknown table ${table}`);
    return [table, ...attributes.map((attribute) => String(item[attribute]))].join(':');
  }
  seed(table: string, item: RecordItem) { this.rows.set(this.key(table, item), { ...item }); }
  async get(table: string, key: RecordItem) {
    const row = this.rows.get(this.key(table, key));
    return row && { ...row };
  }
  async batchGet(table: string, keys: RecordItem[]) {
    return keys.map((key) => this.rows.get(this.key(table, key))).filter((row): row is RecordItem => Boolean(row)).map((row) => ({ ...row }));
  }
  async put(table: string, item: RecordItem, options?: { ifAbsent: string }) {
    const key = this.key(table, item);
    if (options && this.rows.has(key)) throw conditionalError();
    this.rows.set(key, { ...item });
  }
  async update(table: string, key: RecordItem, values: RecordItem) {
    const resolved = this.key(table, key);
    const updated = { ...this.rows.get(resolved), ...key, ...values };
    this.rows.set(resolved, updated);
    return { ...updated };
  }
  async delete(table: string, key: RecordItem, options?: { ifExists: string }) {
    const resolved = this.key(table, key);
    if (options && !this.rows.has(resolved)) throw conditionalError();
    this.rows.delete(resolved);
  }
  async query(table: string, _index: string | undefined, key: string, value: string) {
    return [...this.rows.entries()]
      .filter(([mapKey, item]) => mapKey.startsWith(`${table}:`) && item[key] === value)
      .map(([, item]) => ({ ...item }));
  }
  async createSession(table: string, session: RecordItem, nowEpochSeconds: number) {
    const lockKey = this.key(table, { sessionId: `ACTIVE#${session.courseId}` });
    const lock = this.rows.get(lockKey);
    if (lock && Number(lock.expiresAt) > nowEpochSeconds) throw conditionalError();
    this.rows.set(lockKey, { sessionId: `ACTIVE#${session.courseId}`, itemType: 'ACTIVE_LOCK', openSessionId: session.sessionId, expiresAt: Math.floor(Date.parse(String(session.scheduledEndTime)) / 1000) });
    this.rows.set(this.key(table, session), { ...session });
  }
  async closeSession(table: string, sessionId: string, courseId: string, values: RecordItem) {
    const key = this.key(table, { sessionId });
    const current = this.rows.get(key);
    if (current?.status !== 'OPEN') throw conditionalError();
    const updated = { ...current, ...values };
    this.rows.set(key, updated);
    const lockKey = this.key(table, { sessionId: `ACTIVE#${courseId}` });
    if (this.rows.get(lockKey)?.openSessionId === sessionId) this.rows.delete(lockKey);
    return { ...updated };
  }
}

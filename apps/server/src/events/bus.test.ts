import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { EventBus } from './bus';

const db = testDb();
afterAll(() => db.destroy());

describe('EventBus', () => {
  it('按事件名和通配符分发，处理函数拿到同一个事务', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('oil.fill', async (_tx, e) => void seen.push(`named:${e.restId}`));
    bus.on('*', async (_tx, e) => void seen.push(`any:${e.name}`));
    await db.transaction().execute((tx) => bus.emit(tx, { name: 'oil.fill', shardId: 1, restId: 7 }));
    expect(seen).toEqual(['named:7', 'any:oil.fill']);
  });

  it('处理函数抛错会让整个事务回滚', async () => {
    const bus = new EventBus();
    bus.on('x', async (tx) => {
      await tx.insertInto('audit_log').values({ action: 'bus-rollback-test' }).execute();
      throw new Error('handler failed');
    });
    await expect(
      db.transaction().execute((tx) => bus.emit(tx, { name: 'x', shardId: 1, restId: 1 })),
    ).rejects.toThrow('handler failed');
    const row = await db
      .selectFrom('audit_log')
      .select('id')
      .where('action', '=', 'bus-rollback-test')
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });
});

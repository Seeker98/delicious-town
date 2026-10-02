import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { IMPLEMENTED_FEATURES } from '../../core/features';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('事件合约的数值和表（238-1 设计 §3、§5）', () => {
  it('区服数值默认值；功能开关已实现', () => {
    expect(t.deps.config.tuning.predict).toEqual({
      unit: 1000,
      feeRate: 0.02,
      maxHold: 200,
      maxTrade: 100,
      defaultB: 100,
      minLevel: 20,
      minAccountDays: 7,
    });
    expect(IMPLEMENTED_FEATURES.has('predict')).toBe(true);
  });

  it('事件、持仓、成交能写入；持仓份数不能为负；删事件级联删持仓和成交', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const e = await t.db
      .insertInto('predict_event')
      .values({
        shard_id: shardId,
        title: '测试',
        b: 100,
        unit: 1000,
        p0: 0.5,
        open_at: t.clock.now,
        close_at: new Date(t.clock.now.getTime() + 3_600_000),
        status: 'open',
      })
      .returning(['id', 'kind', 'q_yes', 'description'])
      .executeTakeFirstOrThrow();
    expect(e).toMatchObject({ kind: 'manual', q_yes: 0, description: '' });
    await t.db
      .insertInto('predict_position')
      .values({ event_id: e.id, rest_id: r.restaurantId, yes: 3 })
      .execute();
    const r2 = await newRestaurant(t, { shardId });
    await expect(
      t.db
        .insertInto('predict_position')
        .values({ event_id: e.id, rest_id: r2.restaurantId, no: -1 })
        .execute(),
    ).rejects.toThrow(/check constraint/);
    await t.db
      .insertInto('predict_trade')
      .values({
        event_id: e.id,
        rest_id: r.restaurantId,
        side: 'yes',
        dir: 'buy',
        qty: 3,
        amount: 1500,
        fee: 30,
        price_after: 0.51,
        created_at: t.clock.now,
      })
      .execute();
    await t.db.deleteFrom('predict_event').where('id', '=', e.id).execute();
    const left = await t.db
      .selectFrom('predict_position')
      .select('rest_id')
      .where('event_id', '=', e.id)
      .execute();
    expect(left).toHaveLength(0);
  });
});

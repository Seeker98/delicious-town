import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { createShard } from '../../../test/fixtures';
import { createTestGame, foodNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { mouseRound } from './mouse';
import { regenStrength } from './strength';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('体力恢复（规格书 01 §1.10）', () => {
  it('每次 +1（幸运时 +2），不超过上限；圣佑提高上限', async () => {
    const shardId = await createShard(t.db);
    const low = await newRestaurant(t, { shardId, patch: { strength: 50, strength_max: 100 } });
    const full = await newRestaurant(t, { shardId, patch: { strength: 100, strength_max: 100 } });
    const holy = await newRestaurant(t, { shardId, patch: { strength: 150, strength_max: 100 } });
    await t.db
      .updateTable('restaurant')
      .set({ effect_agg: JSON.stringify({ holyBless: 100 }) })
      .where('id', '=', holy.restaurantId)
      .execute();
    const r = await regenStrength(t.game.deps, shardId, 'p1', new Date());
    expect(r.updated).toBe(2);
    expect([51, 52]).toContain((await restRow(t, low.restaurantId)).strength);
    expect((await restRow(t, full.restaurantId)).strength).toBe(100);
    expect([151, 152]).toContain((await restRow(t, holy.restaurantId)).strength);
  });

  it('沙漏倍率', async () => {
    const shardId = await createShard(t.db);
    const ctx = await newRestaurant(t, { shardId, patch: { strength: 10, strength_max: 100 } });
    await t.db
      .updateTable('restaurant')
      .set({ effect_agg: JSON.stringify({ autoReStrength: 2 }) })
      .where('id', '=', ctx.restaurantId)
      .execute();
    await regenStrength(t.game.deps, shardId, 'p1', new Date());
    expect([12, 14]).toContain((await restRow(t, ctx.restaurantId)).strength);
  });
});

describe('老鼠捣乱（规格书 01 §1.9）', () => {
  async function alwaysMouseShard() {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: { mouse: { rateBase: 10 } } }) })
      .execute();
    return shardId;
  }

  it('没有幸运和捕鼠夹：偷走一种未锁定食材', async () => {
    const shardId = await alwaysMouseShard();
    const ctx = await newRestaurant(t, { shardId, foods: { 101: 5 } });
    const s = await mouseRound(t.game.deps, shardId, 'p1', new Date());
    expect(s).toMatchObject({ triggered: 1, stolen: 1 });
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(4);
    const logs = await t.db
      .selectFrom('rest_log')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(logs.map((l) => [l.type, l.params])).toEqual([['mouse.steal', { foodsId: 101, num: 1 }]]);
  });

  it('老鼠只进营业中的店；一家店出错只记日志，其他店照常', async () => {
    const shardId = await alwaysMouseShard();
    const closed = await newRestaurant(t, { shardId, patch: { state: 2 }, foods: { 101: 5 } });
    const broken = await newRestaurant(t, { shardId, foods: { 101: 5 } });
    const ok = await newRestaurant(t, { shardId, foods: { 101: 5 } });
    // 让 broken 这家店写个人日志时报错，模拟单店处理失败
    await sql`create or replace function fail_rest_log() returns trigger as $$
      begin raise exception 'boom'; end $$ language plpgsql`.execute(t.db);
    await sql
      .raw(
        `create trigger fail_rest_log_${broken.restaurantId} before insert on rest_log for each row
         when (new.rest_id = ${broken.restaurantId}) execute function fail_rest_log()`,
      )
      .execute(t.db);
    try {
      const log = { error: vi.fn() };
      const s = await mouseRound(t.game.deps, shardId, 'p1', new Date(), log);
      expect((await foodNum(t, closed.restaurantId, 101)).num).toBe(5);
      expect((await foodNum(t, ok.restaurantId, 101)).num).toBe(4);
      expect(s.triggered).toBe(2);
      expect(log.error).toHaveBeenCalledWith(
        expect.objectContaining({ shardId, restId: broken.restaurantId }),
        'mouse failed',
      );
    } finally {
      await sql.raw(`drop trigger fail_rest_log_${broken.restaurantId} on rest_log`).execute(t.db);
    }
  });

  it('只有锁定的食材时什么也偷不到', async () => {
    const shardId = await alwaysMouseShard();
    const ctx = await newRestaurant(t, { shardId, foods: { 101: 5 } });
    await t.db
      .updateTable('cupboard_food')
      .set({ locked: true })
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    const s = await mouseRound(t.game.deps, shardId, 'p1', new Date());
    expect(s).toMatchObject({ triggered: 1, nothing: 1 });
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(5);
  });

  it('捕鼠夹 100% 时抓到老鼠，得到银币', async () => {
    const shardId = await alwaysMouseShard();
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 0, level: 10 }, foods: { 101: 5 } });
    await t.db
      .updateTable('restaurant')
      .set({ effect_agg: JSON.stringify({ trapRate: 1 }), effect_dirty: false })
      .where('id', '=', ctx.restaurantId)
      .execute();
    const s = await mouseRound(t.game.deps, shardId, 'p1', new Date());
    expect(s).toMatchObject({ trapped: 1 });
    const coin = (await restRow(t, ctx.restaurantId)).coin;
    expect(coin).toBeGreaterThanOrEqual(100);
    expect(coin).toBeLessThanOrEqual(300);
  });
});

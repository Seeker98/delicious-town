import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { GOODS } from '@dt/config';
import { gameTime, latestSlot } from '@dt/shared';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { gid } from '../../../test/items';
import { eventCount } from '../../../test/quests';
import { resolveMayor } from './mayor';

const DAY = '2026-10-01';
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

/** 某类天气里随便一种（非特殊） */
const weatherOf = (type: number) =>
  [...t.deps.config.weather.values()].find((w) => w.type === type && !w.special)!;

/** 记下那一轮换天任务跑完、换成了 weatherId（揭晓读它） */
async function weatherRan(shardId: number, at: Date, weatherId: number) {
  await t.db
    .insertInto('job_run')
    .values({
      shard_id: shardId,
      job: 'weather',
      period: latestSlot(at, t.deps.config.tuning.world.weatherHours).key,
      started_at: at,
      finished_at: at,
      stats: JSON.stringify({ from: 0, to: weatherId }),
    })
    .execute();
}

describe('镇长猜天气（天气改版设计 §5）', () => {
  it('猜下一次自然换天；一天只能猜一次；小镇页能看到猜的和预报', async () => {
    const a = await newRestaurant(t);
    const r = await t.game.town.mayor(a, 2);
    expect(r.data.today).toMatchObject({ type: 2, right: null, actual: null });
    expect(new Date(r.data.today!.at).getTime()).toBe(gameTime(DAY, 13).getTime());
    expect(r.data.next.types.map((x) => x.type).sort()).toEqual([1, 2, 3, 4]);
    await expect(t.game.town.mayor(a, 1)).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    expect((await t.game.town.overview(a)).mayor.today).toMatchObject({ type: 2, right: null });
    // “小镇”支线：和镇长猜一次天气
    expect(await eventCount(t, a.restaurantId, 'town.mayor.ask')).toBe(1);
  });

  it('换天任务没跑完先不揭晓；跑完后猜对得镇长的推荐、记一次答对', async () => {
    const a = await newRestaurant(t);
    await t.game.town.mayor(a, 2);
    const at = gameTime(DAY, 13);
    expect(await resolveMayor(t.game.deps, a.shardId, at)).toEqual({ resolved: 0, failed: 0 });
    await weatherRan(a.shardId, at, weatherOf(2).id);
    expect(await resolveMayor(t.game.deps, a.shardId, at)).toEqual({ resolved: 1, failed: 0 });
    expect(await goodsNum(t, a.restaurantId, GOODS.mayorFavor)).toBe(1);
    expect(await eventCount(t, a.restaurantId, 'town.mayor.right')).toBe(1);
    t.clock.set(gameTime(DAY, 14));
    expect((await t.game.town.overview(a)).mayor.today).toMatchObject({ type: 2, right: true, actual: 2 });
    // 再跑一次不重复发
    expect(await resolveMayor(t.game.deps, a.shardId, at)).toEqual({ resolved: 0, failed: 0 });
    expect(await goodsNum(t, a.restaurantId, GOODS.mayorFavor)).toBe(1);
  });

  it('一家揭晓出错只跳过它，别家照常；下次再揭晓它（backlog：原来一家出错整轮作废）', async () => {
    const a = await newRestaurant(t);
    const b = await newRestaurant(t, { shardId: a.shardId });
    await t.game.town.mayor(a, 2);
    await t.game.town.mayor(b, 2);
    const at = gameTime(DAY, 13);
    await weatherRan(a.shardId, at, weatherOf(2).id);
    // 只让 b 那一行写不进去（触发器按店号过滤，不影响别的测试）
    const fn = sql.raw(`test_fail_mayor_${b.restaurantId}`);
    await sql`create function ${fn}() returns trigger language plpgsql as $$
      begin
        if new.rest_id = ${sql.raw(String(b.restaurantId))} then raise exception 'test mayor fail'; end if;
        return new;
      end $$`.execute(t.db);
    await sql`create trigger ${fn} before update on mayor_guess for each row execute function ${fn}()`.execute(
      t.db,
    );
    const errors: unknown[] = [];
    try {
      expect(await resolveMayor(t.game.deps, a.shardId, at, { error: (o) => errors.push(o) })).toEqual({
        resolved: 1,
        failed: 1,
      });
    } finally {
      await sql`drop trigger if exists ${fn} on mayor_guess`.execute(t.db);
      await sql`drop function if exists ${fn}()`.execute(t.db);
    }
    expect(errors).toHaveLength(1);
    expect(await goodsNum(t, a.restaurantId, GOODS.mayorFavor)).toBe(1);
    expect(await goodsNum(t, b.restaurantId, GOODS.mayorFavor)).toBe(0);
    expect(await resolveMayor(t.game.deps, a.shardId, at)).toEqual({ resolved: 1, failed: 0 });
    expect(await goodsNum(t, b.restaurantId, GOODS.mayorFavor)).toBe(1);
  });

  it('猜错不罚（用户 2026-10-12）', async () => {
    const a = await newRestaurant(t);
    await t.game.town.mayor(a, 3);
    const at = gameTime(DAY, 13);
    await weatherRan(a.shardId, at, weatherOf(1).id);
    await resolveMayor(t.game.deps, a.shardId, at);
    const row = await t.db
      .selectFrom('mayor_guess')
      .select(['right', 'actual'])
      .where('rest_id', '=', a.restaurantId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ right: false, actual: 1 });
    expect(await goodsNum(t, a.restaurantId, GOODS.mayorFavor)).toBe(0);
    const honors = await t.db
      .selectFrom('store_item')
      .select('goods_id')
      .where('rest_id', '=', a.restaurantId)
      .where('goods_id', '=', gid('镇长的针对'))
      .execute();
    expect(honors).toEqual([]);
    expect(await eventCount(t, a.restaurantId, 'town.mayor.right')).toBe(0);
  });
});

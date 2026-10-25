import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { artBreedOf } from '@dt/config';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { gid } from '../../../test/items';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { runSystemOp } from '../../core/op';
import { breedDue, breedJobs, breedNeed, deliverBreeds, grantBreed, pickBreedFoods } from './breed';

const config = testConfig();
const ART = gid('《山河社稷 · 万象天工》乾坤通景巨屏');
const B = artBreedOf(config.requireGoods(ART).effects)!;
const HOUR = 3_600_000;
const foodId = (name: string) => [...config.foods.values()].find((f) => f.name === name)!.id;
const FALLBACK = ['鱼翅', '鲍鱼', '鱼肚', '燕窝', '虫草'].map(foodId);

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('乾坤通景巨屏孕育：份数（2026-10-25）', () => {
  const placedAt = new Date('2026-10-25T00:00:00Z');
  const at = (h: number) => new Date(placedAt.getTime() + h * HOUR);
  const due = (h: number, expiresH: number | null = 24) =>
    breedDue({ placedAt, expiresAt: expiresH === null ? null : at(expiresH), now: at(h), breed: B });

  it('每 2 小时 1 份，24 小时 12 份；延时拉长也不超过 12；到期后不再长', () => {
    expect(due(2 - 1 / 60)).toBe(0);
    expect(due(2)).toBe(1);
    expect(due(24)).toBe(12);
    expect(due(30, 28.8)).toBe(12);
    expect(due(10, 5)).toBe(2);
    expect(due(-1)).toBe(0);
  });
});

describe('乾坤通景巨屏孕育：挑食材', () => {
  const rice = foodId('大米');
  const mushroom = foodId('香菇');
  const high = [...config.foods.values()].find((f) => f.level === 6 && f.odds <= 65 && !f.retired)!.id;

  it('只挑等级 ≤ 5、odds ≤ 65 的缺料；抽一个扣一个缺口，扣完走兜底', () => {
    const need = new Map([
      [rice, 50],
      [mushroom, 2],
      [high, 50],
    ]);
    const got = pickBreedFoods(need, 20, seededRng(1), config.foods, B);
    expect(got.slice(0, 2)).toEqual([mushroom, mushroom]);
    expect(got.slice(2).every((id) => FALLBACK.includes(id))).toBe(true);
    expect(got).not.toContain(rice);
    expect(got).not.toContain(high);
  });

  it('没有缺料：5 级 odds ≤ 65 里随机', () => {
    const got = pickBreedFoods(new Map(), 30, seededRng(2), config.foods, B);
    expect(got).toHaveLength(30);
    expect(got.every((id) => FALLBACK.includes(id))).toBe(true);
  });
});

describe('乾坤通景巨屏孕育：缺料清单和发放', () => {
  /** 一条至少两道菜的街，和其中一道菜 */
  const [street, ids] = [...config.cookbookIndex.idsByStreet].find(([, l]) => l.length >= 2)!;
  const left = ids[0]!;

  it('缺料清单只看本街还没学的菜，减去橱柜已有的', async () => {
    const need1 = config.requireCookbook(left).needFoods[1] ?? [];
    const first = need1[0]!;
    const ctx = await newRestaurant(t, {
      patch: { street_id: street },
      cookbooks: Object.fromEntries(ids.filter((id) => id !== left).map((id) => [id, 1])),
      foods: { [first.foodsId]: first.num },
    });
    const need = await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 't' }, breedNeed);
    const expected = new Map<number, number>();
    for (const x of need1) expected.set(x.foodsId, (expected.get(x.foodsId) ?? 0) + x.num);
    expected.delete(first.foodsId);
    expect(need).toEqual(expected);
  });

  it('补发到点的份数：橱柜加食材、每份一条店铺动态、记下已发份数；再调不重复', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 } });
    const now = t.clock.now;
    const row = {
      rest_id: ctx.restaurantId,
      slot: 11,
      goods_id: ART,
      placed_at: new Date(now.getTime() - 5 * HOUR),
      expires_at: new Date(now.getTime() + 19 * HOUR),
    };
    await t.db.insertInto('restaurant_device').values(row).execute();
    const total = () =>
      t.db
        .selectFrom('cupboard_food')
        .select((eb) =>
          eb.fn.coalesce(eb.fn.sum<number>(eb('num', '+', eb.ref('fridge_num'))), eb.lit(0)).as('n'),
        )
        .where('rest_id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow()
        .then((r) => Number(r.n));
    const before = await total();
    const run = () =>
      runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 't', now }, (op) =>
        grantBreed(op, { ...row, breed_done: 0 }),
      );
    expect(await run()).toBe(2);
    expect((await total()) - before).toBe(2);
    const logs = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', ctx.restaurantId)
      .where('type', '=', 'device.breed')
      .execute();
    expect(logs.map((l) => [(l.params as { n: number }).n, (l.params as { of: number }).of])).toEqual([
      [1, 12],
      [2, 12],
    ]);
    const dev = await t.db
      .selectFrom('restaurant_device')
      .select('breed_done')
      .where('rest_id', '=', ctx.restaurantId)
      .where('slot', '=', 11)
      .executeTakeFirstOrThrow();
    expect(dev.breed_done).toBe(2);
    const again = await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 't', now }, (op) =>
      grantBreed(op, { ...row, breed_done: 2 }),
    );
    expect(again).toBe(0);
  });
});

describe('乾坤通景巨屏孕育：每分钟任务', () => {
  /** 在屏风位插一件巨屏：placedAgo 小时前摆的，24 小时后到期 */
  async function placed(placedAgo: number, patch: Record<string, unknown> = {}) {
    const ctx = await newRestaurant(t, { patch: { star_level: 1, ...patch } });
    const placedAt = new Date(t.clock.now.getTime() - placedAgo * HOUR);
    await t.db
      .insertInto('restaurant_device')
      .values({
        rest_id: ctx.restaurantId,
        slot: 11,
        goods_id: ART,
        placed_at: placedAt,
        expires_at: new Date(placedAt.getTime() + 24 * HOUR),
      })
      .execute();
    return ctx;
  }
  const done = (restId: number) =>
    t.db
      .selectFrom('restaurant_device')
      .select('breed_done')
      .where('rest_id', '=', restId)
      .where('slot', '=', 11)
      .executeTakeFirstOrThrow()
      .then((r) => r.breed_done);
  const lastFood = (restId: number) =>
    t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', restId)
      .where('type', '=', 'device.breed')
      .orderBy('id', 'desc')
      .executeTakeFirstOrThrow()
      .then((r) => (r.params as { foodsId: number }).foodsId);

  it('停了几小时再跑一次补齐，不重复；到 24 小时给满 12 份为止', async () => {
    const ctx = await placed(7);
    expect((await deliverBreeds(t.game.deps, ctx.shardId, t.clock.now)).granted).toBe(3);
    expect((await deliverBreeds(t.game.deps, ctx.shardId, t.clock.now)).granted).toBe(0);
    await deliverBreeds(t.game.deps, ctx.shardId, new Date(t.clock.now.getTime() + 30 * HOUR));
    expect(await done(ctx.restaurantId)).toBe(12);
  });

  it('换了街道按新街道挑', async () => {
    const ctx = await placed(2);
    await deliverBreeds(t.game.deps, ctx.shardId, t.clock.now);
    const [street] = [...config.cookbookIndex.idsByStreet].find(([s]) => s !== 0)!;
    await t.db
      .updateTable('restaurant')
      .set({ street_id: street })
      .where('id', '=', ctx.restaurantId)
      .execute();
    const later = new Date(t.clock.now.getTime() + 2 * HOUR);
    expect((await deliverBreeds(t.game.deps, ctx.shardId, later)).granted).toBe(1);
    const need = await runSystemOp(
      t.game.deps,
      ctx.shardId,
      ctx.restaurantId,
      { source: 't', now: later },
      breedNeed,
    );
    const got = await lastFood(ctx.restaurantId);
    expect(need.has(got) || FALLBACK.includes(got)).toBe(true);
    const f = config.foods.get(got)!;
    expect(f.level <= 5 && f.odds <= 65).toBe(true);
  });

  it('橱柜满了进冰箱，不报错', async () => {
    const ctx = await placed(2, { cupboard_num: 0 });
    const r = await deliverBreeds(t.game.deps, ctx.shardId, t.clock.now);
    expect(r).toEqual({ granted: 1, failed: 0 });
    const row = await t.db
      .selectFrom('cupboard_food')
      .select(['num', 'fridge_num'])
      .where('rest_id', '=', ctx.restaurantId)
      .where('foods_id', '=', await lastFood(ctx.restaurantId))
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ num: 0, fridge_num: 1 });
  });

  it('任务登记：art-breed 每分钟一次，挂在 restaurant', () => {
    const [job] = breedJobs(t.game.deps);
    expect(job).toMatchObject({ name: 'art-breed', feature: 'restaurant' });
    expect(job!.period(new Date('2026-10-10T04:05:30Z'), config.tuning as never)).toBe('2026-10-10T04:05');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：学 / 偷都成功 */
let win: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
});

const lvl = (n: number) => config.bundle.mysteriousCookbooks.filter((m) => m.level === n);
const MC3 = lvl(3)[0]!; // 3 级：中级教师证 178 能开
const MC4 = lvl(4)[0]!;
const cookbookIds = (n: number) =>
  Object.fromEntries(config.cookbookIndex.allIds.slice(0, n).map((id) => [id, 1]));

async function teacher(g: TestGame, mcId: number, patch: Record<string, number> = {}): Promise<RestCtx> {
  const ctx = await newRestaurant(g, {
    verified: true,
    patch: { star_level: 2, strength: 500, ...patch },
    goods: { 177: 1, 178: 1, 179: 1 },
  });
  await g.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: mcId, way: 1 }).execute();
  await g.db.insertInto('mc_remnant').values({ rest_id: ctx.restaurantId, mc_id: mcId, num: 2 }).execute();
  return ctx;
}
async function student(
  g: TestGame,
  shardId: number,
  level: number,
  patch: Record<string, number> = {},
): Promise<RestCtx> {
  return newRestaurant(g, {
    shardId,
    verified: true,
    cookbooks: cookbookIds(level * 10),
    patch: { star_level: 3, strength: 500, coin: 10_000_000, ...patch },
    goods: { [180 + level]: 10 },
  });
}
const lessonRow = (g: TestGame, id: number) =>
  g.db.selectFrom('mc_lesson').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('开课（规格书 04 §4.7）', () => {
  it('扣残卷 1、教师证 1、体力；课程按教师证的时长和人数；列表里能看到', async () => {
    const tc = await teacher(t, MC3.id);
    const r = await t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    const l = await lessonRow(t, r.data.id);
    expect(l).toMatchObject({
      teacher_rest_id: tc.restaurantId,
      mc_id: MC3.id,
      level: 3,
      max_num: 5,
      closed_at: null,
    });
    expect(l.ends_at.getTime() - t.clock.now.getTime()).toBe(24 * 3600_000);
    expect(await goodsNum(t, tc.restaurantId, 178)).toBe(0);
    expect((await restRow(t, tc.restaurantId)).strength).toBe(500 - 65);
    const list = await t.game.mysterious.lessons(tc);
    expect(list.mine).toMatchObject({ id: r.data.id, teacherId: tc.restaurantId });
    expect(list.certs.find((c) => c.goodsId === 177)).toMatchObject({ num: 1, levels: [1, 2] });
  });

  it('教师证等级不符、没学、星级不够、已有进行中的课都报错；过期的课自动关闭后可以再开（Review Focus 3）', async () => {
    const tc = await teacher(t, MC4.id);
    await expect(t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 177 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'cert_level' },
    });
    await expect(t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 })).rejects.toMatchObject({
      params: { reason: 'mc_not_learned' },
    });
    const low = await teacher(t, MC4.id, { star_level: 0 });
    await expect(t.game.mysterious.openLesson(low, { mcId: MC4.id, certId: 178 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const first = await t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
    await t.db.insertInto('store_item').values({ rest_id: tc.restaurantId, goods_id: 178, num: 1 }).execute();
    await expect(t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'lesson_open' },
    });
    await t.db
      .updateTable('mc_lesson')
      .set({ ends_at: new Date(t.clock.now.getTime() - 1000) })
      .where('id', '=', first.data.id)
      .execute();
    await t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
    expect((await lessonRow(t, first.data.id)).closed_at).not.toBeNull();
  });
});

describe('学习（规格书 04 §4.7）', () => {
  it('学成功：扣体力 50、学费 售价×3、碎片 2；老师得 售价×2 和碎片 1；学生学会（way 2，记老师）', async () => {
    const tc = await teacher(win, MC3.id);
    const { data } = await win.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    const st = await student(win, tc.shardId, 3);
    const teacherCoin = (await restRow(win, tc.restaurantId)).coin;
    const r = await win.game.mysterious.learnLesson(st, data.id, { type: 1 });
    expect(r.data.success).toBe(true);
    const s = await restRow(win, st.restaurantId);
    expect(s.strength).toBe(450);
    expect(s.coin).toBe(10_000_000 - MC3.coin * 3);
    expect(await goodsNum(win, st.restaurantId, 183)).toBe(8);
    expect((await restRow(win, tc.restaurantId)).coin).toBe(teacherCoin + MC3.coin * 2);
    expect(await goodsNum(win, tc.restaurantId, 183)).toBe(1);
    const m = await win.db
      .selectFrom('rest_mc')
      .selectAll()
      .where('rest_id', '=', st.restaurantId)
      .executeTakeFirstOrThrow();
    expect(m).toMatchObject({ mc_id: MC3.id, way: 2, master_rest_id: tc.restaurantId });
    expect((await lessonRow(win, data.id)).learned).toBe(1);
    const feed = await win.db
      .selectFrom('rest_log')
      .select('type')
      .where('rest_id', '=', tc.restaurantId)
      .execute();
    expect(feed.map((x) => x.type)).toContain('lesson.taught');
    await expect(win.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'lesson' },
    });
  });

  it('碎片不够：报错，体力、学费没扣，老师什么也没拿到，没有学习记录', async () => {
    const tc = await teacher(t, MC3.id);
    const { data } = await t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    const st = await student(t, tc.shardId, 3);
    await t.db
      .deleteFrom('store_item')
      .where('rest_id', '=', st.restaurantId)
      .where('goods_id', '=', 183)
      .execute();
    const before = (await restRow(t, tc.restaurantId)).coin;
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 183 },
    });
    expect((await restRow(t, st.restaurantId)).strength).toBe(500);
    expect((await restRow(t, tc.restaurantId)).coin).toBe(before);
    expect(
      await t.db.selectFrom('mc_lesson_student').selectAll().where('lesson_id', '=', data.id).execute(),
    ).toEqual([]);
  });

  it('学自己的课、课满、偷学人数满、课程过期、普通食谱不够、4 级课特色菜不够都报错', async () => {
    const tc = await teacher(t, MC4.id);
    const { data } = await t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
    await expect(t.game.mysterious.learnLesson(tc, data.id, { type: 1 })).rejects.toMatchObject({
      params: { reason: 'own_lesson' },
    });
    const st = await student(t, tc.shardId, 4);
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'mc_count', need: 4 },
    });
    const few = await student(t, tc.shardId, 1);
    await expect(t.game.mysterious.learnLesson(few, data.id, { type: 1 })).rejects.toMatchObject({
      params: { reason: 'cookbooks', need: 40 },
    });
    await t.db.updateTable('mc_lesson').set({ stolen: 2 }).where('id', '=', data.id).execute();
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 2 })).rejects.toMatchObject({
      params: { reason: 'steal_full' },
    });
    await t.db.updateTable('mc_lesson').set({ learned: 3 }).where('id', '=', data.id).execute();
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'lesson_full' },
    });
    await t.db
      .updateTable('mc_lesson')
      .set({ learned: 0, stolen: 0, ends_at: new Date(t.clock.now.getTime() - 1000) })
      .where('id', '=', data.id)
      .execute();
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      params: { reason: 'lesson_over' },
    });
    expect((await t.game.mysterious.lessons(st)).items.some((x) => x.id === data.id)).toBe(false);
  });
});

describe('偷学失败的遗忘（设计文档 裁定 8、9）', () => {
  it('遗忘 等级×3+1 道普通食谱，计数跟着改；4 级课还可能遗忘一道更低级的特色菜，但不会是正在售卖的', async () => {
    // 抽随机数的顺序：偷学判定 0.9（失败）→ 13 次挑食谱 → 遗忘特色菜判定 0（中）→ 挑特色菜 0
    const g = await createTestGame({ rng: () => sequenceRng([0.9, ...Array<number>(13).fill(0), 0, 0]) });
    try {
      const tc = await teacher(g, MC4.id);
      const { data } = await g.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
      const st = await student(g, tc.shardId, 4);
      const [x, y] = lvl(1);
      const [z] = lvl(5);
      const [w] = lvl(6);
      for (const m of [x!, y!, z!, w!])
        await g.db.insertInto('rest_mc').values({ rest_id: st.restaurantId, mc_id: m.id, way: 1 }).execute();
      const c = await g.db
        .insertInto('mc_cook')
        .values({
          rest_id: st.restaurantId,
          shard_id: st.shardId,
          mc_id: x!.id,
          level: 1,
          grade: 1,
          cook_num: 1,
          total_num: 10,
          left_num: 10,
          price: 5,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await g.db
        .updateTable('restaurant')
        .set({ mc_cook_id: c.id })
        .where('id', '=', st.restaurantId)
        .execute();

      const r = await g.game.mysterious.learnLesson(st, data.id, { type: 2 });
      expect(r.data.success).toBe(false);
      expect(r.data.forgot.cookbooks).toHaveLength(13);
      expect(r.data.forgot.mcId).toBe(y!.id);
      const s = await restRow(g, st.restaurantId);
      expect(s.cookbook_counts.learned).toBe(40 - 13);
      const cb = await g.db
        .selectFrom('restaurant_cookbooks')
        .select('levels')
        .where('rest_id', '=', st.restaurantId)
        .executeTakeFirstOrThrow();
      for (const id of r.data.forgot.cookbooks) expect(cb.levels[id]).toBe(0);
      const left = (
        await g.db.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', st.restaurantId).execute()
      ).map((m) => m.mc_id);
      expect(left).toContain(x!.id);
      expect(left).not.toContain(y!.id);
      const logs = await g.db
        .selectFrom('rest_log')
        .select('type')
        .where('rest_id', '=', st.restaurantId)
        .execute();
      expect(logs.map((l) => l.type)).toContain('mc.forget');
      expect((await lessonRow(g, data.id)).stolen).toBe(0);
    } finally {
      await g.close();
    }
  });
});

describe('强制结束', () => {
  it('持有百世之师且人满时花 等级×50000 银币结束；人没满、没有勋章都不行', async () => {
    const tc = await teacher(t, MC3.id, { coin: 1_000_000 });
    const { data } = await t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    await expect(t.game.mysterious.closeLesson(tc)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'statue', goodsId: 216 },
    });
    await grantGoods(t.db, config, tc.restaurantId, 216, 1, new Date());
    await expect(t.game.mysterious.closeLesson(tc)).rejects.toMatchObject({
      params: { reason: 'lesson_not_full' },
    });
    await t.db.updateTable('mc_lesson').set({ learned: 5 }).where('id', '=', data.id).execute();
    await t.game.mysterious.closeLesson(tc);
    expect((await lessonRow(t, data.id)).closed_at).not.toBeNull();
    expect((await restRow(t, tc.restaurantId)).coin).toBe(1_000_000 - 3 * 50000);
    expect((await t.game.mysterious.lessons(tc)).canForceClose).toBe(true);
  });
});

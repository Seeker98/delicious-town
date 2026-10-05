import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { addOrder, openFor } from '../../../test/takeaway';
import { grantGoods } from '../store/grant';
import { GOODS } from '@dt/config';
import { cid, fid } from '../../../test/items';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const runJob = async (shardId: number) =>
  t.game.jobs
    .find((j) => j.name === 'takeaway-orders')!
    .run({
      shardId,
      period: '2026-09-30 12',
      now: t.clock.now,
      settings: await t.game.shards.settings(shardId),
      log: { error: () => undefined },
    });
const idsIn = async (shardId: number) =>
  (await t.db.selectFrom('takeaway_order').select('id').where('shard_id', '=', shardId).execute()).map(
    (r) => r.id,
  );

describe('全服公共单（设计文档 §3.2）', () => {
  it('整点补单：营业店不足 10 按 30 算，目标 = rand(18) + 5 + 2；已有的有效单算在内', async () => {
    const ctx = await newRestaurant(t);
    expect(await runJob(ctx.shardId)).toEqual({ created: 14, removed: 0 });
    const rows = await t.db
      .selectFrom('takeaway_order')
      .selectAll()
      .where('shard_id', '=', ctx.shardId)
      .orderBy('id')
      .execute();
    expect(rows).toHaveLength(14);
    const ids = [...config.cookbooks.keys()].sort((a, b) => a - b);
    expect(rows[0]).toMatchObject({
      cookbook_id: ids[Math.floor(ids.length * 0.4)], // 随机数 0.4 落在全部食谱里的位置（食谱总数会变，问题记录 284）
      grade: 2,
      need_minutes: 28,
      need_renown: 5,
      state: 1,
      owner_rest_id: null,
    });
    expect(rows[0]!.expires_at.getTime() - t.clock.now.getTime()).toBe(36 * 60_000);
    expect(await runJob(ctx.shardId)).toEqual({ created: 0, removed: 0 });
  });

  it('清理：过期超过 1 天的未接单、7 天前完成的单删掉；配送中的不删（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t);
    const week = 8 * 24 * 60;
    const oldOpen = await addOrder(t, ctx.shardId, { expiresIn: -25 * 60 });
    const recentOpen = await addOrder(t, ctx.shardId, { expiresIn: -60 });
    const oldDone = await addOrder(t, ctx.shardId, { state: 3, createdAgo: week, expiresIn: -week });
    const oldDelivering = await addOrder(t, ctx.shardId, { state: 2, createdAgo: week, expiresIn: -week });
    expect((await runJob(ctx.shardId)).removed).toBe(2);
    const left = await idsIn(ctx.shardId);
    expect(left).toEqual(expect.arrayContaining([recentOpen, oldDelivering]));
    expect(left).not.toContain(oldOpen);
    expect(left).not.toContain(oldDone);
  });
});

describe('私人刷新（设计文档 §3.2、裁定 4）', () => {
  it('要工作证；100 万 × 今天第几次；送 160 声望；15 张只有自己能看到', async () => {
    const me = await newRestaurant(t, { patch: { coin: 5_000_000 } });
    const other = await newRestaurant(t, { shardId: me.shardId });
    await openFor(t, me);
    await openFor(t, other);
    await expect(t.game.takeaway.refresh(me)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'job_honor' },
    });
    await grantGoods(t.db, config, me.restaurantId, GOODS.shopJobHonor, 1, t.clock.now);
    expect((await t.game.takeaway.overview(me)).refresh).toEqual({ cost: 1_000_000, hasJob: true });
    expect((await t.game.takeaway.refresh(me)).data).toEqual({ created: 15 });
    expect(await restRow(t, me.restaurantId)).toMatchObject({ coin: 4_000_000, renown: 160 });
    const v = await t.game.takeaway.overview(me);
    expect(v.orders.filter((o) => o.private)).toHaveLength(15);
    expect(v.refresh.cost).toBe(2_000_000);
    await t.game.takeaway.refresh(me);
    expect((await restRow(t, me.restaurantId)).coin).toBe(2_000_000);
    await expect(t.game.takeaway.refresh(me)).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'coin', need: 3_000_000 },
    });
    expect((await t.game.takeaway.overview(other)).orders).toEqual([]);
  });

  it('没开通不能刷新', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 5_000_000 } });
    await grantGoods(t.db, config, ctx.restaurantId, GOODS.shopJobHonor, 1, t.clock.now);
    await expect(t.game.takeaway.refresh(ctx)).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'takeaway_closed' },
    });
  });
});

describe('概览里的单（设计文档 §5）', () => {
  it('看得到公共单和自己的私人单，看不到别人的私人单、过期的和被接走的；每张单写明能不能接', async () => {
    const me = await newRestaurant(t, {
      patch: { renown: 3 },
      cookbooks: { 1: 1 },
      foods: { [fid('猪肉')]: 1, [fid('鸡蛋')]: 1, [fid('香葱')]: 1 },
    });
    const other = await newRestaurant(t, { shardId: me.shardId });
    await openFor(t, me);
    const ok = await addOrder(t, me.shardId, { cookbookId: cid('南煎丸子'), needRenown: 3 });
    const mine = await addOrder(t, me.shardId, { owner: me.restaurantId, grade: 2, needRenown: 3 });
    const renown = await addOrder(t, me.shardId, { needRenown: 4 });
    const notLearned = await addOrder(t, me.shardId, { cookbookId: cid('聊城熏鸡') });
    await addOrder(t, me.shardId, { owner: other.restaurantId });
    await addOrder(t, me.shardId, { expiresIn: -1 });
    await addOrder(t, me.shardId, { state: 2 });
    const v = await t.game.takeaway.overview(me);
    const byId = new Map(v.orders.map((o) => [o.id, o]));
    expect([...byId.keys()].sort((a, b) => a - b)).toEqual([ok, mine, renown, notLearned]);
    expect(byId.get(ok)).toMatchObject({
      cookbookName: '南煎丸子',
      grade: 1,
      needMinutes: 30,
      private: false,
      block: null,
      foods: [
        { foodsId: fid('猪肉'), need: 1, have: 1 },
        { foodsId: fid('鸡蛋'), need: 1, have: 1 },
        { foodsId: fid('香葱'), need: 1, have: 1 },
      ],
    });
    expect(byId.get(mine)).toMatchObject({ private: true, block: 'foods' });
    expect(byId.get(mine)!.foods[0]).toEqual({ foodsId: fid('猪肉'), need: 2, have: 1 });
    expect(byId.get(renown)!.block).toBe('renown');
    expect(byId.get(notLearned)!.block).toBe('not_learned');
  });
});

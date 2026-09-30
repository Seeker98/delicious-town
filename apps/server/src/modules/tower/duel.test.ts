import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime, seededRng, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { befriend, createTestGame, newPair, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { ensureNpc } from '../npc/npc';

const DAY = '2026-09-30';
const config = testConfig();
const STRONG = { attr_cook: 20, attr_cutting: 20, attr_fire: 20, attr_season: 10 };
const MID = { attr_cook: 15, attr_cutting: 15, attr_fire: 15, attr_season: 10 };
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame({ rng: () => sequenceRng([0.4]) });
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const pair = async (a = {}, b = {}): Promise<[RestCtx, RestCtx]> => {
  const [x, y] = await newPair(t, { patch: { star_level: 1, ...a } }, { patch: { star_level: 1, ...b } });
  await befriend(t, x.restaurantId, y.restaurantId);
  return [x, y];
};
const duel = (me: RestCtx, them: RestCtx) => t.game.tower.duel(me, { restId: them.restaurantId });
const setDaily = (restId: number, key: string, count: number) =>
  t.db
    .insertInto('daily_counter')
    .values({ rest_id: restId, day: DAY, key, count })
    .onConflict((oc) => oc.columns(['rest_id', 'day', 'key']).doUpdateSet({ count }))
    .execute();

describe('好友切磋（设计文档 §3.4）', () => {
  it('普通档胜：声望 +5，切磋奖励 2 次；扣 5 体力；计入支线 110 和活跃；对方不受影响', async () => {
    const [a, b] = await pair({ ...STRONG, main_task_step: 23 }, MID);
    expect(await t.game.tower.duelInfo(a, b.restaurantId)).toEqual({
      left: 10,
      spar: 0,
      strength: 100,
      duelStrength: 5,
    });
    const r = await duel(a, b);
    expect(r.data).toMatchObject({ win: true, renown: 5, rank: null, test: false });
    expect(r.data.me.power).toBe(70);
    expect(r.data.them.power).toBe(55);
    expect(r.data.awards).toHaveLength(2);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ strength: 95, renown: 5, coin: 3200 });
    expect(await restRow(t, b.restaurantId)).toMatchObject({ strength: 100, renown: 0, coin: 0 });
    expect(await t.game.tower.duelInfo(a, b.restaurantId)).toMatchObject({ left: 9, spar: 1 });
    const side = (await t.game.task.tasks(a)).side.find((x) => x.id === 110)!;
    expect(side).toMatchObject({ key: 'tower.friendDuel', progress: 1 });
    const act = await t.game.task.activation(a);
    expect(act.items.find((i) => i.name === '与好友赛厨')!.count).toBe(1);
  });

  it('以强凌弱胜 0；以弱胜强胜 +6，满 50 次也照给但没有奖励；以弱胜强负 −2（声望可以为负）', async () => {
    const [a, b] = await pair(STRONG, {});
    expect((await duel(a, b)).data).toMatchObject({ win: true, renown: 0 });
    const [c, d] = await pair(STRONG, { luck: 200 });
    await setDaily(c.restaurantId, 'tower.spar', 50);
    expect((await duel(c, d)).data).toMatchObject({ win: true, renown: 6, awards: [] });
    const [e, f] = await pair({}, MID);
    expect((await duel(e, f)).data).toMatchObject({ win: false, renown: -2 });
    expect((await restRow(t, e.restaurantId)).renown).toBe(-2);
  });

  it('上限：今日切磋满 20 次后普通胜只给 +2、奖励 1 次；满 50 次后 0 且没有奖励', async () => {
    const [a, b] = await pair(STRONG, MID);
    await setDaily(a.restaurantId, 'tower.spar', 20);
    const r1 = await duel(a, b);
    expect(r1.data).toMatchObject({ win: true, renown: 2 });
    expect(r1.data.awards).toHaveLength(1);
    await setDaily(a.restaurantId, 'tower.spar', 50);
    expect((await duel(a, b)).data).toMatchObject({ win: true, renown: 0, awards: [] });
  });

  it('条件：对方是蟹老板、不是好友、声望为负、不到 1 星、同一好友满 10 次都不能切磋', async () => {
    const [a, b] = await pair();
    const npc = await ensureNpc(t.db, config, config.tuning.friend.npc, a.shardId, seededRng(1));
    await befriend(t, a.restaurantId, npc.id);
    await expect(t.game.tower.duel(a, { restId: npc.id })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      params: { reason: 'npc' },
    });
    const [x, y] = await newPair(t, { patch: { star_level: 1 } }, { patch: { star_level: 1 } });
    await expect(duel(x, y)).rejects.toMatchObject({ code: 'NOT_FRIEND' });
    const [neg, n2] = await pair({ renown: -1 }, {});
    await expect(duel(neg, n2)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'renown', what: 'duel' },
    });
    const [nostar, s2] = await pair({ star_level: 0 }, {});
    await expect(duel(nostar, s2)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    await setDaily(a.restaurantId, `tower.duel:${b.restaurantId}`, 10);
    await expect(duel(a, b)).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'duel', max: 10 },
    });
    expect((await t.game.tower.duelInfo(a, b.restaurantId)).left).toBe(0);
    expect((await restRow(t, a.restaurantId)).strength).toBe(100);
  });

  it('区服关闭 tower：切磋报 FEATURE_DISABLED', async () => {
    const [a, b] = await pair();
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: a.shardId, override: JSON.stringify({ features: { tower: false } }) })
      .execute();
    t.game.shards.invalidate(a.shardId);
    await expect(duel(a, b)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(t.game.tower.duelInfo(a, b.restaurantId)).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});

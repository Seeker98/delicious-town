import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEVICE_TYPE, FUND_MEDALS, GOODS_TYPE } from '@dt/config';
import { acquireShard, setAcquireState } from '../../../test/acquire';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { questIn, showQuest } from '../../../test/quests';

/** 支线扩充 B 的状态条件（问题记录 515，方案第八节）：任务页按现在的数算，以前达到的也算 */
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

type Ctx = Awaited<ReturnType<typeof newRestaurant>>;
const quest = (key: string, target: number) =>
  t.deps.config.bundle.quests.find((q) => q.cond.key === key && q.cond.target === target)!;
async function progress(ctx: Ctx, key: string, target: number) {
  const q = quest(key, target);
  await showQuest(t, ctx.restaurantId, q.id);
  return questIn(await t.game.task.tasks(ctx), q.id)?.progress;
}
const goodsWhere = (f: (g: { type: number; deviceType: number | null }) => boolean) =>
  [...t.deps.config.goods.values()].filter((g) => f(g)).map((g) => g.id);

describe('连续签到（历史最长）', () => {
  it('连着签累加；断了从 1 重新数，最长的留着', async () => {
    const ctx = await newRestaurant(t);
    const at = (day: string) => t.clock.set(new Date(`${day}T04:00:00Z`));
    for (const day of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05']) {
      at(day);
      await t.game.task.signIn(ctx);
    }
    t.clock.set(new Date());
    const row = await t.db
      .selectFrom('signin_streak')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ last_day: '2026-11-05', streak: 1, best: 3 });
    expect(await progress(ctx, 'signin.best', 7)).toBe(3);
  });

  it('没签过为 0', async () => {
    const ctx = await newRestaurant(t);
    expect(await progress(ctx, 'signin.best', 7)).toBe(0);
  });
});

describe('其他状态条件', () => {
  it('厨塔最高通过的层', async () => {
    const ctx = await newRestaurant(t);
    await t.db.insertInto('tower_state').values({ rest_id: ctx.restaurantId, best_floor: 5 }).execute();
    expect(await progress(ctx, 'tower.bestFloor', 7)).toBe(5);
  });

  it('名下店数', async () => {
    const shardId = await acquireShard(t);
    const me = await newRestaurant(t, { shardId });
    for (let i = 0; i < 2; i++) {
      const r = await newRestaurant(t, { shardId });
      await setAcquireState(t, r.restaurantId, shardId, { owner_rest_id: me.restaurantId });
    }
    expect(await progress(me, 'acquire.holdings', 8)).toBe(2);
  });

  it('收藏：牌匾按仓库里有的算；荣誉、名画按生效中的荣誉算，基金勋章和过期的不算', async () => {
    const plaques = goodsWhere((g) => g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque);
    const paintings = goodsWhere((g) => g.deviceType === DEVICE_TYPE.painting);
    const other = goodsWhere((g) => g.deviceType === DEVICE_TYPE.pot)[0]!;
    const medal = [...FUND_MEDALS][0]!;
    const ctx = await newRestaurant(t, { goods: { [plaques[0]!]: 1, [plaques[1]!]: 2 } });
    const honor = (id: number, expires: Date | null = null) => ({
      rest_id: ctx.restaurantId,
      source_type: 'honor',
      source_id: id,
      effects: JSON.stringify({}),
      expires_at: expires,
    });
    await t.db
      .insertInto('effect_source')
      .values([
        honor(paintings[0]!),
        honor(paintings[1]!),
        honor(other),
        honor(medal),
        honor(paintings[2]!, new Date(Date.now() - 1000)),
      ])
      .execute();
    expect(await progress(ctx, 'collection.plaques', 3)).toBe(2);
    expect(await progress(ctx, 'collection.honors', 10)).toBe(3);
    expect(await progress(ctx, 'collection.paintings', 7)).toBe(2);
  });

  it('邀请的好友到 10 级、30 级：按邀请奖励记录算，超过每月上限的也算', async () => {
    const ctx = await newRestaurant(t);
    const me = await t.db
      .selectFrom('restaurant')
      .select(['account_id', 'shard_id'])
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    const friend = async (stages: ['lv10' | 'lv30', 'sent' | 'capped'][]) => {
      const f = await newRestaurant(t, { shardId: me.shard_id });
      const acc = (
        await t.db
          .selectFrom('restaurant')
          .select('account_id')
          .where('id', '=', f.restaurantId)
          .executeTakeFirstOrThrow()
      ).account_id;
      for (const [stage, status] of stages)
        await t.db
          .insertInto('invite_reward')
          .values({
            invitee_account_id: acc,
            stage,
            inviter_account_id: me.account_id,
            shard_id: me.shard_id,
            invitee_rest_id: f.restaurantId,
            status,
            month: '2026-11',
          })
          .execute();
    };
    await friend([['lv10', 'sent']]);
    await friend([
      ['lv10', 'capped'],
      ['lv30', 'capped'],
    ]);
    expect(await progress(ctx, 'invite.level10', 1)).toBe(2);
    expect(await progress(ctx, 'invite.level30', 1)).toBe(1);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { GOODS } from '@dt/config';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const talk = (ctx: RestCtx, npc: 'bigEater' | 'wenjie' | 'bro13' | 'carmen') =>
  t.game.town.talk(ctx, { npc });

describe('NPC 对话（设计文档 §3.3）', () => {
  it('镇长大胃锅（原来的大胃哥，问题记录 441）：每天 1~5 级食材 1~3 个 + 1 颗种子；不再送神秘食材兑换券', async () => {
    const a = await newRestaurant(t);
    const first = (await talk(a, 'bigEater')).data;
    expect(first.talk).toBe('bigEater');
    expect(first.rewards).toHaveLength(2);
    const [food, seed] = first.rewards;
    expect(food!.kind).toBe('foods');
    expect(config.requireFood(food!.id!).level).toBeGreaterThanOrEqual(1);
    expect(config.requireFood(food!.id!).level).toBeLessThanOrEqual(5);
    expect(food!.num).toBeGreaterThanOrEqual(1);
    expect(food!.num).toBeLessThanOrEqual(3);
    expect(seed).toMatchObject({ kind: 'seed', num: 1 });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryFoodExchange)).toBe(0);
    const seedRow = await t.db
      .selectFrom('rest_seed')
      .select('num')
      .where('rest_id', '=', a.restaurantId)
      .where('seed_id', '=', seed!.id!)
      .executeTakeFirstOrThrow();
    expect(seedRow.num).toBe(1);

    await expect(talk(a, 'bigEater')).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'talk' },
    });

    t.clock.set(gameTime('2026-10-01', 12));
    expect((await talk(a, 'bigEater')).data.rewards).toHaveLength(2);
  });

  it('卡门的见面礼（问题记录 441：原来大胃哥第一次聊天送）：神秘食材兑换券 ×1，每家店一次', async () => {
    const a = await newRestaurant(t);
    const first = (await talk(a, 'carmen')).data;
    expect(first).toMatchObject({
      npc: 'carmen',
      talk: 'carmenFirst',
      rewards: [{ kind: 'goods', id: GOODS.mysteryFoodExchange, num: 1 }],
    });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryFoodExchange)).toBe(1);
    expect((await t.game.town.overview(a)).bigEaterGift).toBe(true);
    // 第二天也不能再领
    t.clock.set(gameTime('2026-10-01', 12));
    await expect(talk(a, 'carmen')).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'carmen_gift' },
    });
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryFoodExchange)).toBe(1);
  });

  it('雯姐送神秘礼券 1~20 张，13 哥送喇叭 1~2 个；各自每天一次', async () => {
    const a = await newRestaurant(t);
    const w = (await talk(a, 'wenjie')).data;
    expect(w.talk).toBe('wenjie');
    expect(w.rewards).toHaveLength(1);
    expect(w.rewards[0]).toMatchObject({ kind: 'goods', id: GOODS.mysteryTicket });
    expect(w.rewards[0]!.num).toBeGreaterThanOrEqual(1);
    expect(w.rewards[0]!.num).toBeLessThanOrEqual(20);
    expect(await goodsNum(t, a.restaurantId, GOODS.mysteryTicket)).toBe(w.rewards[0]!.num);

    const b = (await talk(a, 'bro13')).data;
    expect(b.talk).toBe('bro13');
    expect(b.rewards[0]).toMatchObject({ kind: 'goods', id: GOODS.horn });
    expect([1, 2]).toContain(b.rewards[0]!.num);

    await expect(talk(a, 'wenjie')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await expect(talk(a, 'bro13')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });

  it('奖励按实际到账显示：超过持有上限被丢弃的部分不算（PR26 遗留）', async () => {
    const a = await newRestaurant(t, { goods: { [GOODS.horn]: 9999 } });
    const r = await t.game.town.talk(a, { npc: 'bro13' });
    expect(r.data.rewards).toEqual([{ kind: 'goods', id: GOODS.horn, num: 0 }]);
    expect(await goodsNum(t, a.restaurantId, GOODS.horn)).toBe(9999);
  });
});

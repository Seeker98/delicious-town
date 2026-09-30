import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

const DAY = '2026-09-30';
const config = testConfig();
let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());
beforeEach(() => t.clock.set(gameTime(DAY, 12)));

const talk = (ctx: RestCtx, npc: 'bigEater' | 'wenjie' | 'bro13') => t.game.town.talk(ctx, { npc });

describe('NPC 对话（设计文档 §3.3）', () => {
  it('大胃哥：1~5 级食材 1~3 个 + 1 颗种子；第一次另送神秘食材兑换券，第二天不再送', async () => {
    const a = await newRestaurant(t);
    const first = (await talk(a, 'bigEater')).data;
    expect(first.talk).toBe('你! 很有个性是吧!');
    const [food, seed, gift] = first.rewards;
    expect(food!.kind).toBe('foods');
    expect(config.requireFood(food!.id!).level).toBeGreaterThanOrEqual(1);
    expect(config.requireFood(food!.id!).level).toBeLessThanOrEqual(5);
    expect(food!.num).toBeGreaterThanOrEqual(1);
    expect(food!.num).toBeLessThanOrEqual(3);
    expect(seed).toMatchObject({ kind: 'seed', num: 1 });
    expect(gift).toEqual({ kind: 'goods', id: 20, num: 1 });
    expect(await goodsNum(t, a.restaurantId, 20)).toBe(1);
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
    const next = (await talk(a, 'bigEater')).data;
    expect(next.talk).toBe('你真有品味! 我也是这样觉得的! 哈哈哈!');
    expect(next.rewards).toHaveLength(2);
    expect(await goodsNum(t, a.restaurantId, 20)).toBe(1);
  });

  it('雯姐送神秘礼券 1~20 张，13 哥送喇叭 1~2 个；各自每天一次', async () => {
    const a = await newRestaurant(t);
    const w = (await talk(a, 'wenjie')).data;
    expect(w.talk).toBe('用了飘柔就明显气质上来了!');
    expect(w.rewards).toHaveLength(1);
    expect(w.rewards[0]).toMatchObject({ kind: 'goods', id: 1 });
    expect(w.rewards[0]!.num).toBeGreaterThanOrEqual(1);
    expect(w.rewards[0]!.num).toBeLessThanOrEqual(20);
    expect(await goodsNum(t, a.restaurantId, 1)).toBe(w.rewards[0]!.num);

    const b = (await talk(a, 'bro13')).data;
    expect(b.talk).toBe('爱就直接去做!!!');
    expect(b.rewards[0]).toMatchObject({ kind: 'goods', id: 315 });
    expect([1, 2]).toContain(b.rewards[0]!.num);

    await expect(talk(a, 'wenjie')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
    await expect(talk(a, 'bro13')).rejects.toMatchObject({ code: 'ALREADY_DONE' });
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPONSOR_HATS } from '@dt/config';
import { runSystemOp } from '../../core/op';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { checkRewardItems, grantRewardOp } from './reward';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('附件发放（设计 §4）', () => {
  it('银币、钻石、道具、食材、命名帽子一起到账；流水来源和日志类型按参数', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0, diamond: 0 } });
    await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (op) =>
      grantRewardOp(
        op,
        {
          coin: 100,
          diamond: 2,
          goods: [{ id: 1, num: 3 }],
          foods: [{ id: 101, num: 4 }],
          hats: [{ tier: 'jade', name: '大橘' }],
        },
        { source: 'mail.claim', logType: 'mail.claim', logParams: { mailId: 9, title: '开服礼' } },
      ),
    );
    const r = await restRow(t, ctx.restaurantId);
    expect([r.coin, r.diamond]).toEqual([100, 2]);
    expect(await goodsNum(t, ctx.restaurantId, 1)).toBe(3);
    expect((await foodNum(t, ctx.restaurantId, 101)).num).toBe(4);
    const hat = await t.db
      .selectFrom('equip')
      .select('custom_name')
      .where('rest_id', '=', ctx.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.jade)
      .executeTakeFirstOrThrow();
    expect(hat.custom_name).toBe('大橘');
    const log = await t.db
      .selectFrom('rest_log')
      .select(['type', 'params'])
      .where('rest_id', '=', ctx.restaurantId)
      .where('type', '=', 'mail.claim')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ mailId: 9, title: '开服礼' });
  });

  it('道具或食材 id 不存在时校验报 VALIDATION_FAILED', () => {
    expect(() => checkRewardItems(t.deps.config, { goods: [{ id: 999999, num: 1 }] })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
    expect(() => checkRewardItems(t.deps.config, { foods: [{ id: 999999, num: 1 }] })).toThrow();
    expect(() => checkRewardItems(t.deps.config, { coin: 1 })).not.toThrow();
  });
});

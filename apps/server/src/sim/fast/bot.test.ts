import { describe, expect, it } from 'vitest';
import { GOODS, resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { PERSONAS } from '../bot';
import { botTurn, starBlockers, type FastBot } from './bot';
import { newMarket } from './market';
import { openFastRest } from './ops';
import type { FastCtx } from './state';
import type { FastWorld } from './world';

const config = testConfig();
const settings = resolveShardSettings(config, {});
const ctx = (): FastCtx => ({
  config,
  tuning: settings.tuning,
  now: new Date('2026-10-02T04:00:00Z'),
  rng: seededRng(5),
  stats: { income: {} },
});
const world = (): FastWorld => ({ weather: {}, weatherId: 0, krabStreet: null, planktonRestId: null });
const bot = (c: FastCtx): FastBot => ({
  name: 'b',
  persona: PERSONAS[0]!,
  rest: openFastRest(c, 1, settings),
  rng: seededRng(9),
  lastSideDay: '',
});

describe('机器人（设计 §4.5）', () => {
  it('签到一次、加点用完、停业时加油复业；同一天第二次不再签到', () => {
    const c = ctx();
    const b = bot(c);
    b.rest.attrLeft = 6;
    b.rest.oil = 0;
    b.rest.state = 2;
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.daily.get('signin')).toBe(1);
    expect(b.rest.attrLeft).toBe(0);
    expect(b.rest.state).toBe(1);
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.daily.get('signin')).toBe(1);
  });

  it('升星条件只差凭证时买凭证并升星', () => {
    const c = ctx();
    const b = bot(c);
    const need = config.starNeed.get(1)!;
    b.rest.level = need.needLevel;
    b.rest.counts.learned = need.needCookbooks;
    b.rest.coin = 1e9;
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.star).toBe(1);
  });

  it('银币为 0、仓库空、停业时不报错（Review Focus 2）', () => {
    const c = ctx();
    const b = bot(c);
    b.rest.coin = 0;
    b.rest.oil = 0;
    b.rest.state = 2;
    b.rest.store.clear();
    // 签到礼包会给银币，所以可能加上油复业，和真实游戏一样；这里只要求不报错
    expect(() => botTurn(c, b, newMarket(), world(), null)).not.toThrow();
  });

  it('学菜：橱柜里的食材够学一道没学过的菜就学', () => {
    const c = ctx();
    const b = bot(c);
    // 只放这道菜的食材；按街道顺序可能先学到用同样食材的别的菜，所以只要求学会了菜
    b.rest.foods.clear();
    const cb = [...config.cookbooks.values()].find((x) => (x.needFoods[1] ?? []).length > 0)!;
    for (const f of cb.needFoods[1]!) b.rest.foods.set(f.foodsId, (b.rest.foods.get(f.foodsId) ?? 0) + f.num);
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.counts.learned).toBeGreaterThan(0);
  });

  it('凭证不够又没钱时，卡点原因有 certs 和 coin', () => {
    const c = ctx();
    const b = bot(c);
    const need = config.starNeed.get(1)!;
    b.rest.level = need.needLevel;
    b.rest.counts.learned = need.needCookbooks;
    b.rest.coin = 0;
    b.rest.store.delete(GOODS.starCert);
    if (need.needCerts > 0)
      expect(starBlockers(c, b.rest)).toEqual(expect.arrayContaining(['certs', 'coin']));
  });
});

import { describe, expect, it } from 'vitest';
import { GOODS, GOODS_TYPE, resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  action,
  addFoods,
  aggOf,
  consumeGoods,
  countGoods,
  gainCoin,
  gainExp,
  grantAward,
  grantGoods,
  openFastRest,
  spendCoin,
} from './ops';
import type { FastCtx } from './state';

const config = testConfig();
const settings = resolveShardSettings(config, {});
const ctx = (): FastCtx => ({
  config,
  tuning: settings.tuning,
  now: new Date('2026-10-02T04:00:00Z'),
  rng: seededRng(7),
  stats: { income: {} },
});

describe('快速模型原语（设计 §4.3）', () => {
  it('新店和真实开店的初值一致：等级、银币、餐桌、开店礼包', () => {
    const c = ctx();
    const r = openFastRest(c, 1, settings);
    const d = settings.restaurant;
    expect(r.level).toBe(d.level);
    expect(r.coin).toBe(d.coin);
    expect(r.tables).toHaveLength(d.tableNum);
    for (const g of d.giftGoods) {
      if (config.requireGoods(g.id).type !== GOODS_TYPE.equip)
        expect(countGoods(c, r, g.id)).toBeGreaterThan(0);
    }
    for (const f of d.giftFoods) expect(r.foods.get(f.id)).toBe(f.num);
  });

  it('经验升级：加属性点、幸运、餐桌上限；按来源记账', () => {
    const c = ctx();
    const r = openFastRest(c, 1, settings);
    const before = { attr: r.attrLeft, luck: r.luck, tableNum: r.tableNum };
    gainExp(c, r, 10_000_000, 'test');
    expect(r.level).toBeGreaterThan(1);
    const up = r.level - 1;
    const t = settings.tuning.rest;
    expect(r.attrLeft).toBe(before.attr + t.attrPerLevel * up);
    expect(r.luck).toBe(before.luck + t.luckPerLevel * up);
    expect(r.tableNum).toBe(before.tableNum + t.tablesPerLevel * up);
    expect(c.stats.income.test!.exp).toBe(10_000_000);
  });

  it('银币不够时 spendCoin 返回 false，不扣', () => {
    const c = ctx();
    const r = openFastRest(c, 1, settings);
    r.coin = 5;
    expect(spendCoin(c, r, 10, 'x')).toBe(false);
    expect(r.coin).toBe(5);
    expect(spendCoin(c, r, 5, 'x')).toBe(true);
    expect(r.coin).toBe(0);
  });

  it('银币流出按来源记账（问题记录 240）：花掉的、扣成负数的都记；没扣成的不记', () => {
    const c = ctx();
    const r = openFastRest(c, 1, settings);
    r.coin = 100;
    spendCoin(c, r, 30, 'market.buy');
    spendCoin(c, r, 500, 'market.buy');
    spendCoin(c, r, 20, 'oil');
    gainCoin(c, r, -10, 'dine');
    expect(c.stats.spend).toEqual({ 'market.buy': 30, oil: 20, dine: 10 });
  });

  it('普通道具到持有上限为止；勋章数量恒为 1 并成为加成来源', () => {
    const c = ctx();
    const r = openFastRest(c, 1, settings);
    const honor = [...config.goods.values()].find(
      (g) => g.type === GOODS_TYPE.honor && !config.isStreetMedal(g) && Object.keys(g.effects).length > 0,
    )!;
    grantGoods(c, r, honor.id, 3, 'test');
    expect(countGoods(c, r, honor.id)).toBe(1);
    expect(r.effects.some((e) => e.sourceType === 'honor' && e.sourceId === honor.id)).toBe(true);
    const cert = config.requireGoods(GOODS.starCert);
    grantGoods(c, r, cert.id, cert.maxNum + 5, 'test');
    expect(countGoods(c, r, cert.id)).toBe(cert.maxNum);
    expect(consumeGoods(c, r, cert.id, 1)).toBe(true);
    expect(consumeGoods(c, r, cert.id, cert.maxNum)).toBe(false);
  });

  it('食材放进橱柜，超出单种上限进冰箱；加成缓存在来源变化后失效', () => {
    const c = ctx();
    const r = openFastRest(c, 1, settings);
    const food = [...config.foods.values()].find((f) => f.level === 1 && !r.foods.has(f.id))!;
    addFoods(c, r, food.id, r.foodsMaxNum + 3);
    expect(r.foods.get(food.id)).toBe(r.foodsMaxNum);
    expect(r.fridge.get(food.id)).toBe(3);
    const a1 = aggOf(c, r);
    r.effects.push({ sourceType: 'side', sourceId: 1, effects: { atRate: 1 }, expiresAt: null });
    r.aggDirty = true;
    expect(aggOf(c, r).atRate ?? 0).toBeCloseTo((a1.atRate ?? 0) + 1);
  });

  it('奖励：银币、道具到账；行为计数记总数，有活跃项的同时记当日活跃', () => {
    const c = ctx();
    const r = openFastRest(c, 1, settings);
    const coin = r.coin;
    const certs = countGoods(c, r, GOODS.starCert);
    grantAward(c, r, { coin: 100, goods: [{ id: GOODS.starCert, num: 2 }] }, 'task');
    expect(r.coin).toBe(coin + 100);
    expect(countGoods(c, r, GOODS.starCert)).toBe(certs + 2);
    action(c, r, 'signin');
    expect(r.counters.get('signin')).toBe(1);
    const name = config.bundle.actionMap.activation['signin'];
    const act = name ? config.activationByName.get(name) : undefined;
    if (act && act.needStar <= r.star) expect(r.daily.get(`act:${act.id}`)).toBe(1);
  });
});

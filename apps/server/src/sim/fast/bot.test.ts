import { describe, expect, it } from 'vitest';
import { GOODS, NEWBIE, resolveShardSettings } from '@dt/config';
import { seededRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { PERSONAS } from '../bot';
import { CHAPTER_MARK } from '../../modules/task/quests';
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
/** 任务都记为已领：只测别的决策时，免得任务奖励（经验升级、银币）干扰（问题记录 318） */
const noQuests = (b: FastBot) => {
  for (const q of config.bundle.quests) b.rest.questDone.add(q.id);
  for (const ch of config.bundle.chapters) b.rest.questDone.add(CHAPTER_MARK + ch.id);
};

describe('机器人（设计 §4.5）', () => {
  it('签到一次、加点用完、停业时加油复业；同一天第二次不再签到', () => {
    const c = ctx();
    const b = bot(c);
    noQuests(b);
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

  it('升星银币（240-1）：只差凭证和银币时钱够就买凭证、付银币升星；不够就攒钱，不买桌子', () => {
    const coinTuning = { ...settings.tuning, growth: { ...settings.tuning.growth, starCoin: [100000] } };
    const c = { ...ctx(), tuning: coinTuning };
    const b = bot(c);
    noQuests(b);
    b.rest.store.delete(NEWBIE.pack);
    b.rest.daily.set('signin', 1);
    const need = config.starNeed.get(1)!;
    b.rest.level = need.needLevel;
    b.rest.counts.learned = need.needCookbooks;
    const cert = config.requireGoods(GOODS.starCert).coin;
    b.rest.coin = cert + 50000;
    const tables = b.rest.tables.length;
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.star).toBe(0);
    expect(b.rest.tables).toHaveLength(tables);
    b.rest.coin = 1e9;
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.star).toBe(1);
    expect(c.stats.spend!.star).toBe(100000);
  });

  it('升星银币不够时卡点原因有 coin（240-1）', () => {
    const coinTuning = { ...settings.tuning, growth: { ...settings.tuning.growth, starCoin: [100000] } };
    const c = { ...ctx(), tuning: coinTuning };
    const b = bot(c);
    const need = config.starNeed.get(1)!;
    b.rest.level = need.needLevel;
    b.rest.counts.learned = need.needCookbooks;
    b.rest.store.set(GOODS.starCert, { num: need.needCerts, expiresAt: null });
    b.rest.coin = 10;
    expect(starBlockers(c, b.rest)).toEqual(['coin']);
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
    // 只能学本街的菜（问题记录 312）
    const cb = [...config.cookbooks.values()].find(
      (x) => x.streetId === b.rest.streetId && (x.needFoods[1] ?? []).length > 0,
    )!;
    for (const f of cb.needFoods[1]!) b.rest.foods.set(f.foodsId, (b.rest.foods.get(f.foodsId) ?? 0) + f.num);
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.counts.learned).toBeGreaterThan(0);
  });

  it('在新街道上时学新街道的菜（问题记录 284）；只学本街的（问题记录 312）', () => {
    const c = ctx();
    const b = bot(c);
    b.rest.streetId = 14;
    b.rest.foods.clear();
    // 18747 鲷鱼握寿司（日本街 14）：鲷鱼、大米、醋
    for (const f of config.requireCookbook(18747).needFoods[1]!)
      b.rest.foods.set(f.foodsId, (b.rest.foods.get(f.foodsId) ?? 0) + f.num);
    botTurn(c, b, newMarket(), world(), null);
    const learnedNew = [...config.cookbooks.values()].filter(
      (x) => x.streetId >= 14 && b.rest.levels[x.id]! > 0,
    );
    expect(learnedNew.length).toBeGreaterThan(0);
  });

  describe('搬街（问题记录 240 报告：只能学本街的菜以后，新手街 69 道菜不够升 2 星）', () => {
    /** 新手街的菜全学到 1 品级，等级够 2 星，只差食谱数 */
    const exhausted = (c: FastCtx) => {
      const b = bot(c);
      noQuests(b);
      for (const id of config.cookbookIndex.idsByStreet.get(0)!) b.rest.levels[id] = 1;
      b.rest.star = 1;
      b.rest.level = config.starNeed.get(2)!.needLevel;
      b.rest.counts.learned = config.cookbookIndex.idsByStreet.get(0)!.length;
      b.rest.coin = 1e7;
      b.rest.daily.set('signin', 1); // 签到送的银币、钻石不干扰
      b.rest.store.delete(NEWBIE.pack); // 新手大礼包里有 50 钻石
      return b;
    };

    it('本街没学过的菜学完了、下一星还要更多：用搬家卡搬到没学过的菜最多的街，付银币，换街道勋章', () => {
      const c = ctx();
      const b = exhausted(c);
      b.rest.store.set(GOODS.moveCard, { num: 1, expiresAt: null });
      botTurn(c, b, newMarket(), world(), null);
      expect(b.rest.streetId).not.toBe(0);
      const most = Math.max(
        ...[...config.cookbookIndex.idsByStreet].filter(([id]) => id !== 0).map(([, ids]) => ids.length),
      );
      expect(config.cookbookIndex.idsByStreet.get(b.rest.streetId)!.length).toBe(most);
      expect(b.rest.store.has(GOODS.moveCard)).toBe(false);
      expect(c.stats.spend!.move).toBeGreaterThan(0);
      expect(b.rest.store.has(config.streetMedalId(0))).toBe(false);
      expect(b.rest.store.has(config.streetMedalId(b.rest.streetId))).toBe(true);
    });

    it('没有搬家卡时花钻石在黑市买一张；钻石不够就不搬', () => {
      const c = ctx();
      const b = exhausted(c);
      b.rest.diamond = 0;
      botTurn(c, b, newMarket(), world(), null);
      expect(b.rest.streetId).toBe(0);
      const c2 = ctx();
      const b2 = exhausted(c2);
      b2.rest.diamond = config.requireGoods(GOODS.moveCard).diamond;
      botTurn(c2, b2, newMarket(), world(), null);
      expect(b2.rest.streetId).not.toBe(0);
      expect(b2.rest.diamond).toBe(0);
    });

    it('本街还有没学过的菜但 3 天没学到新菜：也搬；不到 3 天不搬', () => {
      const c = ctx();
      const b = exhausted(c);
      const left = config.cookbookIndex.idsByStreet.get(0)![0]!;
      b.rest.levels[left] = 0;
      b.rest.counts.learned -= 1;
      b.rest.foods.clear();
      b.rest.store.set(GOODS.moveCard, { num: 1, expiresAt: null });
      b.rest.lastFreshAt = new Date(c.now.getTime() - 2 * 86_400_000);
      botTurn(c, b, newMarket(), world(), null);
      expect(b.rest.streetId).toBe(0);
      b.rest.lastFreshAt = new Date(c.now.getTime() - 4 * 86_400_000);
      botTurn(c, b, newMarket(), world(), null);
      expect(b.rest.streetId).not.toBe(0);
    });
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

describe('机器人决策（终审 I-3，设计 §9）', () => {
  it('只差凭证但买不起时攒钱：不买桌子，不升星', () => {
    const c = ctx();
    const b = bot(c);
    b.rest.store.delete(NEWBIE.pack); // 新手大礼包里有 5 万银币（问题记录 331），这里要测买不起的情况
    const need = config.starNeed.get(1)!;
    b.rest.level = need.needLevel;
    b.rest.counts.learned = need.needCookbooks;
    b.rest.tableNum = 7;
    b.rest.daily.set('signin', 1);
    b.rest.coin = 40_000; // 凭证 55000 买不起；不攒钱的话够买 3 张桌子
    botTurn(c, b, newMarket(), world(), null);
    expect(b.rest.star).toBe(0);
    expect(b.rest.tables).toHaveLength(4);
  });

  it('买菜按缺口买，并留出加满一次油和 2 万的钱', async () => {
    const { unitPrice } = await import('../../modules/market/rules');
    const c = ctx();
    const b = bot(c);
    b.rest.store.delete(NEWBIE.pack); // 大礼包里的银币和食材随机券会改变要算的钱和缺口（问题记录 331）
    noQuests(b);
    b.rest.daily.set('signin', 1);
    b.rest.foods.clear();
    // 缺口只算本街的菜（问题记录 312）：挑一个本街 1 品级合计至少要 2 个的食材
    const ids = config.cookbookIndex.idsByStreet.get(b.rest.streetId)!;
    const needOf = (fid: number) =>
      ids.reduce(
        (s, id) =>
          s +
          (config.requireCookbook(id).needFoods[1] ?? [])
            .filter((f) => f.foodsId === fid)
            .reduce((a, f) => a + f.num, 0),
        0,
      );
    const cb = ids
      .map((id) => config.requireCookbook(id))
      .find((x) => (x.needFoods[1] ?? []).length > 0 && needOf(x.needFoods[1]![0]!.foodsId) >= 2)!;
    const food = config.requireFood(cb.needFoods[1]![0]!.foodsId);
    const price = unitPrice(0, food, settings.tuning.market, {});
    const m = newMarket();
    m.items.push({
      id: 1,
      shelf: 0,
      foodsId: food.id,
      stock: 1000,
      sold: 0,
      openedAt: new Date(0),
      bought: new Map(),
    });
    b.rest.coin = b.rest.oilMax + 20_000 + Math.floor(price * 2.5);
    botTurn(c, b, m, world(), null);
    expect(m.items[0]!.sold).toBe(Math.min(2, cb.needFoods[1]![0]!.num * 999));
    expect(b.rest.coin).toBeGreaterThanOrEqual(b.rest.oilMax + 20_000 - 1);
  });

  it('学菜列表：同一条街先列没学过的，再列可升级的', async () => {
    const { learnable } = await import('./bot');
    const c = ctx();
    const b = bot(c);
    const street = [...config.cookbookIndex.idsByStreet.keys()][0]!;
    const ids = config.cookbookIndex.idsByStreet.get(street)!;
    const [a, n] = ids.filter((id) => (config.requireCookbook(id).needFoods[2] ?? []).length > 0);
    b.rest.levels[a!] = 1;
    b.rest.foods.clear();
    for (const g of [1, 2] as const)
      for (const f of config.requireCookbook(g === 1 ? n! : a!).needFoods[g]!)
        b.rest.foods.set(f.foodsId, (b.rest.foods.get(f.foodsId) ?? 0) + f.num * 3);
    for (const mid of [467, 468, 469, 470, 471]) b.rest.foods.set(mid, 99);
    const list = learnable(c, b.rest, street);
    expect(list.indexOf(n!)).toBeGreaterThanOrEqual(0);
    expect(list.indexOf(a!)).toBeGreaterThan(list.indexOf(n!));
  });
});

describe('任务（问题记录 318）', () => {
  it('签到、加点、加油后领第 1 章对应的主线任务，记进 questDone', () => {
    const c = ctx();
    const b = bot(c);
    b.rest.attrLeft = 6;
    b.rest.oil = 0;
    b.rest.state = 2;
    botTurn(c, b, newMarket(), world(), null);
    for (const id of [2021, 2022, 2025]) expect(b.rest.questDone.has(id), String(id)).toBe(true);
  });
});

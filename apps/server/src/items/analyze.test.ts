import { describe, expect, it } from 'vitest';
import { GOODS, createGameConfig } from '@dt/config';
import { testConfig } from '../../test/config';
import { analyzeItems, type ItemRow } from './analyze';

const config = testConfig();
const none = { goods: new Set<number>(), foods: new Set<number>() };
const report = analyzeItems(config, none);
const row = (kind: ItemRow['kind'], id: number) => report.rows.find((r) => r.kind === kind && r.id === id)!;
const wheres = (r: ItemRow, k: 'gives' | 'uses') => r[k].map((x) => x.where);
const foodOf = (level: number, rare?: boolean) =>
  config.bundle.foods.find((f) => f.level === level && (rare === undefined || f.odds < 100 === rare))!;

describe('道具整理的分析（问题记录 367）', () => {
  it('每个道具、每种食材一行', () => {
    expect(report.rows.filter((r) => r.kind === 'goods')).toHaveLength(config.bundle.goods.length);
    expect(report.rows.filter((r) => r.kind === 'foods')).toHaveLength(config.bundle.foods.length);
  });

  it('1 级普通食材：菜场日常、随机奖励、1 级兑换券', () => {
    const r = row('foods', foodOf(1, false).id);
    expect(wheres(r, 'gives')).toEqual(expect.arrayContaining(['菜场日常', '随机奖励', '1 级食材兑换券']));
    expect(r.noSource).toBe(false);
  });

  it('酒吧小游戏按档次出 1~5 级普通和稀有食材，不出 6 级（问题记录 352）', () => {
    expect(wheres(row('foods', foodOf(3, true).id), 'gives')).toContain('酒吧小游戏');
    expect(wheres(row('foods', foodOf(5, false).id), 'gives')).toContain('酒吧小游戏');
    expect(wheres(row('foods', foodOf(6).id), 'gives')).not.toContain('酒吧小游戏');
  });

  it('合成能合到 5 级、分解能分到 4 级（按游戏里的规则函数算）', () => {
    expect(wheres(row('foods', foodOf(5).id), 'gives')).toContain('合成');
    expect(wheres(row('foods', foodOf(4).id), 'gives')).toContain('分解');
    expect(wheres(row('foods', foodOf(6).id), 'gives')).not.toContain('合成');
  });

  it('神殿探险还出 7 级食材、带探险者秘籍多出 3 级食材；蟹老板橱柜出 1~5 级（backlog 道具整理工具）', () => {
    expect(wheres(row('foods', foodOf(7).id), 'gives')).toContain('神殿探险');
    expect(wheres(row('foods', foodOf(3).id), 'gives')).toContain('神殿探险（探险者秘籍）');
    for (const lv of [1, 2, 3, 4, 5])
      expect(wheres(row('foods', foodOf(lv).id), 'gives')).toContain('蟹老板橱柜');
    expect(wheres(row('foods', foodOf(6).id), 'gives')).not.toContain('蟹老板橱柜');
  });

  it('7 级食材：神殿守护兽、神秘食材兑换券', () => {
    const r = row('foods', foodOf(7).id);
    expect(wheres(r, 'gives')).toEqual(expect.arrayContaining(['神殿守护兽', '神秘食材兑换券']));
  });

  it('6 级食材：大多只能靠菜园获得；食谱只在品级上限调到 10 时用到', () => {
    const lv6 = config.bundle.foods.filter((f) => f.level === 6).map((f) => row('foods', f.id));
    for (const r of lv6) {
      expect(r.notes.includes('只能靠菜园获得')).toBe(r.gives.every((x) => x.where.startsWith('菜园')));
      if (r.uses.some((x) => x.where.startsWith('食谱')))
        expect(r.notes).toContain('食谱只在品级上限调到 10 时用到');
    }
    expect(lv6.filter((r) => r.notes.includes('只能靠菜园获得')).length).toBeGreaterThan(10);
  });

  it('道具：商店有售算来源；代码里写死的标出来；什么都没有的标“没有来源”', () => {
    const sale = config.bundle.goods.find((g) => g.onSale && g.coin > 0)!;
    expect(wheres(row('goods', sale.id), 'gives')).toContain('商店');
    expect(row('goods', GOODS.starCert).code).toBe(true);
    const lonely = report.rows.filter((r) => r.kind === 'goods' && r.noSource);
    expect(lonely.length).toBeGreaterThan(0);
    for (const r of lonely) {
      expect(r.gives).toEqual([]);
      expect(r.code).toBe(false);
    }
  });

  it('道具的用途：使用效果、厨具、宝石、被兑换消耗', () => {
    const equip = config.bundle.goods.find((g) => g.equip)!;
    expect(wheres(row('goods', equip.id), 'uses')).toContain('厨具');
    const usable = config.bundle.goods.find((g) => g.use?.kind === 'gift')!;
    expect(wheres(row('goods', usable.id), 'uses')).toContain('打开礼包');
    const need = config.bundle.goodsExchange[0]!.need[0]!.goodsId;
    expect(wheres(row('goods', need), 'uses')).toContain('镇长兑换');
  });

  it('纪念品只在后台配的活动里发：标“活动（后台配置）”，不算没有来源（终审 I2）', () => {
    const souvenirs = report.rows.filter((r) => r.kind === 'goods' && r.category === '纪念品');
    const plain = souvenirs.filter((r) => !r.gives.some((x) => x.where === '一番赏'));
    expect(plain.length).toBeGreaterThanOrEqual(12);
    for (const r of plain) {
      expect(wheres(r, 'gives')).toEqual(['活动（后台配置）']);
      expect(r.noSource).toBe(false);
    }
  });

  describe('顺着礼包链判断来源（backlog 道具整理工具）', () => {
    // 造两件新道具：礼包 99001（哪里都拿不到）装着 99002（只在这个礼包里）
    const base = config.bundle.goods.find((g) => g.gift?.some((i) => i.type === 'goods'))!;
    const plain = config.bundle.goods.find(
      (g) => !g.gift && !g.use && !g.equip && !g.gem && g.type === base.type,
    )!;
    const pack = {
      ...base,
      id: 99001,
      name: '测试礼包',
      onSale: false,
      awardFlag: null,
      gift: [{ type: 'goods' as const, id: 99002, num: 1, rate: 1 }],
    };
    const inner = { ...plain, id: 99002, name: '测试道具', onSale: false, awardFlag: null };
    const cfg = createGameConfig({ ...config.bundle, goods: [...config.bundle.goods, pack, inner] });
    const rowOf = (r: ReturnType<typeof analyzeItems>, id: number) =>
      r.rows.find((x) => x.kind === 'goods' && x.id === id)!;

    it('只在拿不到的礼包里：这处来源标成拿不到，算没有来源，写明原因', () => {
      const r = rowOf(analyzeItems(cfg, none), 99002);
      expect(r.gives).toEqual([{ where: '礼包 99001 测试礼包', n: 1, dead: true }]);
      expect(r.noSource).toBe(true);
      expect(r.notes).toContain('只从拿不到的礼包或道具获得');
    });

    it('礼包能拿到（例如商店有售）时，里面的东西也算有来源', () => {
      const sale = createGameConfig({
        ...config.bundle,
        goods: [...config.bundle.goods, { ...pack, onSale: true, coin: 100 }, inner],
      });
      const r = rowOf(analyzeItems(sale, none), 99002);
      expect(r.gives[0]!.dead).toBeUndefined();
      expect(r.noSource).toBe(false);
    });

    it('礼包下架了：写“只从已下架礼包获得”', () => {
      const r = rowOf(analyzeItems(cfg, { goods: new Set([99001]), foods: new Set() }), 99002);
      expect(r.noSource).toBe(true);
      expect(r.notes).toContain('只从已下架礼包获得');
    });
  });

  it('来源是已下架的礼包时标出来，不算真来源', () => {
    const gift = config.bundle.goods.find(
      (g) => g.gift?.some((i) => i.type === 'goods' && i.id > 0) && g.id !== GOODS.signInGift,
    )!;
    const item = (gift.gift!.find((i) => i.type === 'goods' && i.id > 0) as { id: number }).id;
    const before = row('goods', item).gives.find((x) => x.where === `礼包 ${gift.id} ${gift.name}`)!;
    expect(before.retired).toBeUndefined();
    const after = analyzeItems(config, { goods: new Set([gift.id]), foods: new Set() });
    const r = after.rows.find((x) => x.kind === 'goods' && x.id === item)!;
    expect(r.gives.find((x) => x.where === `礼包 ${gift.id} ${gift.name}`)!.retired).toBe(true);
    expect(after.rows.find((x) => x.kind === 'goods' && x.id === gift.id)!.retired).toBe(true);
  });

  it('食谱品级：1~10 级，上限以内的标开放，10 级用到 6 级食材', () => {
    expect(report.maxGrade).toBe(config.tuning.rest.cookbookMaxGrade);
    expect(report.grades.map((g) => g.grade)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const g of report.grades) expect(g.open).toBe(g.grade <= report.maxGrade);
    expect(report.grades[9]!.foodLevels[6]).toBeGreaterThan(0);
    expect(report.grades[0]!.foodLevels[6]).toBeUndefined();
  });
});

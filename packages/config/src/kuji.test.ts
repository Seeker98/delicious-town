import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS, GOODS_TYPE } from './ids';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('一番赏配置（设计 §3、§4）', () => {
  it('券、手办、图标、默认数值都在', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const b = bundle!;
    const ticket = b.goods.find((g) => g.id === GOODS.kujiTicket)!;
    expect(ticket).toMatchObject({
      name: '一番赏抽赏券',
      type: GOODS_TYPE.consumable,
      onSale: false,
      stackable: true,
    });
    for (const id of [90101, 90102, 90103, 90104]) {
      const g = b.goods.find((x) => x.id === id)!;
      expect(g.type).toBe(GOODS_TYPE.souvenir);
      // 初代手办（问题记录 274 之前）：不再产出，但道具还在
      expect(g.desc).toContain('（一番赏纪念品）');
    }
    expect(b.looks.icons.map((i) => i.key)).toEqual(expect.arrayContaining(['kuji_a', 'kuji_last']));
    const k = b.tuning.kuji;
    expect(k).toMatchObject({ price: 20000, dailyBuy: 10, maxDraw: 10, activeTickets: 1 });
    expect(k.tiers.map((x) => [x.key, x.count])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 4],
      ['D', 8],
      ['E', 15],
      ['F', 50],
    ]);
    expect(k.tiers[0]).toMatchObject({ icon: 'kuji_a', news: 'broadcast' });
    expect(k.last).toMatchObject({ icon: 'kuji_last', news: 'broadcast' });
    // 只有 A 赏和最后赏上新闻（都是广播）；B 赏不再发新闻（问题记录 286）
    expect(k.tiers.filter((x) => x.news).map((x) => x.key)).toEqual(['A']);
  });

  it('月度主题（问题记录 274）：12 个月齐全，每月 4 个限定手办是纪念品；默认奖品不再带初代手办；每天最多 3 池', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const b = bundle!;
    expect(b.kujiThemes.map((t) => t.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const ids = new Set<number>();
    for (const t of b.kujiThemes) {
      expect(t.name.length).toBeGreaterThan(0);
      for (const key of ['A', 'B', 'C', 'last'] as const) {
        const id = t.figures[key];
        ids.add(id);
        const g = b.goods.find((x) => x.id === id)!;
        expect(g.type).toBe(GOODS_TYPE.souvenir);
        expect(g.desc).toContain(`（一番赏·${t.name}）`);
      }
    }
    expect(ids.size).toBe(48);
    expect(b.kujiThemes[0]!.figures.A).toBe(91011);
    const k = b.tuning.kuji;
    expect(k.maxPools).toBe(3);
    for (const tier of [...k.tiers, k.last]) expect(tier.award.goods ?? []).toEqual([]);
  });

  it('月度主题校验：缺月份、重复月份报错', () => {
    const src = source();
    const k = JSON.parse(JSON.stringify(src['game/kuji']));
    k.themes[1].month = 1;
    const { errors } = buildBundle({ ...src, 'game/kuji': k });
    expect(errors.join(' ')).toMatch(/kuji themes duplicate month 1/);
    expect(errors.join(' ')).toMatch(/kuji themes missing month 2/);
  });

  it('校验：档位不能叫 last，一池总张数不超过 1000（一番赏终审）', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.kuji.tiers[0].key = 'last';
    t.kuji.tiers[5].count = 1000;
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    const all = errors.join(' ');
    expect(all).toMatch(/kuji.*reserved.*last/);
    expect(all).toMatch(/kuji.*total 1030 > 1000/);
  });

  it('校验：档位重复、图标不存在、奖品道具不存在都报错', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.kuji.tiers[1].key = 'A';
    t.kuji.tiers[2].icon = 'nope';
    t.kuji.tiers[3].award = { goods: [{ id: 999999, num: 1 }] };
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    expect(errors.join('\n')).toMatch(/kuji.*duplicate.*A/);
    expect(errors.join('\n')).toMatch(/kuji.*icon nope/);
    expect(errors.join('\n')).toMatch(/kuji.*unknown goods 999999/);
  });

  it('豪华池的档位、称号也检查，错误写明 deluxe（240-2）', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.kuji.deluxe.tiers[1].key = 'A';
    t.kuji.deluxe.last.icon = 'nope';
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    expect(errors).toContain('tuning.kuji.deluxe.tiers duplicate key A');
    expect(errors).toContain('tuning.kuji.deluxe.last icon nope not in looks.icons');
  });
});

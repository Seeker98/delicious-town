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
});

import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS_TYPE, WEALTH } from './ids';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('食材理财配置（理财设计 §3.1）', () => {
  it('真实数据：五个街市补给包（消耗品、卖店价 0、不上架、用法 needFood）；三个期限接三~五级包', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const packs = [1, 2, 3, 4, 5].map((lv) => bundle!.goods.find((g) => g.id === WEALTH.packBase + lv)!);
    expect(packs.map((g) => [g.name, g.type, g.coin, g.onSale, g.use])).toEqual(
      [1, 2, 3, 4, 5].map((lv) => [
        `${'一二三四五'[lv - 1]}级街市补给包`,
        GOODS_TYPE.consumable,
        0,
        false,
        { kind: 'needFood', level: lv },
      ]),
    );
    expect(bundle!.tuning.wealth).toEqual({
      minLevel: 20,
      unit: 1000000,
      maxActive: 3,
      maxTotal: 10000000,
      earlyRate: 0.95,
      terms: [
        { days: 3, goods: WEALTH.packBase + 3, perUnit: 1 },
        { days: 7, goods: WEALTH.packBase + 4, perUnit: 1 },
        { days: 14, goods: WEALTH.packBase + 5, perUnit: 1 },
      ],
    });
  });

  it('检查：合计上限小于一档、期限重复、期限的道具不是补给包时报错', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.wealth.maxTotal = 500000;
    t.wealth.terms[1].days = 3;
    t.wealth.terms[2].goods = 10203;
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    expect(errors).toContain('tuning.wealth maxTotal 500000 must not be less than unit 1000000');
    expect(errors).toContain('tuning.wealth.terms duplicate days 3');
    expect(errors).toContain('tuning.wealth.terms 14 days goods 10203 is not a market pack');
  });

  it('检查：补给包编号要等于 10210 + 等级', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<{ id: number; use?: { level: number } }>;
    goods.find((x) => x.id === WEALTH.packBase + 3)!.use!.level = 4;
    const { errors } = buildBundle({ ...src, 'master/goods': goods });
    expect(errors).toContain(
      `goods ${WEALTH.packBase + 3} market pack level 4 must be goods ${WEALTH.packBase + 4}`,
    );
  });
});

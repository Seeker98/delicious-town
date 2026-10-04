import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS_TYPE } from './ids';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('小镇发展基金配置（240-2）', () => {
  it('真实数据：三档 1000 万、300 万、100 万，存期 7 天，领回 90%、提前 70%；三枚勋章 168 小时、经验 15%/10%/5%', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const f = bundle!.tuning.fund;
    expect(f).toMatchObject({ days: 7, returnRate: 0.9, earlyRate: 0.7 });
    expect(f.tiers.map((x) => [x.key, x.coin, x.medal, x.news])).toEqual([
      ['A', 10000000, 93103, 'broadcast'],
      ['B', 3000000, 93102, 'news'],
      ['C', 1000000, 93101, 'news'],
    ]);
    const medals = [93101, 93102, 93103].map((id) => bundle!.goods.find((g) => g.id === id)!);
    expect(medals.map((g) => [g.type, g.invalidHours, g.effects.expRate, g.onSale])).toEqual([
      [GOODS_TYPE.honor, 168, 0.05, false],
      [GOODS_TYPE.honor, 168, 0.1, false],
      [GOODS_TYPE.honor, 168, 0.15, false],
    ]);
  });

  it('检查：提前比例大于到期比例、档位重复、勋章不是荣誉类时报错', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.fund.earlyRate = 0.95;
    t.fund.tiers[1].key = 'C';
    t.fund.tiers[2].medal = 1;
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    expect(errors).toContain('tuning.fund earlyRate 0.95 must not exceed returnRate 0.9');
    expect(errors).toContain('tuning.fund.tiers duplicate key C');
    expect(errors).toContain('tuning.fund.tiers C medal 1 is not an honor');
  });

  it('检查：档位的勋章必须是基金勋章，填别的荣誉会在领取时被当成基金勋章删掉（终审 I2）', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.fund.tiers[0].medal = 81;
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    expect(errors).toContain('tuning.fund.tiers A medal 81 is not a fund medal');
  });
});

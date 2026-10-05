import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS_TYPE } from './ids';
import { defaultDataDir, readSourceDir } from './source';
import { gid } from './testItems';

const source = () => readSourceDir(defaultDataDir());

/** 后期加的 4 张海报、4 个奖杯（问题记录 146） */
const POSTERS = () =>
  [
    '13 哥宣传海报',
    '镇长宣传海报',
    '蟹老板宣传海报',
    '食神宣传海报',
    '小镇食神奖杯(铂金)',
    '小镇食神奖杯(钻石)',
    '小镇食神奖杯(星耀)',
    '小镇食神奖杯(传说)',
  ].map(gid);

describe('更多宣传海报和奖杯（问题记录 146）', () => {
  it('8 个新道具：设施、设施位、效果、24 小时、价格、需要星级；不进随机奖励池', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const rows = POSTERS().map((id) => {
      const g = bundle!.goods.find((x) => x.id === id)!;
      return [g.type, g.deviceType, g.effects, g.coin, g.onSale, g.needStar, g.awardFlag, g.level];
    });
    expect(rows).toEqual([
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 8 }, 30000, true, 4, null, 4],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 15 }, 50000, true, 6, null, 5],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 30 }, 80000, true, 8, null, 6],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 50 }, 150000, true, 10, null, 7],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 4 }, 30000, true, 4, null, 4],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 5 }, 50000, true, 6, null, 5],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 6 }, 80000, true, 8, null, 6],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 7 }, 150000, true, 10, null, 7],
    ]);
    // 现有的普通海报照旧：同样的效果格式，没有星级门槛
    expect(bundle!.goods.find((g) => g.id === gid('普通宣传海报'))).toMatchObject({
      effects: { time: 24, coinValue: 2 },
    });
    expect(
      bundle!.goods.filter((g) => !POSTERS().includes(g.id)).every((g) => g.needStar === undefined),
    ).toBe(true);
  });

  it('检查：星级越界、设施位不对、id 重复', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<Record<string, unknown>>;
    const posters = goods.filter((g) => g.src === 'poster');
    posters[0]!.needStar = 13;
    posters[1]!.deviceType = 6;
    posters[2]!.id = gid('普通宣传海报');
    // 负数星级（质量期 ②）
    posters[3]!.needStar = -1;
    const errs = buildBundle({ ...src, 'master/goods': goods }).errors.join('\n');
    expect(errs).toContain(`goods ${posters[0]!.id as number} needStar 13`);
    expect(errs).toContain(`goods ${gid('食神宣传海报')} needStar -1`);
    expect(errs).toContain(`goods ${posters[1]!.id as number} poster deviceType 6`);
    expect(errs).toContain(`goods: duplicate id ${gid('普通宣传海报')}`);
  });
});

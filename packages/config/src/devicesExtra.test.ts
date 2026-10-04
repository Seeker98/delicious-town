import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS_TYPE } from './ids';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('更多宣传海报和奖杯（问题记录 146）', () => {
  it('8 个新道具：设施、设施位、效果、24 小时、价格、需要星级；不进随机奖励池', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const rows = [93201, 93202, 93203, 93204, 93205, 93206, 93207, 93208].map((id) => {
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
    expect(bundle!.goods.find((g) => g.id === 13)).toMatchObject({ effects: { time: 24, coinValue: 2 } });
    expect(
      bundle!.goods.filter((g) => g.id < 93201 || g.id > 93208).every((g) => g.needStar === undefined),
    ).toBe(true);
  });

  it('检查：星级越界、设施位不对、id 重复', () => {
    const src = source();
    const d = JSON.parse(JSON.stringify(src['game/devices_extra']));
    d.items[0].needStar = 13;
    d.items[1].deviceType = 6;
    d.items[2].id = 13;
    // 负数星级（质量期 ②）
    d.items[3].needStar = -1;
    const errs = buildBundle({ ...src, 'game/devices_extra': d }).errors.join('\n');
    expect(errs).toContain('needStar 13');
    expect(errs).toContain('devices_extra 93204 needStar -1');
    expect(errs).toContain('deviceType 6');
    expect(errs).toContain('duplicate id 13');
  });
});

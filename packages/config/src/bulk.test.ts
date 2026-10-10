import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('大宗认购配置（大宗认购设计 §2.1）', () => {
  it('真实数据没有错误；默认值', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.tuning.bulk).toMatchObject({
      openHour: 20,
      hours: 24,
      closeWindowMin: 5,
      qty: [150, 110, 80, 60, 45],
      capRate: 0.25,
      groupRate: 0.3,
      blindMin: 60,
    });
  });

  it('检查：每人上限不低于成团线、某一级上限取整后是 0、收盘窗口不短于竞价时长、安慰奖道具不存在时报错', () => {
    const src = source();
    const t = JSON.parse(JSON.stringify(src['game/tuning']));
    t.bulk.capRate = 0.3;
    t.bulk.qty = [150, 110, 80, 60, 3];
    t.bulk.closeWindowMin = 24 * 60;
    t.bulk.consolation.goods = 1;
    t.bulk.blindMin = 24 * 60;
    const { errors } = buildBundle({ ...src, 'game/tuning': t });
    expect(errors).toContain('tuning.bulk capRate 0.3 must be less than groupRate 0.3');
    expect(errors).toContain('tuning.bulk qty level 5 (3) gives a per-person cap of 0');
    expect(errors).toContain('tuning.bulk closeWindowMin 1440 must be shorter than hours 24');
    expect(errors).toContain('tuning.bulk consolation goods 1 does not exist');
    expect(errors).toContain('tuning.bulk blindMin 1440 must be shorter than hours 24');
  });
});

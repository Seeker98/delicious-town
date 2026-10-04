import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { checkNewbieCodes } from './newbieCodes';
import { defaultDataDir, readSourceDir } from './source';

const goods = new Set([1, 28, 29]);
const foods = new Set([10]);
const run = (codes: unknown[]) => {
  const errors: string[] = [];
  checkNewbieCodes({ codes } as never, goods, foods, errors);
  return errors;
};
const ok = { code: 'XINSHOU', minLevel: 1, items: { coin: 100 }, note: '' };

describe('新手码配置（设计 §4.1）', () => {
  it('合法的码没有错误', () => {
    expect(run([ok, { ...ok, code: 'XINSHOU10', items: { goods: [{ id: 28, num: 3 }] } }])).toEqual([]);
  });

  it('码格式不对、重复', () => {
    expect(run([{ ...ok, code: 'ab' }])).toContain('newbie_codes ab: bad code');
    expect(run([ok, ok])).toContain('newbie_codes XINSHOU: duplicate');
  });

  it('奖励为空、道具或食材不存在（Review Focus 4）', () => {
    expect(run([{ ...ok, items: {} }])).toContain('newbie_codes XINSHOU: bad items');
    expect(run([{ ...ok, items: { goods: [{ id: 999, num: 1 }] } }])).toContain(
      'newbie_codes XINSHOU: unknown goods 999',
    );
    expect(run([{ ...ok, items: { foods: [{ id: 998, num: 1 }] } }])).toContain(
      'newbie_codes XINSHOU: unknown foods 998',
    );
  });

  it('真实数据：三档等级码加新手大礼包补领码（问题记录 331），构建通过，进了 bundle', () => {
    const { bundle, errors } = buildBundle(readSourceDir(defaultDataDir()));
    expect(errors).toEqual([]);
    expect(bundle!.newbieCodes.map((c) => [c.code, c.minLevel])).toEqual([
      ['XINSHOU', 1],
      ['XINSHOU10', 10],
      ['XINSHOU20', 20],
      ['XINSHOULIBAO', 1],
    ]);
  });
});

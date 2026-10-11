import { describe, expect, it } from 'vitest';
import zhCN from '../i18n/locales/zh-CN';
import { needLabel, needReason } from './needs';

const goodsName = (id: number) => `道具${id}`;

describe('升星、扩油的条件（界面改版 P10）', () => {
  it('needLabel：道具按目录取名，其余按键；不认识的键原样', () => {
    expect(needLabel({ key: 'cookbooks', need: 30, have: 2, ok: false }, zhCN, goodsName)).toBe('已学食谱');
    expect(needLabel({ key: 'goods', id: 117, need: 1, have: 0, ok: false }, zhCN, goodsName)).toBe(
      '道具117',
    );
    expect(needLabel({ key: 'other' as never, need: 1, have: 0, ok: false }, zhCN, goodsName)).toBe('other');
  });

  it('needReason：写第一项不够的差多少；都够了为空', () => {
    expect(
      needReason(
        [
          { key: 'level', need: 20, have: 25, ok: true },
          { key: 'coin', need: 100_000, have: 1_000, ok: false },
          { key: 'cookbooks', need: 30, have: 28, ok: false },
        ],
        zhCN,
        goodsName,
      ),
    ).toBe('银币还差 99,000');
    expect(needReason([{ key: 'level', need: 20, have: 25, ok: true }], zhCN, goodsName)).toBe('');
    expect(needReason([], zhCN, goodsName)).toBe('');
  });
});

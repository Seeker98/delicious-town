import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const bundle = buildBundle(readSourceDir(defaultDataDir())).bundle!;
const use = (id: number) => bundle.goods.find((g) => g.id === id)!.use;

describe('道具用途（构建时推导）', () => {
  it('货币', () => {
    expect(use(85)).toEqual({ kind: 'currency', coin: 100000, diamond: 0 });
    expect(use(137)).toEqual({ kind: 'currency', coin: 0, diamond: 1 });
  });
  it('各种卡', () => {
    expect(use(3)).toEqual({ kind: 'cupboardNum', amount: 1 });
    expect(use(4)).toEqual({ kind: 'cupboardNum', amount: 5 });
    expect(use(8)).toEqual({ kind: 'storeNum', amount: 10 });
    expect(use(9)).toEqual({ kind: 'lockSlots', amount: 1 });
    expect(use(29)).toEqual({ kind: 'strength', amount: 100 });
    expect(use(303)).toEqual({ kind: 'foodsMax', amount: 20 });
    expect(use(55)).toEqual({ kind: 'resetAttr' });
  });
  it('餐桌、神秘食材、鞋带、厨塔挑战券', () => {
    expect(use(82)).toEqual({ kind: 'addTable' });
    expect(use(139)).toEqual({ kind: 'mysteryFood', level: 7 });
    expect(use(169)).toEqual({ kind: 'bundle', goods: 18, num: 36, targetGoods: 17, targetNum: 1 });
    expect(use(136)).toEqual({ kind: 'towerTicket' });
  });
  it('新格式礼包可以打开，QQ 旧格式礼包不能用', () => {
    expect(use(115)).toEqual({ kind: 'gift' });
    expect(use(117)).toEqual({ kind: 'gift' });
    expect(use(54)).toBeNull();
    expect(use(51)).toBeNull();
  });
  it('其他道具没有用途', () => {
    expect(use(86)).toBeNull();
    expect(use(1)).toBeNull();
  });
});

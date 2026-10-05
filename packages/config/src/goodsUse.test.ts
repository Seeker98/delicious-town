import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';
import { gid } from './testItems';

const bundle = buildBundle(readSourceDir(defaultDataDir())).bundle!;
const use = (id: number) => bundle.goods.find((g) => g.id === id)!.use;

describe('道具用途（构建时推导）', () => {
  it('货币', () => {
    expect(use(gid('金币'))).toEqual({ kind: 'currency', coin: 100000, diamond: 0 });
    expect(use(gid('钻石'))).toEqual({ kind: 'currency', coin: 0, diamond: 1 });
  });
  it('各种卡', () => {
    expect(use(gid('小扩容卡'))).toEqual({ kind: 'cupboardNum', amount: 1 });
    expect(use(gid('中扩容卡'))).toEqual({ kind: 'cupboardNum', amount: 5 });
    expect(use(gid('大扩建卡'))).toEqual({ kind: 'storeNum', amount: 10 });
    expect(use(gid('保险卡'))).toEqual({ kind: 'lockSlots', amount: 1 });
    expect(use(gid('体力卡'))).toEqual({ kind: 'strength', amount: 100 });
    expect(use(gid('食材叠加卡'))).toEqual({ kind: 'foodsMax', amount: 20 });
    expect(use(gid('洗点卡'))).toEqual({ kind: 'resetAttr' });
  });
  it('餐桌、神秘食材、鞋带、厨塔挑战券', () => {
    expect(use(gid('餐桌A'))).toEqual({ kind: 'addTable' });
    expect(use(gid('神秘食材随机劵'))).toEqual({ kind: 'mysteryFood', level: 7 });
    expect(use(gid('鞋带'))).toEqual({
      kind: 'bundle',
      goods: gid('普通飞弹'),
      num: 36,
      targetGoods: gid('极速飞弹'),
      targetNum: 1,
    });
    expect(use(gid('厨塔挑战券'))).toEqual({ kind: 'towerTicket' });
  });
  it('新格式礼包可以打开，QQ 旧格式礼包不能用；新手大礼包按 newbie_pack.json 配了内容，能打开（问题记录 331）', () => {
    expect(use(gid('每日签到礼包'))).toEqual({ kind: 'gift' });
    expect(use(gid('升星礼包(一星)'))).toEqual({ kind: 'gift' });
    expect(use(gid('新手大礼包'))).toEqual({ kind: 'gift' });
    expect(use(gid('开发测试礼包'))).toBeNull();
  });
  it('其他道具没有用途', () => {
    expect(use(gid('升星凭证'))).toBeNull();
    expect(use(gid('神秘礼券'))).toBeNull();
  });
});

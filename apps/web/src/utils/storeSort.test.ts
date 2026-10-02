import { describe, expect, it } from 'vitest';
import type { StoreItemDto } from '@dt/shared';
import { groupStoreItems, sortStoreItems } from './storeSort';

const item = (goodsId: number, expiresAt: string | null = null): StoreItemDto => ({
  goodsId,
  type: 0,
  num: 1,
  expiresAt,
  usable: true,
  batch: false,
  maxUse: 1,
  sellPrice: null,
});
const TYPE: Record<number, number> = { 1: 1, 2: 0, 3: 0, 4: 0, 5: 9, 6: 7 };
const NAME: Record<number, string> = {
  1: '喇叭',
  2: '体力卡',
  3: '小体力卡',
  4: '保险卡',
  5: '新手街勋章',
  6: '怪东西',
};
const typeOf = (id: number) => TYPE[id]!;
const nameOf = (id: number) => NAME[id]!;

describe('仓库排序（问题记录 186）', () => {
  it('按类型分组：消耗品、道具、礼包、设施、勋章，其他最后', () => {
    const g = groupStoreItems([item(6), item(5), item(1), item(2)], typeOf, nameOf);
    expect(g.map((x) => x.type)).toEqual([0, 1, 9, 7]);
  });

  it('组内：有剩余时间的在前、短的在前，再按拼音（Review Focus 5）', () => {
    const s = sortStoreItems(
      [item(3), item(2), item(4, '2026-10-02T00:00:00Z'), item(4, '2026-10-01T00:00:00Z')],
      typeOf,
      nameOf,
    );
    expect(s.map((x) => [x.goodsId, x.expiresAt])).toEqual([
      [4, '2026-10-01T00:00:00Z'],
      [4, '2026-10-02T00:00:00Z'],
      [2, null],
      [3, null],
    ]);
  });
});

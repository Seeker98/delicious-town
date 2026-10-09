import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TableResultDto } from '@dt/shared';
import { tableDish, tableOrderLines } from './tableOrder';

const names = {
  cookbookName: (id: number) => ({ 5: '宫保鸡丁' })[id] ?? `#${id}`,
  mcName: (id: number) => ({ 42: '佛跳墙' })[id] ?? `特色菜${id}`,
};
const last = (patch: Partial<TableResultDto>): TableResultDto => ({
  type: 1,
  coin: 10,
  exp: 2,
  oil: 2,
  ...patch,
});

describe('每桌点的菜（问题记录 559）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('格子里的一行：挑剔顾客和蟹老板写点的菜，普通顾客和章鱼哥写吃的特色菜，都没有时不写', () => {
    expect(tableDish(last({ type: 2, req: 3, grade: 2, cookbookId: 5, satisfied: false }), names)).toBe(
      '宫保鸡丁',
    );
    expect(tableDish(last({ type: 8, req: 4, grade: 5, cookbookId: 5, satisfied: true }), names)).toBe(
      '宫保鸡丁',
    );
    expect(tableDish(last({ type: 1, mcId: 42, mcNum: 1 }), names)).toBe('佛跳墙');
    expect(tableDish(last({ type: 6, mcId: 42, mcNum: 3 }), names)).toBe('佛跳墙');
    expect(tableDish(last({ type: 1 }), names)).toBeNull();
    expect(tableDish(last({ type: 2, req: 2 }), names)).toBeNull();
    expect(tableDish(undefined, names)).toBeNull();
  });

  it('详情：点了什么、要几品、你的几品、满不满意；吃了特色菜再写一行', () => {
    expect(
      tableOrderLines(
        last({ type: 2, req: 3, grade: 2, cookbookId: 5, satisfied: false, mcId: 42, mcNum: 1 }),
        names,
      ),
    ).toEqual(['点了「宫保鸡丁」, 要上品, 你的是中品, 不满意', '吃了特色菜「佛跳墙」×1']);
    expect(
      tableOrderLines(last({ type: 8, req: 4, grade: 5, cookbookId: 5, satisfied: true }), names),
    ).toEqual(['点了「宫保鸡丁」, 要极品, 你的是金牌, 满意']);
    expect(tableOrderLines(last({ type: 1, mcId: 42, mcNum: 1 }), names)).toEqual(['吃了特色菜「佛跳墙」×1']);
    expect(tableOrderLines(last({ type: 1 }), names)).toEqual([]);
  });

  it('挑剔顾客想点菜但你一道能做的都没学：写明，不写菜名', () => {
    expect(tableOrderLines(last({ type: 2, req: 2 }), names)).toEqual([
      '想点中品的菜, 但你还没学会能给他做的菜',
    ]);
  });

  it('旧记录没有特色菜编号时不写特色菜那一行', () => {
    expect(tableOrderLines(last({ type: 1, mcNum: 1 }), names)).toEqual([]);
    expect(tableDish(last({ type: 1, mcNum: 1 }), names)).toBeNull();
  });
});

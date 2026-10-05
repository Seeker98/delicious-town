import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS, GOODS_TYPE } from './ids';
import { createGameConfig } from './runtime';
import { takesStoreSlot } from './souvenir';
import { defaultDataDir, readSourceDir } from './source';
import { gid } from './testItems';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('纪念品（148-2 设计 §6）', () => {
  it('第一批 12 件进了道具表，类型是纪念品，不能卖也不能用', () => {
    // 节日纪念品在 70001~70099；一番赏手办（70101 起、71011 起）也是纪念品类型
    const list = [...config.goods.values()].filter((g) => g.type === GOODS_TYPE.souvenir && g.id < 70100);
    expect(list.map((g) => g.id).sort()).toEqual(Array.from({ length: 12 }, (_, i) => 70001 + i));
    const g = config.requireGoods(gid('小红旗徽章'));
    expect(g.name).toBe('小红旗徽章');
    expect(g.desc).toContain('国庆');
    expect(g).toMatchObject({ coin: 0, diamond: 0, maxNum: 99, use: null, equip: null, gem: null });
  });
  it('id 和已有道具冲突时构建报错', () => {
    const src = readSourceDir(defaultDataDir());
    const goods = structuredClone(src['master/goods']) as Array<{ id: number; src: string }>;
    goods.find((g) => g.src === 'souvenir')!.id = GOODS.mysteryTicket;
    const r = buildBundle({ ...src, 'master/goods': goods });
    expect(r.bundle).toBeNull();
    expect(r.errors).toContain(`goods: duplicate id ${GOODS.mysteryTicket}`);
  });
  it('勋章和纪念品不占仓库格，其他道具占', () => {
    expect(takesStoreSlot(config.requireGoods(gid('新年铃铛')))).toBe(false);
    const honor = [...config.goods.values()].find((g) => g.type === GOODS_TYPE.honor)!;
    expect(takesStoreSlot(honor)).toBe(false);
    const item = [...config.goods.values()].find((g) => g.type === GOODS_TYPE.item)!;
    expect(takesStoreSlot(item)).toBe(true);
    expect(takesStoreSlot(undefined)).toBe(false);
  });
});

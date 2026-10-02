import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS_TYPE } from './ids';
import { createGameConfig } from './runtime';
import { takesStoreSlot } from './souvenir';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('纪念品（148-2 设计 §6）', () => {
  it('第一批 12 件进了道具表，类型是纪念品，不能卖也不能用', () => {
    // 节日纪念品是 90001~90012；一番赏手办 90101~90104 也是纪念品类型
    const list = [...config.goods.values()].filter((g) => g.type === GOODS_TYPE.souvenir && g.id < 90100);
    expect(list.map((g) => g.id).sort()).toEqual(Array.from({ length: 12 }, (_, i) => 90001 + i));
    const g = config.requireGoods(90009);
    expect(g.name).toBe('小红旗徽章');
    expect(g.desc).toContain('国庆');
    expect(g).toMatchObject({ coin: 0, diamond: 0, maxNum: 99, use: null, equip: null, gem: null });
  });
  it('id 和已有道具冲突时构建报错', () => {
    const src = readSourceDir(defaultDataDir());
    const file = src['game/souvenirs'] as { souvenirs: Array<{ id: number }> };
    file.souvenirs[0]!.id = 1;
    const r = buildBundle(src);
    expect(r.bundle).toBeNull();
    expect(r.errors.join('\n')).toMatch(/goods/);
  });
  it('勋章和纪念品不占仓库格，其他道具占', () => {
    expect(takesStoreSlot(config.requireGoods(90001))).toBe(false);
    const honor = [...config.goods.values()].find((g) => g.type === GOODS_TYPE.honor)!;
    expect(takesStoreSlot(honor)).toBe(false);
    const item = [...config.goods.values()].find((g) => g.type === GOODS_TYPE.item)!;
    expect(takesStoreSlot(item)).toBe(true);
    expect(takesStoreSlot(undefined)).toBe(false);
  });
});

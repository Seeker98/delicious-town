import { describe, expect, it } from 'vitest';
import { defaultDataDir, readSourceDir } from '@dt/config';
import { createShopTool } from './shop';
import { gid } from '../../test/items';

const src = readSourceDir(defaultDataDir());
type ShopFile = { goods: Array<{ id: number }>; pools?: { special?: number[]; black?: number[] } };
/** 真实的 shop.json：池子里已经去掉了下架的道具，测试只换 goods，池子沿用它 */
const real = src['game/shop'] as ShopFile;
const MISSILE = gid('普通飞弹');
const RED = gid('[一阶]•红晶原石');

function tool(goods: ShopFile['goods'] = real.goods) {
  const written: string[] = [];
  const t = createShopTool({
    readSource: () => ({
      ...src,
      'game/shop': written.length ? (JSON.parse(written.at(-1)!) as unknown) : { ...real, goods },
    }),
    writeShop: (text) => written.push(text),
  });
  return { t, written };
}

describe('商店整理工具（问题记录 483）', () => {
  it('真实数据（下架的道具还在设计表的池子里）照样出报表，不是空表（2026-10-07 一批下架后发现）', () => {
    const r = tool().t.report();
    expect(r.errors).toEqual([]);
    expect(r.rows.length).toBeGreaterThan(100);
  });

  it('报表：商店相关的道具，带现价、原版价、上下架、特价池和黑市池、回收价；没有构建错误', () => {
    const { t } = tool([{ id: MISSILE, coin: 2400, note: '降价' } as ShopFile['goods'][number]]);
    const r = t.report();
    expect(r.errors).toEqual([]);
    const m = r.rows.find((x) => x.id === MISSILE)!;
    expect(m).toMatchObject({
      name: '普通飞弹',
      coin: 2400,
      diamond: 0,
      onSale: true,
      orig: { coin: 4000, diamond: 0, onSale: true },
      sellPrice: 1680,
      note: '降价',
      retired: false,
    });
    expect(typeof m.special).toBe('boolean');
    const red = r.rows.find((x) => x.id === RED)!;
    expect(red.black).toBe(true);
    // 能不能回收看类型（勋章、宝石不能），页面按改后的银币价现算回收价（终审）
    expect(m.sellable).toBe(true);
    expect(red.sellable).toBe(false);
    // 有钻石价的回收价按 钻石价 × diamondSellCoin 封顶，页面也按它现算（经济分析 2026-10-08）
    expect(r.diamondSellCoin).toBe(2000);
    expect(r.rows.find((x) => x.id === gid('鞋带'))!.sellPrice).toBe(2000);
    // 不上架、没有价格、不在池子里的不列
    expect(r.rows.every((x) => x.onSale || x.coin > 0 || x.diamond > 0 || x.special || x.black)).toBe(true);
  });

  it('下架的道具：原版的上架按下架后算（不算“改过”），保存时不写它的 onSale', () => {
    const r = tool().t.report();
    const retired = r.rows.filter((x) => x.retired);
    expect(retired.length).toBeGreaterThan(0);
    expect(retired.every((x) => !x.onSale && !x.orig.onSale)).toBe(true);
  });

  it('保存：只写和原版不同的字段和改过的池子，带名字和备注；先构建，能过才写', () => {
    const { t, written } = tool([]);
    const base = t.report();
    const special = base.rows.filter((x) => x.special).map((x) => x.id);
    const black = base.rows.filter((x) => x.black).map((x) => x.id);
    const res = t.save({
      goods: [
        { id: MISSILE, coin: 2500, diamond: 0, onSale: true, note: '试试' },
        // 和原版一样、没有备注的不写
        (({ coin, diamond, onSale }) => ({ id: RED, coin, diamond, onSale }))(
          base.rows.find((x) => x.id === RED)!.orig,
        ),
      ],
      pools: { special: special.filter((id) => id !== MISSILE), black },
    });
    expect(res.errors).toEqual([]);
    expect(written).toHaveLength(1);
    const file = JSON.parse(written[0]!) as ShopFile & { goods: unknown[] };
    expect(file.goods).toEqual([{ id: MISSILE, name: '普通飞弹', coin: 2500, note: '试试' }]);
    // 和设计表不同的池子整份写（真实数据两个池子都去掉了下架的道具）
    expect(file.pools!.special).toEqual(special.filter((id) => id !== MISSILE));
    expect(file.pools!.black).toEqual(black);
    expect(written[0]!.endsWith('\n')).toBe(true);
    expect(res.report!.rows.find((x) => x.id === MISSILE)!.coin).toBe(2500);
  });

  it('构建不过不写文件，返回原因（黑市池里放没有钻石价的）', () => {
    const { t, written } = tool();
    const black = t
      .report()
      .rows.filter((x) => x.black)
      .map((x) => x.id);
    const special = t
      .report()
      .rows.filter((x) => x.special)
      .map((x) => x.id);
    const res = t.save({ goods: [], pools: { special, black: [...black, MISSILE] } });
    expect(res.report).toBeNull();
    expect(res.errors.join()).toMatch(`shop black pool goods ${MISSILE} has no diamond price`);
    expect(written).toEqual([]);
  });

  it('改回原版值：这条从 shop.json 里删掉（483 遗留：缺的测试）', () => {
    const base = tool([]).t.report();
    const orig = base.rows.find((x) => x.id === MISSILE)!.orig;
    // 原来改过飞弹的银币价
    const { t, written } = tool([{ id: MISSILE, coin: orig.coin + 100 } as never]);
    expect(t.report().rows.find((x) => x.id === MISSILE)!.coin).toBe(orig.coin + 100);
    const res = t.save({
      goods: [{ id: MISSILE, coin: orig.coin, diamond: orig.diamond, onSale: orig.onSale }],
      pools: {
        special: base.rows.filter((x) => x.special).map((x) => x.id),
        black: base.rows.filter((x) => x.black).map((x) => x.id),
      },
    });
    expect(res.errors).toEqual([]);
    const file = JSON.parse(written.at(-1)!) as ShopFile;
    expect(file.goods.find((x) => x.id === MISSILE)).toBeUndefined();
  });

  it('只有备注的条目（值和原版一样）保留，写名字和备注（483 遗留：缺的测试）', () => {
    const { t, written } = tool([]);
    const base = t.report();
    const orig = base.rows.find((x) => x.id === RED)!.orig;
    const res = t.save({
      goods: [{ id: RED, coin: orig.coin, diamond: orig.diamond, onSale: orig.onSale, note: '先别动' }],
      pools: {
        special: base.rows.filter((x) => x.special).map((x) => x.id),
        black: base.rows.filter((x) => x.black).map((x) => x.id),
      },
    });
    expect(res.errors).toEqual([]);
    const file = JSON.parse(written.at(-1)!) as { goods: unknown[] };
    expect(file.goods).toEqual([{ id: RED, name: '[一阶]•红晶原石', note: '先别动' }]);
  });

  it('池子改回和设计表一样：shop.json 里不写这个池子（483 遗留：缺的测试）', () => {
    // 设计表的池子换成干净的（真实设计表里还留着下架的道具，按它构建会报错）
    const design = [
      { pool: 'special', goods: real.pools!.special! },
      { pool: 'black', goods: real.pools!.black! },
    ];
    const written: string[] = [];
    const t = createShopTool({
      readSource: () => ({
        ...src,
        'designed/shop_pools': design,
        'game/shop': written.length ? (JSON.parse(written.at(-1)!) as unknown) : real,
      }),
      writeShop: (text) => written.push(text),
    });
    const res = t.save({ goods: [], pools: { special: real.pools!.special!, black: real.pools!.black! } });
    expect(res.errors).toEqual([]);
    expect(JSON.parse(written.at(-1)!).pools).toBeUndefined();
  });
});

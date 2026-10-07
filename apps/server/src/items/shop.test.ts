import { describe, expect, it } from 'vitest';
import { defaultDataDir, readSourceDir } from '@dt/config';
import { createShopTool } from './shop';
import { gid } from '../../test/items';

const src = readSourceDir(defaultDataDir());
const MISSILE = gid('普通飞弹');
const RED = gid('[一阶]•红晶原石');

function tool(shop: unknown = { goods: [] }) {
  const written: string[] = [];
  const t = createShopTool({
    readSource: () => ({ ...src, 'game/shop': written.length ? JSON.parse(written.at(-1)!) : shop }),
    writeShop: (text) => written.push(text),
  });
  return { t, written };
}

describe('商店整理工具（问题记录 483）', () => {
  it('报表：商店相关的道具，带现价、原版价、上下架、特价池和黑市池、回收价；没有构建错误', () => {
    const { t } = tool({ goods: [{ id: MISSILE, coin: 2400, note: '降价' }] });
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
    // 不上架、没有价格、不在池子里的不列
    expect(r.rows.every((x) => x.onSale || x.coin > 0 || x.diamond > 0 || x.special || x.black)).toBe(true);
  });

  it('保存：只写和原版不同的字段和改过的池子，带名字和备注；先构建，能过才写', () => {
    const { t, written } = tool();
    const base = t.report();
    const special = base.rows.filter((x) => x.special).map((x) => x.id);
    const res = t.save({
      goods: [
        { id: MISSILE, coin: 2500, diamond: 0, onSale: true, note: '试试' },
        // 和原版一样、没有备注的不写
        (({ coin, diamond, onSale }) => ({ id: RED, coin, diamond, onSale }))(
          base.rows.find((x) => x.id === RED)!.orig,
        ),
      ],
      pools: {
        special: special.filter((id) => id !== MISSILE),
        black: base.rows.filter((x) => x.black).map((x) => x.id),
      },
    });
    expect(res.errors).toEqual([]);
    expect(written).toHaveLength(1);
    const file = JSON.parse(written[0]!) as { goods: unknown[]; pools?: Record<string, number[]> };
    expect(file.goods).toEqual([{ id: MISSILE, name: '普通飞弹', coin: 2500, note: '试试' }]);
    // 黑市池没变，不写；特价池变了，整份写
    expect(file.pools).toEqual({ special: special.filter((id) => id !== MISSILE) });
    expect(written[0]!.endsWith('\n')).toBe(true);
    expect(res.report!.rows.find((x) => x.id === MISSILE)!.coin).toBe(2500);
  });

  it('构建不过不写文件，返回原因（黑市池里放没有钻石价的）', () => {
    const { t, written } = tool();
    const black = t
      .report()
      .rows.filter((x) => x.black)
      .map((x) => x.id);
    const res = t.save({ goods: [], pools: { black: [...black, MISSILE] } });
    expect(res.report).toBeNull();
    expect(res.errors.join()).toMatch(`shop black pool goods ${MISSILE} has no diamond price`);
    expect(written).toEqual([]);
  });
});

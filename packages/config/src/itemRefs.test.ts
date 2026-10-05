import { describe, expect, it } from 'vitest';
import { GOODS } from './ids';
import { CODE_GOODS, CODE_FOODS, itemRefs, tuningRefs, type ItemRef } from './itemRefs';
import { realBuild } from './testBundle';

const b = realBuild().bundle!;
const refs = itemRefs(b);
const find = (kind: ItemRef['kind'], id: number, role?: ItemRef['role']) =>
  refs.filter((r) => r.kind === kind && r.id === id && (role === undefined || r.role === role));

describe('道具、食材的引用（问题记录 367）', () => {
  it('引用到的道具和食材都存在', () => {
    const goods = new Set(b.goods.map((g) => g.id));
    const foods = new Set(b.foods.map((f) => f.id));
    const missing = refs.filter((r) => !(r.kind === 'goods' ? goods : foods).has(r.id));
    expect(missing).toEqual([]);
  });

  it('商店有售、随机奖励池按道具自己的字段算来源', () => {
    const sale = b.goods.find((g) => g.onSale && g.coin > 0)!;
    expect(find('goods', sale.id, 'gives').map((r) => r.where)).toContain('商店');
    const award = b.goods.find((g) => g.awardFlag !== null)!;
    expect(find('goods', award.id, 'gives').map((r) => r.where)).toContain('随机奖励');
  });

  it('食谱按品级记食材的消耗', () => {
    const c = b.cookbooks[0]!;
    const f = c.needFoods[10]![0]!;
    expect(find('foods', f.foodsId, 'uses').map((r) => r.where)).toContain('食谱 10 品级');
  });

  it('镇长兑换：换到的是来源，花掉的是消耗', () => {
    const e = b.goodsExchange[0]!;
    expect(find('goods', e.goodsId, 'gives').map((r) => r.where)).toContain('镇长兑换');
    expect(find('goods', e.need[0]!.goodsId, 'uses').map((r) => r.where)).toContain('镇长兑换');
  });

  it('礼包内容算来源，写明是哪个礼包', () => {
    const g = b.goods.find((x) => x.gift?.some((i) => i.type === 'goods' && i.id > 0))!;
    const item = g.gift!.find((i) => i.type === 'goods' && i.id > 0) as { id: number };
    expect(find('goods', item.id, 'gives').map((r) => r.where)).toContain(`礼包 ${g.id} ${g.name}`);
  });

  it('菜园的种子、配方产出算来源，标明菜园', () => {
    const s = b.seeds[0]!;
    expect(find('foods', s.foodsId, 'gives').map((r) => r.where)).toContain('菜园种子');
    const f = b.formulas[0]!;
    expect(find('foods', f.resFoodsId, 'gives').map((r) => r.where)).toContain('菜园配方');
    expect(find('foods', f.subFoodsId, 'uses').map((r) => r.where)).toContain('菜园配方');
  });

  it('升星奖励、区服数值里的奖励（厨塔排行、外卖）都算来源', () => {
    const star = b.starAward.find((s) => (s.award.goods ?? []).length > 0)!;
    expect(find('goods', star.award.goods![0]!.id, 'gives').map((r) => r.where)).toContain(
      `升星奖励 ${star.star} 星`,
    );
    const [, rankGift] = b.tuning.tower.rankGifts[0]!;
    expect(find('goods', rankGift, 'gives').map((r) => r.where)).toContain('厨塔排行');
    const [takeaway] = b.tuning.takeaway.awards[0]!;
    expect(find('goods', takeaway, 'gives').map((r) => r.where)).toContain('外卖');
  });

  it('搬家发的街道勋章、区服数值里的特色菜冠军奖励都算来源（终审 C1、I4）', () => {
    for (const s of b.streets)
      expect(
        find('goods', s.medalId, 'gives').map((r) => r.where),
        String(s.id),
      ).toContain('搬家（街道勋章）');
    expect(
      tuningRefs({ ...b.tuning, mysterious: { ...b.tuning.mysterious, championGoodsId: 93 } })
        .filter((r) => r.id === 93)
        .map((r) => r.where),
    ).toContain('特色菜冠军');
  });

  it('代码里写死的道具：GOODS 常量、按编号推的碎片和 N 级券、万能食材', () => {
    for (const id of Object.values(GOODS)) expect(CODE_GOODS.has(id), String(id)).toBe(true);
    for (const id of [181, 186, 241, 245]) expect(CODE_GOODS.has(id), String(id)).toBe(true);
    expect(find('goods', GOODS.starCert, 'code')).toHaveLength(1);
    expect(CODE_FOODS.has(467)).toBe(true);
    expect(find('foods', 468, 'code')).toHaveLength(1);
  });
});

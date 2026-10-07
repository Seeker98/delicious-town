import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { GOODS } from './ids';
import { itemRefs } from './itemRefs';
import { defaultDataDir, readSourceDir } from './source';
import { realBuild } from './testBundle';

const real = realBuild().bundle!;
const refs = itemRefs(real);
/** 只被自己的字段（商店有售、随机奖励）引用的道具：下架它不会碰到别处 */
const selfOnly = (id: number) =>
  refs
    .filter((r) => r.kind === 'goods' && r.id === id)
    .every((r) => r.where === '商店' || r.where === '随机奖励');
const loose = real.goods.find((g) => g.awardFlag !== null && selfOnly(g.id))!;
const unused = real.foods.find((f) => !refs.some((r) => r.kind === 'foods' && r.id === f.id));

function build(retired: unknown) {
  const src = readSourceDir(defaultDataDir());
  src['game/retired'] = retired;
  return buildBundle(src);
}

describe('下架名单（问题记录 367）', () => {
  it('真实数据的下架名单能通过构建', () => {
    expect(realBuild().errors).toEqual([]);
  });

  it('下架的道具保留定义、标上 retired，退出商店和随机奖励池', () => {
    const { bundle, errors } = build({ goods: [{ id: loose.id, note: '用不到' }], foods: [] });
    expect(errors).toEqual([]);
    const g = bundle!.goods.find((x) => x.id === loose.id)!;
    expect(g.retired).toBe(true);
    expect(g.awardFlag).toBeNull();
    expect(g.onSale).toBe(false);
    expect(bundle!.goods.find((x) => x.id !== loose.id)!.retired).toBeUndefined();
  });

  it('下架的食材保留定义、标上 retired', () => {
    expect(unused).toBeDefined();
    if (!unused) return;
    const { bundle, errors } = build({ goods: [], foods: [{ id: unused.id }] });
    expect(errors).toEqual([]);
    expect(bundle!.foods.find((f) => f.id === unused.id)!.retired).toBe(true);
  });

  it('没有的编号、重复的编号报错', () => {
    const { errors } = build({
      goods: [{ id: 999999 }, { id: loose.id }, { id: loose.id }],
      foods: [{ id: 999998 }],
    });
    expect(errors).toContain('retired references unknown goods 999999');
    expect(errors).toContain('retired references unknown foods 999998');
    expect(errors).toContain(`retired lists goods ${loose.id} twice`);
  });

  it('还被别处引用的不能下架：按引用处归并报错（镇长兑换换到的东西会自动去掉，要用掉的材料仍然拦，问题记录 501）', () => {
    const need = real.goodsExchange[0]!.need[0]!.goodsId;
    const { errors } = build({ goods: [{ id: need }, { id: GOODS.starCert }], foods: [] });
    expect(
      errors.some((x) => x.startsWith(`retired goods ${need} is still used by`) && x.includes('镇长兑换')),
    ).toBe(true);
    expect(
      errors.some(
        (x) => x.startsWith(`retired goods ${GOODS.starCert} is still used by`) && x.includes('代码'),
      ),
    ).toBe(true);
  });

  it('街道勋章不能下架：搬家时会发（终审 C1）', () => {
    const medal = real.streets[1]!.medalId;
    const { errors } = build({ goods: [{ id: medal }], foods: [] });
    expect(
      errors.some((x) => x.startsWith(`retired goods ${medal} is still used by`) && x.includes('搬家')),
    ).toBe(true);
  });

  it('厨塔长老会掉的厨具不能下架（backlog 第 ⑦ 批审查：原来没算进引用）', () => {
    const drop = real.towerFloors.find((f) => f.elder.drops.length > 0)!.elder.drops[0]!;
    const { errors } = build({ goods: [{ id: drop }], foods: [] });
    expect(
      errors.some((x) => x.startsWith(`retired goods ${drop} is still used by`) && x.includes('厨塔长老')),
    ).toBe(true);
  });

  it('食谱用到的食材不能下架：同一处只报一次，带次数', () => {
    const food = real.cookbooks[0]!.needFoods[1]![0]!.foodsId;
    const { errors } = build({ goods: [], foods: [{ id: food }] });
    const line = errors.find((x) => x.startsWith(`retired foods ${food} is still used by`))!;
    expect(line).toMatch(/食谱 1 品级 ×\d+/);
    expect(line.match(/食谱 1 品级/g)).toHaveLength(1);
  });
});

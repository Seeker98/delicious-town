import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('buildBundle（真实数据）', () => {
  it('没有错误，数量正确', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.foods).toHaveLength(313);
    expect(bundle!.goods).toHaveLength(601);
    expect(bundle!.cookbooks).toHaveLength(2363);
    expect(bundle!.streets).toHaveLength(14);
    expect(bundle!.starNeed).toHaveLength(12);
    expect(bundle!.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('合并了新设计的售价和 awardflag', () => {
    const { bundle } = buildBundle(source());
    const cb = bundle!.cookbooks.find((c) => c.id === 1)!;
    expect(cb.coin).toBeGreaterThan(0);
    expect(Object.keys(cb.needFoods)).toHaveLength(10);
    expect(bundle!.goods.find((g) => g.id === 491)!.awardFlag).toBe(6);
  });

  it('解析道具 value：效果、礼包、纯数字', () => {
    const { bundle } = buildBundle(source());
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(81)!.effects).toEqual({ atRate: 0.25, coinRate: 1, expRate: 1 });
    expect(goods.get(115)!.gift!.length).toBeGreaterThan(0);
    expect(goods.get(3)!.value).toBe(1);
  });

  it('同样的输入生成同样的版本号', () => {
    expect(buildBundle(source()).bundle!.version).toBe(buildBundle(source()).bundle!.version);
  });
});

describe('buildBundle（坏数据）', () => {
  it('食谱引用了不存在的食材', () => {
    const src = source();
    const cookbooks = structuredClone(src['dataset/cookbooks']) as Array<{
      needFoodsByLevel: Record<string, Array<{ foodsId: number }>>;
    }>;
    cookbooks[0]!.needFoodsByLevel['1']![0]!.foodsId = 999999;
    const { bundle, errors } = buildBundle({ ...src, 'dataset/cookbooks': cookbooks });
    expect(bundle).toBeNull();
    expect(errors).toContain('cookbook 1 grade 1 references unknown food 999999');
  });

  it('礼包引用了不存在的道具', () => {
    const src = source();
    const goods = structuredClone(src['dataset/goods']) as Array<{ id: number; value: string | null }>;
    goods.find((g) => g.id === 117)!.value = '[{"type":"goods","id":888888,"num":1,"rate":1}]';
    const { errors } = buildBundle({ ...src, 'dataset/goods': goods });
    expect(errors).toContain('goods 117 gift references unknown goods 888888');
  });

  it('开店赠送了不存在的道具', () => {
    const src = source();
    const defaults = { ...(src['restaurant_defaults'] as object), giftGoods: [{ id: 777777, num: 1 }] };
    const { errors } = buildBundle({ ...src, restaurant_defaults: defaults });
    expect(errors).toContain('restaurant_defaults gift references unknown goods 777777');
  });

  it('字段类型错误时指出表名和路径', () => {
    const src = source();
    const foods = structuredClone(src['dataset/foods']) as Array<Record<string, unknown>>;
    foods[0]!.coin = 'abc';
    const { errors } = buildBundle({ ...src, 'dataset/foods': foods });
    expect(errors.some((e) => e.startsWith('dataset/foods: 0.coin'))).toBe(true);
  });
});

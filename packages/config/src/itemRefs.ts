import { FOODS, FUND, GOODS, NEWBIE, SPONSOR_HATS } from './ids';
import type { Tuning } from './tuning';
import type { Award, ConfigBundle, GiftItem } from './types';

/**
 * 道具、食材在配置里被哪里引用（问题记录 367）：下架检查和道具整理工具共用。
 * gives = 玩家能从这里拿到；uses = 这里要用到它（消耗或持有生效）；code = 代码里直接用（不分得失）
 */
export type ItemKind = 'goods' | 'foods';
export type RefRole = 'gives' | 'uses' | 'code';
export interface ItemRef {
  kind: ItemKind;
  id: number;
  role: RefRole;
  /** 引用处，按表归并（例如“食谱 10 品级”“镇长兑换”），同一处的多条只是数量 */
  where: string;
}

const range = (base: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => base + from + i);

/**
 * 代码里直接用到的道具：ids.ts 的常量、按编号推算的（残卷碎片 181~186、N 级券 241~245），
 * 以及构建里点名检查的（菜园、小镇、嘻哈男孩用到的道具）
 */
export const CODE_GOODS: ReadonlySet<number> = new Set([
  ...Object.values(GOODS),
  ...range(GOODS.fragmentBase, 1, 6),
  ...range(GOODS.levelTicketBase, 1, 5),
  ...Object.values(SPONSOR_HATS),
  ...Object.values(FUND),
  NEWBIE.pack,
  ...range(NEWBIE.foodVoucherBase, 1, 5),
  // 菜园（build.ts yard）、小镇（build.ts town）
  464,
  465,
  469,
  470,
  339,
  19,
  241,
  242,
  243,
  244,
  245,
  256,
  315,
  491,
]);

/** 代码里直接用到的食材：万能食材 467~471 */
export const CODE_FOODS: ReadonlySet<number> = new Set(range(FOODS.masterBase, 1, 5));

function collector() {
  const out: ItemRef[] = [];
  const add = (kind: ItemKind, id: number, role: RefRole, where: string) =>
    out.push({ kind, id, role, where });
  const award = (where: string, a: Pick<Award, 'goods' | 'foods'>) => {
    for (const g of a.goods ?? []) add('goods', g.id, 'gives', where);
    for (const f of a.foods ?? []) add('foods', f.id, 'gives', where);
  };
  return { out, add, award };
}

/** 区服数值里引用的道具、食材：后台按区服改数值时也要检查（问题记录 367） */
export function tuningRefs(t: Tuning): ItemRef[] {
  const { out, add, award } = collector();
  add('goods', t.shop.specialFallbackGoods, 'gives', '商店特价');
  for (const [, id] of t.tower.rankGifts) add('goods', id, 'gives', '厨塔排行');
  for (const [id] of t.takeaway.awards) add('goods', id, 'gives', '外卖');
  for (const id of [t.takeaway.customer.success, t.takeaway.customer.fail]) add('goods', id, 'gives', '外卖');
  for (const id of t.hiphop.weeklyCards) add('goods', id, 'gives', '嘻哈男孩');
  for (const [card, wage] of t.hiphop.wages) {
    add('goods', card, 'uses', '嘻哈男孩');
    add('goods', wage, 'gives', '嘻哈男孩');
  }
  for (const [id] of t.forum.featureReward.goods) add('goods', id, 'gives', '论坛精华');
  for (const r of [t.invite.newbie, t.invite.rewards.lv10, t.invite.rewards.lv30]) award('邀请', r);
  for (const k of [t.kuji, t.kuji.deluxe]) {
    for (const tier of k.tiers) award('一番赏', tier.award);
    award('一番赏', k.last.award);
  }
  for (const tier of t.fund.tiers) add('goods', tier.medal, 'gives', '小镇发展基金');
  for (const [id] of t.temple.missileAttack) add('goods', id, 'uses', '神殿飞弹');
  return out;
}

export function itemRefs(b: Omit<ConfigBundle, 'version' | 'i18n'>): ItemRef[] {
  const { out, add, award } = collector();
  const gift = (where: string, items: readonly GiftItem[]) => {
    for (const i of items) {
      if (i.type === 'goods' && i.id > 0) add('goods', i.id, 'gives', where);
      if (i.type === 'foods' && i.id !== undefined && i.id > 0) add('foods', i.id, 'gives', where);
    }
  };

  // ---------- 道具自己的字段 ----------
  for (const g of b.goods) {
    if (g.onSale && g.coin > 0) add('goods', g.id, 'gives', '商店');
    if (g.awardFlag !== null) add('goods', g.id, 'gives', '随机奖励');
    if (g.gift) gift(`礼包 ${g.id} ${g.name}`, g.gift);
    if (g.gem?.nextId) add('goods', g.gem.nextId, 'gives', '宝石升阶');
  }
  for (const id of b.shopPools.special) add('goods', id, 'gives', '商店特价');
  for (const id of b.shopPools.black) add('goods', id, 'gives', '黑市');

  // ---------- 食谱、特色菜、菜园 ----------
  for (const c of b.cookbooks)
    for (const [grade, list] of Object.entries(c.needFoods))
      for (const f of list) add('foods', f.foodsId, 'uses', `食谱 ${grade} 品级`);
  for (const m of b.mysteriousCookbooks) for (const id of m.foods) add('foods', id, 'uses', '特色菜');
  for (const s of b.seeds) add('foods', s.foodsId, 'gives', '菜园种子');
  for (const f of b.formulas) {
    add('foods', f.resFoodsId, 'gives', '菜园配方');
    for (const id of [f.mainFoodsId, f.subFoodsId, f.addFoodsId]) add('foods', id, 'uses', '菜园配方');
  }

  // ---------- 奖励 ----------
  for (const s of b.starAward) award(`升星奖励 ${s.star} 星`, s.award);
  for (const c of b.chapters) award('任务', c.award);
  for (const q of b.quests) award('任务', q.award);
  for (const g of b.weeklyGroups) {
    award('每周任务', g.fullAward);
    for (const q of g.quests) award('每周任务', q.award);
  }
  for (const r of b.activationRewards) award('活跃奖励', r.award);
  for (const a of b.guessAwards) award('菜场竞猜', a.award);
  for (const a of b.guessBonus) award('菜场竞猜', a.award);
  for (const c of b.newbieCodes) award('新手兑换码', c.items);
  for (const g of b.restaurantDefaults.giftGoods) add('goods', g.id, 'gives', '开店礼物');
  for (const f of b.restaurantDefaults.giftFoods) add('foods', f.id, 'gives', '开店礼物');
  for (const a of b.slotAwards)
    if (a.itemId !== null) add(a.kind === 'foods' ? 'foods' : 'goods', a.itemId, 'gives', '老虎机');
  for (const r of b.renownShop) add('goods', r.goodsId, 'gives', '声望商店');
  for (const x of b.bless) if (x.goodsId !== null) add('goods', x.goodsId, 'gives', '星愿');
  for (const t of b.kujiThemes)
    for (const id of Object.values(t.figures)) add('goods', id, 'gives', '一番赏');

  // ---------- 兑换、消耗 ----------
  for (const e of b.goodsExchange) {
    add('goods', e.goodsId, 'gives', '镇长兑换');
    for (const n of e.need) add('goods', n.goodsId, 'uses', '镇长兑换');
  }
  for (const o of b.oilNeed) for (const g of o.needGoods) add('goods', g.id, 'uses', '油壶升级');

  // ---------- 区服数值（默认值） ----------
  out.push(...tuningRefs(b.tuning));

  // ---------- 代码里直接用到的 ----------
  for (const id of CODE_GOODS) add('goods', id, 'code', '代码');
  for (const id of CODE_FOODS) add('foods', id, 'code', '代码');
  return out;
}

/**
 * 下架的道具、食材还被引用时的错误（问题记录 367）：每个编号一行，同一引用处归并成次数。
 * 下架的道具已经在构建时退出商店和随机奖励池，这两处不算
 */
export function retiredErrors(
  refs: readonly ItemRef[],
  retired: { goods: ReadonlySet<number>; foods: ReadonlySet<number> },
): string[] {
  const hits = new Map<string, Map<string, number>>();
  for (const r of refs) {
    if (!retired[r.kind].has(r.id)) continue;
    const key = `${r.kind} ${r.id}`;
    let m = hits.get(key);
    if (!m) hits.set(key, (m = new Map()));
    m.set(r.where, (m.get(r.where) ?? 0) + 1);
  }
  return [...hits].map(
    ([key, m]) =>
      `retired ${key} is still used by ${[...m].map(([where, n]) => `${where} ×${n}`).join(', ')}`,
  );
}

/** 配置包里已下架的编号 */
export function retiredOf(b: Pick<ConfigBundle, 'goods' | 'foods'>): {
  goods: Set<number>;
  foods: Set<number>;
} {
  return {
    goods: new Set(b.goods.filter((g) => g.retired).map((g) => g.id)),
    foods: new Set(b.foods.filter((f) => f.retired).map((f) => f.id)),
  };
}

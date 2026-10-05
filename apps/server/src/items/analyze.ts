import { GOODS_TYPE, itemRefs, type GameConfig, type ItemKind } from '@dt/config';
import { awardFoodsPool, prizeFoodPools } from '../modules/award/random';
import { handleTargetLevel } from '../modules/cupboard/rules';
import { blessFoodIds, levelFoodIds, mysteryFoodIds } from '../modules/town/rules';

/**
 * 道具整理工具的分析（问题记录 367）：每个道具、每种食材从哪来、拿来干什么。
 * 配置里的引用来自 itemRefs；食材按等级的来源照游戏里的规则函数和默认区服数值算，规则改了这里跟着变
 */

/** 一处来源或用途；n 是同一处引用的条数；retired = 这处本身是已下架的道具（例如下架礼包里的东西） */
export interface Tag {
  where: string;
  n: number;
  retired?: true;
}

export interface ItemRow {
  kind: ItemKind;
  id: number;
  name: string;
  /** 道具类型名，或“N 级食材”“N 级稀有食材” */
  category: string;
  level: number;
  desc: string;
  gives: Tag[];
  uses: Tag[];
  /** 代码里直接用到 */
  code: boolean;
  /** 除了已下架的来源，没有任何来源，代码里也没用到 */
  noSource: boolean;
  /** 没有任何用途，代码里也没用到 */
  noUse: boolean;
  /** 有条件才有来源或用途的说明 */
  notes: string[];
  retired: boolean;
}

export interface GradeRow {
  grade: number;
  name: string;
  /** 默认区服数值的食谱品级上限以内 */
  open: boolean;
  /** 食材等级 → 这一品级全部食谱合计要几种次 */
  foodLevels: Record<number, number>;
}

export interface ItemReport {
  maxGrade: number;
  grades: GradeRow[];
  rows: ItemRow[];
}

const GOODS_TYPE_NAME: Record<number, string> = {
  [GOODS_TYPE.consumable]: '消耗品',
  [GOODS_TYPE.item]: '道具',
  [GOODS_TYPE.gift]: '礼包',
  [GOODS_TYPE.device]: '设施',
  [GOODS_TYPE.equip]: '厨具',
  [GOODS_TYPE.gem]: '宝石',
  [GOODS_TYPE.remnant]: '残卷',
  [GOODS_TYPE.honor]: '荣誉',
  [GOODS_TYPE.souvenir]: '纪念品',
};

/** 道具的使用效果怎么称呼 */
const USE_NAME: Record<string, string> = {
  gift: '打开礼包',
  randomFood: '换随机食材',
  mysteryFood: '换随机食材',
  bundle: '合成道具',
  currency: '换货币',
  strength: '加体力',
  addTable: '加餐桌',
  cupboardNum: '扩橱柜',
  storeNum: '扩仓库',
  foodsMax: '加食材上限',
  lockSlots: '加锁定格',
  resetAttr: '洗点',
  towerTicket: '厨塔挑战',
};

const YARD = new Set(['菜园种子', '菜园配方']);

export function analyzeItems(
  config: GameConfig,
  retired: { goods: ReadonlySet<number>; foods: ReadonlySet<number> },
): ItemReport {
  const b = config.bundle;
  const t = b.tuning;
  const maxGrade = t.rest.cookbookMaxGrade;
  const tags = new Map<string, Map<string, Tag>>();
  const key = (kind: ItemKind, id: number, side: 'gives' | 'uses') => `${kind}:${id}:${side}`;
  const add = (kind: ItemKind, id: number, side: 'gives' | 'uses', where: string, viaGoods?: number) => {
    let m = tags.get(key(kind, id, side));
    if (!m) tags.set(key(kind, id, side), (m = new Map()));
    const x = m.get(where);
    if (x) x.n++;
    else
      m.set(where, {
        where,
        n: 1,
        ...(viaGoods !== undefined && retired.goods.has(viaGoods) ? { retired: true } : {}),
      });
  };
  const code = new Set<string>();

  // ---------- 配置里的引用 ----------
  const giftOf = /^礼包 (\d+) /;
  for (const r of itemRefs(b)) {
    if (r.role === 'code') code.add(`${r.kind}:${r.id}`);
    else add(r.kind, r.id, r.role, r.where, Number(giftOf.exec(r.where)?.[1] ?? NaN));
  }

  // 纪念品（148-2）只在后台配的兑换活动里发，存在数据库里，配置里看不到（终审 I2）
  for (const g of b.goods)
    if (g.type === GOODS_TYPE.souvenir && !tags.get(key('goods', g.id, 'gives'))?.has('一番赏'))
      add('goods', g.id, 'gives', '活动（后台配置）');

  // ---------- 道具的用途 ----------
  for (const g of b.goods) {
    if (g.use) add('goods', g.id, 'uses', USE_NAME[g.use.kind] ?? g.use.kind);
    if (g.equip) add('goods', g.id, 'uses', '厨具');
    if (g.gem) add('goods', g.id, 'uses', '宝石');
    if (config.maps.has(g.id)) add('goods', g.id, 'uses', '神殿探险图');
    if (config.missiles.has(g.id)) add('goods', g.id, 'uses', '神殿飞弹');
    if (config.fertilizers.has(g.id)) add('goods', g.id, 'uses', '菜园肥料');
    if (config.teacherCerts.has(g.id)) add('goods', g.id, 'uses', '特色菜教学');
    if (config.appraiseTools.has(g.id)) add('goods', g.id, 'uses', '鉴定');
    else if (!g.use && !g.equip && !g.gem && Object.keys(g.effects).length > 0)
      add('goods', g.id, 'uses', g.type === GOODS_TYPE.device ? '摆放加成' : '持有加成');
  }

  // ---------- 食材按等级的来源（游戏里的规则，默认区服数值） ----------
  const live = b.foods.filter((f) => !f.retired);
  const levelOf = (lv: number) => live.filter((f) => f.level === lv);
  const byLevel = (levels: Iterable<number>, where: string, viaGoods?: number) => {
    for (const lv of levels) for (const f of levelOf(lv)) add('foods', f.id, 'gives', where, viaGoods);
  };
  const weighted = (w: ReadonlyArray<readonly [number, number]>) =>
    w.filter(([, x]) => x > 0).map(([l]) => l);
  byLevel(weighted(t.market.dailyLevelWeights), '菜场日常');
  byLevel(weighted(t.market.specialLevelWeights), '菜场特价');
  byLevel([t.market.premiumLevel], '菜场高级货');
  for (const id of awardFoodsPool(b.foods, Number.MAX_SAFE_INTEGER)) add('foods', id, 'gives', '随机奖励');
  // 酒吧小游戏（问题记录 352）：各档次等级范围里的普通、稀有食材
  const barFoods = new Set<number>();
  for (const tier of t.bar.prize.foodTiers) {
    const { normal, rare } = prizeFoodPools(b.foods, tier.levels);
    for (const id of [...normal, ...rare.map((x) => x.id)]) barFoods.add(id);
  }
  for (const id of barFoods) add('foods', id, 'gives', '酒吧小游戏');
  const levels = [...new Set(b.foods.map((f) => f.level))];
  for (const lv of levels) {
    if (handleTargetLevel('compose', lv - 1) === lv) byLevel([lv], '合成');
    if (handleTargetLevel('decompose', lv + 1) === lv) byLevel([lv], '分解');
  }
  for (const m of config.maps.values()) byLevel(range(m.level[0], m.level[1]), '神殿探险');
  byLevel([1, 2, 3, 7], '神殿守护兽');
  byLevel(
    t.town.npc.bigEaterLevelWeights.flatMap((w, i) => (w > 0 ? [i + 1] : [])),
    '大胃王',
  );
  for (const x of b.bless)
    if ((x.type === 0 || x.type === 5) && x.levels)
      for (const id of blessFoodIds(config, x.levels)) add('foods', id, 'gives', '星愿');
  for (let lv = 1; lv <= 5; lv++)
    for (const id of levelFoodIds(config, t.town, lv)) add('foods', id, 'gives', `${lv} 级食材兑换券`);
  for (const id of mysteryFoodIds(config, t.town)) add('foods', id, 'gives', '神秘食材兑换券');
  for (const lv of [2, 3])
    for (const f of config.rareFoodPools.get(lv)?.items ?? []) add('foods', f.id, 'gives', '万能食材兑换');
  for (const g of b.goods) {
    if (g.use?.kind === 'randomFood' || g.use?.kind === 'mysteryFood')
      byLevel([g.use.level], `道具 ${g.id} ${g.name}`, g.id);
    for (const i of g.gift ?? []) {
      if (i.type !== 'foods' || (i.id !== undefined && i.id > 0)) continue;
      byLevel(i.flag === 'master' ? [9] : [Number(i.flag)], `礼包 ${g.id} ${g.name}`, g.id);
    }
  }

  // ---------- 食谱品级 ----------
  const gradeNeed = new Map<number, Record<number, number>>();
  for (const c of b.cookbooks)
    for (const [grade, list] of Object.entries(c.needFoods)) {
      let m = gradeNeed.get(Number(grade));
      if (!m) gradeNeed.set(Number(grade), (m = {}));
      for (const x of list) {
        const lv = config.foods.get(x.foodsId)?.level ?? 0;
        m[lv] = (m[lv] ?? 0) + 1;
      }
    }
  const grades: GradeRow[] = b.cookbookGrades.map((g) => ({
    grade: g.grade,
    name: g.name,
    open: g.grade <= maxGrade,
    foodLevels: gradeNeed.get(g.grade) ?? {},
  }));

  // ---------- 汇总 ----------
  const list = (kind: ItemKind, id: number, side: 'gives' | 'uses') =>
    [...(tags.get(key(kind, id, side))?.values() ?? [])].sort((a, b) => a.where.localeCompare(b.where, 'zh'));
  const row = (
    kind: ItemKind,
    id: number,
    base: Omit<
      ItemRow,
      'kind' | 'id' | 'gives' | 'uses' | 'code' | 'noSource' | 'noUse' | 'notes' | 'retired'
    >,
  ): ItemRow => {
    const gives = list(kind, id, 'gives');
    const uses = list(kind, id, 'uses');
    const isCode = code.has(`${kind}:${id}`);
    const real = gives.filter((x) => !x.retired);
    const notes: string[] = [];
    if (real.length > 0 && real.every((x) => YARD.has(x.where))) notes.push('只能靠菜园获得');
    const grade = /^食谱 (\d+) 品级$/;
    // 只看食谱：别的用途（例如菜园配方当材料）另算
    const cook = uses.flatMap((x) => {
      const m = grade.exec(x.where);
      return m ? [Number(m[1])] : [];
    });
    if (cook.length > 0 && cook.every((g) => g > maxGrade))
      notes.push(`食谱只在品级上限调到 ${Math.min(...cook)} 时用到`);
    return {
      kind,
      id,
      ...base,
      gives,
      uses,
      code: isCode,
      noSource: real.length === 0 && !isCode,
      noUse: uses.length === 0 && !isCode,
      notes,
      retired: retired[kind].has(id),
    };
  };
  const rows: ItemRow[] = [
    ...b.goods.map((g) =>
      row('goods', g.id, {
        name: g.name,
        category: GOODS_TYPE_NAME[g.type] ?? `类型 ${g.type}`,
        level: g.level,
        desc: g.desc,
      }),
    ),
    ...b.foods.map((f) =>
      row('foods', f.id, {
        name: f.name,
        category: `${f.level} 级${f.odds < 100 ? '稀有' : ''}食材`,
        level: f.level,
        desc: '',
      }),
    ),
  ];
  return { maxGrade, grades, rows };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

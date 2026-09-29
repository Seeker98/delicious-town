import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as raw from './raw';
import type { SourceData } from './source';
import type { ActivationReward, Award, ConfigBundle, Cookbook, Food, GiftItem, Goods, IdNum } from './types';

export interface BuildResult {
  bundle: ConfigBundle | null;
  errors: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numericEntries(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isPlainObject(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number') out[k] = x;
  return out;
}

function splitTaste(s: string | null | undefined): number[] {
  return (s ?? '')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

export function buildBundle(src: SourceData): BuildResult {
  const errors: string[] = [];

  function parse<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | null {
    const r = schema.safeParse(src[key]);
    if (r.success) return r.data;
    for (const issue of r.error.issues.slice(0, 20))
      errors.push(`${key}: ${issue.path.join('.')}: ${issue.message}`);
    return null;
  }

  const foodsRaw = parse('dataset/foods', z.array(raw.rawFood));
  const goodsRaw = parse('dataset/goods', z.array(raw.rawGoods));
  const cookbooksRaw = parse('dataset/cookbooks', z.array(raw.rawCookbook));
  const streetsRaw = parse('dataset/streets', z.array(raw.rawStreet));
  const mysteriousRaw = parse('dataset/mysterious_cookbooks', z.array(raw.rawMysterious));
  const devicesRaw = parse('dataset/devices', z.array(raw.rawDevice));
  const actTasksRaw = parse('dataset/activation_tasks', z.array(raw.rawActivationTask));
  const actRewardsRaw = parse('dataset/activation_rewards', z.array(raw.rawActivationReward));
  const pricesRaw = parse('designed/cookbooks_price', z.array(raw.rawCookbookPrice));
  const awardFlagsRaw = parse('designed/goods_awardflag', z.array(raw.rawAwardFlag));
  const weatherRaw = parse('designed/weather', z.array(raw.rawWeather));
  const starNeedRaw = parse('designed/star_need', z.array(raw.rawStarNeed));
  const starAwardRaw = parse('designed/star_award', z.array(raw.rawStarAward));
  const oilRaw = parse('designed/oil_need', z.array(raw.rawOilNeed));
  const tasksRaw = parse('designed/tasks', z.array(raw.rawTask));
  const seedsRaw = parse('designed/seeds', z.array(raw.rawSeed));
  const seedExRaw = parse('designed/seed_exchange', z.array(raw.rawSeedExchange));
  const formulasRaw = parse('designed/foods_formula', z.array(raw.rawFormula));
  const goodsExRaw = parse('designed/goods_exchange', z.array(raw.rawGoodsExchange));
  const renownRaw = parse('designed/renown_shop', z.array(raw.rawRenownShop));
  const blessRaw = parse('designed/bless', z.array(raw.rawBless));
  const defaults = parse('restaurant_defaults', raw.restaurantDefaultsSchema);

  if (
    errors.length > 0 ||
    !foodsRaw ||
    !goodsRaw ||
    !cookbooksRaw ||
    !streetsRaw ||
    !mysteriousRaw ||
    !devicesRaw ||
    !actTasksRaw ||
    !actRewardsRaw ||
    !pricesRaw ||
    !awardFlagsRaw ||
    !weatherRaw ||
    !starNeedRaw ||
    !starAwardRaw ||
    !oilRaw ||
    !tasksRaw ||
    !seedsRaw ||
    !seedExRaw ||
    !formulasRaw ||
    !goodsExRaw ||
    !renownRaw ||
    !blessRaw ||
    !defaults
  ) {
    return { bundle: null, errors };
  }

  const unique = (table: string, ids: number[]) => {
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${table}: duplicate id ${id}`);
      seen.add(id);
    }
  };

  // ---------- 食材 ----------
  const foods: Food[] = foodsRaw.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    coin: f.coin,
    odds: f.odds,
    type: f.type ?? null,
    maxNum: f.maxNum ?? 999,
  }));
  unique(
    'foods',
    foods.map((f) => f.id),
  );
  const foodIds = new Set(foods.map((f) => f.id));

  // ---------- 道具 ----------
  const awardFlags = new Map(awardFlagsRaw.map((a) => [a.id, a.awardflag]));
  const goods: Goods[] = goodsRaw.map((g) => {
    let value: unknown = null;
    if (g.value !== null && g.value !== undefined && g.value.trim() !== '') {
      try {
        value = JSON.parse(g.value);
      } catch {
        errors.push(`goods ${g.id} value is not valid JSON`);
      }
    }
    let gift: GiftItem[] | null = null;
    if (Array.isArray(value)) {
      const r = z.array(raw.giftItemSchema).safeParse(value);
      if (r.success) gift = r.data;
      else errors.push(`goods ${g.id} gift is malformed: ${r.error.issues[0]?.message ?? ''}`);
    }
    return {
      id: g.id,
      name: g.name,
      type: g.type,
      deviceType: g.devicetype ?? null,
      invalidHours: g.invalidhour ?? null,
      maxNum: g.maxNum ?? 9999,
      stackable: g.subflag === 1,
      level: g.level ?? 1,
      coin: g.coin ?? 0,
      diamond: g.diamond ?? 0,
      onSale: g.saleflag === 1,
      awardFlag: awardFlags.get(g.id) ?? g.awardflag ?? null,
      desc: g.desc ?? '',
      value,
      effects: numericEntries(value),
      gift,
    };
  });
  unique(
    'goods',
    goods.map((g) => g.id),
  );
  const goodsIds = new Set(goods.map((g) => g.id));
  for (const id of awardFlags.keys())
    if (!goodsIds.has(id)) errors.push(`goods_awardflag references unknown goods ${id}`);
  for (const g of goods) {
    for (const item of g.gift ?? []) {
      if (item.type === 'goods' && item.id > 0 && !goodsIds.has(item.id)) {
        errors.push(`goods ${g.id} gift references unknown goods ${item.id}`);
      }
    }
  }

  // ---------- 街道 ----------
  const streets = streetsRaw.map((s) => ({
    id: s.id,
    name: s.name,
    cookName: s.cookname ?? '',
    desc: s.desc ?? '',
  }));
  unique(
    'streets',
    streets.map((s) => s.id),
  );
  const streetIds = new Set(streets.map((s) => s.id));

  // ---------- 食谱 ----------
  const prices = new Map(pricesRaw.map((p) => [p.id, p]));
  const cookbooks: Cookbook[] = cookbooksRaw.map((c) => {
    const price = prices.get(c.id);
    if (!price) errors.push(`cookbook ${c.id} has no price`);
    if (!streetIds.has(c.streetId)) errors.push(`cookbook ${c.id} references unknown street ${c.streetId}`);
    const needFoods: Cookbook['needFoods'] = {};
    for (let grade = 1; grade <= 10; grade++) {
      const list = c.needFoodsByLevel[String(grade)];
      if (!list || list.length === 0) {
        errors.push(`cookbook ${c.id} is missing grade ${grade}`);
        continue;
      }
      for (const f of list) {
        if (!foodIds.has(f.foodsId))
          errors.push(`cookbook ${c.id} grade ${grade} references unknown food ${f.foodsId}`);
      }
      needFoods[grade] = list.map((f) => ({ foodsId: f.foodsId, num: f.num }));
    }
    return {
      id: c.id,
      name: c.name,
      streetId: c.streetId,
      taste: c.taste ?? [],
      coin: price?.coin ?? 0,
      level: price?.level ?? 1,
      desc: price?.desc ?? '',
      needFoods,
    };
  });
  unique(
    'cookbooks',
    cookbooks.map((c) => c.id),
  );

  // ---------- 特色菜 ----------
  const mysteriousCookbooks = mysteriousRaw.map((m) => {
    for (const f of m.foods) {
      if (!foodIds.has(f.foodsId)) errors.push(`mysterious ${m.id} references unknown food ${f.foodsId}`);
    }
    return {
      id: m.id,
      name: m.name,
      level: m.level,
      road: m.road,
      nutritive: m.nutritive ?? 0,
      coin: m.coin ?? 0,
      odds: m.odds ?? 0,
      taste: splitTaste(m.taste),
      foods: m.foods,
    };
  });
  unique(
    'mysterious_cookbooks',
    mysteriousCookbooks.map((m) => m.id),
  );

  // ---------- 奖励引用检查 ----------
  const checkAward = (where: string, a: Award) => {
    for (const g of a.goods ?? [])
      if (!goodsIds.has(g.id)) errors.push(`${where} references unknown goods ${g.id}`);
    for (const f of a.foods ?? [])
      if (!foodIds.has(f.id)) errors.push(`${where} references unknown food ${f.id}`);
  };
  const checkGoodsList = (where: string, list: IdNum[]) => {
    for (const g of list) if (!goodsIds.has(g.id)) errors.push(`${where} references unknown goods ${g.id}`);
  };
  const contiguous = (table: string, levels: number[]) => {
    const sorted = [...levels].sort((a, b) => a - b);
    if (sorted.some((lv, i) => lv !== i + 1)) errors.push(`${table} must be contiguous from 1`);
  };

  // ---------- 天气、设施、星级、油壶、任务、活跃 ----------
  const weather = weatherRaw.map((w) => ({
    id: w.id,
    name: w.name,
    daytime: w.daytime,
    type: w.type,
    special: w.specialflag === 1,
    probability: w.probability ?? null,
    effects: numericEntries(w.value),
    note: w.note ?? '',
  }));
  unique(
    'weather',
    weather.map((w) => w.id),
  );

  const devices = devicesRaw.map((d) => ({
    id: d.deviceid,
    name: d.devicename,
    deviceType: d.devicetype,
    needStar: d.needreststar,
    note: d.devicenote ?? '',
  }));

  const starNeed = starNeedRaw.map((s) => ({
    star: s.starlevel,
    name: s.name,
    needLevel: s.needRestlevel,
    needCookbooks: s.needCookbooksnum,
    cookbooksKind: s.cookbooksKind,
    needCerts: s.needCertnum,
    needPurpleShells: s.needPurpleshell,
  }));
  contiguous(
    'star_need',
    starNeed.map((s) => s.star),
  );
  const starAward = starAwardRaw.map((s) => ({ star: s.starlevel, award: s.award }));
  for (const s of starAward) checkAward(`star_award ${s.star}`, s.award);

  const oilNeed = oilRaw.map((o) => ({
    level: o.oillevel,
    needLevel: o.needRestlevel,
    needStar: o.needStarlevel,
    needCoin: o.needCoin,
    needGoods: o.needGoods,
    needPurpleShells: o.needPurpleshell,
    addOil: o.addOilnum,
    oilMax: o.oilnummax,
  }));
  contiguous(
    'oil_need',
    oilNeed.map((o) => o.level),
  );
  for (const o of oilNeed) checkGoodsList(`oil_need ${o.level}`, o.needGoods);

  const tasks = tasksRaw.map((t) => ({
    id: t.id,
    main: t.mainflag === 1,
    step: t.step,
    name: t.taskname,
    cond: t.cond,
    award: t.award,
    href: t.href,
  }));
  unique(
    'tasks',
    tasks.map((t) => t.id),
  );
  for (const t of tasks) checkAward(`task ${t.id}`, t.award);

  const activationTasks = actTasksRaw.map((a) => ({
    id: a.id,
    name: a.activationname,
    points: a.activationvalue,
    limitTimes: a.limittimes,
    needStar: a.starlevel ?? 0,
  }));
  const activationRewards: ActivationReward[] = [];
  for (const r of actRewardsRaw) {
    try {
      activationRewards.push({ points: r.dictval, award: raw.awardSchema.parse(JSON.parse(r.note)) });
    } catch {
      errors.push(`activation_reward ${r.dictval} note is not a valid award`);
    }
  }

  // ---------- 以后子项目用到的表 ----------
  const seedIds = new Set(seedsRaw.map((s) => s.id));
  for (const s of seedsRaw)
    if (!foodIds.has(s.foodsId)) errors.push(`seed ${s.id} references unknown food ${s.foodsId}`);
  for (const e of seedExRaw)
    if (!seedIds.has(e.seedId)) errors.push(`seed_exchange references unknown seed ${e.seedId}`);
  for (const f of formulasRaw) {
    for (const id of [f.mainFoodsId, f.subFoodsId, f.addFoodsId, f.resFoodsId]) {
      if (!foodIds.has(id)) errors.push(`formula ${f.id} references unknown food ${id}`);
    }
  }
  for (const e of goodsExRaw) {
    if (!goodsIds.has(e.goodsId)) errors.push(`goods_exchange ${e.id} references unknown goods ${e.goodsId}`);
    for (const n of e.needGoods) {
      if (n.type === 'goods' && !goodsIds.has(n.id))
        errors.push(`goods_exchange ${e.id} references unknown goods ${n.id}`);
    }
  }
  for (const r of renownRaw)
    if (!goodsIds.has(r.goodsId)) errors.push(`renown_shop references unknown goods ${r.goodsId}`);
  for (const b of blessRaw) {
    const gid = b.value?.goodsId;
    if (gid !== undefined && !goodsIds.has(gid)) errors.push(`bless ${b.id} references unknown goods ${gid}`);
  }

  // ---------- 开店默认值 ----------
  for (const g of defaults.giftGoods) {
    if (!goodsIds.has(g.id)) errors.push(`restaurant_defaults gift references unknown goods ${g.id}`);
  }
  if (!streetIds.has(defaults.streetId))
    errors.push(`restaurant_defaults references unknown street ${defaults.streetId}`);

  if (errors.length > 0) return { bundle: null, errors };

  const body: Omit<ConfigBundle, 'version'> = {
    foods,
    goods,
    cookbooks,
    streets,
    mysteriousCookbooks,
    weather,
    devices,
    starNeed,
    starAward,
    oilNeed,
    tasks,
    activationTasks,
    activationRewards,
    restaurantDefaults: defaults,
    extra: {
      seeds: seedsRaw,
      seedExchange: seedExRaw,
      formulas: formulasRaw,
      goodsExchange: goodsExRaw,
      renownShop: renownRaw,
      bless: blessRaw,
    },
  };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { bundle: { version, ...body }, errors: [] };
}

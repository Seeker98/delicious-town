import { buildI18n } from './i18n';
import { isQuestStateKey } from './quests';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as raw from './raw';
import type { SourceData } from './source';
import { SUIT_EFFECT_KEYS, buildSuits, parseEquipDef, parseGemDef } from './equip';
import { applyEquipLore } from './lore';
import { parseAppraiseDef, parseTeacherCert } from './mysterious';
import { parseMapDef, parseMissileDef } from './temple';
import { deriveGoodsUse } from './goodsUse';
import { kujiErrors } from './kuji';
import { fundErrors } from './fund';
import { foodWeights } from './foodSupply';
import { FUND_MEDALS, GOODS_TYPE, NON_SUIT_IDS } from './ids';
import { tuningSchema } from './tuning';
import { checkNewbieCodes } from './newbieCodes';
import { checkSettingDocs } from './settingDocs';
import { applyStressTables } from './stressTable';
import { calibrateWatchman } from './towerFloor';
import type {
  ActivationReward,
  Chapter,
  Quest,
  QuestLine,
  WeeklyGroup,
  Award,
  Bless,
  CollectionTier,
  ConfigBundle,
  Cookbook,
  Food,
  GiftItem,
  Goods,
  GoodsExchange,
  IdNum,
  RenownShopItem,
  SlotAward,
  TowerFloor,
  KujiTheme,
} from './types';

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

/** 事件键归属的功能：按前缀匹配，取最长的前缀；找不到返回 null */
export function featureOfKey(key: string, features: Record<string, string>): string | null {
  let best: string | null = null;
  for (const prefix of Object.keys(features)) {
    if (key.startsWith(prefix) && (best === null || prefix.length > best.length)) best = prefix;
  }
  return best === null ? null : features[best]!;
}

function tiersFrom(list: Array<{ dictname: string; dictval: number; note: string }>): CollectionTier[] {
  return list
    .map((t) => {
      let note: unknown = {};
      try {
        note = JSON.parse(t.note);
      } catch {
        note = {};
      }
      return { count: t.dictval, name: t.dictname, effects: numericEntries(note) };
    })
    .sort((a, b) => a.count - b.count);
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

  /** 原始数据 + 新设计的同类数据（新街道，问题记录 284）；任一份解析失败就是 null */
  const both = <T>(a: T[] | null, b: T[] | null): T[] | null => (a && b ? [...a, ...b] : null);
  const foodsRaw = both(
    parse('dataset/foods', z.array(raw.rawFood)),
    parse('designed/foods_new', z.array(raw.rawFood)),
  );
  const goodsRaw = both(
    parse('dataset/goods', z.array(raw.rawGoods)),
    parse('designed/street_medals_new', z.array(raw.rawGoods)),
  );
  const cookbooksRaw = both(
    parse('dataset/cookbooks', z.array(raw.rawCookbook)),
    parse('designed/cookbooks_new', z.array(raw.rawCookbook)),
  );
  const streetsRaw = both(
    parse('dataset/streets', z.array(raw.rawStreet)),
    parse('designed/streets_new', z.array(raw.rawStreet)),
  );
  const medalMapRaw = parse('designed/street_medal_map', z.array(raw.rawStreetMedal));
  const mysteriousRaw = parse('dataset/mysterious_cookbooks', z.array(raw.rawMysterious));
  const devicesRaw = parse('dataset/devices', z.array(raw.rawDevice));
  const actTasksRaw = parse('dataset/activation_tasks', z.array(raw.rawActivationTask));
  const actRewardsRaw = parse('dataset/activation_rewards', z.array(raw.rawActivationReward));
  const actExtra = parse('designed/activation_extra', raw.rawActivationExtra);
  const pricesRaw = both(
    parse('designed/cookbooks_price', z.array(raw.rawCookbookPrice)),
    parse('designed/cookbooks_price_new', z.array(raw.rawCookbookPrice)),
  );
  const awardFlagsRaw = parse('designed/goods_awardflag', z.array(raw.rawAwardFlag));
  const weatherRaw = parse('designed/weather', z.array(raw.rawWeather));
  const starNeedRaw = parse('designed/star_need', z.array(raw.rawStarNeed));
  const starAwardRaw = parse('designed/star_award', z.array(raw.rawStarAward));
  const oilRaw = parse('designed/oil_need', z.array(raw.rawOilNeed));
  const chaptersRaw = parse('designed/quest_chapters', z.array(raw.rawChapter));
  const questMainRaw = parse('designed/quest_main', z.array(raw.rawQuestMain));
  const questLinesRaw = parse('designed/quest_lines', z.array(raw.rawQuestLine));
  const weeklyRaw = parse('designed/quest_weekly', z.array(raw.rawWeeklyGroup));
  const seedsRaw = parse('designed/seeds', z.array(raw.rawSeed));
  const seedExRaw = parse('designed/seed_exchange', z.array(raw.rawSeedExchange));
  const formulasRaw = parse('designed/foods_formula', z.array(raw.rawFormula));
  const incomeRaw = parse('designed/income_action', z.array(raw.rawIncomeAction));
  const slotRaw = parse('dataset/bar_slot_machine_award', z.array(raw.rawSlotAward));
  const towerRaw = parse('dataset/tower_floors', z.array(raw.rawTowerFloor));
  const goodsExRaw = parse('designed/goods_exchange', z.array(raw.rawGoodsExchange));
  const renownRaw = parse('designed/renown_shop', z.array(raw.rawRenownShop));
  const blessRaw = parse('designed/bless', z.array(raw.rawBless));
  const potRaw = parse('dataset/suit_pot', z.array(raw.rawDictTier));
  const paintingRaw = parse('dataset/suit_painting', z.array(raw.rawDictTier));
  const guessFoodsRaw = parse('dataset/market_guess_foods', z.array(raw.rawGuessFood));
  const gradesRaw = parse('designed/cookbook_grades', z.array(raw.rawCookbookGrade));
  const specialTiersRaw = parse('designed/shop_special_rate', z.array(raw.rawSpecialTier));
  const shopPoolsRaw = parse('designed/shop_pools', z.array(raw.rawShopPool));
  const suitsRaw = parse('designed/equip_suits', z.array(raw.rawSuit));
  const mcProfRaw = parse('designed/mc_proficiency', z.array(raw.rawMcProficiency));
  const tuning = parse('game/tuning', tuningSchema);
  const holidays = parse('game/holidays', raw.holidaysFile);
  const guessAwardRaw = parse('game/market_guess_award', raw.guessAwardFile);
  const actionMap = parse('game/action_map', raw.actionMapFile);
  const looks = parse('game/looks', raw.looksFile);
  const equipLore = parse('game/equip_lore', raw.equipLoreFile);
  const towerFix = parse('game/tower_fix', raw.towerFixFile);
  const settingDocs = parse('game/setting_docs', raw.settingDocsFile);
  const newbieCodesRaw = parse('game/newbie_codes', raw.newbieCodesFile);
  const souvenirsRaw = parse('game/souvenirs', raw.souvenirsFile);
  const newbieRaw = parse('game/newbie_pack', raw.newbiePackFile);
  const kujiRaw = parse('game/kuji', raw.kujiFile);
  const fundRaw = parse('game/fund', raw.fundFile);
  const foodSupply = parse('game/food_supply', raw.foodSupplyFile);
  const devicesExtra = parse('game/devices_extra', raw.devicesExtraFile);
  const defaults = parse('restaurant_defaults', raw.restaurantDefaultsSchema);

  if (
    errors.length > 0 ||
    !foodsRaw ||
    !goodsRaw ||
    !cookbooksRaw ||
    !streetsRaw ||
    !medalMapRaw ||
    !mysteriousRaw ||
    !mcProfRaw ||
    !devicesRaw ||
    !actTasksRaw ||
    !actRewardsRaw ||
    !actExtra ||
    !pricesRaw ||
    !awardFlagsRaw ||
    !weatherRaw ||
    !starNeedRaw ||
    !starAwardRaw ||
    !oilRaw ||
    !chaptersRaw ||
    !questMainRaw ||
    !questLinesRaw ||
    !weeklyRaw ||
    !seedsRaw ||
    !seedExRaw ||
    !formulasRaw ||
    !incomeRaw ||
    !slotRaw ||
    !towerRaw ||
    !goodsExRaw ||
    !renownRaw ||
    !blessRaw ||
    !potRaw ||
    !paintingRaw ||
    !guessFoodsRaw ||
    !gradesRaw ||
    !specialTiersRaw ||
    !shopPoolsRaw ||
    !suitsRaw ||
    !tuning ||
    !holidays ||
    !guessAwardRaw ||
    !actionMap ||
    !looks ||
    !equipLore ||
    !towerFix ||
    !settingDocs ||
    !newbieCodesRaw ||
    !souvenirsRaw ||
    !newbieRaw ||
    !kujiRaw ||
    !fundRaw ||
    !foodSupply ||
    !devicesExtra ||
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
    // 菜谱建好后按需求回填（问题记录 50）
    weight: f.odds,
    type: f.type ?? null,
    maxNum: f.maxNum ?? 999,
  }));
  unique(
    'foods',
    foods.map((f) => f.id),
  );
  const foodIds = new Set(foods.map((f) => f.id));

  // ---------- 道具 ----------
  const lored = applyEquipLore(goodsRaw, suitsRaw, equipLore, errors);
  const awardFlags = new Map(awardFlagsRaw.map((a) => [a.id, a.awardflag]));
  const builtGoods: Goods[] = lored.goods.map((g) => {
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
    const item: Goods = {
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
      use: null,
      equip: null,
      gem: null,
    };
    item.use = deriveGoodsUse(item);
    if (item.type === GOODS_TYPE.equip) {
      const d = parseEquipDef(value);
      if (typeof d === 'string') errors.push(`goods ${g.id} equip ${d}`);
      else item.equip = d;
    } else if (item.type === GOODS_TYPE.gem) {
      const d = parseGemDef(value);
      if (typeof d === 'string') errors.push(`goods ${g.id} gem ${d}`);
      else item.gem = d;
    }
    return item;
  });
  // ---------- 强化数值表（问题记录 120） ----------
  // 纪念品（148-2 设计 §6）：配置里定义的永久道具，没有加成和用途；描述末尾注明节日
  const souvenirGoods: Goods[] = souvenirsRaw.souvenirs.map((s) => ({
    id: s.id,
    name: s.name,
    type: GOODS_TYPE.souvenir,
    deviceType: null,
    invalidHours: null,
    maxNum: 99,
    stackable: true,
    level: 1,
    coin: 0,
    diamond: 0,
    onSale: false,
    awardFlag: null,
    desc: `${s.desc}（${s.holiday}纪念品）`,
    value: null,
    effects: {},
    gift: null,
    use: null,
    equip: null,
    gem: null,
  }));
  // 一番赏抽赏券（一番赏设计 §4）：消耗品，不出售，可堆叠
  const kujiTicket: Goods = {
    id: kujiRaw.ticket.id,
    name: kujiRaw.ticket.name,
    type: GOODS_TYPE.consumable,
    deviceType: null,
    invalidHours: null,
    maxNum: 9999,
    stackable: true,
    level: 1,
    coin: 0,
    diamond: 0,
    onSale: false,
    awardFlag: null,
    desc: kujiRaw.ticket.desc,
    value: null,
    effects: {},
    gift: null,
    use: null,
    equip: null,
    gem: null,
  };
  // 豪华签券（240-2）：和普通券同一种生成方式
  const kujiDeluxeTicket: Goods = {
    ...kujiTicket,
    id: kujiRaw.deluxeTicket.id,
    name: kujiRaw.deluxeTicket.name,
    desc: kujiRaw.deluxeTicket.desc,
  };
  // 一番赏月度主题手办（问题记录 274）：纪念品，说明末尾注明主题
  const kujiThemes: KujiTheme[] = [];
  const kujiFigures: Goods[] = [];
  {
    const seenMonth = new Set<number>();
    for (const t of kujiRaw.themes) {
      if (seenMonth.has(t.month)) errors.push(`kuji themes duplicate month ${t.month}`);
      seenMonth.add(t.month);
      for (const f of Object.values(t.figures))
        kujiFigures.push({ ...souvenirLike(f.id, f.name, `${f.desc}（一番赏·${t.name}）`) });
      kujiThemes.push({
        month: t.month,
        name: t.name,
        desc: t.desc,
        figures: { A: t.figures.A.id, B: t.figures.B.id, C: t.figures.C.id, last: t.figures.last.id },
      });
    }
    for (let m = 1; m <= 12; m++) if (!seenMonth.has(m)) errors.push(`kuji themes missing month ${m}`);
    kujiThemes.sort((a, b) => a.month - b.month);
  }
  // 一到五级食材随机券（问题记录 331）：消耗品，不出售，可堆叠
  const foodVouchers: Goods[] = newbieRaw.vouchers.map((v) => ({
    ...souvenirLike(v.id, v.name, v.desc),
    type: GOODS_TYPE.consumable,
    maxNum: 9999,
    use: { kind: 'randomFood', level: v.level },
  }));
  // 小镇发展基金勋章（240-2）：限时荣誉，不出售；id 要和 ids.ts 的 FUND 一致
  for (const m of fundRaw.medals) if (!FUND_MEDALS.has(m.id)) errors.push(`fund medal ${m.id} not in FUND`);
  // 后期的宣传海报、奖杯（问题记录 146）：设施，商店有售，按星级可用；不进随机奖励池
  const maxStar = Math.max(...starNeedRaw.map((s) => s.starlevel));
  for (const x of devicesExtra.items) {
    if (x.deviceType !== 1 && x.deviceType !== 2)
      errors.push(`devices_extra ${x.id} deviceType ${x.deviceType}`);
    if (x.needStar < 0 || x.needStar > maxStar) errors.push(`devices_extra ${x.id} needStar ${x.needStar}`);
  }
  const extraDevices: Goods[] = devicesExtra.items.map((x) => ({
    ...souvenirLike(x.id, x.name, x.desc),
    type: GOODS_TYPE.device,
    deviceType: x.deviceType,
    coin: x.coin,
    onSale: true,
    value: { time: x.time, [x.effect]: x.value },
    effects: { time: x.time, [x.effect]: x.value },
    needStar: x.needStar,
  }));
  const fundMedals: Goods[] = fundRaw.medals.map((m) => ({
    ...souvenirLike(m.id, m.name, m.desc),
    type: GOODS_TYPE.honor,
    invalidHours: m.hours,
    maxNum: 1,
    stackable: false,
    value: m.effects,
    effects: m.effects,
  }));
  // 新手大礼包（goods 54）：原数据没有内容，按 newbie_pack.json 配上（问题记录 331）
  const withPack = builtGoods.map((g) =>
    g.id === newbieRaw.pack.goodsId ? { ...g, gift: newbieRaw.pack.gift, use: { kind: 'gift' as const } } : g,
  );
  if (!builtGoods.some((g) => g.id === newbieRaw.pack.goodsId))
    errors.push(`newbie_pack references unknown goods ${newbieRaw.pack.goodsId}`);
  const goods = [
    ...applyStressTables(withPack, equipLore.stressTables, errors),
    ...souvenirGoods,
    kujiTicket,
    kujiDeluxeTicket,
    ...kujiFigures,
    ...foodVouchers,
    ...fundMedals,
    ...extraDevices,
  ];
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
  // 街道勋章用显式对应表（问题记录 284）：以前按 devicetype<=13 识别，雕像 devicetype 20 会和印度街冲突
  const medalOf = new Map<number, number>();
  for (const m of medalMapRaw) {
    const g = goods.find((x) => x.id === m.goodsId);
    if (!g || g.type !== GOODS_TYPE.honor)
      errors.push(`street_medal_map street ${m.streetId} goods ${m.goodsId} is not a medal`);
    if (medalOf.has(m.streetId)) errors.push(`street_medal_map street ${m.streetId} listed twice`);
    medalOf.set(m.streetId, m.goodsId);
  }
  unique(
    'street_medal_map goods',
    medalMapRaw.map((m) => m.goodsId),
  );
  const streets = streetsRaw.map((s) => {
    const medalId = medalOf.get(s.id);
    if (medalId === undefined) errors.push(`street ${s.id} has no medal`);
    return { id: s.id, name: s.name, cookName: s.cookname ?? '', desc: s.desc ?? '', medalId: medalId ?? -1 };
  });
  for (const id of medalOf.keys())
    if (!streets.some((s) => s.id === id)) errors.push(`street_medal_map references unknown street ${id}`);
  unique(
    'streets',
    streets.map((s) => s.id),
  );
  const streetIds = new Set(streets.map((s) => s.id));

  // ---------- 食谱 ----------
  // 老表和新表合起来不能有重复 id，也不能给不存在的食谱定价（backlog 284）
  unique(
    'cookbooks_price',
    pricesRaw.map((p) => p.id),
  );
  const cookbookIdSet = new Set(cookbooksRaw.map((c) => c.id));
  for (const p of pricesRaw)
    if (!cookbookIdSet.has(p.id)) errors.push(`cookbooks_price: price for unknown cookbook ${p.id}`);
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
  // 食材出现权重向全服需求靠 α（问题记录 50）
  const weights = foodWeights(foods, cookbooks, foodSupply.demandBlend);
  for (const f of foods) f.weight = weights.get(f.id) ?? f.odds;
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
      appraisable: m.appraisable ?? true,
      // 数据里的 num 是食材等级，不是数量（设计文档 裁定 1）
      foods: m.foods.map((f) => f.foodsId),
    };
  });
  unique(
    'mysterious_cookbooks',
    mysteriousCookbooks.map((m) => m.id),
  );
  const mcProficiency = [...mcProfRaw]
    .sort((a, b) => a.curlevel - b.curlevel)
    .map((p) => ({ curlevel: p.curlevel, name: p.name, expNext: p.expNext < 0 ? null : p.expNext }));
  mcProficiency.forEach((p, i) => {
    if (p.curlevel !== i + 1) errors.push(`mc_proficiency: curlevel ${p.curlevel} out of order`);
  });
  for (const g of goods) {
    if (g.deviceType === 177) {
      const c = parseTeacherCert(g.value);
      if (typeof c === 'string') errors.push(`goods ${g.id} teacher cert ${c}`);
    }
    const a = parseAppraiseDef(g.value);
    if (a && !mysteriousCookbooks.some((m) => m.appraisable && m.level >= a.min && m.level <= a.max))
      errors.push(`goods ${g.id} appraise range ${a.min}-${a.max} has no dish`);
  }

  // ---------- 厨具套装、宝石升阶 ----------
  const suits = buildSuits(lored.suits);
  unique(
    'equip_suits',
    suits.map((s) => s.id),
  );
  const suitIds = new Set(suits.map((s) => s.id));
  for (const s of lored.suits) {
    for (const t of s.tiers) {
      if (t.neednum > s.maxnum)
        errors.push(`equip_suits ${s.suitid} tier needs ${t.neednum} pieces but maxnum is ${s.maxnum}`);
      for (const k of Object.keys(t.value))
        if (!SUIT_EFFECT_KEYS.has(k)) errors.push(`equip_suits ${s.suitid} has unknown effect ${k}`);
    }
    const pieces = goods.filter((g) => g.equip?.suitId === s.suitid).length;
    if (pieces !== s.maxnum)
      errors.push(`equip_suits ${s.suitid} has ${pieces} pieces but maxnum is ${s.maxnum}`);
  }
  const goodsById = new Map(goods.map((g) => [g.id, g]));
  for (const g of goods) {
    if (g.equip && !NON_SUIT_IDS.has(g.equip.suitId) && !suitIds.has(g.equip.suitId))
      errors.push(`goods ${g.id} references unknown suit ${g.equip.suitId}`);
    if (g.gem && g.gem.nextId !== null && !goodsById.get(g.gem.nextId)?.gem)
      errors.push(`goods ${g.id} gem next ${g.gem.nextId} is not a gem`);
  }

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

  /** "all" = 菜谱总数（"把全部食谱升到珍品"、泛紫 5 星，问题记录 284） */
  const allOr = (n: number | 'all') => (n === 'all' ? cookbooks.length : n);
  const starNeed = starNeedRaw.map((s) => ({
    star: s.starlevel,
    name: s.name,
    needLevel: s.needRestlevel,
    needCookbooks: allOr(s.needCookbooksnum),
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

  // ---------- 任务（问题记录 318）：章节主线、玩法支线、每周任务 ----------
  const chapters: Chapter[] = chaptersRaw.map((c) => ({ ...c }));
  unique(
    'quest_chapters',
    chapters.map((c) => c.id),
  );
  for (const c of chapters) checkAward(`chapter ${c.id}`, c.award);
  const chapterIds = new Set(chapters.map((c) => c.id));
  /** 条件键归到功能（| 连接的取第一个）；状态键必须能算出来 */
  const questFeature = (id: number, cond: { kind: string; key: string }) => {
    if (cond.kind === 'state' && !isQuestStateKey(cond.key))
      errors.push(`quest ${id} unknown state key ${cond.key}`);
    const f = featureOfKey(cond.key.split('|')[0]!, actionMap.features);
    if (f === null) errors.push(`quest ${id} key ${cond.key} has no feature`);
    return f ?? '';
  };
  const quests: Quest[] = [];
  for (const q of questMainRaw) {
    if (!chapterIds.has(q.chapter)) errors.push(`quest ${q.id} references unknown chapter ${q.chapter}`);
    if (q.id !== 2000 + q.chapter * 20 + q.order)
      errors.push(`quest ${q.id} id must be 2000 + chapter×20 + order`);
    quests.push({
      id: q.id,
      line: null,
      chapter: q.chapter,
      order: q.order,
      needStar: 0,
      name: q.name,
      cond: { ...q.cond, target: allOr(q.cond.target) },
      award: q.award,
      href: q.href,
      feature: questFeature(q.id, q.cond),
    });
  }
  const questLines: QuestLine[] = [];
  for (const l of questLinesRaw) {
    if (!chapterIds.has(l.chapter)) errors.push(`quest line ${l.id} references unknown chapter ${l.chapter}`);
    for (const st of l.steps) {
      if (st.id !== 3000 + l.id * 20 + st.order)
        errors.push(`quest ${st.id} id must be 3000 + line×20 + order`);
      quests.push({
        id: st.id,
        line: l.id,
        chapter: l.chapter,
        order: st.order,
        needStar: st.needStar,
        name: st.name,
        cond: { ...st.cond, target: allOr(st.cond.target) },
        award: st.award,
        href: st.href,
        feature: questFeature(st.id, st.cond),
      });
    }
    questLines.push({
      id: l.id,
      key: l.key,
      name: l.name,
      chapter: l.chapter,
      feature: quests.find((q) => q.line === l.id)?.feature ?? '',
    });
  }
  unique(
    'quest_lines',
    questLines.map((l) => l.id),
  );
  const weeklyGroups: WeeklyGroup[] = weeklyRaw.map((g) => {
    checkAward(`weekly ${g.key} full`, g.fullAward);
    return {
      key: g.key,
      minStar: g.minStar,
      maxStar: g.maxStar,
      fullId: g.fullId,
      fullAward: g.fullAward,
      quests: g.quests.map((q) => ({ ...q, feature: questFeature(q.id, { kind: 'counter', key: q.key }) })),
    };
  });
  unique('quests', [
    ...quests.map((q) => q.id),
    ...weeklyGroups.flatMap((g) => [g.fullId, ...g.quests.map((q) => q.id)]),
  ]);
  for (const q of quests) checkAward(`quest ${q.id}`, q.award);
  for (const g of weeklyGroups) for (const q of g.quests) checkAward(`quest ${q.id}`, q.award);

  const activationTasks = [
    ...actTasksRaw.map((a) => ({
      id: a.id,
      name: a.activationname,
      points: a.activationvalue,
      limitTimes: a.limittimes,
      needStar: a.starlevel ?? 0,
    })),
    // 问题记录 318：新玩法的活跃项
    ...actExtra.tasks.map((a) => ({
      id: a.id,
      name: a.name,
      points: a.points,
      limitTimes: a.limit,
      needStar: a.needStar,
    })),
  ];
  unique(
    'activation_tasks',
    activationTasks.map((a) => a.id),
  );
  const activationRewards: ActivationReward[] = [];
  for (const r of actRewardsRaw) {
    try {
      activationRewards.push({ points: r.dictval, award: raw.awardSchema.parse(JSON.parse(r.note)) });
    } catch {
      errors.push(`activation_reward ${r.dictval} note is not a valid award`);
    }
  }
  activationRewards.push(...actExtra.rewards);
  activationRewards.sort((a, b) => a.points - b.points);
  for (const r of actExtra.rewards) checkAward(`activation_reward ${r.points}`, r.award);

  const activationNames = new Set(activationTasks.map((a) => a.name));
  for (const [key, name] of Object.entries(actionMap.activation)) {
    if (!activationNames.has(name))
      errors.push(`action_map activation ${key} references unknown activation ${name}`);
  }

  // ---------- 2A 新表 ----------
  const cookbookGrades = gradesRaw.map((g) => ({ ...g })).sort((a, b) => a.grade - b.grade);
  contiguous(
    'cookbook_grades',
    cookbookGrades.map((g) => g.grade),
  );

  const shopSpecialTiers = specialTiersRaw
    .map((t) => ({ name: t.name, discount: t.foodsrate, stock: t.num, from: t.startrate, to: t.endrate }))
    .sort((a, b) => a.from - b.from);
  if (shopSpecialTiers[0]?.from !== 0 || shopSpecialTiers.at(-1)?.to !== 1)
    errors.push('shop_special_rate must cover [0, 1)');

  const shopPools = { special: [] as number[], black: [] as number[] };
  for (const p of shopPoolsRaw) {
    for (const id of p.goods) {
      if (!goodsIds.has(id)) errors.push(`shop_pools ${p.pool} references unknown goods ${id}`);
    }
    shopPools[p.pool] = p.goods;
  }
  if (!goodsIds.has(tuning.shop.specialFallbackGoods))
    errors.push(
      `tuning shop.specialFallbackGoods references unknown goods ${tuning.shop.specialFallbackGoods}`,
    );

  const marketGuessFoods = guessFoodsRaw.map((f) => f.i);
  // 竞猜清单原本就是日常菜场能出的全部 1、2 级食材；新加的同等级食材（新街道，问题记录 284）也上日常菜场，一并能猜
  const guessIds = new Set(marketGuessFoods);
  const dailyLevels = new Set(tuning.market.dailyLevelWeights.map(([l]) => l));
  for (const f of foods) if (dailyLevels.has(f.level) && !guessIds.has(f.id)) marketGuessFoods.push(f.id);
  for (const id of marketGuessFoods)
    if (!foodIds.has(id)) errors.push(`market_guess_foods references unknown food ${id}`);

  const guessAwards = guessAwardRaw.byHits.sort((a, b) => a.hits - b.hits);
  for (const a of guessAwards) checkAward(`market_guess_award hits ${a.hits}`, a.award);
  const guessBonus = guessAwardRaw.bonus.sort((a, b) => b.minHits - a.minHits);
  for (const a of guessBonus) checkAward(`market_guess_award bonus ${a.minHits}`, a.award);

  // ---------- 以后子项目用到的表 ----------
  const seeds = seedsRaw.map((s) => ({
    id: s.id,
    foodsId: s.foodsId,
    name: s.name,
    level: s.foodsLevel,
    coin: s.coin,
    infancy: s.infancy,
    maturity: s.maturity,
    autumn: s.autumn,
    harvest: s.harvest,
    harvestNum: s.harvestnum,
    odds: s.odds,
  }));
  for (const g of goods) {
    if (g.deviceType === 97) {
      const m = parseMissileDef(g.value);
      if (typeof m === 'string') errors.push(`goods ${g.id} missile ${m}`);
    }
    if (g.deviceType === 96) {
      const m = parseMapDef(g.value);
      if (typeof m === 'string') errors.push(`goods ${g.id} map ${m}`);
    }
  }
  const seedIds = new Set(seedsRaw.map((s) => s.id));
  for (const s of seedsRaw)
    if (!foodIds.has(s.foodsId)) errors.push(`seed ${s.id} references unknown food ${s.foodsId}`);
  const seedExchange = seedExRaw.map((e) => ({
    seedId: e.seedId,
    seedNum: e.seednum,
    essence: e.remnantnum,
  }));
  for (const e of seedExchange) {
    if (!seedIds.has(e.seedId)) errors.push(`seed_exchange references unknown seed ${e.seedId}`);
    if (e.seedNum < 1 || e.essence < 1) errors.push(`seed_exchange ${e.seedId} needs positive numbers`);
  }
  const formulas = formulasRaw.map((f) => ({
    id: f.id,
    name: f.name,
    mainFoodsId: f.mainFoodsId,
    subFoodsId: f.subFoodsId,
    addFoodsId: f.addFoodsId,
    resFoodsId: f.resFoodsId,
    odds: f.odds,
  }));
  unique(
    'foods_formula',
    formulas.map((f) => f.id),
  );
  for (const f of formulas) {
    for (const id of [f.mainFoodsId, f.subFoodsId, f.addFoodsId, f.resFoodsId]) {
      if (!foodIds.has(id)) errors.push(`formula ${f.id} references unknown food ${id}`);
    }
  }
  const incomeActions = incomeRaw.map((a) => ({
    id: a.id,
    name: a.name,
    coin: a.coin,
    exp: a.exp,
    landExp: a.landExp ?? 0,
  }));
  unique(
    'income_action',
    incomeActions.map((a) => a.id),
  );
  for (const id of [50, 51, 52, 53, 54, 55, 56])
    if (!incomeActions.some((a) => a.id === id)) errors.push(`income_action missing yard action ${id}`);
  for (const id of [464, 465, 469, 470, 339])
    if (!goodsIds.has(id)) errors.push(`yard references unknown goods ${id}`);
  for (const g of goods) {
    if (g.deviceType === 80 && !((g.effects.plantTime ?? 0) > 0))
      errors.push(`goods ${g.id} fertilizer needs a positive plantTime`);
  }
  // ---------- 酒吧（子项目 4C-1） ----------
  const SLOT_KINDS = ['empty', 'foods', 'goods'] as const;
  const slotAwards: SlotAward[] = [];
  for (const a of slotRaw) {
    const kind = SLOT_KINDS[a.type];
    if (kind === undefined) {
      errors.push(`bar_slot_machine_award ${a.id} has unknown type ${a.type}`);
      continue;
    }
    const itemId = kind === 'foods' ? (a.foodsId ?? null) : kind === 'goods' ? (a.goodsId ?? null) : null;
    if (kind === 'foods' && (itemId === null || !foodIds.has(itemId)))
      errors.push(`bar_slot_machine_award ${a.id} references unknown food ${itemId}`);
    if (kind === 'goods' && (itemId === null || !goodsIds.has(itemId)))
      errors.push(`bar_slot_machine_award ${a.id} references unknown goods ${itemId}`);
    slotAwards.push({
      id: a.id,
      kind,
      itemId,
      odds: a.odds,
      rare: a.rareflag === 1,
      getNum: a.getNum,
      news: a.newsflag === 1,
    });
  }
  unique(
    'bar_slot_machine_award',
    slotAwards.map((a) => a.id),
  );
  if (!slotAwards.some((a) => a.id === tuning.bar.slotFloorAwardId && a.kind !== 'empty'))
    errors.push(`tuning.bar.slotFloorAwardId ${tuning.bar.slotFloorAwardId} not in slot awards`);
  // 神秘礼券、蟹币、神灯（GOODS.mysteryTicket / krabCoin / magicLamp）
  for (const id of [1, 240, 389]) if (!goodsIds.has(id)) errors.push(`bar references unknown goods ${id}`);
  // ---------- 厨塔（子项目 4C-2） ----------
  // 守塔人覆盖（问题记录 120）：各层厨力、第 5/6 层互换
  const fixByFloor = new Map(towerFix.floors.map((f) => [f.floor, f]));
  // 同一层写两次时以前不报错、后一条生效，容易改错一条却看不出来（backlog 厨具小修）
  const seenFloors = new Set<number>();
  for (const f of towerFix.floors) {
    if (seenFloors.has(f.floor)) errors.push(`tower_fix lists floor ${f.floor} twice`);
    seenFloors.add(f.floor);
  }
  for (const f of towerFix.floors)
    if (!towerRaw.some((r) => r.floor === f.floor))
      errors.push(`tower_fix references unknown floor ${f.floor}`);
  const towerSrc = towerRaw.map((r) => {
    const x = fixByFloor.get(r.floor);
    return x
      ? {
          ...r,
          attrSum: x.power,
          watchmanRestName: x.watchmanRestName ?? r.watchmanRestName,
          watchman: x.watchman ?? r.watchman,
          note: x.note ?? r.note,
        }
      : r;
  });
  const towerFloors: TowerFloor[] = [...towerSrc]
    .sort((a, b) => a.floor - b.floor)
    .map((f) => ({
      floor: f.floor,
      name: f.watchmanRestName,
      title: f.watchman,
      minLevel: f.minlevel,
      maxTimes: f.challengemaxtimes,
      mc: f.specialflag === 1,
      note: f.note ?? '',
      ...calibrateWatchman(f.floor, f.minlevel, f.attrSum),
    }));
  towerFloors.forEach((f, i) => {
    if (f.floor !== i + 1) errors.push(`tower_floors: floor ${f.floor} out of order`);
  });
  for (const f of towerSrc) {
    if (f.attrSum <= 0 || f.challengemaxtimes <= 0)
      errors.push(`tower_floors ${f.floor} needs positive attrSum and challengemaxtimes`);
  }
  const renownShop: RenownShopItem[] = renownRaw.map((r) => ({
    goodsId: r.goodsId,
    renown: r.renown,
    rare: r.rareflag === 1,
    weeklyLimit: r.weeklyLimit,
    weekGroup: r.weekGroup,
    require: r.require,
  }));
  for (const [, id] of tuning.tower.rankGifts)
    if (!goodsIds.has(id)) errors.push(`tuning.tower.rankGifts references unknown goods ${id}`);
  // 厨塔挑战券（GOODS.towerTicket）
  if (!goodsIds.has(136)) errors.push('tower references unknown goods 136');
  // ---------- 外卖（子项目 4D） ----------
  for (const [id] of tuning.takeaway.awards)
    if (!goodsIds.has(id)) errors.push(`tuning.takeaway.awards references unknown goods ${id}`);
  for (const id of [tuning.takeaway.customer.success, tuning.takeaway.customer.fail])
    if (!goodsIds.has(id)) errors.push(`tuning.takeaway.customer references unknown goods ${id}`);
  // 外卖券、商店工作证（GOODS.takeawayTicket / shopJobHonor）
  for (const id of [263, 108]) if (!goodsIds.has(id)) errors.push(`takeaway references unknown goods ${id}`);
  if (Math.abs(tuning.takeaway.gradeRates.reduce((s, x) => s + x, 0) - 1) > 1e-9)
    errors.push('tuning.takeaway.gradeRates must sum to 1');
  for (const r of renownRaw)
    if (!goodsIds.has(r.goodsId)) errors.push(`renown_shop references unknown goods ${r.goodsId}`);
  // ---------- 小镇（子项目 4E-1） ----------
  const goodsExchange: GoodsExchange[] = goodsExRaw.map((e) => ({
    id: e.id,
    category: e.category,
    goodsId: e.goodsId,
    num: e.num,
    need: e.needGoods.map((n) => ({ goodsId: n.id, num: n.num })),
    times: e.times,
    news: e.newsflag === 1,
  }));
  unique(
    'goods_exchange',
    goodsExchange.map((e) => e.id),
  );
  for (const e of goodsExchange) {
    if (!goodsIds.has(e.goodsId)) errors.push(`goods_exchange ${e.id} references unknown goods ${e.goodsId}`);
    for (const n of e.need)
      if (!goodsIds.has(n.goodsId))
        errors.push(`goods_exchange ${e.id} references unknown goods ${n.goodsId}`);
    if (e.times === 0 || e.times < -1) errors.push(`goods_exchange ${e.id} times must be -1 or positive`);
  }
  const bless: Bless[] = blessRaw.map((x) => ({
    id: x.id,
    name: x.name,
    type: x.type,
    num: x.num,
    needAct: x.needAct,
    levels: x.value?.level ?? null,
    goodsId: x.value?.goodsId ?? null,
    buff: x.buff,
    odds: x.odds,
  }));
  unique(
    'bless',
    bless.map((x) => x.id),
  );
  for (const x of bless) {
    if (x.goodsId !== null && !goodsIds.has(x.goodsId))
      errors.push(`bless ${x.id} references unknown goods ${x.goodsId}`);
    if (x.type === 2 && x.goodsId === null) errors.push(`bless ${x.id} needs goodsId`);
    if (
      (x.type === 0 || x.type === 5) &&
      (x.levels === null || x.levels[0] < 1 || x.levels[1] > 6 || x.levels[0] > x.levels[1])
    )
      errors.push(`bless ${x.id} needs a level range within 1~6`);
  }
  // 神秘礼券、爆裂飞弹、神秘券、蟹黄堡、蟹币、N 级券、雷神锤、喇叭、神灯、幸运饼干
  for (const id of [1, 19, 20, 180, 240, 241, 242, 243, 244, 245, 256, 315, 389, 491])
    if (!goodsIds.has(id)) errors.push(`town references unknown goods ${id}`);
  for (const id of tuning.town.mysteryExclude)
    if (!foodIds.has(id)) errors.push(`tuning.town.mysteryExclude references unknown food ${id}`);

  // ---------- 嘻哈男孩（子项目 4E-2） ----------
  const hh = tuning.hiphop;
  for (const [place] of hh.placeWeights)
    // 和 @dt/shared 的 HIPHOP_PLACES 一致（问题记录 256 加了 10~15）
    if (![1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15].includes(place))
      errors.push(`tuning.hiphop.placeWeights has unknown place ${place}`);
  for (const id of [...hh.weeklyCards, ...hh.wages.flat(), 230, 231, 232])
    if (!goodsIds.has(id)) errors.push(`hiphop references unknown goods ${id}`);
  const wageCards = new Set(hh.wages.map(([card]) => card));
  if (wageCards.size !== hh.weeklyCards.length || hh.weeklyCards.some((c) => !wageCards.has(c)))
    errors.push('tuning.hiphop.wages must cover exactly the weeklyCards');

  // ---------- 酒吧扩展、神殿飞弹（PR27、PR28 遗留） ----------
  const mem = tuning.bar.memory;
  if (mem.lengths.length !== mem.awardLevels.length)
    errors.push('tuning.bar.memory: lengths and awardLevels must have the same count');
  const darts = tuning.bar.darts;
  if (darts.periodMs[0] > darts.periodMs[1]) errors.push('tuning.bar.darts.periodMs must be [min, max]');
  if (darts.rings.some(([r], i) => i > 0 && r <= darts.rings[i - 1]![0]))
    errors.push('tuning.bar.darts.rings must be sorted by radius');
  for (const [id, min, max] of tuning.temple.missileAttack) {
    if (!goodsIds.has(id)) errors.push(`tuning.temple.missileAttack references unknown goods ${id}`);
    if (min > max) errors.push(`tuning.temple.missileAttack ${id} min > max`);
  }

  // ---------- 论坛（子项目 4E-3） ----------
  for (const [id] of tuning.forum.featureReward.goods)
    if (!goodsIds.has(id)) errors.push(`forum.featureReward references unknown goods ${id}`);

  // ---------- 邀请（子项目 6A-2） ----------
  const inviteRewards: Array<[string, (typeof tuning.invite)['newbie']]> = [
    ['newbie', tuning.invite.newbie],
    ['rewards.lv10', tuning.invite.rewards.lv10],
    ['rewards.lv30', tuning.invite.rewards.lv30],
  ];
  for (const [where, r] of inviteRewards) {
    for (const g of r.goods ?? [])
      if (!goodsIds.has(g.id)) errors.push(`invite.${where} references unknown goods ${g.id}`);
    for (const f of r.foods ?? [])
      if (!foodIds.has(f.id)) errors.push(`invite.${where} references unknown foods ${f.id}`);
  }

  // ---------- 新手兑换码（问题记录 150） ----------
  const newbieCodes = checkNewbieCodes(newbieCodesRaw, goodsIds, foodIds, errors);

  // ---------- 区服数值说明（问题记录 126） ----------
  checkSettingDocs(
    settingDocs,
    tuning as unknown as Record<string, unknown>,
    defaults as unknown as Record<string, unknown>,
    errors,
  );

  // ---------- 开店默认值 ----------
  for (const g of defaults.giftGoods) {
    if (!goodsIds.has(g.id)) errors.push(`restaurant_defaults gift references unknown goods ${g.id}`);
  }
  for (const f of defaults.giftFoods) {
    if (!foodIds.has(f.id)) errors.push(`restaurant_defaults gift references unknown food ${f.id}`);
  }
  if (!streetIds.has(defaults.streetId))
    errors.push(`restaurant_defaults references unknown street ${defaults.streetId}`);

  // ---------- 装扮 ----------
  const doorIds = new Set<number>();
  for (const d of looks.doors) {
    if (doorIds.has(d.id)) errors.push(`looks: duplicate door ${d.id}`);
    doorIds.add(d.id);
  }
  if (looks.doors.find((d) => d.id === 0)?.coin !== 0) errors.push('looks: door 0 must be free');
  const avatarIds = new Set<number>();
  for (const a of looks.avatars) {
    if (avatarIds.has(a.id)) errors.push(`looks: duplicate avatar ${a.id}`);
    avatarIds.add(a.id);
  }
  const iconKeys = new Set<string>();
  for (const i of looks.icons) {
    if (iconKeys.has(i.key)) errors.push(`looks: duplicate icon ${i.key}`);
    iconKeys.add(i.key);
    if (i.shop && i.shop.to <= i.shop.from) errors.push(`looks: icon ${i.key} shop must end after it starts`);
  }
  if (!avatarIds.has(tuning.friend.npc.avatar))
    errors.push(`tuning.friend.npc.avatar ${tuning.friend.npc.avatar} not in looks`);
  if (!doorIds.has(tuning.friend.npc.door))
    errors.push(`tuning.friend.npc.door ${tuning.friend.npc.door} not in looks`);
  // 一番赏（一番赏设计 §3）：引用检查和后台保存区服数值共用
  errors.push(...kujiErrors(tuning.kuji, { goodsIds, foodIds, iconKeys }));
  // 小镇发展基金（240-2）：同一套检查后台保存区服数值时也跑
  const honorIds = new Set(goods.filter((g) => g.type === GOODS_TYPE.honor).map((g) => g.id));
  errors.push(...fundErrors(tuning.fund, { honorIds }));
  for (const m of fundRaw.medals)
    if (!iconKeys.has(m.icon)) errors.push(`fund medal ${m.id} icon ${m.icon} not in looks.icons`);
  // 豪华池按月轮换的称号（240-2）
  {
    const deluxeKeys = new Set([...tuning.kuji.deluxe.tiers.map((x) => x.key), 'last']);
    const seenMonth = new Set<string>();
    for (const m of kujiRaw.deluxeMonths) {
      if (seenMonth.has(m.month)) errors.push(`kuji deluxeMonths duplicate month ${m.month}`);
      seenMonth.add(m.month);
      for (const [key, icon] of Object.entries(m.icons)) {
        if (!deluxeKeys.has(key)) errors.push(`kuji deluxeMonths ${m.month} key ${key} is not a deluxe tier`);
        if (!iconKeys.has(icon)) errors.push(`kuji deluxeMonths ${m.month} icon ${icon} not in looks.icons`);
      }
    }
  }

  if (errors.length > 0) return { bundle: null, errors };

  const i18n = buildI18n(
    {
      goods,
      foods,
      weather,
      streets,
      devices,
      suits: suits.map((s) => ({ id: s.id, name: s.name, tiers: s.tiers.map((x) => x.desc) })),
      mysterious: mysteriousCookbooks,
      doors: looks.doors,
      avatars: looks.avatars,
      icons: looks.icons.map((x) => ({ id: x.key, title: x.title, desc: x.desc })),
      tasks: [...quests, ...weeklyGroups.flatMap((g) => g.quests)].map((q) => ({ id: q.id, name: q.name })),
      chapters: chapters.map((c) => ({ id: c.id, name: c.name })),
      questLines: questLines.map((l) => ({ id: l.id, name: l.name })),
      activation: activationTasks,
      bless,
      tower: [...towerFloors.values()].map((f) => ({
        id: f.floor,
        name: f.name,
        title: f.title,
        note: f.note,
      })),
      formulas: [...formulas.values()],
      kujiThemes: kujiThemes.map((x) => ({ id: x.month, name: x.name, desc: x.desc })),
      proficiency: mcProficiency.map((x) => ({ id: x.curlevel, name: x.name })),
      cookbooks,
    },
    src,
    errors,
  );
  if (errors.length > 0) return { bundle: null, errors };

  const body: Omit<ConfigBundle, 'version'> = {
    i18n,
    foods,
    goods,
    cookbooks,
    streets,
    mysteriousCookbooks,
    mcProficiency,
    seeds,
    formulas,
    seedExchange,
    incomeActions,
    slotAwards,
    towerFloors,
    renownShop,
    weather,
    devices,
    starNeed,
    starAward,
    oilNeed,
    chapters,
    quests,
    questLines,
    weeklyGroups,
    activationTasks,
    activationRewards,
    kujiThemes,
    kujiDeluxeMonths: kujiRaw.deluxeMonths,
    fundMedals: fundRaw.medals.map((m) => ({ id: m.id, icon: m.icon })),
    cookbookGrades,
    shopSpecialTiers,
    shopPools,
    potTiers: tiersFrom(potRaw),
    paintingTiers: tiersFrom(paintingRaw),
    marketGuessFoods,
    guessAwards,
    guessBonus,
    actionMap,
    holidays,
    tuning,
    restaurantDefaults: defaults,
    settingDocs,
    newbieCodes,
    looks,
    suits,
    goodsExchange,
    bless,
    extra: {},
  };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { bundle: { version, ...body }, errors: [] };
}

/** 纪念品类型的道具：没有加成和用途，不出售，不占仓库格 */
function souvenirLike(id: number, name: string, desc: string): Goods {
  return {
    id,
    name,
    type: GOODS_TYPE.souvenir,
    deviceType: null,
    invalidHours: null,
    maxNum: 99,
    stackable: true,
    level: 1,
    coin: 0,
    diamond: 0,
    onSale: false,
    awardFlag: null,
    desc,
    value: null,
    effects: {},
    gift: null,
    use: null,
    equip: null,
    gem: null,
  };
}

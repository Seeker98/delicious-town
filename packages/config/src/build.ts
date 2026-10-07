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
import { itemRefs, retiredErrors } from './itemRefs';
import { kujiErrors } from './kuji';
import { fundErrors } from './fund';
import { foodWeights } from './foodSupply';
import { FUND_MEDALS, GOODS, GOODS_TYPE, NEWBIE, NON_SUIT_IDS } from './ids';
import { tuningSchema } from './tuning';
import { checkNewbieCodes } from './newbieCodes';
import { checkSettingDocs } from './settingDocs';
import { applyStressTables } from './stressTable';
import { isNewId, type IdKind } from './renumber';
import { checkStreetDescs } from './streetDesc';
import { elderAttrs, elderErrors, elderLevelErrors } from './towerFloor';
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

export interface BuildOptions {
  /**
   * 长老数据（game/tower_elders）对不上或缺失时也出配置：给生成长老的 pnpm -F @dt/server elders 用，
   * 免得改了强化表、加点数后旧的长老数据通不过校验，生成器又拿不到新配置（问题记录 408 审查）
   */
  ignoreElders?: boolean;
}

export function buildBundle(src: SourceData, opts: BuildOptions = {}): BuildResult {
  const errors: string[] = [];

  function parse<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | null {
    const r = schema.safeParse(src[key]);
    if (r.success) return r.data;
    // 数组里某一项出错时带上它的编号，免得只有下标（backlog 第 ⑦ 批）
    const idAt = (i: unknown) => {
      const x = typeof i === 'number' && Array.isArray(src[key]) ? (src[key] as unknown[])[i] : undefined;
      const id = x && typeof x === 'object' ? (x as { id?: unknown }).id : undefined;
      return typeof id === 'number' ? ` (${key.split('/').pop()} ${id})` : '';
    };
    for (const issue of r.error.issues.slice(0, 20))
      errors.push(`${key}: ${issue.path.join('.')}: ${issue.message}${idAt(issue.path[0])}`);
    return null;
  }

  /** 原始数据 + 新设计的同类数据（新街道，问题记录 284）；任一份解析失败就是 null */
  const both = <T>(a: T[] | null, b: T[] | null): T[] | null => (a && b ? [...a, ...b] : null);
  // 道具、食材、菜谱的定义在主表（重新编号 PR 1）
  const foodsRaw = parse('master/foods', z.array(raw.masterFood));
  const goodsRaw = parse('master/goods', z.array(raw.masterGoods));
  const cookbooksRaw = parse('master/cookbooks', z.array(raw.masterCookbook));
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
  const towerElders = opts.ignoreElders
    ? (raw.towerEldersFile.safeParse(src['game/tower_elders']).data ?? { note: '', floors: [] })
    : parse('game/tower_elders', raw.towerEldersFile);
  const elderError = (m: string) => {
    if (!opts.ignoreElders) errors.push(m);
  };
  const settingDocs = parse('game/setting_docs', raw.settingDocsFile);
  const newbieCodesRaw = parse('game/newbie_codes', raw.newbieCodesFile);
  const newbieRaw = parse('game/newbie_pack', raw.newbiePackFile);
  const kujiRaw = parse('game/kuji', raw.kujiFile);
  const fundRaw = parse('game/fund', raw.fundFile);
  const foodSupply = parse('game/food_supply', raw.foodSupplyFile);
  const retiredRaw = parse('game/retired', raw.retiredFile);
  const slotsRaw = parse('game/cookbook_slots', raw.cookbookSlotsFile);
  const groupsRaw = parse('game/goods_groups', raw.goodsGroupsFile);
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
    !towerElders ||
    !settingDocs ||
    !newbieCodesRaw ||
    !newbieRaw ||
    !kujiRaw ||
    !fundRaw ||
    !foodSupply ||
    !retiredRaw ||
    !slotsRaw ||
    !groupsRaw ||
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
    type: f.type,
    maxNum: f.maxNum,
  }));
  unique(
    'foods',
    foods.map((f) => f.id),
  );
  const foodIds = new Set(foods.map((f) => f.id));

  // ---------- 道具（定义在主表，重新编号 PR 1） ----------
  const suitsAll = applyEquipLore(suitsRaw, equipLore);
  const builtGoods: Goods[] = goodsRaw.map((m) => {
    const value = m.value ?? null;
    let gift: GiftItem[] | null = null;
    if (Array.isArray(value)) {
      const r = z.array(raw.giftItemSchema).safeParse(value);
      if (r.success) gift = r.data;
      else errors.push(`goods ${m.id} gift is malformed: ${r.error.issues[0]?.message ?? ''}`);
    }
    const item: Goods = {
      id: m.id,
      name: m.name,
      type: m.type,
      deviceType: m.deviceType,
      invalidHours: m.invalidHours,
      maxNum: m.maxNum,
      stackable: m.stackable,
      level: m.level,
      coin: m.coin,
      diamond: m.diamond,
      onSale: m.onSale,
      awardFlag: m.awardFlag,
      desc: m.desc,
      value,
      effects: numericEntries(value),
      gift,
      use: null,
      equip: null,
      gem: null,
    };
    item.use = m.use ?? deriveGoodsUse(item);
    if (item.type === GOODS_TYPE.equip) {
      const d = parseEquipDef(value);
      if (typeof d === 'string') errors.push(`goods ${m.id} equip ${d}`);
      else item.equip = d;
    } else if (item.type === GOODS_TYPE.gem) {
      const d = parseGemDef(value);
      if (typeof d === 'string') errors.push(`goods ${m.id} gem ${d}`);
      else item.gem = d;
    }
    if (m.needStar !== undefined) item.needStar = m.needStar;
    return item;
  });
  // 后期的宣传海报、奖杯（问题记录 146）：设施位只能是 1、2，星级不超过最高星
  const maxStar = Math.max(...starNeedRaw.map((s) => s.starlevel));
  for (const m of goodsRaw) {
    if (m.needStar !== undefined && (m.needStar < 0 || m.needStar > maxStar))
      errors.push(`goods ${m.id} needStar ${m.needStar}`);
    if (m.src === 'poster' && m.deviceType !== 1 && m.deviceType !== 2)
      errors.push(`goods ${m.id} poster deviceType ${m.deviceType}`);
    // 主表里手写的几类定义，原来各自文件的格式检查（质量期第 ⑦ 批）
    if (m.needStar !== undefined && m.src !== 'poster')
      errors.push(`goods ${m.id} needStar only for posters`);
    if (m.src === 'poster') {
      const v = (m.value ?? {}) as Record<string, unknown>;
      if (typeof v.time !== 'number' || !Number.isInteger(v.time) || v.time < 1)
        errors.push(`goods ${m.id} poster value time must be an integer >= 1`);
      if (Object.keys(v).filter((k) => k === 'coinValue' || k === 'expValue').length !== 1)
        errors.push(`goods ${m.id} poster value needs exactly one of coinValue / expValue`);
      if (m.type !== GOODS_TYPE.device) errors.push(`goods ${m.id} poster must be a device`);
      for (const [k, x] of Object.entries(v)) {
        if (k === 'time') continue;
        if (k !== 'coinValue' && k !== 'expValue')
          errors.push(`goods ${m.id} poster value key ${k} not allowed`);
        else if (typeof x !== 'number' || x <= 0) errors.push(`goods ${m.id} poster value ${k} must be > 0`);
      }
    }
    if (m.src === 'souvenir' && m.type !== GOODS_TYPE.souvenir)
      errors.push(`goods ${m.id} src souvenir must be type souvenir`);
    if ((m.id === GOODS.kujiTicket || m.id === GOODS.kujiDeluxeTicket) && m.type !== GOODS_TYPE.consumable)
      errors.push(`goods ${m.id} kuji ticket must be a consumable`);
  }
  // 一到五级食材随机券（问题记录 331）：原来由构建写死，主表可以手改了，按约定检查（终审 I1）：
  // 每级一张、编号 = foodVoucherBase + 等级、消耗品、用法是随机食材；用法只有随机券能写
  const voucherLevels = new Set<number>();
  for (const m of goodsRaw) {
    if (m.src !== 'newbie') {
      if (m.use) errors.push(`goods ${m.id} use is only for food vouchers`);
      continue;
    }
    if (m.type !== GOODS_TYPE.consumable) errors.push(`goods ${m.id} voucher must be a consumable`);
    if (m.use?.kind !== 'randomFood') {
      errors.push(`goods ${m.id} voucher needs use randomFood`);
      continue;
    }
    const want = NEWBIE.foodVoucherBase + m.use.level;
    if (m.id !== want) errors.push(`goods ${m.id} voucher level ${m.use.level} must be goods ${want}`);
    else voucherLevels.add(m.use.level);
  }
  for (let lv = 1; lv <= 5; lv++)
    if (!voucherLevels.has(lv)) errors.push(`food voucher for level ${lv} is missing`);
  // 新手大礼包（goods 54）：内容按 newbie_pack.json 配（问题记录 331）
  const withPack = builtGoods.map((g) =>
    g.id === newbieRaw.pack.goodsId ? { ...g, gift: newbieRaw.pack.gift, use: { kind: 'gift' as const } } : g,
  );
  if (!builtGoods.some((g) => g.id === newbieRaw.pack.goodsId))
    errors.push(`newbie_pack references unknown goods ${newbieRaw.pack.goodsId}`);
  // ---------- 强化数值表（问题记录 120） ----------
  const goods = applyStressTables(withPack, equipLore.stressTables, errors);
  unique(
    'goods',
    goods.map((g) => g.id),
  );
  const goodsIds = new Set(goods.map((g) => g.id));

  // ---------- 下架（问题记录 367） ----------
  // 定义保留给已持有的玩家；道具退出商店和随机奖励池，食材在运行时退出各等级的食材池。还被引用的在最后报错
  const retired = { goods: new Set<number>(), foods: new Set<number>() };
  for (const kind of ['goods', 'foods'] as const) {
    const known = kind === 'goods' ? goodsIds : foodIds;
    for (const { id } of retiredRaw[kind]) {
      if (!known.has(id)) errors.push(`retired references unknown ${kind} ${id}`);
      if (retired[kind].has(id)) errors.push(`retired lists ${kind} ${id} twice`);
      retired[kind].add(id);
    }
  }
  for (const g of goods)
    if (retired.goods.has(g.id)) Object.assign(g, { retired: true, awardFlag: null, onSale: false });
  for (const f of foods) if (retired.foods.has(f.id)) f.retired = true;

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
    return {
      id: s.id,
      name: s.name,
      cookName: s.cookname ?? '',
      desc: s.desc ?? '',
      theme: s.theme ?? '',
      focus: s.focus ?? null,
      medalId: medalId ?? -1,
    };
  });
  for (const id of medalOf.keys())
    if (!streets.some((s) => s.id === id)) errors.push(`street_medal_map references unknown street ${id}`);
  unique(
    'streets',
    streets.map((s) => s.id),
  );
  const streetIds = new Set(streets.map((s) => s.id));

  // ---------- 食谱（定义在主表，含售价、推荐等级、描述） ----------
  const cookbooks: Cookbook[] = cookbooksRaw.map((c) => {
    if (!streetIds.has(c.streetId)) errors.push(`cookbook ${c.id} references unknown street ${c.streetId}`);
    const needFoods: Cookbook['needFoods'] = {};
    for (let grade = 1; grade <= 10; grade++) {
      const list = c.needFoods[String(grade)];
      if (!list || list.length === 0) {
        errors.push(`cookbook ${c.id} is missing grade ${grade}`);
        continue;
      }
      for (const f of list)
        if (!foodIds.has(f.foodsId))
          errors.push(`cookbook ${c.id} grade ${grade} references unknown food ${f.foodsId}`);
      needFoods[grade] = list.map((f) => ({ foodsId: f.foodsId, num: f.num }));
    }
    if (c.slot >= slotsRaw.next) errors.push(`cookbook ${c.id} slot ${c.slot} >= next ${slotsRaw.next}`);
    return {
      id: c.id,
      slot: c.slot,
      name: c.name,
      streetId: c.streetId,
      taste: c.taste,
      coin: c.coin,
      level: c.level,
      desc: c.desc,
      needFoods,
    };
  });
  // 食材出现权重向全服需求靠 α（问题记录 50）
  const weights = foodWeights(foods, cookbooks, foodSupply.demandBlend);
  for (const f of foods) f.weight = weights.get(f.id) ?? f.odds;
  // 食材随机券那一级要有抽得出的食材：配错时用券会白扣（质量期 ②）
  for (const g of goods) {
    const use = g.use;
    if (use?.kind === 'randomFood' && !foods.some((f) => f.level === use.level && f.weight > 0))
      errors.push(`goods ${g.id} randomFood level ${use.level} has no food to draw`);
  }
  unique(
    'cookbooks',
    cookbooks.map((c) => c.id),
  );
  // 存储位不能重复：两道菜共用一个字节，学会一道另一道也算学会（重新编号 PR 3）
  const seenSlot = new Set<number>();
  for (const c of cookbooks) {
    if (seenSlot.has(c.slot)) errors.push(`cookbooks: duplicate slot ${c.slot}`);
    seenSlot.add(c.slot);
  }

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
  const suits = buildSuits(suitsAll);
  unique(
    'equip_suits',
    suits.map((s) => s.id),
  );
  const suitIds = new Set(suits.map((s) => s.id));
  for (const s of suitsAll) {
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
  // 一番赏月度主题（问题记录 274）：手办是主表里的纪念品
  const kujiThemes: KujiTheme[] = [];
  {
    const seenMonth = new Set<number>();
    for (const t of kujiRaw.themes) {
      if (seenMonth.has(t.month)) errors.push(`kuji themes duplicate month ${t.month}`);
      seenMonth.add(t.month);
      for (const [slot, id] of Object.entries(t.figures))
        if (goodsById.get(id)?.type !== GOODS_TYPE.souvenir)
          errors.push(`kuji theme ${t.month} figure ${slot} ${id} is not a souvenir`);
      kujiThemes.push({ month: t.month, name: t.name, desc: t.desc, figures: { ...t.figures } });
    }
    for (let m = 1; m <= 12; m++) if (!seenMonth.has(m)) errors.push(`kuji themes missing month ${m}`);
    kujiThemes.sort((a, b) => a.month - b.month);
  }
  // 小镇发展基金勋章（240-2）：id 要和 ids.ts 的 FUND 一致，是主表里的荣誉
  for (const m of fundRaw.medals) {
    if (!FUND_MEDALS.has(m.id)) errors.push(`fund medal ${m.id} not in FUND`);
    const g = goodsById.get(m.id);
    if (g?.type !== GOODS_TYPE.honor) errors.push(`fund medal ${m.id} is not an honor`);
    // 时长、件数原来由构建写死（终审 I1）：没有时长会发出永久勋章和称号
    if (g && !((g.invalidHours ?? 0) >= 1)) errors.push(`fund medal ${m.id} needs invalidHours >= 1`);
    if (g && g.maxNum !== 1) errors.push(`fund medal ${m.id} maxNum must be 1`);
  }
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
  for (const id of [
    GOODS.formulaScroll,
    GOODS.moonScroll,
    GOODS.starTear,
    GOODS.formulaEssence,
    GOODS.borderCollie,
  ])
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
  // 一掷千金开局按“这一级、出现率 100、没下架”的普通食材抽（bar/deal.ts）；某一级没有能抽的会报 500（#192 审查）
  for (const level of new Set(tuning.bar.deal.prizes.filter((p) => p.kind === 'food').map((p) => p.level)))
    if (!foods.some((f) => f.level === level && f.odds === 100 && !f.retired))
      errors.push(`tuning.bar.deal.prizes: no common level-${level} food to draw`);
  if (!slotAwards.some((a) => a.id === tuning.bar.slotFloorAwardId && a.kind !== 'empty'))
    errors.push(`tuning.bar.slotFloorAwardId ${tuning.bar.slotFloorAwardId} not in slot awards`);
  // 神秘礼券、蟹币、神灯（GOODS.mysteryTicket / krabCoin / magicLamp）
  for (const id of [GOODS.mysteryTicket, GOODS.krabCoin, GOODS.magicLamp])
    if (!goodsIds.has(id)) errors.push(`bar references unknown goods ${id}`);
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
  // 赛厨长老（问题记录 408）：每层一条，校验和厨具配置对得上，再算出被挑战时的属性
  const elderCtx = {
    goods: new Map(goods.map((g) => [g.id, g])),
    suits: new Map(suits.map((s) => [s.id, s])),
    attrPerLevel: tuning.rest.attrPerLevel,
    luckPerLevel: tuning.rest.luckPerLevel,
  };
  const elderByFloor = new Map(towerElders.floors.map((e) => [e.floor, e]));
  const seenElders = new Set<number>();
  for (const e of towerElders.floors) {
    if (seenElders.has(e.floor)) elderError(`tower_elders lists floor ${e.floor} twice`);
    seenElders.add(e.floor);
    if (!towerRaw.some((r) => r.floor === e.floor))
      elderError(`tower_elders references unknown floor ${e.floor}`);
    for (const m of elderErrors(e, elderCtx)) elderError(m);
  }
  for (const m of elderLevelErrors(
    towerElders.floors.flatMap((e) => {
      const r = towerRaw.find((x) => x.floor === e.floor);
      return r ? [{ floor: e.floor, minLevel: r.minlevel, level: e.level }] : [];
    }),
  ))
    elderError(m);
  const elderOfFloor = (floor: number) => {
    const e = elderByFloor.get(floor);
    if (!e) {
      elderError(`tower_elders misses floor ${floor}`);
      return {
        attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0, luck: 0 },
        power: 0,
        elder: { level: 1, stress: 0, points: { cook: 0, cutting: 0, fire: 0 }, pieces: [], drops: [] },
      };
    }
    const { floor: _f, ...elder } = e;
    return { ...elderAttrs(e, elderCtx), elder };
  };
  const towerSrc = towerRaw.map((r) => {
    const x = fixByFloor.get(r.floor);
    return x
      ? {
          ...r,
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
      ...elderOfFloor(f.floor),
    }));
  towerFloors.forEach((f, i) => {
    if (f.floor !== i + 1) errors.push(`tower_floors: floor ${f.floor} out of order`);
  });
  for (const f of towerSrc) {
    if (f.challengemaxtimes <= 0) errors.push(`tower_floors ${f.floor} needs positive challengemaxtimes`);
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
  if (!goodsIds.has(GOODS.towerTicket)) errors.push(`tower references unknown goods ${GOODS.towerTicket}`);
  // ---------- 外卖（子项目 4D） ----------
  for (const [id] of tuning.takeaway.awards)
    if (!goodsIds.has(id)) errors.push(`tuning.takeaway.awards references unknown goods ${id}`);
  for (const id of [tuning.takeaway.customer.success, tuning.takeaway.customer.fail])
    if (!goodsIds.has(id)) errors.push(`tuning.takeaway.customer references unknown goods ${id}`);
  // 外卖券、商店工作证（GOODS.takeawayTicket / shopJobHonor）
  for (const id of [GOODS.takeawayTicket, GOODS.shopJobHonor])
    if (!goodsIds.has(id)) errors.push(`takeaway references unknown goods ${id}`);
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
  for (const id of [
    GOODS.mysteryTicket,
    GOODS.missileBurst,
    GOODS.mysteryFoodExchange,
    GOODS.krabBurger,
    GOODS.krabCoin,
    ...[1, 2, 3, 4, 5].map((lv) => GOODS.levelTicketBase + lv),
    GOODS.thorHammer,
    GOODS.horn,
    GOODS.magicLamp,
    GOODS.luckyCookie,
  ])
    if (!goodsIds.has(id)) errors.push(`town references unknown goods ${id}`);
  for (const id of tuning.town.mysteryExclude)
    if (!foodIds.has(id)) errors.push(`tuning.town.mysteryExclude references unknown food ${id}`);

  // ---------- 嘻哈男孩（子项目 4E-2） ----------
  const hh = tuning.hiphop;
  for (const [place] of hh.placeWeights)
    // 和 @dt/shared 的 HIPHOP_PLACES 一致（问题记录 256 加了 10~15）
    if (![1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15].includes(place))
      errors.push(`tuning.hiphop.placeWeights has unknown place ${place}`);
  for (const id of [
    ...hh.weeklyCards,
    ...hh.wages.flat(),
    GOODS.hiphopCulture,
    GOODS.mayorFavor,
    GOODS.mayorAgainst,
  ])
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
  errors.push(
    ...kujiErrors(tuning.kuji, {
      goodsIds,
      foodIds,
      iconKeys,
      deluxeMonths: kujiRaw.deluxeMonths,
      activationPoints: new Set(activationRewards.map((r) => r.points)),
    }),
  );
  // 小镇发展基金（240-2）：同一套检查后台保存区服数值时也跑
  const honorIds = new Set(goods.filter((g) => g.type === GOODS_TYPE.honor).map((g) => g.id));
  errors.push(...fundErrors(tuning.fund, { honorIds }));
  for (const m of fundRaw.medals)
    if (!iconKeys.has(m.icon)) errors.push(`fund medal ${m.id} icon ${m.icon} not in looks.icons`);

  // ---------- 编号规则（重新编号，设计 §2） ----------
  const groupByKey = new Map(groupsRaw.groups.map((g) => [g.key, g]));
  const sortedGroups = [...groupsRaw.groups].sort((a, b) => a.base - b.base);
  sortedGroups.forEach((g, i) => {
    const next = sortedGroups[i + 1];
    if (next && g.base + g.size > next.base) errors.push(`goods groups ${g.key} and ${next.key} overlap`);
  });
  for (const m of goodsRaw) {
    const g = groupByKey.get(m.group);
    if (!g) errors.push(`goods ${m.id} group ${m.group} unknown`);
    else if (m.id < g.base || m.id >= g.base + g.size)
      errors.push(`goods ${m.id} outside group ${g.key} (${g.base}~${g.base + g.size - 1})`);
  }
  for (const f of foodsRaw) if (f.id < 1001 || f.id > 9999) errors.push(`foods ${f.id} outside 1001~9999`);
  for (const c of cookbooksRaw)
    if (c.id < 100001 || c.id > 199999) errors.push(`cookbooks ${c.id} outside 100001~199999`);
  const legacyPairs = (name: IdKind, list: ReadonlyArray<{ id: number; legacyId?: number }>) => {
    const seen = new Set<number>();
    const out: Array<[number, number]> = [];
    for (const x of list) {
      if (x.legacyId === undefined) continue;
      if (seen.has(x.legacyId)) errors.push(`${name}: duplicate legacyId ${x.legacyId}`);
      // 旧编号落在新号段里时，旧链接会把一个合法的新编号跳走
      if (isNewId(name, x.legacyId))
        errors.push(`${name} ${x.id} legacyId ${x.legacyId} is in the new id range`);
      seen.add(x.legacyId);
      out.push([x.legacyId, x.id]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  const legacy = {
    goods: legacyPairs('goods', goodsRaw),
    foods: legacyPairs('foods', foodsRaw),
    cookbooks: legacyPairs('cookbooks', cookbooksRaw),
  };

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
  checkStreetDescs(streets, goods, i18n, errors);
  if (errors.length > 0) return { bundle: null, errors };

  const body: Omit<ConfigBundle, 'version'> = {
    legacy,
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
  errors.push(...retiredErrors(itemRefs(body), retired));
  if (errors.length > 0) return { bundle: null, errors };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { bundle: { version, ...body }, errors: [] };
}

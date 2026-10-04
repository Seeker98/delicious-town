import { deviceHours, DEVICE_TYPE, GOODS, GOODS_TYPE, type Award, type Goods } from '@dt/config';
import { gameDay, gameParts, nextSlot, pickWeighted, type Rng } from '@dt/shared';
import { applyLearn, foodsNeedFor, learnTypeOf, mergeNeed, planLearn } from '../../modules/cookbook/rules';
import { composePool, handleTargetLevel, runHandle } from '../../modules/cupboard/rules';
import { oilChecks, starChecks, starCoinOf } from '../../modules/growth/rules';
import { clearTable } from '../../modules/interact/tables';
import { killReward, killStrength } from '../../modules/interact/rules';
import { personLimit, unitPrice } from '../../modules/market/rules';
import {
  CHAPTER_MARK,
  counterOf,
  foreignLearned,
  lineViews,
  mainView,
  reachedChapter,
  type QuestCtx,
} from '../../modules/task/quests';
import { activationTotal, stateValue } from '../../modules/task/rules';
import { CHEAP_DEVICES, USE_ALL, type Persona } from '../bot';
import { joinGuess, marketBuy, type FastMarket } from './market';
import {
  action,
  addFoods,
  aggOf,
  consumeGoods,
  countGoods,
  foodNum,
  gainCoin,
  gainDiamond,
  gainExp,
  gainOil,
  grantAward,
  grantGoods,
  luckOf,
  openGift,
  spendCoin,
  spendDiamond,
  spendStrength,
  subFoods,
} from './ops';
import { applySide, type SideTable } from './side';
import type { FastCtx, FastRest } from './state';
import type { FastWorld } from './world';

/** 一个快速模型的机器人：画像、店、自己的随机源、上次发旁支产出的日子 */
export interface FastBot {
  name: string;
  persona: Persona;
  rest: FastRest;
  rng: Rng;
  lastSideDay: string;
}

/** 学菜列表的排序（cookbook/service.ts 的 ORDER） */
const LEARN_ORDER: Record<string, number> = { '0': 0, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, z: 2, max: 3 };
const TASK_EXTRA = {
  'friends.count': 0,
  'rest.thumbs': 0,
  'equip.maxStress': 0,
  'mc.learned': 0,
  'yard.lands': 0,
  'honor.potCount': 0,
  'takeaway.open': 0,
};

const needOf = (c: FastCtx) => (id: number, grade: number) =>
  c.config.requireCookbook(id).needFoods[grade] ?? [];
const levelOfFood = (c: FastCtx) => (id: number) => c.config.foods.get(id)?.level ?? 0;
const haveFood = (r: FastRest) => (id: number) => foodNum(r, id);

/** 食谱某品级合并后的食材需求是静态数据，按配置缓存（性能） */
const mergedCache = new WeakMap<object, Map<number, ReturnType<typeof mergeNeed>>>();
function mergedNeed(c: FastCtx, id: number, grade: number): ReturnType<typeof mergeNeed> {
  let m = mergedCache.get(c.config);
  if (!m) mergedCache.set(c.config, (m = new Map()));
  const key = id * 16 + grade;
  let v = m.get(key);
  if (!v) m.set(key, (v = mergeNeed(c.config.requireCookbook(id).needFoods[grade] ?? [])));
  return v;
}

// ---------- 商店（shop/service.ts） ----------

function storeKinds(c: FastCtx, r: FastRest): number {
  let n = 0;
  for (const [id, s] of r.store) {
    if (s.num <= 0) continue;
    if (c.config.requireGoods(id).type === GOODS_TYPE.honor) continue;
    n += 1;
  }
  return n;
}

/** 勋章、牌匾只能一个一个买；永久的已拥有就不能再买；其他道具受持有上限和仓库种数限制（assertBuyable） */
function buyable(c: FastCtx, r: FastRest, g: Goods, num: number): boolean {
  const plaque = g.type === GOODS_TYPE.device && g.deviceType === DEVICE_TYPE.plaque;
  const honor = g.type === GOODS_TYPE.honor;
  if ((plaque || honor || !g.stackable) && num > 1) return false;
  const have = countGoods(c, r, g.id);
  const permanent = plaque || (honor && g.invalidHours === null);
  if (permanent && have > 0) return false;
  if (!plaque && !honor && have + num > g.maxNum) return false;
  if (!honor && have === 0 && storeKinds(c, r) >= r.storeNum) return false;
  return true;
}

function shopBuy(c: FastCtx, r: FastRest, goodsId: number, num: number): boolean {
  const g = c.config.requireGoods(goodsId);
  if (!g.onSale || g.coin <= 0 || !buyable(c, r, g, num)) return false;
  // 流出按用途分（问题记录 240）
  const use =
    g.id === GOODS.starCert
      ? 'shop.cert'
      : g.id === GOODS.tableA
        ? 'shop.table'
        : g.type === GOODS_TYPE.device
          ? 'shop.device'
          : 'shop.other';
  if (!spendCoin(c, r, g.coin * num, use)) return false;
  grantGoods(c, r, g.id, num, 'shop');
  action(c, r, 'shop.buy');
  return true;
}

function buyBlack(c: FastCtx, r: FastRest, goodsId: number, num: number): boolean {
  const g = c.config.requireGoods(goodsId);
  if (!c.config.bundle.shopPools.black.includes(g.id) || g.diamond <= 0 || !buyable(c, r, g, num))
    return false;
  if (!spendDiamond(c, r, g.diamond * num)) return false;
  grantGoods(c, r, g.id, num, 'shop');
  return true;
}

// ---------- 用道具（store/use.ts） ----------

function addTables(c: FastCtx, r: FastRest, num: number): boolean {
  const perFloor = c.tuning.rest.tablesPerFloor;
  const cap = Math.min(r.tableNum, (r.star + 1) * perFloor);
  const count = r.tables.length;
  if (count + num > cap) return false;
  for (let i = 0; i < num; i++) {
    const no = count + i + 1;
    r.tables.push({ no, floor: Math.floor((no - 1) / perFloor) + 1, customer: 0 });
  }
  return true;
}

function useGoods(c: FastCtx, r: FastRest, g: Goods, num: number): boolean {
  const use = g.use;
  if (!use || num <= 0) return false;
  if (use.kind === 'addTable') {
    const cap = Math.min(r.tableNum, (r.star + 1) * c.tuning.rest.tablesPerFloor);
    if (r.tables.length + num > cap) return false;
  }
  if (use.kind === 'cupboardNum' && r.cupboardNum >= c.config.foods.size) return false;
  if (!consumeGoods(c, r, g.id, num)) return false;
  switch (use.kind) {
    case 'currency':
      gainCoin(c, r, use.coin * num, 'other');
      gainDiamond(c, r, use.diamond * num, 'other');
      break;
    case 'addTable':
      addTables(c, r, num);
      break;
    case 'mysteryFood': {
      const list = c.config.foodsByLevel.get(use.level) ?? [];
      for (let i = 0; i < num && list.length > 0; i++) addFoods(c, r, list[c.rng.int(list.length)]!.id, 1);
      break;
    }
    case 'randomFood': {
      // 和 store/use.ts 一样按掉落权重抽（问题记录 331）
      const pool = c.config.foodPools.get(use.level);
      for (let i = 0; i < num && pool && pool.total > 0; i++) addFoods(c, r, pickWeighted(pool, c.rng).id, 1);
      break;
    }
    case 'lockSlots':
      r.foodsLockNum += use.amount * num;
      break;
    case 'foodsMax':
      r.foodsMaxNum += use.amount * num;
      break;
    case 'storeNum':
      r.storeNum += use.amount * num;
      break;
    case 'cupboardNum':
      r.cupboardNum = Math.min(r.cupboardNum + use.amount * num, c.config.foods.size);
      break;
    case 'gift':
      openGift(c, r, g, num, 'gift');
      break;
    default:
      break;
  }
  return true;
}

// ---------- 设施（growth/devices.ts） ----------

export function placeDevice(c: FastCtx, r: FastRest, slot: number, goodsId: number): boolean {
  const g = c.config.requireGoods(goodsId);
  if (g.deviceType === DEVICE_TYPE.plaque) {
    if (countGoods(c, r, goodsId) < 1) return false;
    for (const [s, d] of r.devices) if (s !== slot && d.goodsId === goodsId) return false;
  } else if (!consumeGoods(c, r, goodsId, 1)) return false;
  const hours = deviceHours(g);
  const ext = aggOf(c, r).extendTimeRate ?? 0;
  const expiresAt =
    hours === null ? null : new Date(c.now.getTime() + Math.round(hours * (1 + ext) * 3600_000));
  r.devices.set(slot, { goodsId, expiresAt });
  const { time: _time, ...effects } = g.effects;
  r.effects = r.effects.filter((e) => !(e.sourceType === 'device' && e.sourceId === slot));
  r.effects.push({ sourceType: 'device', sourceId: slot, effects, expiresAt });
  r.aggDirty = true;
  action(c, r, 'device.place');
  return true;
}

// ---------- 学菜（cookbook/service.ts） ----------

function learn(c: FastCtx, r: FastRest, id: number): boolean {
  const cb = c.config.requireCookbook(id);
  // 和真实接口一样只能学、升级本街的菜（问题记录 312）
  if (cb.streetId !== r.streetId) return false;
  const from = r.levels[id] ?? 0;
  const to = from + 1;
  if (to > c.tuning.rest.cookbookMaxGrade) return false;
  const plan = planLearn(mergedNeed(c, id, to), haveFood(r), levelOfFood(c));
  if (plan.kind === 'none') return false;
  for (const x of plan.consume) subFoods(c, r, x.foodsId, x.num);
  r.levels[id] = to;
  if (from === 0) r.lastFreshAt = c.now;
  r.counts = applyLearn(r.counts, cb.streetId, from, to);
  r.levelsVersion += 1;
  action(c, r, 'cookbook.learn');
  return true;
}

export function learnable(c: FastCtx, r: FastRest, street: number): number[] {
  const max = c.tuning.rest.cookbookMaxGrade;
  const have = haveFood(r);
  const lv = levelOfFood(c);
  const rows = (c.config.cookbookIndex.idsByStreet.get(street) ?? []).map((id) => {
    const grade = r.levels[id] ?? 0;
    if (grade >= max) return { id, grade, learn: 'max', next: 0 };
    const need = mergedNeed(c, id, grade + 1);
    return { id, grade, learn: learnTypeOf(planLearn(need, have, lv)), next: need.length };
  });
  const sort = (xs: typeof rows) =>
    xs.sort(
      (a, b) =>
        LEARN_ORDER[a.learn]! - LEARN_ORDER[b.learn]! || a.grade - b.grade || a.next - b.next || a.id - b.id,
    );
  const can = (x: (typeof rows)[number]) => x.learn !== 'z' && x.learn !== 'max';
  const fresh = sort(rows.filter((x) => can(x) && x.grade === 0));
  const up = sort(rows.filter((x) => can(x) && x.grade > 0));
  return [...fresh, ...up].slice(0, 20).map((x) => x.id);
}

/** 把所有食谱学到 1 品级还需要的食材总量；只在学菜后变化，按 levelsVersion 缓存（性能） */
function foodsNeed(c: FastCtx, r: FastRest): Map<number, number> {
  // 只算本街的菜（问题记录 312：别的街学不了）
  const version = `${r.levelsVersion}:${r.streetId}`;
  if (r.needCache?.version === version) return r.needCache.need;
  const need = foodsNeedFor(
    c.config.cookbookIndex.idsByStreet.get(r.streetId) ?? [],
    r.levels,
    Math.min(1, c.tuning.rest.cookbookMaxGrade),
    needOf(c),
  );
  r.needCache = { version, need };
  return need;
}

function foodsLack(c: FastCtx, r: FastRest): Map<number, number> {
  const need = foodsNeed(c, r);
  const lack = new Map<number, number>();
  for (const [id, n] of need) {
    const l = n - foodNum(r, id);
    if (l > 0) lack.set(id, l);
  }
  return lack;
}

// ---------- 搬街（growth/service.ts 的 move） ----------

/** 本街连续这么久没学到新菜，就当这条街学不动了 */
const STALE_MS = 3 * 86_400_000;

/** 搬街：有搬家处工作证免卡，否则用搬家卡（没有就花钻石在黑市买一张）；付 餐桌数 × 餐桌A 半价，幸运时再减半；换街道勋章 */
function moveStreet(c: FastCtx, r: FastRest, streetId: number): boolean {
  const cfg = c.config;
  const job = countGoods(c, r, GOODS.moveJobHonor) > 0;
  let cost = Math.floor(r.tables.length * (cfg.requireGoods(GOODS.tableA).coin / 2));
  if (r.coin < cost) return false;
  if (!job && countGoods(c, r, GOODS.moveCard) === 0 && !buyBlack(c, r, GOODS.moveCard, 1)) return false;
  if (!job) consumeGoods(c, r, GOODS.moveCard, 1);
  if (c.rng.chance(luckOf(c, r).rate)) cost = Math.floor(cost / 2);
  spendCoin(c, r, cost, 'move');
  const old = cfg.streetMedalId(r.streetId);
  r.store.delete(old);
  r.effects = r.effects.filter((e) => !(e.sourceType === 'street' && e.sourceId === old));
  r.aggDirty = true;
  grantGoods(c, r, cfg.streetMedalId(streetId), 1, 'move');
  r.streetId = streetId;
  r.lastFreshAt = c.now;
  r.learnIdleKey = '';
  action(c, r, 'rest.move');
  return true;
}

/**
 * 什么时候搬（快速模型的假设，问题记录 240 报告）：下一星还差食谱数，而本街没学过的菜学完了、
 * 或者连续 3 天没学到新菜，就搬到没学过的菜最多的街
 */
function maybeMove(c: FastCtx, r: FastRest): boolean {
  const need = c.config.starNeed.get(r.star + 1);
  if (!need || need.cookbooksKind !== 'learned' || r.counts.learned >= need.needCookbooks) return false;
  const byStreet = c.config.cookbookIndex.idsByStreet;
  const fresh = (street: number) => (byStreet.get(street) ?? []).filter((id) => !r.levels[id]).length;
  r.lastFreshAt ??= c.now;
  const stale = c.now.getTime() - r.lastFreshAt.getTime() >= STALE_MS;
  if (fresh(r.streetId) > 0 && !stale) return false;
  let target = -1;
  let best = 0;
  for (const id of [...byStreet.keys()].sort((a, b) => a - b)) {
    if (id === r.streetId) continue;
    const n = fresh(id);
    if (n > best) {
      best = n;
      target = id;
    }
  }
  return target >= 0 && moveStreet(c, r, target);
}

// ---------- 卡点 ----------

/** 升不了下一星的原因：level / cookbooks / certs / coin / foods:<食材名>（最多 3 种） */
export function starBlockers(c: FastCtx, r: FastRest): string[] {
  const need = c.config.starNeed.get(r.star + 1);
  if (!need) return [];
  const coin = starCoinOf(c.tuning.growth, r.star + 1);
  const checks = starChecks(
    { level: r.level, coin: r.coin },
    r.counts,
    countGoods(c, r, GOODS.starCert),
    need,
    coin,
  );
  const out: string[] = [];
  for (const ch of checks) {
    if (ch.ok) continue;
    if (ch.key === 'level') out.push('level');
    if (ch.key === 'cookbooks') {
      out.push('cookbooks');
      const lack = [...foodsLack(c, r)].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3);
      for (const [id] of lack) out.push(`foods:${c.config.requireFood(id).name}`);
    }
    if (ch.key === 'goods') {
      out.push('certs');
      const cert = c.config.requireGoods(GOODS.starCert);
      if (r.coin < cert.coin * (ch.need - ch.have)) out.push('coin');
    }
    if (ch.key === 'coin' && !out.includes('coin')) out.push('coin');
  }
  return out;
}

/**
 * 一次上线（照搬 sim/bot.ts 的 botTurn，顺序相同）：
 * 签到 → 旁支 → 用道具 → 加点 → 加油 → 灭蟑螂 → 任务和活跃 → 摆设施 → 升星 / 扩油壶 → 买桌子 → 买菜 → 学食谱 → 合成多余食材
 */
export function botTurn(
  c0: FastCtx,
  bot: FastBot,
  m: FastMarket,
  w: FastWorld,
  side: SideTable | null,
): void {
  const c: FastCtx = { ...c0, rng: bot.rng };
  const r = bot.rest;
  const cfg = c.config;

  // 签到（task/service.ts 的 signIn）
  if ((r.daily.get('signin') ?? 0) === 0) {
    r.daily.set('signin', 1);
    grantGoods(c, r, GOODS.signInGift, 1, 'signin');
    action(c, r, 'signin');
  }

  // 旁支产出：每天第一次上线时发（设计 §5.2）
  const today = gameDay(c.now);
  if (side && bot.lastSideDay !== today) {
    applySide(c, r, side, bot.persona.key);
    bot.lastSideDay = today;
  }

  // 用道具：餐桌A一张张用；其他"直接用掉"的一次最多 maxBatch 个
  for (const [id] of [...r.store]) {
    const g = cfg.requireGoods(id);
    const use = g.use;
    if (!use) continue;
    const have = countGoods(c, r, id);
    if (have <= 0) continue;
    if (use.kind === 'addTable') {
      for (let i = 0; i < have; i++) if (!useGoods(c, r, g, 1)) break;
      continue;
    }
    if (!USE_ALL.has(use.kind)) continue;
    useGoods(c, r, g, Math.min(have, c.tuning.store.maxBatch));
  }

  // 加点：全加厨艺
  if (r.attrLeft > 0) {
    r.attrCook += r.attrLeft;
    r.attrLeft = 0;
    action(c, r, 'attr.allocate');
  }

  // 加油（growth.refuel）：油少于六成时加，钱不够有多少加多少；加了油就复业
  if (r.oil < r.oilMax * 0.6) {
    const add = Math.min(r.oilMax - r.oil, r.coin);
    if (add > 0) {
      spendCoin(c, r, add, 'oil');
      gainOil(c, r, add);
      if (r.state === 2) r.state = 1;
      action(c, r, 'oil.fill');
    }
  }

  // 灭自己店的蟑螂（interact/roach.ts 的 killIn，place = self）
  const rt = c.tuning.friend.roach;
  for (const tb of [...r.tables]) {
    if (tb.customer !== 3) continue;
    const agg = aggOf(c, r);
    let strength = killStrength('self', agg, gameParts(c.now).hour, rt);
    if (strength > 0 && c.rng.chance(agg.killRoachNoStrengthRate ?? 0)) strength = 0;
    if (!spendStrength(c, r, strength)) break;
    r.tables = r.tables.map((x) => (x.no === tb.no ? clearTable(x) : x));
    const rw = killReward(r.level, 'self', agg, rt);
    gainCoin(c, r, rw.coin, 'roach');
    gainExp(c, r, rw.exp, 'roach');
    if (c.rng.chance(rt.ticketRate + luckOf(c, r).rate / 2))
      grantGoods(c, r, GOODS.mysteryTicket, c.rng.intMin1(rt.ticketMax), 'roach');
    r.daily.set('roach.kill', (r.daily.get('roach.kill') ?? 0) + 1);
    action(c, r, 'roach.kill');
  }

  // 任务（task/service.ts，问题记录 318）：主线、支线当前档、章末能领就领；功能都按开着算；
  // 快速模型没有的状态（好友数等）按 0。每周任务不模拟：快速模型按天跑，周常收益小，先不算
  const { chapters, quests, questLines } = cfg.bundle;
  const counters = Object.fromEntries(r.counters);
  const extra = { ...TASK_EXTRA, 'cookbooks.foreignLearned': foreignLearned(r.counts.street) };
  const qctx: QuestCtx = {
    level: r.level,
    star: r.star,
    done: r.questDone,
    available: () => true,
    progress: (q) =>
      q.kind === 'counter'
        ? counterOf(q.key, counters)
        : (stateValue(
            q.key,
            { level: r.level, star_level: r.star, oil_level: r.oilLevel },
            r.counts,
            extra,
          ) ?? 0),
  };
  for (let i = 0; i < 5; i++) {
    qctx.level = r.level;
    qctx.star = r.star;
    const v = mainView(chapters, quests, qctx);
    const lines = lineViews(questLines, quests, qctx, reachedChapter(v, chapters));
    const ready = [
      ...v.quests,
      ...lines.flatMap((l) => (l.quest && l.lockedStar === null ? [l.quest] : [])),
    ].filter((q) => !r.questDone.has(q.id) && qctx.progress(q.cond) >= q.cond.target);
    if (ready.length === 0 && !v.chapterClaimable) break;
    for (const q of ready) {
      grantAward(c, r, q.award, 'task');
      r.questDone.add(q.id);
    }
    if (v.chapterClaimable && v.chapter && ready.length === 0) {
      grantAward(c, r, v.chapter.award, 'task');
      r.questDone.add(CHAPTER_MARK + v.chapter.id);
    }
  }

  // 活跃奖励（claimActivation）：经验 × 等级；有效的爱心项链翻倍
  const acts = cfg.bundle.activationTasks.filter((a) => a.limitTimes > 0);
  const total = activationTotal(acts, new Map(acts.map((a) => [a.id, r.daily.get(`act:${a.id}`) ?? 0])));
  for (const rw of cfg.bundle.activationRewards) {
    const key = `act.claim:${rw.points}`;
    if ((r.daily.get(key) ?? 0) > 0 || total < rw.points) continue;
    r.daily.set(key, 1);
    const award: Award = rw.award.exp ? { ...rw.award, exp: rw.award.exp * r.level } : rw.award;
    grantAward(c, r, award, 'activation', countGoods(c, r, GOODS.loveNecklace) > 0 ? 2 : 1);
  }

  // 摆设施：空着的、已解锁的格子；仓库没有时钱够就买便宜货
  const ownedDevices = [...r.store.keys()]
    .sort((a, b) => a - b)
    .filter((id) => cfg.requireGoods(id).type === GOODS_TYPE.device);
  for (const dev of [...cfg.devices.values()].sort((a, b) => a.id - b.id)) {
    if (r.star < dev.needStar || (dev.id === 7 && !r.plaque2Open)) continue;
    const cur = r.devices.get(dev.id);
    if (cur && (!cur.expiresAt || cur.expiresAt > c.now)) continue;
    let goodsId = ownedDevices.find(
      (id) => cfg.requireGoods(id).deviceType === dev.deviceType && countGoods(c, r, id) > 0,
    );
    const cheap = CHEAP_DEVICES[dev.deviceType];
    if (goodsId === undefined && cheap !== undefined && r.coin > 50_000 && shopBuy(c, r, cheap, 1))
      goodsId = cheap;
    if (goodsId !== undefined) placeDevice(c, r, dev.id, goodsId);
  }

  // 升星：只差凭证和升星银币时，钱够就买凭证、付银币升星；钱不够就把这笔钱攒下来（240-1）
  let saving = 0;
  const starNeed = cfg.starNeed.get(r.star + 1);
  if (starNeed && starNeed.cookbooksKind === 'learned') {
    const starCoin = starCoinOf(c.tuning.growth, r.star + 1);
    const checks = starChecks(
      { level: r.level, coin: r.coin },
      r.counts,
      countGoods(c, r, GOODS.starCert),
      starNeed,
      starCoin,
    );
    const cert = checks.find((x) => x.key === 'goods');
    const others = checks.filter((x) => x.key !== 'goods' && x.key !== 'coin').every((x) => x.ok);
    if (others) {
      const num = cert && !cert.ok ? cert.need - cert.have : 0;
      const cost = cfg.requireGoods(GOODS.starCert).coin * num + starCoin;
      if (r.coin < cost || (num > 0 && !shopBuy(c, r, GOODS.starCert, num))) saving = cost;
      else if (consumeGoods(c, r, GOODS.starCert, starNeed.needCerts)) {
        spendCoin(c, r, starCoin, 'star');
        r.star += 1;
        const award = cfg.starAward.get(r.star);
        if (award) grantAward(c, r, award, 'star');
      }
    }
  }

  // 扩油壶：等级星级够了就扩；钱不够时攒下来
  const oil = cfg.oilNeed.get(r.oilLevel + 1);
  if (saving === 0 && oil && r.level >= oil.needLevel && r.star >= oil.needStar) {
    const checks = oilChecks(
      { level: r.level, star_level: r.star, coin: r.coin },
      (id) => countGoods(c, r, id),
      oil,
    );
    const lacking = checks.filter((x) => x.key === 'goods' && !x.ok);
    const goodsCost = lacking.reduce((s, x) => s + cfg.requireGoods(x.id!).coin * (x.need - x.have), 0);
    const cost = oil.needCoin + goodsCost;
    if (r.coin >= cost) {
      for (const x of lacking) {
        const g = cfg.requireGoods(x.id!);
        if (g.onSale) shopBuy(c, r, g.id, x.need - x.have);
        else buyBlack(c, r, g.id, x.need - x.have);
      }
      const ok =
        oil.needGoods.every((g) => countGoods(c, r, g.id) >= g.num) &&
        countGoods(c, r, GOODS.purpleShell) >= oil.needPurpleShells &&
        r.coin >= oil.needCoin;
      if (ok) {
        for (const g of oil.needGoods) consumeGoods(c, r, g.id, g.num);
        consumeGoods(c, r, GOODS.purpleShell, oil.needPurpleShells);
        spendCoin(c, r, oil.needCoin, 'oil.expand');
        r.oilLevel = oil.level;
        r.oilMax = oil.oilMax;
      }
    } else saving = cost;
  }

  // 买桌子：留出加满油、2 万和要攒的钱
  const tableCap = Math.min(r.tableNum, (r.star + 1) * c.tuning.rest.tablesPerFloor);
  const tableA = cfg.requireGoods(GOODS.tableA);
  const tables = Math.min(
    tableCap - r.tables.length,
    Math.floor((r.coin - r.oilMax - 20_000 - saving) / Math.max(1, tableA.coin)),
  );
  if (tables > 0 && shopBuy(c, r, tableA.id, tables))
    for (let i = 0; i < tables; i++) if (!useGoods(c, r, tableA, 1)) break;

  // 买菜：学所有食谱到 1 品级还缺的；先日常后特价；然后报名竞猜
  const lack = foodsLack(c, r);
  const reserve = r.oilMax + 20_000 + saving;
  const t = c.tuning.market;
  for (const shelf of [0, 1] as const) {
    for (const it of m.items.filter((x) => x.shelf === shelf)) {
      const want = lack.get(it.foodsId) ?? 0;
      if (want <= 0) continue;
      const food = cfg.requireFood(it.foodsId);
      const limit = personLimit(it.shelf, food, it.openedAt, c.now, t);
      const room = Math.min(limit - (it.bought.get(r.id) ?? 0), it.stock - it.sold, want);
      const price = unitPrice(shelf, food, t, w.weather);
      const affordable = Math.floor((r.coin - reserve) / Math.max(1, price));
      const num = Math.min(room, affordable);
      if (num > 0 && marketBuy(c, r, m, it.id, num, w.weather)) lack.set(it.foodsId, want - num);
    }
  }
  const period = nextSlot(c.now, t.dailyHours).key;
  const daily = m.items.filter((x) => x.shelf === 0);
  if (m.guesses.get(r.id)?.period !== period && daily.length > 0) {
    const pick = daily
      .map((x) => x.foodsId)
      .filter((id) => cfg.bundle.marketGuessFoods.includes(id))
      .slice(0, t.guessMaxPick);
    if (pick.length > 0) joinGuess(c, r, m, pick);
  }

  // 本街学不动了就搬街（只能学本街的菜，问题记录 312）
  maybeMove(c, r);

  // 学食谱：每条街先学新的、再升级学过的，最多 20 个
  // 上次一道都没学到、橱柜和食谱都没变时，结果一样，跳过（性能）
  const idleKey = `${r.foodsVersion}:${r.levelsVersion}`;
  if (r.learnIdleKey !== idleKey) {
    let learned = 0;
    for (const id of learnable(c, r, r.streetId)) if (learn(c, r, id)) learned += 1;
    r.learnIdleKey = learned === 0 ? `${r.foodsVersion}:${r.levelsVersion}` : '';
  }

  // 合成多余食材：只用当天的免体力次数，把学菜用不到的 1~4 级食材合成上去
  const cup = c.tuning.cupboard;
  let free = cup.freeHandleBase + cup.freeHandlePerStar * r.star - (r.daily.get('handle') ?? 0);
  const need = foodsNeed(c, r);
  for (const [id, have] of [...r.foods].sort((a, b) => a[0] - b[0])) {
    if (free <= 0) break;
    const food = cfg.foods.get(id);
    if (!food || food.level < 1 || food.level > 4) continue;
    const surplus = have - (need.get(id) ?? 0) - 5;
    const num = Math.min(100, surplus - (surplus % 2));
    if (num < 2 || r.coin <= 0) continue;
    const target = handleTargetLevel('compose', food.level);
    if (target === null) continue;
    subFoods(c, r, id, num);
    r.daily.set('handle', (r.daily.get('handle') ?? 0) + 1);
    const agg = aggOf(c, r);
    const out = runHandle(
      {
        way: 'compose',
        num,
        star: r.star,
        foodCoin: food.coin,
        weatherRate: w.weather.foodsOperRate ?? 0,
        luckRate: luckOf(c, r).rate,
        extraRate: agg.composeFoodsRate ?? 0,
        tuning: c.tuning,
      },
      // 和真实合成一样不抽已经堆满的食材（问题记录 290）
      composePool(cfg.foodPools.get(target)!, (fid) => (r.foods.get(fid) ?? 0) >= r.foodsMaxNum),
      c.rng,
    );
    for (const p of out.picks) addFoods(c, r, p, 1);
    gainCoin(c, r, out.failCoin, 'other');
    action(c, r, 'foods.handle');
    free -= 1;
  }
}

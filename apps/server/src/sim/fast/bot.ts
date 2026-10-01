import { deviceHours, DEVICE_TYPE, GOODS, GOODS_TYPE, type Award, type Goods } from '@dt/config';
import { gameDay, gameParts, nextSlot, type Rng } from '@dt/shared';
import { applyLearn, foodsNeedFor, learnTypeOf, mergeNeed, planLearn } from '../../modules/cookbook/rules';
import { handleTargetLevel, runHandle } from '../../modules/cupboard/rules';
import { oilChecks, starChecks } from '../../modules/growth/rules';
import { clearTable } from '../../modules/interact/tables';
import { killReward, killStrength } from '../../modules/interact/rules';
import { personLimit, unitPrice } from '../../modules/market/rules';
import { activationTotal, effectiveMainStep, stateValue, visibleSide } from '../../modules/task/rules';
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
  if (!spendCoin(c, r, g.coin * num)) return false;
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

function placeDevice(c: FastCtx, r: FastRest, slot: number, goodsId: number): boolean {
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
  const from = r.levels[id] ?? 0;
  const to = from + 1;
  if (to > c.tuning.rest.cookbookMaxGrade) return false;
  const plan = planLearn(cb.needFoods[to] ?? [], haveFood(r), levelOfFood(c));
  if (plan.kind === 'none') return false;
  for (const x of plan.consume) subFoods(c, r, x.foodsId, x.num);
  r.levels[id] = to;
  r.counts = applyLearn(r.counts, cb.streetId, from, to);
  action(c, r, 'cookbook.learn');
  return true;
}

function learnable(c: FastCtx, r: FastRest, street: number): number[] {
  const max = c.tuning.rest.cookbookMaxGrade;
  const rows = (c.config.cookbookIndex.idsByStreet.get(street) ?? []).map((id) => {
    const grade = r.levels[id] ?? 0;
    if (grade >= max) return { id, grade, learn: 'max', next: 0 };
    const need = mergeNeed(needOf(c)(id, grade + 1));
    return { id, grade, learn: learnTypeOf(planLearn(need, haveFood(r), levelOfFood(c))), next: need.length };
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

function foodsLack(c: FastCtx, r: FastRest): Map<number, number> {
  const need = foodsNeedFor(
    c.config.cookbookIndex.allIds,
    r.levels,
    Math.min(1, c.tuning.rest.cookbookMaxGrade),
    needOf(c),
  );
  const lack = new Map<number, number>();
  for (const [id, n] of need) {
    const l = n - foodNum(r, id);
    if (l > 0) lack.set(id, l);
  }
  return lack;
}

// ---------- 卡点 ----------

/** 升不了下一星的原因：level / cookbooks / certs / coin / foods:<食材名>（最多 3 种） */
export function starBlockers(c: FastCtx, r: FastRest): string[] {
  const need = c.config.starNeed.get(r.star + 1);
  if (!need) return [];
  const checks = starChecks({ level: r.level }, r.counts, countGoods(c, r, GOODS.starCert), need);
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

  // 任务（task/service.ts）：功能都按开着算；快速模型没有的状态（好友数等）按 0
  const tasks = cfg.bundle.tasks;
  const mains = tasks.filter((t) => t.main).sort((a, b) => a.step - b.step);
  const all = () => true;
  for (let i = 0; i < 5; i++) {
    const mainStep = effectiveMainStep(r.mainTaskStep, mains, all);
    const main = mains.find((t) => t.step === mainStep);
    const sides = visibleSide(tasks, mainStep, r.tasksDone, all);
    const progressOf = (t: (typeof tasks)[number]) =>
      t.cond.kind === 'counter'
        ? (r.counters.get(t.cond.key) ?? 0)
        : (stateValue(
            t.cond.key,
            { level: r.level, star_level: r.star, oil_level: r.oilLevel },
            r.counts,
            TASK_EXTRA,
          ) ?? 0);
    const done = [...(main ? [main] : []), ...sides].filter((t) => progressOf(t) >= t.cond.target);
    if (done.length === 0) break;
    for (const t of done) {
      grantAward(c, r, t.award, 'task');
      if (t.main) r.mainTaskStep = t.step + 1;
      else r.tasksDone.add(t.id);
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
  for (const dev of [...cfg.devices.values()].sort((a, b) => a.id - b.id)) {
    if (r.star < dev.needStar || (dev.id === 7 && !r.plaque2Open)) continue;
    const cur = r.devices.get(dev.id);
    if (cur && (!cur.expiresAt || cur.expiresAt > c.now)) continue;
    let goodsId = [...r.store.keys()]
      .sort((a, b) => a - b)
      .find((id) => {
        const g = cfg.requireGoods(id);
        return g.type === GOODS_TYPE.device && g.deviceType === dev.deviceType && countGoods(c, r, id) > 0;
      });
    const cheap = CHEAP_DEVICES[dev.deviceType];
    if (goodsId === undefined && cheap !== undefined && r.coin > 50_000 && shopBuy(c, r, cheap, 1))
      goodsId = cheap;
    if (goodsId !== undefined) placeDevice(c, r, dev.id, goodsId);
  }

  // 升星：只差凭证时钱够就买，钱不够把凭证钱攒下来
  let saving = 0;
  const starNeed = cfg.starNeed.get(r.star + 1);
  if (starNeed && starNeed.cookbooksKind === 'learned') {
    const checks = starChecks({ level: r.level }, r.counts, countGoods(c, r, GOODS.starCert), starNeed);
    const cert = checks.find((x) => x.key === 'goods');
    const others = checks.filter((x) => x.key !== 'goods').every((x) => x.ok);
    if (others && cert && !cert.ok) {
      const num = cert.need - cert.have;
      if (!shopBuy(c, r, GOODS.starCert, num)) saving = cfg.requireGoods(GOODS.starCert).coin * num;
    }
    if (others && consumeGoods(c, r, GOODS.starCert, starNeed.needCerts)) {
      r.star += 1;
      const award = cfg.starAward.get(r.star);
      if (award) grantAward(c, r, award, 'star');
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

  // 学食谱：每条街先学新的、再升级学过的，最多 20 个
  for (let street = 0; street <= 13; street++) for (const id of learnable(c, r, street)) learn(c, r, id);

  // 合成多余食材：只用当天的免体力次数，把学菜用不到的 1~4 级食材合成上去
  const cup = c.tuning.cupboard;
  let free = cup.freeHandleBase + cup.freeHandlePerStar * r.star - (r.daily.get('handle') ?? 0);
  const need = foodsNeedFor(cfg.cookbookIndex.allIds, r.levels, 1, needOf(c));
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
      cfg.foodPools.get(target)!,
      c.rng,
    );
    for (const p of out.picks) addFoods(c, r, p, 1);
    gainCoin(c, r, out.failCoin, 'other');
    action(c, r, 'foods.handle');
    free -= 1;
  }
}

import { handleStrength } from '../modules/cupboard/rules';
import { GOODS, type GoodsUse } from '@dt/config';
import type { RestCtx } from '../core/deps';
import type { Game } from '../game';
import { AppError } from '../http/errors';
import { gradeOf } from '../modules/cookbook/rules';
import { starNeedOf } from '../modules/growth/rules';
import type { SimEnv } from './env';

export interface Persona {
  key: 'diligent' | 'normal' | 'casual';
  label: string;
  /** 每天在这些整点上线 */
  hours: number[];
}

export const PERSONAS: Persona[] = [
  { key: 'diligent', label: '勤快', hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
  { key: 'normal', label: '普通', hours: [9, 13, 20] },
  { key: 'casual', label: '休闲', hours: [20] },
];

/** 在新手街到这个等级就搬走（2026-10-12 线上核对：搬离新手街时 5~19 级，中位 13 级）；快速模型用同一个 */
export const LEAVE_NEWBIE_LEVEL = 13;
/** 缺 1 个 L+1 级食材，买这么多个 L 级的去合成：2 个合 1 次，按权重随机抽、缺料倾向弱，约 3 次才中 1 个要的 */
export const FEED_PER_LACK = 6;
/** 学菜要用的食材，合成时在需要量之外再留几个；用不到的不留 */
const KEEP_EACH = 5;
export const spareOf = (have: number, need: number): number => have - need - (need > 0 ? KEEP_EACH : 0);
/** 免体力次数用完后花体力合成时留着的体力（灭蟑螂用） */
export const HANDLE_KEEP_STRENGTH = 20;

/** 按食材等级汇总缺口 */
export function lackByLevel(
  levelOf: (id: number) => number,
  lack: Iterable<[number, number]>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [id, n] of lack) if (n > 0) out.set(levelOf(id), (out.get(levelOf(id)) ?? 0) + n);
  return out;
}

/**
 * 每级还要买多少原料（2026-10-12 线上核对：活跃玩家大量买 1、2 级食材合成上去）：
 * 上一级的缺口 × FEED_PER_LACK，减去这一级已有的可合成的量；只算 1~4 级
 */
export function feedWant(
  levelOf: (id: number) => number,
  lack: Iterable<[number, number]>,
  foods: Iterable<[number, number]>,
  need: (id: number) => number,
): Map<number, number> {
  const lackLv = lackByLevel(levelOf, lack);
  const spare = new Map<number, number>();
  for (const [id, have] of foods) {
    const n = spareOf(have, need(id));
    if (n > 0) spare.set(levelOf(id), (spare.get(levelOf(id)) ?? 0) + n);
  }
  const out = new Map<number, number>();
  for (let lv = 1; lv <= 4; lv++) {
    const want = (lackLv.get(lv + 1) ?? 0) * FEED_PER_LACK - (spare.get(lv) ?? 0);
    if (want > 0) out.set(lv, want);
  }
  return out;
}

export interface Bot {
  name: string;
  persona: Persona;
  ctx: RestCtx;
  /** 搬街判断用：上次看到的学会食谱数、最近一次学到新菜（或搬街）的时间 */
  lastLearned?: number;
  lastFreshAt?: Date;
}

export async function createBots(
  env: SimEnv,
  personaKeys: Persona['key'][],
  perPersona: number,
): Promise<Bot[]> {
  const bots: Bot[] = [];
  let i = 0;
  for (const persona of PERSONAS.filter((p) => personaKeys.includes(p.key))) {
    for (let k = 1; k <= perPersona; k++) {
      i += 1;
      const acc = await env.deps.db
        .insertInto('account')
        .values({
          username: `bot${i}`,
          password_hash: 'x',
          email: `bot${i}@sim.local`,
          email_verified_at: env.clock.now(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const restId = await env.game.restaurant.open(acc.id, env.shardId, `${persona.label}${k}号`);
      bots.push({
        name: `${persona.label}${k}`,
        persona,
        // 每个机器人独立的 IP 和设备，避免菜场按 IP 限购时互相影响
        ctx: {
          accountId: acc.id,
          shardId: env.shardId,
          restaurantId: restId,
          ip: `10.0.${i >> 8}.${i & 255}`,
          deviceId: `sim-bot-device-${i}`,
        },
      });
    }
  }
  return bots;
}

export interface TurnStats {
  actions: number;
  failures: number;
}

/** 直接用掉的道具用途 */
export const USE_ALL: ReadonlySet<GoodsUse['kind']> = new Set([
  'gift',
  'currency',
  'cupboardNum',
  'storeNum',
  'foodsMax',
  'lockSlots',
  'mysteryFood',
  'randomFood',
]);
/** 设施位没有设施时去商店买的便宜货：海报、奖杯、节油器 */
export const CHEAP_DEVICES: Record<number, number> = {
  1: GOODS.normalPoster,
  2: GOODS.bronzeTrophy,
  3: GOODS.midOilSaver,
};

type Attempt = (fn: () => Promise<unknown>) => Promise<boolean>;

/**
 * 一次上线（设计文档 §8.1）："认真但不刷极限"的固定策略：
 * 签到 → 用道具 → 加点 → 加油 → 领任务和活跃 → 摆设施 → 升星 / 扩油壶 → 买菜 → 学食谱 → 合成多余食材
 */
export async function botTurn(game: Game, bot: Bot): Promise<TurnStats> {
  const stats: TurnStats = { actions: 0, failures: 0 };
  const ctx = bot.ctx;
  const config = game.app.config;
  const attempt: Attempt = async (fn) => {
    try {
      await fn();
      stats.actions += 1;
      return true;
    } catch (e) {
      if (e instanceof AppError) {
        stats.failures += 1;
        return false;
      }
      throw e;
    }
  };
  const rest = () => game.restaurant.overview(ctx.restaurantId);

  await attempt(() => game.task.signIn(ctx));

  const store = await game.store.list(ctx, {});
  for (const it of store.items) {
    const use = config.requireGoods(it.goodsId).use;
    if (!use || !it.usable) continue;
    if (use.kind === 'addTable') {
      for (let i = 0; i < it.num; i++) {
        if (!(await attempt(() => game.store.use(ctx, { goodsId: it.goodsId, num: 1 })))) break;
      }
      continue;
    }
    if (!USE_ALL.has(use.kind)) continue;
    if (it.batch)
      await attempt(() => game.store.use(ctx, { goodsId: it.goodsId, num: Math.min(it.num, 99) }));
    else
      for (let i = 0; i < Math.min(it.num, 20); i++)
        await attempt(() => game.store.use(ctx, { goodsId: it.goodsId, num: 1 }));
  }

  let r = await rest();
  if (r.attrLeft > 0)
    await attempt(() => game.growth.allocate(ctx, { cook: r.attrLeft, cutting: 0, fire: 0 }));
  r = await rest();
  if (r.oil < r.oilMax * 0.6) await attempt(() => game.growth.refuel(ctx));
  // 自然蟑螂占着餐桌不走，有体力就灭掉（自己店不要求验证邮箱）
  for (const tb of await game.restaurant.floor(ctx.restaurantId)) {
    if (tb.customer !== 3) continue;
    if (!(await attempt(() => game.social.roach.kill(ctx, { restId: ctx.restaurantId, tableNo: tb.no }))))
      break;
  }

  for (let i = 0; i < 5; i++) {
    // 问题记录 318：主线、支线当前档、每周任务里达成没领的都领；本章领完领章末
    const t = await game.task.tasks(ctx);
    const ready = [...t.main, ...t.lines.map((l) => l.quest), ...(t.weekly?.quests ?? [])].filter(
      (x) => x && x.done && !x.claimed,
    );
    const chapter = t.chapter?.claimable ? t.chapter.id : null;
    const full = t.weekly?.full.claimable ? t.weekly.full.id : null;
    if (ready.length === 0 && chapter === null && full === null) break;
    for (const x of ready) await attempt(() => game.task.claimTask(ctx, x!.id));
    if (chapter !== null) await attempt(() => game.task.claimChapter(ctx, chapter));
    if (full !== null) await attempt(() => game.task.claimTask(ctx, full));
  }
  const act = await game.task.activation(ctx);
  for (const rw of act.rewards) {
    if (!rw.claimed && act.total >= rw.points) await attempt(() => game.task.claimActivation(ctx, rw.points));
  }

  const dev = await game.growth.devices(ctx);
  for (const slot of dev.slots) {
    if (!slot.unlocked || slot.goodsId !== null) continue;
    let goodsId = dev.store.find((x) => x.deviceType === slot.deviceType)?.goodsId;
    const cheap = CHEAP_DEVICES[slot.deviceType];
    if (goodsId === undefined && cheap !== undefined && (await rest()).coin > 50_000) {
      if (await attempt(() => game.shop.buy(ctx, { goodsId: cheap, num: 1 }))) goodsId = cheap;
    }
    if (goodsId !== undefined) {
      const g = goodsId;
      await attempt(() => game.growth.placeDevice(ctx, { slot: slot.slot, goodsId: g }));
    }
  }

  // 升星只差凭证和升星银币时：钱够就买凭证升星；钱不够就把钱攒下来，本次不再花在油壶、餐桌和菜场上（240-1）
  const star = await game.growth.starNeed(ctx);
  let saving = 0;
  if (star.available && star.nextStar !== null) {
    const cert = star.checks.find((c) => c.key === 'goods');
    const starCoin = star.checks.find((c) => c.key === 'coin')?.need ?? 0;
    const others = star.checks.filter((c) => c.key !== 'goods' && c.key !== 'coin').every((c) => c.ok);
    if (others) {
      const num = cert && !cert.ok ? cert.need - cert.have : 0;
      const cost = (num > 0 ? config.requireGoods(cert!.id!).coin * num : 0) + starCoin;
      if (
        (await rest()).coin < cost ||
        (num > 0 && !(await attempt(() => game.shop.buy(ctx, { goodsId: cert!.id!, num }))))
      )
        saving = cost;
      else await attempt(() => game.growth.starUp(ctx));
    }
  }

  // 扩油壶：等级和星级够了就扩；银币不够时把钱攒下来（油壶小，夜里没人上线会断油停业）
  const oil = await game.growth.oilNeed(ctx);
  const oilGate = oil.checks.filter((c) => c.key === 'level' || c.key === 'star').every((c) => c.ok);
  if (saving === 0 && oil.nextLevel !== null && oilGate) {
    const lacking = oil.checks.filter((x) => x.key === 'goods' && !x.ok);
    const goodsCost = lacking.reduce(
      (sum, c) => sum + config.requireGoods(c.id!).coin * (c.need - c.have),
      0,
    );
    const cost = (oil.checks.find((c) => c.key === 'coin')?.need ?? 0) + goodsCost;
    if ((await rest()).coin >= cost) {
      for (const c of lacking) {
        const g = config.requireGoods(c.id!);
        const num = c.need - c.have;
        if (g.onSale) await attempt(() => game.shop.buy(ctx, { goodsId: g.id, num }));
        else await attempt(() => game.shop.buyBlack(ctx, { goodsId: g.id, num }));
      }
      await attempt(() => game.growth.oilExpand(ctx));
    } else saving = cost;
  }

  // 升级只提高餐桌上限，实际的桌子去商店买餐桌A补上（设计文档 裁定 10）
  r = await rest();
  const tableCap = Math.min(r.tableNum, (r.starLevel + 1) * config.tuning.rest.tablesPerFloor);
  const tableA = config.requireGoods(GOODS.tableA);
  const tables = Math.min(
    tableCap - r.tables.length,
    Math.floor((r.coin - r.oilMax - 20_000 - saving) / Math.max(1, tableA.coin)),
  );
  if (tables > 0 && (await attempt(() => game.shop.buy(ctx, { goodsId: tableA.id, num: tables }))))
    for (let i = 0; i < tables; i++) await attempt(() => game.store.use(ctx, { goodsId: tableA.id, num: 1 }));

  await shopForFoods(game, bot, attempt, saving);

  await maybeMove(game, bot, attempt);

  {
    // 只能学本街的菜（问题记录 312）；可学（没学过的）和可升级（已学的）分开查，先学新的
    const q = { street: (await rest()).streetId, page: 1 } as const;
    const learnable = await game.cookbook.list(ctx, { ...q, filter: 'learnable' });
    const upgradable = await game.cookbook.list(ctx, { ...q, filter: 'upgradable' });
    for (const row of [...learnable.items, ...upgradable.items].slice(0, 20))
      await attempt(() => game.cookbook.learn(ctx, row.id));
    // 学到新菜的时间当场记下（快速模型在学的那一刻记），搬街判断两边才对得上
    await learnedNow(game, bot);
  }

  await composeSurplus(game, bot, attempt);
  return stats;
}

/** 买"把本街食谱学到 1 品级还缺"的食材（只能学本街的菜，问题记录 312）；留出加满一次油的钱和正在攒的钱 */
async function shopForFoods(game: Game, bot: Bot, attempt: Attempt, saving: number): Promise<void> {
  const ctx = bot.ctx;
  let r = await game.restaurant.overview(ctx.restaurantId);
  const need = await game.cookbook.foodsNeed(ctx, { target: 1, street: r.streetId });
  const lack = new Map(need.items.filter((x) => x.lack > 0).map((x) => [x.foodsId, x.lack]));
  const market = await game.market.view(ctx);
  const reserve = r.oilMax + 20_000 + saving;
  for (const it of [...market.daily, ...market.special]) {
    const want = lack.get(it.foodsId) ?? 0;
    const room = Math.min(it.limit - it.bought, it.left, want);
    const affordable = Math.floor((r.coin - reserve) / Math.max(1, it.price));
    const num = Math.min(room, affordable);
    if (num <= 0) continue;
    if (await attempt(() => game.market.buy(ctx, { itemId: it.id, num }))) {
      r = await game.restaurant.overview(ctx.restaurantId);
    }
  }
  // 原料：缺 L+1 级食材时，在日常货架多买 L 级的合成上去
  const config = game.app.config;
  const levelOf = (id: number) => config.foods.get(id)?.level ?? 0;
  const left = (await game.cookbook.foodsNeed(ctx, { target: 1, street: r.streetId })).items;
  const cup = await game.cupboard.list(ctx);
  const needOf = new Map(left.map((x) => [x.foodsId, x.need]));
  const feed = feedWant(
    levelOf,
    left.map((x) => [x.foodsId, x.lack] as [number, number]),
    cup.items.map((x) => [x.foodsId, x.num] as [number, number]),
    (id) => needOf.get(id) ?? 0,
  );
  const fresh = await game.market.view(ctx);
  for (const it of [...fresh.daily].sort(
    (a, b) => config.requireFood(a.foodsId).coin - config.requireFood(b.foodsId).coin || a.id - b.id,
  )) {
    const lv = levelOf(it.foodsId);
    const want = feed.get(lv) ?? 0;
    const room = Math.min(it.limit - it.bought, it.left, want);
    const num = Math.min(room, Math.floor((r.coin - reserve) / Math.max(1, it.price)));
    if (num <= 0) continue;
    if (await attempt(() => game.market.buy(ctx, { itemId: it.id, num }))) {
      feed.set(lv, want - num);
      r = await game.restaurant.overview(ctx.restaurantId);
    }
  }
  if (!market.guess.joined && market.daily.length > 0) {
    const pick = market.daily
      .map((x) => x.foodsId)
      .filter((id) => market.guess.pool.includes(id))
      .slice(0, market.guess.maxPick);
    if (pick.length > 0) await attempt(() => game.market.joinGuess(ctx, pick));
  }
}

/** 本街连续这么久没学到新菜，就当这条街学不动了（和快速模型 sim/fast/bot.ts 一致） */
const STALE_MS = 3 * 86_400_000;

/** 读学会的食谱；比上次多了就把"最近学到新菜"记成现在 */
async function learnedNow(game: Game, bot: Bot): Promise<{ levels: Uint8Array; learned: number }> {
  const row = await game.app.db
    .selectFrom('restaurant_cookbooks')
    .select('levels')
    .where('rest_id', '=', bot.ctx.restaurantId)
    .executeTakeFirstOrThrow();
  const levels = new Uint8Array(row.levels);
  const learned = levels.reduce((n, g) => n + (g > 0 ? 1 : 0), 0);
  if (bot.lastFreshAt === undefined || learned > (bot.lastLearned ?? 0)) bot.lastFreshAt = game.app.now();
  bot.lastLearned = learned;
  return { levels, learned };
}

/**
 * 搬街（和快速模型同一规则，问题记录 240 报告；2026-10-12 按线上核对改）：新手街到 LEAVE_NEWBIE_LEVEL 级就搬；
 * 其他街下一星还差食谱数，而本街没学过的菜学完了、或者连续 3 天没学到新菜就搬。都搬到没学过的菜最多的街；
 * 没有搬家卡时花钻石在黑市买一张
 */
async function maybeMove(game: Game, bot: Bot, attempt: Attempt): Promise<void> {
  const ctx = bot.ctx;
  const config = game.app.config;
  const now = game.app.now();
  const { levels, learned } = await learnedNow(game, bot);
  const r = await game.restaurant.overview(ctx.restaurantId);
  const byStreet = config.cookbookIndex.idsByStreet;
  const fresh = (street: number) =>
    (byStreet.get(street) ?? []).filter((id) => !gradeOf(levels, config.cookbookIndex.slotOf, id)).length;
  if (r.streetId === 0) {
    if (r.level < LEAVE_NEWBIE_LEVEL) return;
  } else {
    const need = starNeedOf(config.starNeed, config.tuning.growth, r.starLevel + 1);
    if (!need || need.cookbooksKind !== 'learned' || learned >= need.needCookbooks) return;
    const stale = now.getTime() - (bot.lastFreshAt ?? now).getTime() >= STALE_MS;
    if (fresh(r.streetId) > 0 && !stale) return;
  }
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
  if (target < 0) return;
  const store = await game.store.list(ctx, {});
  if (!store.items.some((x) => x.goodsId === GOODS.moveCard && x.num > 0))
    await attempt(() => game.shop.buyBlack(ctx, { goodsId: GOODS.moveCard, num: 1 }));
  if (await attempt(() => game.growth.move(ctx, target))) bot.lastFreshAt = now;
}

/**
 * 合成（和快速模型一致）：用当天的免体力次数，把学食谱用不到的 1~4 级食材合成上去，先合上一级缺料的；
 * 免体力次数用完后，上一级缺料的花体力接着合（线上活跃玩家每天合成几十到几百次，2026-10-12 核对）。
 * 从没合成过时先合成 2 个，做主线"合成或分解一次食材"
 */
async function composeSurplus(game: Game, bot: Bot, attempt: Attempt): Promise<void> {
  const ctx = bot.ctx;
  const config = game.app.config;
  const cup = await game.cupboard.list(ctx);
  let free = cup.freeHandleLeft;
  const ov = await game.restaurant.overview(ctx.restaurantId);
  const streetId = ov.streetId;
  let strength = ov.strength;
  const need = await game.cookbook.foodsNeed(ctx, { target: 1, street: streetId });
  const needed = new Map(need.items.map((x) => [x.foodsId, x.need]));
  const levelOf = (id: number) => config.foods.get(id)?.level ?? 0;
  const lackLv = lackByLevel(
    levelOf,
    need.items.map((x) => [x.foodsId, x.lack] as [number, number]),
  );
  const up = (id: number) => Number((lackLv.get(levelOf(id) + 1) ?? 0) > 0);
  let first =
    (await game.app.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'foods.handle')
      .executeTakeFirst()) === undefined;
  for (const it of [...cup.items].sort((a, b) => up(b.foodsId) - up(a.foodsId) || a.foodsId - b.foodsId)) {
    const food = config.foods.get(it.foodsId);
    if (!food || food.level < 1 || food.level > 4) continue;
    const paid = free <= 0;
    if (paid && (!up(it.foodsId) || strength <= HANDLE_KEEP_STRENGTH)) continue;
    const surplus = spareOf(it.num, needed.get(it.foodsId) ?? 0);
    let num = first ? Math.min(2, it.num) : Math.min(100, surplus - (surplus % 2));
    // 花体力时合成出几个扣几点（2026-10-13），只花留给灭蟑螂以外的
    if (paid) num = Math.min(num, (strength - HANDLE_KEEP_STRENGTH) * 2);
    if (num < 2) continue;
    if (await attempt(() => game.cupboard.handle(ctx, { foodsId: it.foodsId, way: 'compose', num }))) {
      first = false;
      if (paid) strength -= handleStrength('compose', num);
      else free -= 1;
    }
  }
}

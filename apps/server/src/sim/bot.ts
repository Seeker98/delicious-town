import { GOODS, type GoodsUse } from '@dt/config';
import type { RestCtx } from '../core/deps';
import type { Game } from '../game';
import { AppError } from '../http/errors';
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

export interface Bot {
  name: string;
  persona: Persona;
  ctx: RestCtx;
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
]);
/** 设施位没有设施时去商店买的便宜货：海报、奖杯、节油器 */
export const CHEAP_DEVICES: Record<number, number> = { 1: 13, 2: 10, 3: 21 };

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
    const t = await game.task.tasks(ctx);
    const done = [t.main, ...t.side].filter((x) => x?.done);
    if (done.length === 0) break;
    for (const x of done) await attempt(() => game.task.claimTask(ctx, x!.id));
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

  // 升星只差凭证时：钱够就买凭证升星；钱不够就把凭证的钱攒下来，本次不再花在油壶、餐桌和菜场上
  const star = await game.growth.starNeed(ctx);
  let saving = 0;
  if (star.available && star.nextStar !== null) {
    const cert = star.checks.find((c) => c.key === 'goods');
    const others = star.checks.filter((c) => c.key !== 'goods').every((c) => c.ok);
    if (others && cert && !cert.ok) {
      const num = cert.need - cert.have;
      if (!(await attempt(() => game.shop.buy(ctx, { goodsId: cert.id!, num }))))
        saving = config.requireGoods(cert.id!).coin * num;
    }
    if (others) await attempt(() => game.growth.starUp(ctx));
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

  {
    // 只能学本街的菜（问题记录 312）；可学（没学过的）和可升级（已学的）分开查，先学新的
    const q = { street: (await rest()).streetId, page: 1 } as const;
    const learnable = await game.cookbook.list(ctx, { ...q, filter: 'learnable' });
    const upgradable = await game.cookbook.list(ctx, { ...q, filter: 'upgradable' });
    for (const row of [...learnable.items, ...upgradable.items].slice(0, 20))
      await attempt(() => game.cookbook.learn(ctx, row.id));
  }

  await composeSurplus(game, bot, attempt);
  return stats;
}

/** 买"把所有食谱学到 1 品级还缺"的食材；留出加满一次油的钱和正在攒的钱 */
async function shopForFoods(game: Game, bot: Bot, attempt: Attempt, saving: number): Promise<void> {
  const ctx = bot.ctx;
  const need = await game.cookbook.foodsNeed(ctx, { target: 1 });
  const lack = new Map(need.items.filter((x) => x.lack > 0).map((x) => [x.foodsId, x.lack]));
  const market = await game.market.view(ctx);
  let r = await game.restaurant.overview(ctx.restaurantId);
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
  if (!market.guess.joined && market.daily.length > 0) {
    const pick = market.daily
      .map((x) => x.foodsId)
      .filter((id) => market.guess.pool.includes(id))
      .slice(0, market.guess.maxPick);
    if (pick.length > 0) await attempt(() => game.market.joinGuess(ctx, pick));
  }
}

/** 用当天的免体力次数，把学食谱用不到的 1~4 级食材合成上去 */
async function composeSurplus(game: Game, bot: Bot, attempt: Attempt): Promise<void> {
  const ctx = bot.ctx;
  const cup = await game.cupboard.list(ctx);
  let free = cup.freeHandleLeft;
  const need = await game.cookbook.foodsNeed(ctx, { target: 1 });
  const needed = new Map(need.items.map((x) => [x.foodsId, x.need]));
  for (const it of cup.items) {
    if (free <= 0) break;
    const food = game.app.config.foods.get(it.foodsId);
    if (!food || food.level < 1 || food.level > 4) continue;
    const surplus = it.num - (needed.get(it.foodsId) ?? 0) - 5;
    const num = Math.min(100, surplus - (surplus % 2));
    if (num < 2) continue;
    if (await attempt(() => game.cupboard.handle(ctx, { foodsId: it.foodsId, way: 'compose', num })))
      free -= 1;
  }
}

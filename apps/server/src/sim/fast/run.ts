import { GOODS, resolveShardSettings, type GameConfig, type Tuning } from '@dt/config';
import { gameDay, gameParts, hashSeed, ROUND_MS, seededRng } from '@dt/shared';
import { PERSONAS, type Persona } from '../bot';
import type { BotDay } from '../metrics';
import { botTurn, starBlockers, type FastBot } from './bot';
import { newMarket, restockIfDue, settleGuesses } from './market';
import { openFastRest } from './ops';
import { mouseVisit, regenRound, settleRound } from './round';
import type { SideTable } from './side';
import type { FastCtx, FastStats, Income } from './state';
import { advanceWorld, globalsOf, newWorld, pickPlankton } from './world';

/**
 * 模拟区服的 id：世界、菜场、痞老板的种子按区服 id 派生，和真实定时任务、全真模拟器（区服 1）一致；
 * --seed 只影响机器人和结算的随机数，和全真模拟器的含义相同
 */
export const SIM_SHARD_ID = 1;

export interface StuckTracker {
  star: number;
  /** 当前星级下，等级第一次够到下一星要求的那天；没够到为 null */
  since: number | null;
}

/**
 * 卡点（设计 §7，规则同全真模拟的 detectStuck）：从"当前星级、等级已够下一星"的第一天算起，
 * 连续 threshold 天以上没升星才算卡住；返回卡了几天，没卡住返回 null。升星后重新算
 */
export function trackStuck(
  t: StuckTracker,
  day: number,
  star: number,
  eligible: boolean,
  threshold: number,
): number | null {
  if (star !== t.star) {
    t.star = star;
    t.since = null;
  }
  if (!eligible) return null;
  t.since ??= day;
  const days = day - t.since;
  return days >= threshold ? days : null;
}

export interface FastOptions {
  days: number;
  botsPerPersona: number;
  personas: Persona['key'][];
  seed: number;
  start: Date;
  tuning: Tuning;
  side: SideTable | null;
  stuckDays: number;
}

/** 每个机器人每天 0 点的状态（和全真模拟的 BotDay 同样字段）+ 当天结算和旁支的银币 */
export interface FastDay extends BotDay {
  settleCoin: number;
  sideCoin: number;
}

export interface FastStuck {
  bot: string;
  persona: string;
  star: number;
  days: number;
  reasons: string[];
}

export interface FastResult {
  name: string;
  days: FastDay[];
  /** 画像 → 来源 → 累计收入 */
  income: Record<string, Record<string, Income>>;
  /** 画像 → 用途 → 累计花掉的银币（问题记录 240） */
  spend: Record<string, Record<string, number>>;
  stuck: FastStuck[];
  /** 体力恢复任务跑了几次（诊断用：真实定时任务每 10 分钟一次） */
  regenCount: number;
  elapsedMs: number;
}

interface Runner {
  bot: FastBot;
  stats: FastStats;
  lastSettle: number;
  lastSide: number;
  stuck: StuckTracker;
}

const sumCoin = (s: FastStats, pick: (k: string) => boolean) =>
  Object.entries(s.income).reduce((n, [k, v]) => (pick(k) ? n + v.coin : n), 0);

/**
 * 跑一套数值（快速模拟设计 §4）：每 4 分钟一轮，一天 360 轮。
 * 每个随机源都按"种子 + 用途 + 店 + 轮"派生，几套数值用同一组随机数（公共随机数，设计 §4.7）
 */
export function runFast(
  name: string,
  o: FastOptions,
  config: GameConfig,
  onDay?: (day: number) => void,
): FastResult {
  const started = Date.now();
  const settings = { ...resolveShardSettings(config, {}), tuning: o.tuning };
  const tuning = o.tuning;
  const ctxOf = (stats: FastStats, now: Date): FastCtx => ({
    config,
    tuning,
    now,
    rng: seededRng(0),
    stats,
  });

  let id = 0;
  const runners: Runner[] = [];
  for (const persona of PERSONAS.filter((p) => o.personas.includes(p.key))) {
    for (let k = 1; k <= o.botsPerPersona; k++) {
      id += 1;
      const stats: FastStats = { income: {} };
      const c = ctxOf(stats, o.start);
      c.rng = seededRng(hashSeed(o.seed, 'open', id));
      const rest = openFastRest(c, id, settings);
      runners.push({
        bot: {
          name: `${persona.label}${k}`,
          persona,
          rest,
          rng: seededRng(hashSeed(o.seed, 'bot', id)),
          lastSideDay: '',
        },
        stats,
        lastSettle: 0,
        lastSide: 0,
        stuck: { star: 0, since: null },
      });
    }
  }
  const rests = new Map(runners.map((x) => [x.bot.rest.id, x.bot.rest]));
  const world = newWorld(config, tuning, o.start, seededRng(hashSeed(SIM_SHARD_ID, 'world-init')));
  const market = newMarket();
  const days: FastDay[] = [];
  const stuck = new Map<string, FastStuck>();

  const snapshot = (day: number) => {
    for (const x of runners) {
      const r = x.bot.rest;
      const settle = sumCoin(x.stats, (k) => k === 'settlement');
      const side = sumCoin(x.stats, (k) => k.startsWith('side.'));
      days.push({
        day,
        bot: x.bot.name,
        persona: x.bot.persona.key,
        level: r.level,
        star: r.star,
        coin: r.coin,
        diamond: r.diamond,
        learned: r.counts.learned,
        certs: r.store.get(GOODS.starCert)?.num ?? 0,
        oilLevel: r.oilLevel,
        renown: r.renown,
        settleCoin: settle - x.lastSettle,
        sideCoin: side - x.lastSide,
      });
      x.lastSettle = settle;
      x.lastSide = side;
      // 卡点：等级够了却超过 stuckDays 天没升星（设计 §7；规则同全真模拟的 detectStuck）
      const need = config.starNeed.get(r.star + 1);
      const eligible = !!need && need.cookbooksKind === 'learned' && r.level >= need.needLevel;
      const stuckDays = trackStuck(x.stuck, day, r.star, eligible, o.stuckDays);
      if (stuckDays === null) stuck.delete(x.bot.name);
      else
        stuck.set(x.bot.name, {
          bot: x.bot.name,
          persona: x.bot.persona.key,
          star: r.star,
          days: stuckDays,
          reasons: starBlockers(ctxOf(x.stats, new Date(o.start.getTime() + day * 86_400_000)), r),
        });
    }
  };
  snapshot(0);

  const end = o.start.getTime() + o.days * 86_400_000;
  let now = new Date(o.start.getTime());
  let lastDay = gameDay(now);
  let dayIndex = 0;
  let lastStrength = '';
  let lastMouse = '';
  let regenCount = 0;
  while (now.getTime() < end) {
    const round = Math.floor(now.getTime() / ROUND_MS);
    const today = gameDay(now);
    for (const x of runners) {
      if (x.bot.rest.day !== today) {
        x.bot.rest.daily.clear();
        x.bot.rest.day = today;
      }
    }
    advanceWorld(world, config, tuning, now, SIM_SHARD_ID);
    pickPlankton(world, [...rests.values()], now, seededRng(hashSeed(SIM_SHARD_ID, 'plankton', round)));
    const opened = restockIfDue(market, config, tuning, now, SIM_SHARD_ID);
    if (opened) {
      const c = ctxOf({ income: {} }, now);
      for (const x of runners) {
        if (!market.guesses.has(x.bot.rest.id)) continue;
        c.stats = x.stats;
        c.rng = seededRng(hashSeed(o.seed, 'guess', x.bot.rest.id, round));
        settleGuesses(
          c,
          new Map([[x.bot.rest.id, x.bot.rest]]),
          market,
          opened.foods,
          opened.key,
          opened.hour,
        );
      }
    }
    const g = globalsOf(world, config, tuning, now);
    for (const x of runners) {
      const c = ctxOf(x.stats, now);
      c.rng = seededRng(hashSeed(o.seed, 'settle', x.bot.rest.id, round));
      settleRound(c, x.bot.rest, g);
    }
    // 体力恢复每 10 分钟、老鼠每 30 分钟（settlement/jobs.ts 的周期）；种子和真实定时任务相同
    const sp = String(Math.floor(now.getTime() / 600_000));
    if (sp !== lastStrength) {
      lastStrength = sp;
      regenCount += 1;
      for (const x of runners) {
        const c = ctxOf(x.stats, now);
        c.rng = seededRng(hashSeed(SIM_SHARD_ID, 'strength', sp, x.bot.rest.id));
        regenRound(c, x.bot.rest);
      }
    }
    const mp = String(Math.floor(now.getTime() / 1_800_000));
    if (mp !== lastMouse) {
      lastMouse = mp;
      const mt = tuning.mouse;
      for (const x of runners) {
        const r = x.bot.rest;
        if (r.state !== 1) continue;
        const rng = seededRng(hashSeed(SIM_SHARD_ID, 'mouse', mp, r.id));
        const rate = (mt.rateBase - mt.ratePerStar * r.star) * (r.streetId === 0 ? mt.newbieFactor : 1);
        if (!rng.chance(rate)) continue;
        const c = ctxOf(x.stats, now);
        c.rng = rng;
        mouseVisit(c, r);
      }
    }
    const { hour, minute } = gameParts(now);
    if (minute < ROUND_MS / 60_000) {
      for (const x of runners) {
        if (!x.bot.persona.hours.includes(hour)) continue;
        botTurn(ctxOf(x.stats, now), x.bot, market, world, o.side);
      }
    }
    now = new Date(now.getTime() + ROUND_MS);
    const nd = gameDay(now);
    if (nd !== lastDay) {
      lastDay = nd;
      dayIndex += 1;
      snapshot(dayIndex);
      onDay?.(dayIndex);
    }
  }

  const income: FastResult['income'] = {};
  for (const x of runners) {
    const p = (income[x.bot.persona.key] ??= {});
    for (const [k, v] of Object.entries(x.stats.income)) {
      const t = (p[k] ??= { coin: 0, exp: 0, diamond: 0 });
      t.coin += v.coin;
      t.exp += v.exp;
      t.diamond += v.diamond;
    }
  }
  const spend: FastResult['spend'] = {};
  for (const x of runners) {
    const p = (spend[x.bot.persona.key] ??= {});
    for (const [k, v] of Object.entries(x.stats.spend ?? {})) p[k] = (p[k] ?? 0) + v;
  }
  return {
    name,
    days,
    income,
    spend,
    stuck: [...stuck.values()],
    regenCount,
    elapsedMs: Date.now() - started,
  };
}

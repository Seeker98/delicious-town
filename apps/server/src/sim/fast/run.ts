import { GOODS, resolveShardSettings, type GameConfig, type Tuning } from '@dt/config';
import { gameDay, gameParts, hashSeed, ROUND_MS, seededRng } from '@dt/shared';
import { PERSONAS, type Persona } from '../bot';
import type { BotDay } from '../metrics';
import { botTurn, starBlockers, type FastBot } from './bot';
import { newMarket, restockIfDue, settleGuesses } from './market';
import { openFastRest } from './ops';
import { regenRound, settleRound } from './round';
import type { SideTable } from './side';
import type { FastCtx, FastStats, Income } from './state';
import { advanceWorld, globalsOf, newWorld, pickPlankton } from './world';

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
  stuck: FastStuck[];
  elapsedMs: number;
}

interface Runner {
  bot: FastBot;
  stats: FastStats;
  lastSettle: number;
  lastSide: number;
  lastStarDay: number;
}

const sumCoin = (s: FastStats, pick: (k: string) => boolean) =>
  Object.entries(s.income).reduce((n, [k, v]) => (pick(k) ? n + v.coin : n), 0);

/**
 * 跑一套数值（快速模拟设计 §4）：每 4 分钟一轮，一天 360 轮。
 * 每个随机源都按"种子 + 用途 + 店 + 轮"派生，几套数值用同一组随机数（公共随机数，设计 §4.7）
 */
export function runFast(name: string, o: FastOptions, config: GameConfig): FastResult {
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
        lastStarDay: 0,
      });
    }
  }
  const rests = new Map(runners.map((x) => [x.bot.rest.id, x.bot.rest]));
  const world = newWorld(config, tuning, o.start, seededRng(hashSeed(o.seed, 'world-init')));
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
      // 卡点：等级够了却超过 stuckDays 天没升星（设计 §7）
      const need = config.starNeed.get(r.star + 1);
      if (need && r.level >= need.needLevel && day - x.lastStarDay >= o.stuckDays) {
        stuck.set(x.bot.name, {
          bot: x.bot.name,
          persona: x.bot.persona.key,
          star: r.star,
          days: day - x.lastStarDay,
          reasons: starBlockers(ctxOf(x.stats, new Date(o.start.getTime() + day * 86_400_000)), r),
        });
      }
    }
  };
  snapshot(0);

  const end = o.start.getTime() + o.days * 86_400_000;
  let now = new Date(o.start.getTime());
  let lastDay = gameDay(now);
  let dayIndex = 0;
  const stars = new Map(runners.map((x) => [x.bot.name, x.bot.rest.star]));
  while (now.getTime() < end) {
    const round = Math.floor(now.getTime() / ROUND_MS);
    const today = gameDay(now);
    for (const x of runners) {
      if (x.bot.rest.day !== today) {
        x.bot.rest.daily.clear();
        x.bot.rest.day = today;
      }
    }
    advanceWorld(world, config, tuning, now, (tag) => seededRng(hashSeed(o.seed, 'world', tag)));
    pickPlankton(world, [...rests.values()], now, seededRng(hashSeed(o.seed, 'plankton', round)));
    const opened = restockIfDue(market, config, tuning, now, (tag) => seededRng(hashSeed(o.seed, tag)));
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
      // 结算和体力恢复共用这家店这一轮的随机源（每轮少派生一次，性能）
      c.rng = seededRng(hashSeed(o.seed, 'round', x.bot.rest.id, round));
      settleRound(c, x.bot.rest, g);
      regenRound(c, x.bot.rest);
    }
    const { hour, minute } = gameParts(now);
    if (minute < ROUND_MS / 60_000) {
      for (const x of runners) {
        if (!x.bot.persona.hours.includes(hour)) continue;
        botTurn(ctxOf(x.stats, now), x.bot, market, world, o.side);
        if (x.bot.rest.star !== stars.get(x.bot.name)) {
          stars.set(x.bot.name, x.bot.rest.star);
          x.lastStarDay = dayIndex;
          stuck.delete(x.bot.name);
        }
      }
    }
    now = new Date(now.getTime() + ROUND_MS);
    const nd = gameDay(now);
    if (nd !== lastDay) {
      lastDay = nd;
      dayIndex += 1;
      snapshot(dayIndex);
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
  return { name, days, income, stuck: [...stuck.values()], elapsedMs: Date.now() - started };
}

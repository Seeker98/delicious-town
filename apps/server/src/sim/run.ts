import { gameDay, gameParts, ROUND_MS } from '@dt/shared';
import { runDueJobs } from '../worker/periodic';
import { botTurn, createBots, type Bot, type Persona } from './bot';
import { openSimEnv } from './env';
import {
  detectStuck,
  economyOf,
  snapshot,
  starDays,
  type BotDay,
  type EconomyRow,
  type StuckRow,
} from './metrics';

export interface SimOptions {
  adminUrl: string;
  dbName: string;
  redisUrl: string;
  bundlePath: string;
  days: number;
  botsPerPersona: number;
  personas: Persona['key'][];
  seed: number;
  start: Date;
  tuning?: unknown;
  stuckDays?: number;
}

export interface SimResult {
  options: Omit<SimOptions, 'adminUrl' | 'redisUrl' | 'bundlePath'>;
  bots: Array<{ name: string; persona: string; restaurantId: number }>;
  days: BotDay[];
  economy: EconomyRow[];
  stuck: StuckRow[];
  starDays: Record<string, Record<string, number>>;
  elapsedMs: number;
}

/**
 * 模拟 N 天（设计文档 §8.1）：每次推进一轮（4 分钟），先执行到期的周期任务，
 * 每个整点让该上线的机器人各行动一次；每天 0 点记一次快照
 */
export async function runSim(o: SimOptions, progress?: (msg: string) => void): Promise<SimResult> {
  const started = Date.now();
  const env = await openSimEnv({
    adminUrl: o.adminUrl,
    dbName: o.dbName,
    redisUrl: o.redisUrl,
    bundlePath: o.bundlePath,
    start: o.start,
    seed: o.seed,
    tuning: o.tuning,
  });
  try {
    const bots: Bot[] = await createBots(env, o.personas, o.botsPerPersona);
    const periodic = {
      db: env.deps.db,
      shards: env.game.shards,
      now: env.clock.now,
      log: { error: () => {} },
    };
    const days: BotDay[] = await snapshot(env.deps.db, bots, 0);
    const end = o.start.getTime() + o.days * 86_400_000;
    let lastDay = gameDay(env.clock.now());
    let dayIndex = 0;
    while (env.clock.now().getTime() < end) {
      await runDueJobs(periodic, env.game.jobs, { shardIds: [env.shardId] });
      const { hour, minute } = gameParts(env.clock.now());
      if (minute < ROUND_MS / 60_000) {
        for (const bot of bots) if (bot.persona.hours.includes(hour)) await botTurn(env.game, bot);
      }
      env.clock.advance(ROUND_MS);
      const today = gameDay(env.clock.now());
      if (today !== lastDay) {
        lastDay = today;
        dayIndex += 1;
        days.push(...(await snapshot(env.deps.db, bots, dayIndex)));
        progress?.(`第 ${dayIndex} 天完成`);
      }
    }
    const economy = await economyOf(
      env.deps.db,
      bots.map((b) => b.ctx.restaurantId),
    );
    return {
      options: {
        dbName: o.dbName,
        days: o.days,
        botsPerPersona: o.botsPerPersona,
        personas: o.personas,
        seed: o.seed,
        start: o.start,
        tuning: o.tuning,
        stuckDays: o.stuckDays,
      },
      bots: bots.map((b) => ({ name: b.name, persona: b.persona.key, restaurantId: b.ctx.restaurantId })),
      days,
      economy,
      stuck: detectStuck(days, env.deps.config, o.stuckDays ?? 5),
      starDays: starDays(days),
      elapsedMs: Date.now() - started,
    };
  } finally {
    await env.close();
  }
}

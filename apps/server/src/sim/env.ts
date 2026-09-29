import pg from 'pg';
import { loadGameConfig } from '@dt/config';
import { hashSeed, seededRng } from '@dt/shared';
import type { AppDeps } from '../app';
import { createDb } from '../db';
import { migrateToLatest } from '../db/migrate';
import { loadEnv } from '../env';
import { EventBus } from '../events/bus';
import { createGame, type Game } from '../game';
import { disabledCaptcha } from '../infra/captcha';
import { memoryMailer } from '../infra/mailer';
import { createRedis } from '../infra/redis';
import { createSessionStore } from '../security/sessionStore';

export interface SimClock {
  now(): Date;
  set(d: Date): void;
  advance(ms: number): void;
}

export function createSimClock(start: Date): SimClock {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    set: (d) => {
      t = d.getTime();
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** 先删后建一次性库（库名只允许小写字母、数字、下划线） */
export async function recreateDatabase(adminUrl: string, dbName: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error(`bad database name ${dbName}`);
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    await c.query(`drop database if exists ${dbName} with (force)`);
    await c.query(`create database ${dbName}`);
  } finally {
    await c.end();
  }
}

export interface SimEnvOptions {
  /** 有建库权限的连接串（开发库 dt 或测试库 dt_test） */
  adminUrl: string;
  dbName: string;
  redisUrl: string;
  bundlePath: string;
  start: Date;
  seed: number;
  /** 区服 tuning 覆盖 */
  tuning?: unknown;
}

export interface SimEnv {
  deps: AppDeps;
  game: Game;
  clock: SimClock;
  shardId: number;
  dbUrl: string;
  close(): Promise<void>;
}

export async function openSimEnv(o: SimEnvOptions): Promise<SimEnv> {
  await recreateDatabase(o.adminUrl, o.dbName);
  const dbUrl = withDatabase(o.adminUrl, o.dbName);
  const db = createDb(dbUrl, 20);
  await migrateToLatest(db);
  const redis = createRedis(o.redisUrl);
  await redis.flushdb();
  const clock = createSimClock(o.start);
  let opSeq = 0;
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'development',
    LOG_LEVEL: 'silent',
    DATABASE_URL: dbUrl,
    REDIS_URL: o.redisUrl,
    CONFIG_BUNDLE_PATH: o.bundlePath,
    WEB_ORIGIN: 'http://localhost',
    ENABLE_TEST_API: 'false',
  });
  const deps: AppDeps = {
    env,
    db,
    redis,
    config: loadGameConfig(o.bundlePath),
    mailer: memoryMailer(),
    captcha: disabledCaptcha(),
    bus: new EventBus(),
    sessions: createSessionStore(redis, 3600),
    now: clock.now,
    // 机器人操作按顺序执行，每个操作取一个按序号派生的种子：同样参数两次运行结果一致
    rng: () => seededRng(hashSeed(o.seed, 'op', opSeq++)),
  };
  const game = createGame(deps);
  const shardId = 1;
  await db.insertInto('shard').values({ id: shardId, name: '模拟服', opened_at: o.start }).execute();
  if (o.tuning !== undefined) {
    await db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ tuning: o.tuning }) })
      .execute();
  }
  return {
    deps,
    game,
    clock,
    shardId,
    dbUrl,
    close: async () => {
      await db.destroy();
      redis.disconnect();
    },
  };
}

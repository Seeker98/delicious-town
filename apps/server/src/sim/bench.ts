import { hashSeed, roundOf, ROUND_MS, seededRng } from '@dt/shared';
import type { CookbookCounts } from '../db/schema';
import { gradeOf, setGrade } from '../modules/cookbook/rules';
import { settleShardRound } from '../modules/settlement/runner';
import { openSimEnv, type SimEnv } from './env';

export interface BenchOptions {
  adminUrl: string;
  dbName: string;
  redisUrl: string;
  bundlePath: string;
  restaurants: number;
  rounds: number;
  seed: number;
}

export interface BenchRound {
  round: number;
  ms: number;
  p50: number;
  p95: number;
  settled: number;
  failed: number;
}

export interface BenchResult {
  restaurants: number;
  rounds: BenchRound[];
  limitMs: number;
  pass: boolean;
}

/** 架构文档的验收指标：5000 家店一轮 ≤ 30 秒 */
export const BENCH_LIMIT_MS = 30_000;

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** 批量造店：等级、星级、食谱数量按分布生成；每家带街道勋章加成来源，第一轮要重新汇总 */
export async function seedRestaurants(env: SimEnv, n: number, seed: number): Promise<void> {
  const db = env.deps.db;
  const config = env.deps.config;
  const rng = seededRng(hashSeed(seed, 'bench'));
  const allIds = config.cookbookIndex.allIds;
  /** 除新手街外的街道（新街道上线后不再写死 13 条，问题记录 284） */
  const movable = [...config.streets.keys()].filter((id) => id !== 0);
  for (let start = 0; start < n; start += 500) {
    const size = Math.min(500, n - start);
    const accounts = await db
      .insertInto('account')
      .values(
        Array.from({ length: size }, (_, i) => ({
          username: `b${start + i}`,
          password_hash: 'x',
          email: `b${start + i}@bench.local`,
        })),
      )
      .returning('id')
      .execute();
    const plans = accounts.map((a, i) => {
      const level = 1 + rng.int(99);
      const star = Math.min(7, Math.floor(level / 14));
      const street = movable[rng.int(movable.length)]!;
      const levels = Buffer.alloc(config.cookbookIndex.slots);
      const counts: CookbookCounts = { learned: 0, grade: Array(11).fill(0) as number[], street: {} };
      const learned = Math.min(allIds.length, level * 20);
      const offset = rng.int(allIds.length);
      for (let k = 0; k < learned; k++) {
        const id = allIds[(offset + k * 7) % allIds.length]!;
        if (gradeOf(levels, config.cookbookIndex.slotOf, id) > 0) continue;
        const grade = 1 + rng.int(Math.min(7, star + 1));
        setGrade(levels, config.cookbookIndex.slotOf, id, grade);
        counts.learned += 1;
        counts.grade[grade]! += 1;
        const s = String(config.cookbookIndex.street[id]);
        counts.street[s] = (counts.street[s] ?? 0) + 1;
      }
      return {
        account: a.id,
        name: `压测${start + i}`,
        level,
        star,
        street,
        levels,
        counts,
        tableNum: Math.min(level + 3, (star + 1) * 16),
      };
    });
    const rests = await db
      .insertInto('restaurant')
      .values(
        plans.map((p) => ({
          shard_id: env.shardId,
          account_id: p.account,
          name: p.name,
          level: p.level,
          coin: 1_000_000,
          diamond: 0,
          strength: 100,
          strength_max: 100,
          oil: 100_000,
          oil_max: 100_000,
          star_level: p.star,
          street_id: p.street,
          renown: 10,
          attr_left: 0,
          luck: p.level - 1,
          table_num: p.tableNum,
          cupboard_num: 100,
          store_num: 20,
          foods_max_num: 999,
          foods_lock_num: 15,
          cookbook_counts: JSON.stringify(p.counts),
        })),
      )
      .returning('id')
      .execute();
    await db
      .insertInto('restaurant_tables')
      .values(
        rests.map((r, i) => ({
          rest_id: r.id,
          tables: JSON.stringify(
            Array.from({ length: plans[i]!.tableNum }, (_, k) => ({
              no: k + 1,
              floor: Math.floor(k / 16) + 1,
              customer: 0,
            })),
          ),
        })),
      )
      .execute();
    await db
      .insertInto('restaurant_cookbooks')
      .values(rests.map((r, i) => ({ rest_id: r.id, levels: plans[i]!.levels })))
      .execute();
    await db
      .insertInto('effect_source')
      .values(
        rests.map((r, i) => {
          const medal = config.requireGoods(config.streetMedalId(plans[i]!.street));
          return {
            rest_id: r.id,
            source_type: 'street',
            source_id: medal.id,
            effects: JSON.stringify(medal.effects),
            expires_at: null,
          };
        }),
      )
      .execute();
  }
}

/** 结算压测（设计文档 §8.3）：真实批处理跑 rounds 轮，报告每轮耗时和每店耗时分位数 */
export async function bench(o: BenchOptions): Promise<BenchResult> {
  const now = new Date();
  const env = await openSimEnv({
    adminUrl: o.adminUrl,
    dbName: o.dbName,
    redisUrl: o.redisUrl,
    bundlePath: o.bundlePath,
    start: now,
    seed: o.seed,
  });
  try {
    await seedRestaurants(env, o.restaurants, o.seed);
    const base = roundOf(now);
    const rounds: BenchRound[] = [];
    for (let i = 0; i < o.rounds; i++) {
      const times: number[] = [];
      const at = new Date(now.getTime() + i * ROUND_MS);
      const s = await settleShardRound(env.game.deps, env.game.world, env.shardId, base + i, at, {
        onRestaurant: (_id, ms) => times.push(ms),
      });
      rounds.push({
        round: i + 1,
        ms: s.ms,
        p50: percentile(times, 0.5),
        p95: percentile(times, 0.95),
        settled: s.settled,
        failed: s.failed,
      });
    }
    return {
      restaurants: o.restaurants,
      rounds,
      limitMs: BENCH_LIMIT_MS,
      pass: rounds.every((r) => r.ms <= BENCH_LIMIT_MS && r.failed === 0),
    };
  } finally {
    await env.close();
  }
}

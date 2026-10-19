import type { Kysely } from 'kysely';
import { GOODS } from '@dt/config';
import { ErrorCode, gameDay, latestSlot, type MayorDto } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { emitAction } from '../../core/action';
import { restLog, runSystemOp, type Op } from '../../core/op';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { finishedRound } from '../predict/auto/rounds';
import { grantGoodsOp } from '../store/goods';
import type { WorldService } from '../world/service';

type WorldSnapshot = Awaited<ReturnType<WorldService['ensure']>>;

/** 今天猜的那一次、现在猜的话哪一轮揭晓和那一轮的预报 */
export async function mayorView(
  db: Kysely<DB>,
  world: WorldService,
  shardId: number,
  restId: number,
  now: Date,
  /** 调用方已经在读世界状态时传进来，不再读一遍 */
  snapshot?: Promise<WorldSnapshot>,
): Promise<MayorDto> {
  const [row, snap] = await Promise.all([
    db
      .selectFrom('mayor_guess')
      .select(['type', 'at', 'right', 'actual'])
      .where('rest_id', '=', restId)
      .where('day', '=', gameDay(now))
      .executeTakeFirst(),
    // 在玩家事务里调用时 db 是事务，不能另向连接池要连接
    snapshot ?? world.ensure(shardId, now, db),
  ]);
  const f = await world.forecast(shardId, snap);
  return {
    today: row ? { type: row.type, at: row.at.toISOString(), right: row.right, actual: row.actual } : null,
    next: {
      at: f.at.toISOString(),
      types: Object.entries(f.types).map(([type, p]) => ({ type: Number(type), p })),
    },
  };
}

/**
 * 镇长猜天气（天气改版设计 §5）：每天一次，猜下一次自然换天后的天气大类（罗盘、晴雨签盖的不算），
 * 换天时揭晓，猜对给“镇长的推荐”；猜错不罚（用户 2026-10-12）
 */
export async function askMayor(o: Op, world: WorldService, type: number): Promise<MayorDto> {
  const snap = await world.ensure(o.shardId, o.now, o.tx);
  const row = await o.tx
    .insertInto('mayor_guess')
    .values({ rest_id: o.rest.id, shard_id: o.shardId, day: gameDay(o.now), type, at: snap.naturalUntil })
    .onConflict((oc) => oc.columns(['rest_id', 'day']).doNothing())
    .returning('rest_id')
    .executeTakeFirst();
  if (!row) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'mayor' });
  // “小镇”支线：和镇长猜一次天气
  await emitAction(o, 'town.mayor.ask');
  return mayorView(o.tx, world, o.shardId, o.rest.id, o.now);
}

/** 一次最多揭晓几条：剩下的下一个 10 分钟接着来（backlog：原来不分批） */
export const MAYOR_BATCH = 500;

type Log = { error(obj: object, msg: string): void };

/**
 * 揭晓到时间的猜测：读那一轮换天任务记下的自然天气（weather 任务的 stats.to）；那一轮还没跑完的先不揭晓，
 * 下次再来。每家店单独一个事务；某家出错只记日志、跳过，下一个 10 分钟再揭晓它（backlog：原来一家出错整轮作废）
 */
export async function resolveMayor(
  d: GameDeps,
  shardId: number,
  now: Date,
  log?: Log,
  batch = MAYOR_BATCH,
): Promise<{ resolved: number; failed: number }> {
  // 先按揭晓时刻判断哪几轮能揭晓：判不了的那一轮（换天任务漏跑）不能占着分批的队头，把后面的天都卡住
  const ats = await d.db
    .selectFrom('mayor_guess')
    .select('at')
    .distinct()
    .where('shard_id', '=', shardId)
    .where('right', 'is', null)
    .where('at', '<=', now)
    .execute();
  if (ats.length === 0) return { resolved: 0, failed: 0 };
  const { tuning } = await d.shards.settings(shardId);
  const actualAt = new Map<number, number>();
  for (const { at } of ats) {
    const round = await finishedRound(
      d.db,
      shardId,
      'weather',
      latestSlot(at, tuning.world.weatherHours).key,
    );
    const to = Number((round?.stats as { to?: unknown } | undefined)?.to);
    const type = d.config.weather.get(to)?.type;
    if (type !== undefined) actualAt.set(at.getTime(), type);
  }
  if (actualAt.size === 0) return { resolved: 0, failed: 0 };
  const rows = await d.db
    .selectFrom('mayor_guess')
    .select(['rest_id', 'day', 'type', 'at'])
    .where('shard_id', '=', shardId)
    .where('right', 'is', null)
    .where(
      'at',
      'in',
      [...actualAt.keys()].map((t) => new Date(t)),
    )
    .orderBy('at')
    .orderBy('rest_id')
    .limit(batch)
    .execute();
  let resolved = 0;
  let failed = 0;
  for (const r of rows) {
    const actual = actualAt.get(r.at.getTime());
    if (actual === undefined) continue;
    const right = actual === r.type;
    try {
      await runSystemOp(d, shardId, r.rest_id, { source: 'town.mayor', now }, async (o) => {
        const done = await o.tx
          .updateTable('mayor_guess')
          .set({ actual, right })
          .where('rest_id', '=', r.rest_id)
          .where('day', '=', r.day)
          .where('right', 'is', null)
          .returning('rest_id')
          .executeTakeFirst();
        if (!done) return;
        if (right) {
          await grantGoodsOp(o, GOODS.mayorFavor, 1);
          // “小镇”支线：答对的次数
          await emitAction(o, 'town.mayor.right');
        }
        restLog(o, 'town.mayor', { type: r.type, actual, right });
      });
      resolved += 1;
    } catch (err) {
      failed += 1;
      log?.error({ err, shardId, restId: r.rest_id, day: r.day }, 'mayor resolve failed');
    }
  }
  return { resolved, failed };
}

/** 每 10 分钟揭晓一次到时间的镇长猜测（换天任务跑完之后才揭晓得了） */
export function mayorJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'mayor-resolve',
      feature: 'town',
      period: (now) => String(Math.floor(now.getTime() / 600_000)),
      run: ({ shardId, now, log }) => resolveMayor(d, shardId, now, log),
    },
  ];
}

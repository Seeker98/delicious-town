import { sql, type Kysely } from 'kysely';
import {
  ErrorCode,
  gameDay,
  type ActivitiesDto,
  type ActivityClaimDto,
  type ActivityDto,
  type ActivityExchangeDto,
  type ActivitySpec,
  type ActivitySummaryDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, notEnough, requirement } from '../../core/errors';
import { emitAction } from '../../core/action';
import { restLog, runOp, type Op } from '../../core/op';
import { spendDiamond } from '../../core/resources';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { grantRewardOp } from '../mail/reward';
import { consumeGoods } from '../store/goods';
import { myRankOf, poolOf, rankedOf, type RankedRow } from './coop';
import { passDailyKey } from './handler';
import {
  activityState,
  currencyKey,
  dropDailyKey,
  exchangedKey,
  exchangeUntil,
  rewardsOf,
  scaleRewards,
  type RewardState,
} from './rules';

/** 结束多久以内还留在玩家的活动列表里（设计 §7.2） */
const LIST_AFTER_END_MS = 7 * 86_400_000;
/** 全服合力的总分和前 10 名在本进程缓存多久（148-3 设计 §5.3） */
const COOP_CACHE_MS = 30_000;

export interface Progress {
  counters: Record<string, number>;
  premium: boolean;
  claims: Map<string, 'page' | 'mail'>;
}

export async function loadProgress(db: Kysely<DB>, activityId: number, restId: number): Promise<Progress> {
  const [cs, pass, claims] = await Promise.all([
    db
      .selectFrom('activity_counter')
      .select(['key', 'count'])
      .where('activity_id', '=', activityId)
      .where('rest_id', '=', restId)
      .execute(),
    db
      .selectFrom('activity_pass')
      .select('rest_id')
      .where('activity_id', '=', activityId)
      .where('rest_id', '=', restId)
      .executeTakeFirst(),
    db
      .selectFrom('activity_claim')
      .select(['reward_key', 'via'])
      .where('activity_id', '=', activityId)
      .where('rest_id', '=', restId)
      .execute(),
  ]);
  return {
    counters: Object.fromEntries(cs.map((c) => [c.key, Number(c.count)])),
    premium: pass !== undefined,
    claims: new Map(claims.map((c) => [c.reward_key, c.via])),
  };
}

type Row = {
  id: number;
  shard_id: number | null;
  kind: ActivitySpec['kind'];
  title: string;
  body: string;
  starts_at: Date;
  ends_at: Date;
  min_level: number;
  def: unknown;
};
const specOf = (r: Row) => ({ kind: r.kind, def: r.def }) as ActivitySpec;

export function createActivityService(d: GameDeps) {
  const visible = (db: Kysely<DB>, shardId: number) =>
    db
      .selectFrom('activity')
      .select(['id', 'shard_id', 'kind', 'title', 'body', 'starts_at', 'ends_at', 'min_level', 'def'])
      .where('deleted_at', 'is', null)
      .where((eb) => eb.or([eb('shard_id', '=', shardId), eb('shard_id', 'is', null)]));

  const coopCache = new Map<string, { expires: number; pool: number; top: RankedRow[] }>();
  /** 玩家列表用的总分和前 10 名，按"活动 + 区服"缓存；领取、结算不走缓存 */
  async function coopBoard(activityId: number, shardId: number) {
    const k = `${activityId}:${shardId}`;
    const nowMs = Date.now();
    const hit = coopCache.get(k);
    if (hit && hit.expires > nowMs) return hit;
    const v = {
      expires: nowMs + COOP_CACHE_MS,
      pool: await poolOf(d.db, activityId, shardId),
      top: await rankedOf(d.db, activityId, shardId, 10),
    };
    coopCache.set(k, v);
    return v;
  }

  /** 今天计数用到的 daily_counter 键：兑换活动按掉落规则，战令、合力按积分规则（148-2 设计 §7） */
  function dailyKeys(row: Row): string[] {
    const spec = specOf(row);
    if (spec.kind === 'exchange') return spec.def.drops.map((_, i) => dropDailyKey(row.id, i));
    if (spec.kind === 'pass' || spec.kind === 'coop')
      return spec.def.rules.map((r) => passDailyKey(row.id, r.key));
    return [];
  }

  function todayOf(row: Row, daily: ReadonlyMap<string, number>): Record<string, number> {
    const spec = specOf(row);
    if (spec.kind === 'exchange')
      return Object.fromEntries(
        spec.def.drops.map((_, i) => [`d${i}`, daily.get(dropDailyKey(row.id, i)) ?? 0]),
      );
    if (spec.kind !== 'pass' && spec.kind !== 'coop') return {};
    return Object.fromEntries(
      spec.def.rules.map((r) => [r.key, daily.get(passDailyKey(row.id, r.key)) ?? 0]),
    );
  }

  /**
   * 列表里所有活动的进度、是否已结算、今天的计数一次读完（质量期 ③）：
   * 原来每个活动各查 5 条，活动一多红点接口就几十条查询；现在固定 5 条，和活动个数无关
   */
  async function loadAll(rows: Row[], shardId: number, restId: number, now: Date) {
    const ids = rows.map((r) => r.id);
    const keys = rows.flatMap(dailyKeys);
    const [cs, passes, claims, settles, daily] =
      ids.length === 0
        ? [[], [], [], [], []]
        : await Promise.all([
            d.db
              .selectFrom('activity_counter')
              .select(['activity_id', 'key', 'count'])
              .where('activity_id', 'in', ids)
              .where('rest_id', '=', restId)
              .execute(),
            d.db
              .selectFrom('activity_pass')
              .select('activity_id')
              .where('activity_id', 'in', ids)
              .where('rest_id', '=', restId)
              .execute(),
            d.db
              .selectFrom('activity_claim')
              .select(['activity_id', 'reward_key', 'via'])
              .where('activity_id', 'in', ids)
              .where('rest_id', '=', restId)
              .execute(),
            d.db
              .selectFrom('activity_settle')
              .select('activity_id')
              .where('activity_id', 'in', ids)
              .where('shard_id', '=', shardId)
              .execute(),
            keys.length === 0
              ? Promise.resolve([] as Array<{ key: string; count: number }>)
              : d.db
                  .selectFrom('daily_counter')
                  .select(['key', 'count'])
                  .where('rest_id', '=', restId)
                  .where('day', '=', gameDay(now))
                  .where('key', 'in', keys)
                  .execute(),
          ]);
    const progress = new Map<number, Progress>(
      ids.map((id) => [id, { counters: {}, premium: false, claims: new Map() }]),
    );
    for (const c of cs) progress.get(c.activity_id)!.counters[c.key] = Number(c.count);
    for (const p of passes) progress.get(p.activity_id)!.premium = true;
    for (const c of claims) progress.get(c.activity_id)!.claims.set(c.reward_key, c.via);
    return {
      progress,
      settled: new Set(settles.map((x) => x.activity_id)),
      daily: new Map(daily.map((x) => [x.key, x.count])),
    };
  }

  async function dto(
    row: Row,
    shardId: number,
    restId: number,
    now: Date,
    all: Awaited<ReturnType<typeof loadAll>>,
  ): Promise<ActivityDto> {
    const p = all.progress.get(row.id)!;
    const state = activityState(now, row.ends_at, all.settled.has(row.id));
    const spec = specOf(row);
    const board = spec.kind === 'coop' ? await coopBoard(row.id, shardId) : null;
    const rewards = rewardsOf(spec, p.counters, p.premium, { pool: board?.pool }).map((x) => ({
      key: x.key,
      award: x.award,
      reached: x.reached,
      claimed: p.claims.get(x.key) ?? null,
    }));
    return {
      id: row.id,
      ...specOf(row),
      title: row.title,
      body: row.body,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      minLevel: row.min_level,
      state,
      counters: p.counters,
      today: todayOf(row, all.daily),
      premium: p.premium,
      rewards,
      claimable: state === 'running' ? rewards.filter((x) => x.reached && !x.claimed).length : 0,
      exchangeUntil: exchangeUntil(specOf(row), row.ends_at)?.toISOString() ?? null,
      coop: board
        ? {
            pool: board.pool,
            top: board.top.map((r) => ({ ...r, mine: r.restId === restId })),
            // 自己在缓存的前 10 名里时按缓存的名次写，和表里一致；不在才实时查（backlog 148-3）
            myRank:
              board.top.find((r) => r.restId === restId)?.rank ??
              (await myRankOf(d.db, row.id, shardId, p.counters.points ?? 0)),
          }
        : null,
    };
  }

  /** 锁店事务里取活动：不存在、已删、不是本区服、还没开始 → NOT_FOUND；不在进行中 → not_running */
  async function runningRow(o: Op, id: number): Promise<Row> {
    const row = (await visible(o.tx, o.shardId)
      .where('id', '=', id)
      .where('starts_at', '<=', o.now)
      .executeTakeFirst()) as Row | undefined;
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'activity', id });
    if (o.now >= row.ends_at) throw invalidState('not_running');
    return row;
  }

  async function claimKeys(o: Op, row: Row, pick: (x: RewardState, claimed: boolean) => boolean) {
    const p = await loadProgress(o.tx, row.id, o.rest.id);
    const spec = specOf(row);
    // 全服合力：领取时在事务里实时求和，不用列表的缓存（148-3 设计 §6）
    const pool = spec.kind === 'coop' ? await poolOf(o.tx, row.id, o.shardId) : undefined;
    const all = rewardsOf(spec, p.counters, p.premium, { pool });
    const out: ActivityClaimDto = { keys: [], items: [] };
    for (const x of all) {
      if (!pick(x, p.claims.has(x.key))) continue;
      await o.tx
        .insertInto('activity_claim')
        .values({
          activity_id: row.id,
          rest_id: o.rest.id,
          reward_key: x.key,
          via: 'page',
          claimed_at: o.now,
        })
        .execute();
      await grantRewardOp(o, x.award, {
        source: 'activity',
        logType: 'activity.claim',
        logParams: { activityId: row.id, title: row.title, key: x.key },
      });
      out.keys.push(x.key);
      out.items.push(x.award);
    }
    // 任务和活跃"领取限时活动奖励"（问题记录 318）：领一次计一次，不管这次领了几个奖励
    if (out.keys.length > 0) await emitAction(o, 'activity.claim');
    return { all, p, out };
  }

  const op = <T>(ctx: RestCtx, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature: 'activity', source: 'activity' }, fn);

  return {
    async list(ctx: RestCtx): Promise<ActivitiesDto> {
      await d.shards.ensureFeature(ctx.shardId, 'activity');
      const now = d.now();
      const rest = await d.db
        .selectFrom('restaurant')
        .select('level')
        .where('id', '=', ctx.restaurantId)
        .executeTakeFirstOrThrow();
      const rows = (await visible(d.db, ctx.shardId)
        .where('starts_at', '<=', now)
        .where('ends_at', '>', new Date(now.getTime() - LIST_AFTER_END_MS))
        .orderBy('ends_at')
        .execute()) as Row[];
      const all = await loadAll(rows, ctx.shardId, ctx.restaurantId, now);
      return {
        items: await Promise.all(rows.map((r) => dto(r, ctx.shardId, ctx.restaurantId, now, all))),
        level: rest.level,
      };
    },

    async summary(ctx: RestCtx): Promise<ActivitySummaryDto> {
      const { items } = await this.list(ctx);
      const running = items.filter((a) => a.state === 'running');
      return { running: running.length, claimable: running.reduce((s, a) => s + a.claimable, 0) };
    },

    claim(ctx: RestCtx, id: number, key: string) {
      return op(ctx, async (o) => {
        const row = await runningRow(o, id);
        const { all, p, out } = await claimKeys(
          o,
          row,
          (x, claimed) => x.key === key && x.reached && !claimed,
        );
        if (out.keys.length > 0) return out;
        const x = all.find((r) => r.key === key);
        if (!x) throw invalidState('no_reward', { key });
        if (p.claims.has(key)) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'activity_reward' });
        throw requirement('activity', { key });
      });
    },

    claimAll(ctx: RestCtx, id: number) {
      return op(ctx, async (o) => {
        const row = await runningRow(o, id);
        const { out } = await claimKeys(o, row, (x, claimed) => x.reached && !claimed);
        if (out.keys.length === 0) throw invalidState('nothing');
        return out;
      });
    },

    unlock(ctx: RestCtx, id: number) {
      return op(ctx, async (o) => {
        const row = await runningRow(o, id);
        const spec = specOf(row);
        if (spec.kind !== 'pass') throw invalidState('not_pass');
        const r = await o.tx
          .insertInto('activity_pass')
          .values({ activity_id: row.id, rest_id: o.rest.id, unlocked_at: o.now })
          .onConflict((oc) => oc.doNothing())
          .returning('rest_id')
          .executeTakeFirst();
        if (!r) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'activity_pass' });
        if (spec.def.unlock.diamond) spendDiamond(o, spec.def.unlock.diamond, { source: 'activity' });
        for (const g of spec.def.unlock.goods ?? [])
          await consumeGoods(o, g.id, g.num, { source: 'activity' });
        restLog(o, 'activity.unlock', { activityId: row.id, title: row.title });
        return { premium: true as const };
      });
    },

    /** 活动商店兑换：结束后兑换期内也能换（148-2 设计 §5） */
    exchange(ctx: RestCtx, id: number, index: number, times: number) {
      return op(ctx, async (o): Promise<ActivityExchangeDto> => {
        const row = (await visible(o.tx, o.shardId)
          .where('id', '=', id)
          .where('starts_at', '<=', o.now)
          .executeTakeFirst()) as Row | undefined;
        if (!row) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'activity', id });
        const spec = specOf(row);
        if (spec.kind !== 'exchange') throw invalidState('not_exchange');
        if (o.now >= exchangeUntil(spec, row.ends_at)!) throw invalidState('exchange_closed');
        const item = spec.def.shop[index];
        if (!item) throw invalidState('no_item', { index });
        const p = await loadProgress(o.tx, row.id, o.rest.id);
        const done = p.counters[exchangedKey(index)] ?? 0;
        if (done + times > item.limit)
          throw limitReached('activity_exchange', { limit: item.limit, left: item.limit - done });
        for (const c of item.cost) {
          const need = c.num * times;
          const have = p.counters[currencyKey(c.currency)] ?? 0;
          if (have < need) throw notEnough('activity_currency', need, have, c.currency);
        }
        for (const c of item.cost) {
          const need = c.num * times;
          const r = await o.tx
            .updateTable('activity_counter')
            .set({ count: sql<string>`count - ${need}` })
            .where('activity_id', '=', row.id)
            .where('rest_id', '=', o.rest.id)
            .where('key', '=', currencyKey(c.currency))
            .where('count', '>=', String(need))
            .executeTakeFirst();
          if (Number(r.numUpdatedRows) !== 1) throw notEnough('activity_currency', need, 0, c.currency);
        }
        await o.tx
          .insertInto('activity_counter')
          .values({ activity_id: row.id, rest_id: o.rest.id, key: exchangedKey(index), count: times })
          .onConflict((oc) =>
            oc
              .columns(['activity_id', 'rest_id', 'key'])
              .doUpdateSet({ count: sql<string>`activity_counter.count + ${times}` }),
          )
          .execute();
        const items = scaleRewards(item.award, times);
        await grantRewardOp(o, items, {
          source: 'activity',
          logType: 'activity.exchange',
          logParams: {
            activityId: row.id,
            title: row.title,
            times,
            cost: item.cost.map((c) => ({ name: spec.def.currencies[c.currency]!.name, num: c.num * times })),
          },
        });
        // 兑换型活动只能靠兑换拿奖励：兑换一次也算"领取限时活动奖励"（问题记录 318）
        await emitAction(o, 'activity.claim');
        return { index, times, items };
      });
    },
  };
}
export type ActivityService = ReturnType<typeof createActivityService>;

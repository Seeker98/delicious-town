import type { Transaction } from 'kysely';
import type { GameConfig, ShardSettings, Tuning } from '@dt/config';
import type { GameEvent, Rng } from '@dt/shared';
import type { DB, RestaurantRow } from '../db/schema';
import { withRestaurant } from '../db/tx';
import { recordLedger, type LedgerEntry } from '../modules/ledger/ledger';
import { postNews } from '../modules/news/news';
import type { GameDeps, RestCtx } from './deps';

/** 可以通过 setRest 修改的餐厅列（加成缓存由 effects 模块自己维护） */
export type RestColumn = Exclude<
  keyof RestaurantRow,
  'id' | 'shard_id' | 'account_id' | 'created_at' | 'effect_agg' | 'effect_next_expire_at' | 'effect_dirty'
>;

const JSON_COLUMNS: ReadonlySet<string> = new Set(['cookbook_counts']);

export interface Op {
  readonly deps: GameDeps;
  readonly tx: Transaction<DB>;
  /** 餐厅快照：通过 setRest 修改，flushOp 时一次写回 */
  readonly rest: RestaurantRow;
  /** 玩家操作时为会话上下文；定时任务为 null */
  readonly ctx: RestCtx | null;
  readonly shardId: number;
  readonly now: Date;
  readonly rng: Rng;
  readonly config: GameConfig;
  readonly settings: ShardSettings;
  readonly tuning: Tuning;
  /** 流水的默认来源 */
  readonly source: string;
  readonly events: GameEvent[];
  readonly ledger: LedgerEntry[];
  readonly logs: Array<{ type: string; params: Record<string, unknown> }>;
  readonly news: Array<{ type: string; params: Record<string, unknown> }>;
  readonly touched: Set<RestColumn>;
  /** 同一个操作内的缓存（加成汇总、幸运等） */
  readonly cache: Map<string, unknown>;
}

export interface OpResult<T> {
  data: T;
  events: GameEvent[];
}

export function createOp(
  deps: GameDeps,
  tx: Transaction<DB>,
  rest: RestaurantRow,
  settings: ShardSettings,
  opts: { source: string; ctx?: RestCtx | null; now?: Date; rng?: Rng },
): Op {
  return {
    deps,
    tx,
    rest: { ...rest },
    ctx: opts.ctx ?? null,
    shardId: rest.shard_id,
    now: opts.now ?? deps.now(),
    rng: opts.rng ?? deps.rng(),
    config: deps.config,
    settings,
    tuning: settings.tuning,
    source: opts.source,
    events: [],
    ledger: [],
    logs: [],
    news: [],
    touched: new Set(),
    cache: new Map(),
  };
}

export function setRest<K extends RestColumn>(op: Op, col: K, value: RestaurantRow[K]): void {
  (op.rest as Record<string, unknown>)[col] = value;
  op.touched.add(col);
}

/** 个人日志（rest_log），flushOp 时写入 */
export function restLog(op: Op, type: string, params: Record<string, unknown> = {}): void {
  op.logs.push({ type, params });
}

/** 区服新闻，flushOp 时写入，restId 取当前餐厅 */
export function opNews(op: Op, type: string, params: Record<string, unknown> = {}): void {
  op.news.push({ type, params });
}

/** 把快照的改动、流水、日志、新闻写进数据库（仍在同一事务里） */
export async function flushOp(op: Op): Promise<void> {
  if (op.touched.size > 0) {
    const patch: Record<string, unknown> = {};
    for (const col of op.touched) {
      const v = op.rest[col];
      patch[col] = JSON_COLUMNS.has(col) ? JSON.stringify(v) : v;
    }
    await op.tx.updateTable('restaurant').set(patch).where('id', '=', op.rest.id).execute();
    op.touched.clear();
  }
  if (op.ledger.length > 0) await recordLedger(op.tx, op.ledger.splice(0), op.now);
  if (op.logs.length > 0) {
    const logs = op.logs.splice(0);
    await op.tx
      .insertInto('rest_log')
      .values(
        logs.map((l) => ({
          rest_id: op.rest.id,
          type: l.type,
          params: JSON.stringify(l.params),
          created_at: op.now,
        })),
      )
      .execute();
  }
  for (const n of op.news.splice(0)) {
    await postNews(
      op.tx,
      { shardId: op.shardId, type: n.type, restId: op.rest.id, params: n.params },
      op.now,
    );
  }
}

/** 玩家写操作：检查功能开关 → 锁店 → 执行 → 写回；任何异常整体回滚 */
export async function runOp<T>(
  deps: GameDeps,
  ctx: RestCtx,
  opts: { feature: string; source: string },
  fn: (op: Op) => Promise<T>,
): Promise<OpResult<T>> {
  const settings = await deps.shards.ensureFeature(ctx.shardId, opts.feature);
  return withRestaurant(deps.db, ctx.restaurantId, async (tx, rest) => {
    const op = createOp(deps, tx, rest, settings, { source: opts.source, ctx });
    const data = await fn(op);
    await flushOp(op);
    return { data, events: op.events };
  });
}

/** 定时任务对某家店的操作：不检查功能开关（由调度器检查），可指定时间和随机源 */
export async function runSystemOp<T>(
  deps: GameDeps,
  shardId: number,
  restId: number,
  opts: { source: string; now?: Date; rng?: Rng },
  fn: (op: Op) => Promise<T>,
): Promise<T> {
  const settings = await deps.shards.settings(shardId);
  return withRestaurant(deps.db, restId, async (tx, rest) => {
    const op = createOp(deps, tx, rest, settings, opts);
    const data = await fn(op);
    await flushOp(op);
    return data;
  });
}

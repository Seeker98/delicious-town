import { sql } from 'kysely';
import { ErrorCode, type CreateGrantInput, type GrantDto, type GrantItems } from '@dt/shared';
import { restLog, runSystemOp, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainExp } from '../../core/resources';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { JobLogger } from '../../worker/scheduler';
import { addFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';
import type { AdminActor } from './access';
import { writeAudit } from './audit';

const SOURCE = 'admin.grant';

/** 发放一份补偿：走正常发放逻辑（橱柜满进冰箱、仓库满照发），写流水和个人日志 */
export async function grantItemsOp(op: Op, items: GrantItems, reason: string): Promise<void> {
  if (items.coin) gainCoin(op, items.coin, { source: SOURCE });
  if (items.diamond) gainDiamond(op, items.diamond, { source: SOURCE });
  if (items.exp) gainExp(op, items.exp, { source: SOURCE });
  for (const g of items.goods ?? []) await grantGoodsOp(op, g.id, g.num, { source: SOURCE });
  for (const f of items.foods ?? []) await addFoods(op, f.id, f.num, { source: SOURCE });
  restLog(op, 'admin.grant', { reason, items });
}

type GrantRow = {
  id: number;
  shard_id: number;
  target: 'rest' | 'shard';
  rest_id: number | null;
  min_level: number | null;
  items: unknown;
  reason: string;
  status: GrantDto['status'];
  total: number;
  done_count: number;
  failed_count: number;
  created_at: Date;
  finished_at: Date | null;
  username: string | null;
};

const toDto = (r: GrantRow): GrantDto => ({
  id: r.id,
  shardId: r.shard_id,
  target: r.target,
  restId: r.rest_id,
  minLevel: r.min_level,
  items: r.items as GrantItems,
  reason: r.reason,
  status: r.status,
  total: r.total,
  doneCount: r.done_count,
  failedCount: r.failed_count,
  actor: r.username,
  createdAt: r.created_at.toISOString(),
  finishedAt: r.finished_at?.toISOString() ?? null,
});

export function createAdminGrants(game: Game) {
  const { db, config } = game.app;

  function checkItems(items: GrantItems): void {
    const bad: Array<{ path: string; message: string }> = [];
    (items.goods ?? []).forEach((g, i) => {
      if (!config.goods.has(g.id)) bad.push({ path: `items.goods.${i}.id`, message: 'unknown' });
    });
    (items.foods ?? []).forEach((f, i) => {
      if (!config.foods.has(f.id)) bad.push({ path: `items.foods.${i}.id`, message: 'unknown' });
    });
    if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
  }

  function targets(shardId: number, minLevel: number | null | undefined) {
    let q = db.selectFrom('restaurant').where('shard_id', '=', shardId);
    if (minLevel) q = q.where('level', '>=', minLevel);
    return q;
  }

  async function one(id: number): Promise<GrantDto> {
    const r = await db
      .selectFrom('admin_grant as g')
      .leftJoin('account', 'account.id', 'g.actor_account_id')
      .selectAll('g')
      .select('account.username')
      .where('g.id', '=', id)
      .executeTakeFirstOrThrow();
    return toDto(r);
  }

  return {
    async preview(shardId: number, minLevel?: number): Promise<{ count: number }> {
      const r = await targets(shardId, minLevel)
        .select(({ fn }) => fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow();
      return { count: Number(r.n) };
    },

    async create(actor: AdminActor, b: CreateGrantInput): Promise<GrantDto> {
      checkItems(b.items);
      const shard = await db.selectFrom('shard').select('id').where('id', '=', b.shardId).executeTakeFirst();
      if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
      if (b.target === 'rest') {
        const restId = b.restId!;
        const rest = await db
          .selectFrom('restaurant')
          .select('id')
          .where('id', '=', restId)
          .where('shard_id', '=', b.shardId)
          .executeTakeFirst();
        if (!rest) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
        const id = await runSystemOp(game.deps, b.shardId, restId, { source: SOURCE }, async (op) => {
          await grantItemsOp(op, b.items, b.reason);
          const g = await op.tx
            .insertInto('admin_grant')
            .values({
              shard_id: b.shardId,
              target: 'rest',
              rest_id: restId,
              items: JSON.stringify(b.items),
              reason: b.reason,
              status: 'done',
              total: 1,
              done_count: 1,
              actor_account_id: actor.accountId,
              created_at: op.now,
              finished_at: op.now,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
          await op.tx
            .insertInto('admin_grant_done')
            .values({ grant_id: g.id, rest_id: restId, ok: true })
            .execute();
          await writeAudit(op.tx, {
            actor,
            action: 'grant.create',
            target: `restaurant:${restId}`,
            detail: { grantId: g.id, items: b.items, reason: b.reason },
          });
          return g.id;
        });
        return one(id);
      }
      const { count } = await this.preview(b.shardId, b.minLevel);
      const id = await db.transaction().execute(async (tx) => {
        const g = await tx
          .insertInto('admin_grant')
          .values({
            shard_id: b.shardId,
            target: 'shard',
            min_level: b.minLevel ?? null,
            items: JSON.stringify(b.items),
            reason: b.reason,
            status: 'pending',
            total: count,
            actor_account_id: actor.accountId,
            // created_at 用数据库时钟（默认值）：worker 用它和 restaurant.created_at（也是数据库时钟）比较，
            // 只发给发放前已开的店；不能用可推进的游戏时钟
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await writeAudit(tx, {
          actor,
          action: 'grant.create',
          target: `shard:${b.shardId}`,
          detail: {
            grantId: g.id,
            items: b.items,
            reason: b.reason,
            minLevel: b.minLevel ?? null,
            total: count,
          },
        });
        return g.id;
      });
      return one(id);
    },

    async list(shardId?: number): Promise<GrantDto[]> {
      let q = db
        .selectFrom('admin_grant as g')
        .leftJoin('account', 'account.id', 'g.actor_account_id')
        .selectAll('g')
        .select('account.username');
      if (shardId) q = q.where('g.shard_id', '=', shardId);
      return (await q.orderBy('g.id', 'desc').limit(50).execute()).map(toDto);
    },
  };
}

/**
 * worker 调度任务：取一条未完成的全区服发放，处理一批还没有结果的店。
 * 每家店的发放和结果记录在同一事务；结果表主键保证重跑、并发都不会重复到账（Review Focus 3）。
 * 单店出错单独记失败，不影响其他店；没有剩余目标时置为 done / failed
 */
export async function processGrants(game: Game, log: JobLogger, batch = 200): Promise<number> {
  const { db } = game.app;
  const g = await db
    .selectFrom('admin_grant')
    .selectAll()
    .where('target', '=', 'shard')
    .where('status', 'in', ['pending', 'running'])
    .orderBy('id')
    .limit(1)
    .executeTakeFirst();
  if (!g) return 0;
  if (g.status === 'pending')
    await db.updateTable('admin_grant').set({ status: 'running' }).where('id', '=', g.id).execute();
  const items = g.items as GrantItems;
  let q = db
    .selectFrom('restaurant')
    .select('id')
    .where('shard_id', '=', g.shard_id)
    .where('created_at', '<=', g.created_at)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('admin_grant_done')
            .select('rest_id')
            .where('grant_id', '=', g.id)
            .whereRef('admin_grant_done.rest_id', '=', 'restaurant.id'),
        ),
      ),
    );
  if (g.min_level !== null) q = q.where('level', '>=', g.min_level);
  const todo = await q.orderBy('id').limit(batch).execute();
  for (const { id: restId } of todo) {
    try {
      await runSystemOp(game.deps, g.shard_id, restId, { source: SOURCE }, async (op) => {
        const claimed = await op.tx
          .insertInto('admin_grant_done')
          .values({ grant_id: g.id, rest_id: restId, ok: true })
          .onConflict((oc) => oc.columns(['grant_id', 'rest_id']).doNothing())
          .returning('rest_id')
          .executeTakeFirst();
        if (!claimed) return;
        await grantItemsOp(op, items, g.reason);
      });
    } catch (err) {
      log.error({ err, grantId: g.id, restId }, 'admin grant failed');
      await db
        .insertInto('admin_grant_done')
        .values({
          grant_id: g.id,
          rest_id: restId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
        .onConflict((oc) => oc.columns(['grant_id', 'rest_id']).doNothing())
        .execute();
    }
  }
  const c = await db
    .selectFrom('admin_grant_done')
    .select([
      sql<number>`count(*) filter (where ok)`.as('ok'),
      sql<number>`count(*) filter (where not ok)`.as('bad'),
    ])
    .where('grant_id', '=', g.id)
    .executeTakeFirstOrThrow();
  const bad = Number(c.bad);
  const finished = todo.length < batch;
  await db
    .updateTable('admin_grant')
    .set({
      done_count: Number(c.ok),
      failed_count: bad,
      ...(finished
        ? { status: bad > 0 ? ('failed' as const) : ('done' as const), finished_at: game.deps.now() }
        : {}),
    })
    .where('id', '=', g.id)
    .execute();
  return todo.length;
}

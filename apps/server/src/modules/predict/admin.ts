import { sql } from 'kysely';
import { ErrorCode, initialShares, lmsrPrice, type PredictAdminRow, type PredictStatus } from '@dt/shared';
import { invalidState } from '../../core/errors';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';

const LIMIT = 100;

/** 事件合约后台（238-1 设计 §6.3、§7.3）：出题、列表、判定、作废 */
export function createPredictAdmin(game: Game) {
  const db = game.app.db;

  async function create(
    actor: AdminActor,
    b: { shardId: number; title: string; description: string; closeAt: string; p0: number; b?: number },
  ): Promise<{ id: number }> {
    const now = game.deps.now();
    const closeAt = new Date(b.closeAt);
    if (closeAt <= now) throw invalidState('predict_close_at');
    const t = (await game.deps.shards.settings(b.shardId)).tuning.predict;
    const liq = b.b ?? t.defaultB;
    const p0 = b.p0 / 100;
    const s = initialShares(p0, liq);
    return db.transaction().execute(async (tx) => {
      const r = await tx
        .insertInto('predict_event')
        .values({
          shard_id: b.shardId,
          title: b.title,
          description: b.description,
          b: liq,
          unit: t.unit,
          q_yes: s.y,
          q_no: s.n,
          p0,
          open_at: now,
          close_at: closeAt,
          status: 'open',
          created_by: actor.accountId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await writeAudit(tx, {
        actor,
        action: 'predict.create',
        target: `predict_event:${r.id}`,
        detail: { shardId: b.shardId, title: b.title, p0: b.p0, b: liq, closeAt: b.closeAt },
      });
      return { id: Number(r.id) };
    });
  }

  async function list(shardId: number): Promise<PredictAdminRow[]> {
    const rows = await db
      .selectFrom('predict_event as e')
      .leftJoin('account as a', 'a.id', 'e.created_by')
      .select([
        'e.id',
        'e.title',
        'e.status',
        'e.outcome',
        'e.close_at',
        'e.q_yes',
        'e.q_no',
        'e.b',
        'e.unit',
        'a.username as creator',
        sql<string>`(select count(*) from predict_trade t where t.event_id = e.id)`.as('trades'),
        sql<string>`(select count(*) from predict_position p where p.event_id = e.id and (p.yes > 0 or p.no > 0))`.as(
          'holders',
        ),
        sql<string>`(select coalesce(sum(t.fee), 0) from predict_trade t where t.event_id = e.id)`.as('fees'),
        sql<string>`(select coalesce(sum(case when t.dir = 'buy' then t.amount else -t.amount end), 0) from predict_trade t where t.event_id = e.id)`.as(
          'net',
        ),
        sql<string>`(select coalesce(sum(p.yes), 0) from predict_position p where p.event_id = e.id)`.as(
          'yes',
        ),
        sql<string>`(select coalesce(sum(p.no), 0) from predict_position p where p.event_id = e.id)`.as('no'),
      ])
      .where('e.shard_id', '=', shardId)
      .orderBy('e.id', 'desc')
      .limit(LIMIT)
      .execute();
    const now = game.deps.now();
    return rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      status: (r.status === 'open' && r.close_at <= now ? 'closed' : r.status) as PredictStatus,
      outcome: r.outcome,
      closeAt: r.close_at.toISOString(),
      price: lmsrPrice(r.q_yes, r.q_no, r.b),
      trades: Number(r.trades),
      holders: Number(r.holders),
      fees: Number(r.fees),
      ifYes: Number(r.net) - r.unit * Number(r.yes),
      ifNo: Number(r.net) - r.unit * Number(r.no),
      creator: r.creator ?? null,
    }));
  }

  /** 判定 / 作废：只在短事务里锁事件行改状态；发钱由结算任务做 */
  async function finish(
    actor: AdminActor,
    id: number,
    set: { status: 'resolved' | 'void'; outcome: boolean | null },
  ) {
    const now = game.deps.now();
    await db.transaction().execute(async (tx) => {
      const e = await tx
        .selectFrom('predict_event')
        .select(['status', 'title'])
        .where('id', '=', String(id))
        .forUpdate()
        .executeTakeFirst();
      if (!e) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'predict_event', id });
      if (e.status !== 'open' && e.status !== 'closed') throw invalidState('predict_final');
      await tx
        .updateTable('predict_event')
        .set({ status: set.status, outcome: set.outcome, resolved_at: now })
        .where('id', '=', String(id))
        .execute();
      await writeAudit(tx, {
        actor,
        action: set.status === 'resolved' ? 'predict.resolve' : 'predict.void',
        target: `predict_event:${id}`,
        detail: { title: e.title, ...(set.status === 'resolved' ? { outcome: set.outcome } : {}) },
      });
    });
    return { ok: true as const };
  }

  return {
    create,
    list,
    resolve: (actor: AdminActor, id: number, outcome: boolean) =>
      finish(actor, id, { status: 'resolved', outcome }),
    voidEvent: (actor: AdminActor, id: number) => finish(actor, id, { status: 'void', outcome: null }),
  };
}

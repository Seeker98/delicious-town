import { sql } from 'kysely';
import {
  ErrorCode,
  gameDay,
  type AdminBulkFoodDto,
  type AdminBulkLotDto,
  type AdminBulkUpdateInput,
} from '@dt/shared';
import type { Game } from '../../game';
import { invalidState } from '../../core/errors';
import { foodPrice } from '../../core/prices';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { refPrices } from '../exchange/ref';
import { futuresUnitPrice } from '../futures/rules';
import { bulkReserve } from './rules';
import { payOut } from './settle';

/** 后台列几批 */
const LOTS = 30;

/** 后台“大宗认购”页（大宗认购设计 §3.2）：认购食材清单（全服一份）、从期货同步、批次和取消 */
export function createAdminBulk(game: Game) {
  const { db, config } = game.app;

  /** 1~5 级、没下架的食材（能进清单的范围） */
  const candidates = () =>
    [...config.foods.values()]
      .filter((f) => f.level >= 1 && f.level <= 5 && !f.retired)
      .sort((a, b) => a.level - b.level || a.id - b.id);

  return {
    async list(shardId: number): Promise<AdminBulkFoodDto[]> {
      const s = await game.shards.settings(shardId);
      const foods = candidates();
      const [rows, futures, refs] = await Promise.all([
        db.selectFrom('bulk_food').select(['foods_id', 'enabled']).execute(),
        db.selectFrom('futures_food').select(['foods_id', 'enabled']).execute(),
        refPrices(
          db,
          config,
          s.tuning.exchange,
          s.tuning.market.levelPriceRate,
          shardId,
          foods.map((f) => f.id),
          gameDay(game.deps.now()),
        ),
      ]);
      const mine = new Map(rows.map((r) => [r.foods_id, r.enabled]));
      const fut = new Map(futures.map((r) => [r.foods_id, r.enabled]));
      return foods.map((f) => ({
        foodsId: f.id,
        level: f.level,
        rare: f.odds < 100,
        inList: mine.has(f.id),
        enabled: mine.get(f.id) ?? false,
        futuresEnabled: fut.get(f.id) ?? null,
        reserve: bulkReserve(
          futuresUnitPrice(foodPrice(f, s.tuning.market), refs.get(f.id)!, s.tuning.futures),
          s.tuning.bulk,
        ),
      }));
    },

    /** 批量启用、停用：不在清单里的加进来。有一种不合法整批不改；审计带改前的样子 */
    async update(actor: AdminActor, items: AdminBulkUpdateInput['items']): Promise<void> {
      const ok = new Set(candidates().map((f) => f.id));
      const bad = items.flatMap((x, i) =>
        ok.has(x.foodsId) ? [] : [{ path: `items.${i}.foodsId`, message: 'unknown' }],
      );
      if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
      await db.transaction().execute(async (tx) => {
        const cur = new Map(
          (
            await tx
              .selectFrom('bulk_food')
              .select(['foods_id', 'enabled'])
              .where(
                'foods_id',
                'in',
                items.map((x) => x.foodsId),
              )
              .forUpdate()
              .execute()
          ).map((r) => [r.foods_id, r.enabled]),
        );
        const before = items.map((x) => ({ foodsId: x.foodsId, enabled: cur.get(x.foodsId) ?? null }));
        for (const x of items)
          await tx
            .insertInto('bulk_food')
            .values({ foods_id: x.foodsId, enabled: x.enabled, updated_by: actor.accountId })
            .onConflict((oc) =>
              oc.column('foods_id').doUpdateSet({
                enabled: x.enabled,
                updated_at: sql<Date>`now()`,
                updated_by: actor.accountId,
              }),
            )
            .execute();
        await writeAudit(tx, { actor, action: 'bulk.foods', target: 'bulk', detail: { before, items } });
      });
    },

    /**
     * 从期货同步（设计 §3.2）：期货里启用的在这里设成启用（不在清单里的加进来）；期货里有、没启用的设成停用；
     * 期货表里没有的食材不动。审计带改前改后
     */
    async sync(actor: AdminActor): Promise<void> {
      const ok = new Set(candidates().map((f) => f.id));
      const futures = (await db.selectFrom('futures_food').select(['foods_id', 'enabled']).execute()).filter(
        (r) => ok.has(r.foods_id),
      );
      const ids = futures.map((r) => r.foods_id);
      await db.transaction().execute(async (tx) => {
        const before =
          ids.length === 0
            ? []
            : (
                await tx
                  .selectFrom('bulk_food')
                  .select(['foods_id', 'enabled'])
                  .where('foods_id', 'in', ids)
                  .forUpdate()
                  .execute()
              ).map((r) => ({ foodsId: r.foods_id, enabled: r.enabled }));
        for (const r of futures) {
          if (r.enabled)
            await tx
              .insertInto('bulk_food')
              .values({ foods_id: r.foods_id, enabled: true, updated_by: actor.accountId })
              .onConflict((oc) =>
                oc
                  .column('foods_id')
                  .doUpdateSet({ enabled: true, updated_at: sql<Date>`now()`, updated_by: actor.accountId }),
              )
              .execute();
          else
            await tx
              .updateTable('bulk_food')
              .set({ enabled: false, updated_at: sql<Date>`now()`, updated_by: actor.accountId })
              .where('foods_id', '=', r.foods_id)
              .execute();
        }
        const after = futures.map((r) => ({ foodsId: r.foods_id, enabled: r.enabled }));
        await writeAudit(tx, { actor, action: 'bulk.sync', target: 'bulk', detail: { before, after } });
      });
    },

    async lots(shardId: number): Promise<AdminBulkLotDto[]> {
      const rows = await db
        .selectFrom('bulk_lot as l')
        .leftJoin('bulk_bid as b', 'b.lot_id', 'l.id')
        .selectAll('l')
        .select((eb) => [
          eb.fn.count<string>('b.rest_id').as('bidders'),
          eb.fn.coalesce(eb.fn.sum<string>('b.qty'), eb.lit(0)).as('demand'),
        ])
        .where('l.shard_id', '=', shardId)
        .groupBy('l.id')
        .orderBy('l.opens_at', 'desc')
        .limit(LOTS)
        .execute();
      return rows.map((l) => ({
        id: Number(l.id),
        day: String(l.day),
        foodsId: l.foods_id,
        level: l.level,
        qty: l.qty,
        reserve: Number(l.reserve),
        opensAt: l.opens_at.toISOString(),
        endsAt: l.ends_at.toISOString(),
        closeAt: l.close_at.toISOString(),
        status: l.status,
        price: l.price === null ? null : Number(l.price),
        sold: l.sold,
        bidders: Number(l.bidders),
        demand: Number(l.demand),
      }));
    },

    /** 取消进行中的批次（设计 §3.2）：改成 cancelled；钱由结算第二段退，这里先跑一次，失败了下一分钟任务补 */
    async cancel(actor: AdminActor, lotId: number): Promise<void> {
      const now = game.deps.now();
      const lot = await db.transaction().execute(async (tx) => {
        const l = await tx
          .selectFrom('bulk_lot')
          .select(['id', 'shard_id', 'status'])
          .where('id', '=', String(lotId))
          .forUpdate()
          .executeTakeFirst();
        if (!l || l.status !== 'open') throw invalidState('bulk_not_open');
        await tx
          .updateTable('bulk_lot')
          .set({ status: 'cancelled', settled_at: now })
          .where('id', '=', l.id)
          .execute();
        await writeAudit(tx, { actor, action: 'bulk.cancel', target: `bulk_lot:${l.id}`, detail: { lotId } });
        return l;
      });
      await payOut(game.deps, lot.shard_id, now).catch(() => undefined);
    },
  };
}

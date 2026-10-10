import { sql } from 'kysely';
import { ErrorCode, gameDay, type AdminFuturesFoodDto, type AdminFuturesUpdateInput } from '@dt/shared';
import type { Game } from '../../game';
import { foodPrice } from '../../core/prices';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { refPrices } from '../exchange/ref';
import { futuresQuota, futuresUnitPrice } from './rules';

/** 后台“期货食材”页（期货设计 §5.3）：全服一份列表；价格、已订份数按所选区服 */
export function createAdminFutures(game: Game) {
  const { db, config } = game.app;

  /** 1~5 级、没下架的食材（能上架的范围） */
  const candidates = () =>
    [...config.foods.values()]
      .filter((f) => f.level >= 1 && f.level <= 5 && !f.retired)
      .sort((a, b) => a.level - b.level || a.id - b.id);

  /** 每种食材有哪些街道的菜谱要用 */
  function streetsOf(): Map<number, number[]> {
    const m = new Map<number, Set<number>>();
    for (const c of config.cookbooks.values())
      for (const list of Object.values(c.needFoods))
        for (const x of list) {
          const s = m.get(x.foodsId) ?? new Set<number>();
          s.add(c.streetId);
          m.set(x.foodsId, s);
        }
    return new Map([...m].map(([id, s]) => [id, [...s].sort((a, b) => a - b)]));
  }

  return {
    async list(shardId: number): Promise<AdminFuturesFoodDto[]> {
      const s = await game.shards.settings(shardId);
      const t = s.tuning.futures;
      const day = gameDay(game.deps.now());
      const foods = candidates();
      const [rows, used, refs] = await Promise.all([
        db.selectFrom('futures_food').select(['foods_id', 'enabled', 'daily_quota']).execute(),
        db
          .selectFrom('futures_quota')
          .select(['foods_id', 'used'])
          .where('shard_id', '=', shardId)
          .where('day', '=', day)
          .execute(),
        refPrices(
          db,
          config,
          s.tuning.exchange,
          s.tuning.market.levelPriceRate,
          shardId,
          foods.map((f) => f.id),
          day,
        ),
      ]);
      const byId = new Map(rows.map((r) => [r.foods_id, r]));
      const usedBy = new Map(used.map((r) => [r.foods_id, r.used]));
      const streets = streetsOf();
      return foods.map((f) => {
        const r = byId.get(f.id);
        const levelPrice = foodPrice(f, s.tuning.market);
        const ref = refs.get(f.id)!;
        return {
          foodsId: f.id,
          level: f.level,
          rare: f.odds < 100,
          inList: r !== undefined,
          enabled: r?.enabled ?? false,
          dailyQuota: r?.daily_quota ?? null,
          defaultQuota: futuresQuota(f.level, null, t),
          streets: streets.get(f.id) ?? [],
          ref,
          levelPrice,
          unitPrice: futuresUnitPrice(levelPrice, ref, t),
          ordered: usedBy.get(f.id) ?? 0,
        };
      });
    },

    /** 批量改：不在表里的加进表（没给 enabled 时按下架加）；dailyQuota null 恢复默认。有一种不合法整批不改 */
    async update(actor: AdminActor, items: AdminFuturesUpdateInput['items']): Promise<void> {
      const ok = new Set(candidates().map((f) => f.id));
      const bad = items.flatMap((x, i) =>
        ok.has(x.foodsId) ? [] : [{ path: `items.${i}.foodsId`, message: 'unknown' }],
      );
      if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
      await db.transaction().execute(async (tx) => {
        // 审计写改前的样子（期货设计 §5.3，终审 I2）：不在表里的记 null，批量改错了能照着恢复
        const cur = new Map(
          (
            await tx
              .selectFrom('futures_food')
              .select(['foods_id', 'enabled', 'daily_quota'])
              .where(
                'foods_id',
                'in',
                items.map((x) => x.foodsId),
              )
              .forUpdate()
              .execute()
          ).map((r) => [r.foods_id, r]),
        );
        const before = items.map((x) => ({
          foodsId: x.foodsId,
          enabled: cur.get(x.foodsId)?.enabled ?? null,
          dailyQuota: cur.get(x.foodsId)?.daily_quota ?? null,
        }));
        for (const x of items)
          await tx
            .insertInto('futures_food')
            .values({
              foods_id: x.foodsId,
              enabled: x.enabled ?? false,
              daily_quota: x.dailyQuota ?? null,
              updated_by: actor.accountId,
            })
            .onConflict((oc) =>
              oc.column('foods_id').doUpdateSet({
                ...(x.enabled !== undefined ? { enabled: x.enabled } : {}),
                ...(x.dailyQuota !== undefined ? { daily_quota: x.dailyQuota } : {}),
                updated_at: sql<Date>`now()`,
                updated_by: actor.accountId,
              }),
            )
            .execute();
        await writeAudit(tx, {
          actor,
          action: 'futures.foods',
          target: 'futures',
          detail: { before, items },
        });
      });
    },
  };
}

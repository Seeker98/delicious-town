import { GOODS_TYPE } from '@dt/config';
import {
  addDays,
  gameParts,
  gameTime,
  type LedgerRecordDto,
  type RecordsRange,
  type StoreDto,
} from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { featureAvailable } from '../../core/features';
import { runOp } from '../../core/op';
import { looseEquipCount } from './goods';
import { sellPrice } from './rules';
import { useGoods } from './use';

const HOUR = 3600_000;

function rangeOf(range: RecordsRange, now: Date): [Date, Date] {
  const hours = { '1h': 1, '6h': 6, '12h': 12 } as const;
  if (range in hours) return [new Date(now.getTime() - hours[range as keyof typeof hours] * HOUR), now];
  const day = gameParts(now).day;
  if (range === 'today') return [gameTime(day, 0), now];
  if (range === 'yesterday') return [gameTime(addDays(day, -1), 0), gameTime(day, 0)];
  return [gameTime(addDays(day, -2), 0), gameTime(addDays(day, -1), 0)];
}

export function createStoreService(d: GameDeps) {
  return {
    async list(ctx: RestCtx, q: { type?: number }): Promise<StoreDto> {
      const now = d.now();
      const [rest, settings] = await Promise.all([
        d.db
          .selectFrom('restaurant')
          .select('store_num')
          .where('id', '=', ctx.restaurantId)
          .executeTakeFirstOrThrow(),
        d.shards.settings(ctx.shardId),
      ]);
      const rows = await d.db
        .selectFrom('store_item')
        .selectAll()
        .where('rest_id', '=', ctx.restaurantId)
        .where('num', '>', 0)
        .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
        .orderBy('goods_id')
        .execute();
      const items = rows
        .map((r) => ({ r, g: d.config.goods.get(r.goods_id) }))
        .filter((x) => x.g !== undefined && (q.type === undefined || x.g.type === q.type))
        .map(({ r, g }) => {
          const use = g!.use;
          const usable = use !== null && (use.kind !== 'towerTicket' || featureAvailable(settings, 'tower'));
          const batch =
            usable && (use!.kind === 'gift' || settings.tuning.store.batchUsable.includes(r.goods_id));
          return {
            goodsId: r.goods_id,
            num: r.num,
            expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
            usable,
            batch,
            maxUse: !usable ? 0 : batch ? Math.min(r.num, settings.tuning.store.maxBatch) : 1,
            sellPrice: sellPrice(g!, settings.tuning),
          };
        });
      const equips = await looseEquipCount(d.db, ctx.restaurantId);
      const kinds =
        rows.filter((r) => d.config.goods.get(r.goods_id)?.type !== GOODS_TYPE.honor).length + equips;
      return { kinds, storeNum: rest.store_num, equips, items };
    },

    async records(ctx: RestCtx, q: { range: RecordsRange }): Promise<LedgerRecordDto[]> {
      const [from, to] = rangeOf(q.range, d.now());
      const rows = await d.db
        .selectFrom('ledger')
        .select(['kind', 'item_id', 'delta', 'source', 'created_at'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('created_at', '>=', from)
        .where('created_at', '<', new Date(to.getTime() + 1))
        .orderBy('created_at', 'desc')
        .limit(200)
        .execute();
      return rows.map((r) => ({
        kind: r.kind,
        itemId: r.item_id,
        delta: r.delta,
        source: r.source,
        at: r.created_at.toISOString(),
      }));
    },

    use(ctx: RestCtx, b: { goodsId: number; num: number }) {
      return runOp(d, ctx, { feature: 'store', source: 'store.use' }, (op) => useGoods(op, b.goodsId, b.num));
    },
  };
}

export type StoreService = ReturnType<typeof createStoreService>;

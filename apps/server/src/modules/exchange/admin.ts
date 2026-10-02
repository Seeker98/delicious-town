import { sql } from 'kysely';
import {
  gameDay,
  gameTime,
  type ExchangeMakerDto,
  type ExchangeFlag,
  type ExchangeFrozenRow,
  type ExchangeSuspiciousRow,
  type ExchangeSuspiciousSide,
} from '@dt/shared';
import type { Game } from '../../game';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { makerBase, makerPrices, marketFloor } from './maker';
import { refPrices } from './ref';
import { priceBand } from './rules';
import { bookLock } from './service';
import { addCredit, creditWallets, newCredits } from './wallet';

const KEEP_DAYS = 7;
const LIMIT = 200;

/** 交易所后台（156-2 设计 §6、§7）：可疑成交列表、冻结名单、冻结、解冻、没收 */
export function createExchangeAdmin(game: Game) {
  const db = game.app.db;

  async function suspicious(shardId: number, flag?: ExchangeFlag): Promise<ExchangeSuspiciousRow[]> {
    const since = new Date(game.deps.now().getTime() - KEEP_DAYS * 86_400_000);
    let q = db
      .selectFrom('exchange_trade as t')
      .leftJoin('restaurant as rb', 'rb.id', 't.buyer_rest_id')
      .leftJoin('restaurant as rs', 'rs.id', 't.seller_rest_id')
      .leftJoin('account as ab', 'ab.id', 't.buyer_account_id')
      .leftJoin('account as as', 'as.id', 't.seller_account_id')
      .leftJoin('exchange_ref as r', (j) =>
        j
          .onRef('r.shard_id', '=', 't.shard_id')
          .onRef('r.foods_id', '=', 't.foods_id')
          .on('r.day', '=', sql<string>`(t.created_at at time zone 'Asia/Shanghai')::date`),
      )
      .select([
        't.id',
        't.created_at',
        't.foods_id',
        't.price',
        't.qty',
        't.flags',
        't.buyer_rest_id',
        't.seller_rest_id',
        't.buyer_account_id',
        't.seller_account_id',
        'rb.name as buyer_name',
        'rs.name as seller_name',
        'ab.username as buyer_user',
        'as.username as seller_user',
        'r.price as ref',
      ])
      .where('t.shard_id', '=', shardId)
      .where('t.created_at', '>=', since)
      // 系统成交没有标记，也不进这个列表（156-3）
      .where('t.system', '=', false)
      .where(sql<boolean>`t.flags <> '{}'`);
    if (flag) q = q.where(sql<boolean>`${flag} = any(t.flags)`);
    const rows = await q.orderBy('t.id', 'desc').limit(LIMIT).execute();
    const holds = rows.length
      ? await db
          .selectFrom('exchange_hold')
          .select(['trade_id', 'rest_id', 'status'])
          .where(
            'trade_id',
            'in',
            rows.map((r) => r.id),
          )
          .execute()
      : [];
    const holdOf = (tradeId: string, restId: number) =>
      holds.find((h) => h.trade_id === tradeId && h.rest_id === restId)?.status ?? null;
    const side = (
      restId: number,
      name: string | null,
      accountId: number | null,
      username: string | null,
      tradeId: string,
    ): ExchangeSuspiciousSide => ({
      restId,
      restName: name,
      accountId,
      username,
      hold: holdOf(tradeId, restId),
    });
    return rows.map((r) => ({
      tradeId: Number(r.id),
      at: r.created_at.toISOString(),
      foodsId: r.foods_id,
      price: r.price,
      ref: r.ref ?? null,
      qty: r.qty,
      amount: r.price * r.qty,
      flags: r.flags as ExchangeFlag[],
      buyer: side(r.buyer_rest_id!, r.buyer_name, r.buyer_account_id, r.buyer_user, r.id),
      seller: side(r.seller_rest_id!, r.seller_name, r.seller_account_id, r.seller_user, r.id),
    }));
  }

  async function frozen(shardId: number): Promise<ExchangeFrozenRow[]> {
    const rows = await db
      .selectFrom('exchange_freeze as f')
      .innerJoin('restaurant as r', 'r.id', 'f.rest_id')
      .innerJoin('account as a', 'a.id', 'r.account_id')
      .leftJoin('account as x', 'x.id', 'f.actor_account_id')
      .select([
        'f.rest_id',
        'r.name',
        'a.username',
        'f.reason',
        'x.username as actor',
        'f.created_at',
        sql<string>`(select coalesce(sum(h.coin), 0) from exchange_hold h where h.rest_id = f.rest_id and h.status = 'held')`.as(
          'held_coin',
        ),
        sql<string>`(select coalesce(sum(h.num), 0) from exchange_hold h where h.rest_id = f.rest_id and h.status = 'held')`.as(
          'held_foods',
        ),
      ])
      .where('r.shard_id', '=', shardId)
      .orderBy('f.created_at', 'desc')
      .execute();
    return rows.map((r) => ({
      restId: r.rest_id,
      restName: r.name,
      username: r.username,
      reason: r.reason,
      actor: r.actor ?? null,
      at: r.created_at.toISOString(),
      heldCoin: Number(r.held_coin),
      heldFoods: Number(r.held_foods),
    }));
  }

  /** 冻结：写名单，撤掉全部挂单（剩余退进交易所账户，盘口按食材 id 顺序加锁） */
  async function freeze(actor: AdminActor, b: { restId: number; reason: string }) {
    const now = game.deps.now();
    await db.transaction().execute(async (tx) => {
      // 先锁店（和 withRestaurant 同一种锁）：正在进行的下单、取出做完才冻结，冻结之后它们会读到冻结名单；
      // 加锁顺序是 店 → 盘口 → 账户，和下单一致（156-2 终审 I1）
      const rest = await tx
        .selectFrom('restaurant')
        .select('shard_id')
        .where('id', '=', b.restId)
        .forNoKeyUpdate()
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('exchange_freeze')
        .values({ rest_id: b.restId, reason: b.reason, actor_account_id: actor.accountId })
        .onConflict((oc) =>
          oc.column('rest_id').doUpdateSet({ reason: b.reason, actor_account_id: actor.accountId }),
        )
        .execute();
      const open = await tx
        .selectFrom('exchange_order')
        .select('foods_id')
        .distinct()
        .where('rest_id', '=', b.restId)
        .where('status', '=', 'open')
        .orderBy('foods_id')
        .execute();
      const c = newCredits();
      for (const { foods_id } of open) {
        await bookLock(tx, rest.shard_id, foods_id);
        const rows = await tx
          .updateTable('exchange_order')
          .set({ status: 'cancelled', closed_at: now })
          .where('rest_id', '=', b.restId)
          .where('foods_id', '=', foods_id)
          .where('status', '=', 'open')
          .returning(['side', 'price', 'qty', 'filled'])
          .execute();
        for (const r of rows) {
          const left = r.qty - r.filled;
          if (r.side === 'buy') addCredit(c, b.restId, r.price * left);
          else addCredit(c, b.restId, 0, foods_id, left);
        }
      }
      await creditWallets(tx, c);
      await writeAudit(tx, {
        actor,
        action: 'exchange.freeze',
        target: `rest:${b.restId}`,
        detail: { reason: b.reason },
      });
    });
    return { ok: true as const };
  }

  async function unfreeze(actor: AdminActor, b: { restId: number }) {
    await db.transaction().execute(async (tx) => {
      await tx.deleteFrom('exchange_freeze').where('rest_id', '=', b.restId).execute();
      await writeAudit(tx, { actor, action: 'exchange.unfreeze', target: `rest:${b.restId}` });
    });
    return { ok: true as const };
  }

  /** 没收冻结中的所得：按成交（双方）或按店（全部）；已解冻的不追回 */
  async function confiscate(actor: AdminActor, b: { tradeId: number } | { restId: number }) {
    return db.transaction().execute(async (tx) => {
      let q = tx.updateTable('exchange_hold').set({ status: 'confiscated' }).where('status', '=', 'held');
      q = 'tradeId' in b ? q.where('trade_id', '=', String(b.tradeId)) : q.where('rest_id', '=', b.restId);
      const rows = await q.returning(['coin', 'num']).execute();
      const coin = rows.reduce((s, r) => s + Number(r.coin), 0);
      const foods = rows.reduce((s, r) => s + r.num, 0);
      await writeAudit(tx, {
        actor,
        action: 'exchange.confiscate',
        target: 'tradeId' in b ? `exchange_trade:${b.tradeId}` : `rest:${b.restId}`,
        detail: { coin, foods, count: rows.length },
      });
      return { count: rows.length, coin, foods };
    });
  }

  /** 系统做市汇总（只读）：有库存或今天有收购的食材，和今天的银币收支 */
  async function maker(shardId: number): Promise<ExchangeMakerDto> {
    const now = game.deps.now();
    const day = gameDay(now);
    const s = await game.deps.shards.settings(shardId);
    const t = s.tuning.exchange;
    const stock = await db
      .selectFrom('exchange_stock')
      .select(['foods_id', 'num'])
      .where('shard_id', '=', shardId)
      .where('num', '>', 0)
      .execute();
    const bought = await db
      .selectFrom('exchange_maker_day')
      .select(['foods_id', 'bought'])
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .where('bought', '>', 0)
      .execute();
    const stockBy = new Map(stock.map((x) => [x.foods_id, x.num]));
    const boughtBy = new Map(bought.map((x) => [x.foods_id, x.bought]));
    const ids = [...new Set([...stockBy.keys(), ...boughtBy.keys()])].sort((a, b) => a - b);
    const refs = await refPrices(db, game.deps.config, t, shardId, ids, day);
    const foods = ids.map((id) => {
      const ref = refs.get(id)!;
      const food = game.deps.config.requireFood(id);
      const p = makerPrices(
        ref,
        marketFloor(food, game.deps.config, s.tuning.market),
        priceBand(ref, t),
        t.maker,
        makerBase(food, game.deps.config, t),
      );
      return {
        foodsId: id,
        stock: stockBy.get(id) ?? 0,
        bought: boughtBy.get(id) ?? 0,
        bid: p.bid,
        ask: p.ask,
      };
    });
    const agg = await db
      .selectFrom('exchange_trade')
      .select([
        sql<string>`coalesce(sum(case when buyer_rest_id is null then price::bigint * qty else 0 end), 0)`.as(
          'spent',
        ),
        sql<string>`coalesce(sum(case when seller_rest_id is null then price::bigint * qty else 0 end), 0)`.as(
          'earned',
        ),
        sql<string>`coalesce(sum(case when buyer_rest_id is null then fee else 0 end), 0)`.as('fee'),
      ])
      .where('shard_id', '=', shardId)
      .where('system', '=', true)
      .where('created_at', '>=', gameTime(day, 0))
      .executeTakeFirstOrThrow();
    const spent = Number(agg.spent);
    const earned = Number(agg.earned);
    const fee = Number(agg.fee);
    return { foods, today: { spent, earned, fee, net: earned - spent + fee } };
  }

  return { suspicious, frozen, freeze, unfreeze, confiscate, maker };
}

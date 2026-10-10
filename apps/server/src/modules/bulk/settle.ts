import type { GameDeps } from '../../core/deps';
import { restLog, runSystemOp } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { addFoods } from '../cupboard/foods';
import { addCredit, creditWallets, newCredits } from '../exchange/wallet';
import { postNews } from '../news/news';
import { grantGoodsOp } from '../store/goods';
import { allocate, consolationLine } from './rules';

type Log = { error(obj: object, msg: string): void };
const NO_LOG: Log = { error: () => {} };

/** 第二段一轮最多处理几条出价（多出的下一分钟接着处理），同期货交割 */
const BATCH = 500;

/**
 * 第一段（大宗认购设计 §1.4）：到了收盘时刻还是 open 的批次，锁住批次行，按出价算成交价和每家中几份，
 * 写进批次和每条出价，改状态。出价时对批次行拿共享锁，这里拿排他锁：正在提交的出价先提交，之后的出价看到状态已变
 */
export async function closeDue(d: GameDeps, shardId: number, now: Date): Promise<number> {
  const due = await d.db
    .selectFrom('bulk_lot')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('close_at', '<=', now)
    .execute();
  let n = 0;
  for (const { id } of due) {
    const closed = await d.db.transaction().execute(async (tx) => {
      const lot = await tx
        .selectFrom('bulk_lot')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!lot || lot.status !== 'open') return false;
      const bids = await tx.selectFrom('bulk_bid').selectAll().where('lot_id', '=', id).execute();
      const a = allocate(
        lot.qty,
        bids.map((b) => ({ restId: b.rest_id, price: Number(b.price), qty: b.qty, rankedAt: b.ranked_at })),
      );
      const ok = a.demand >= lot.group_qty && a.price !== null;
      await tx
        .updateTable('bulk_lot')
        .set({
          status: ok ? 'settled' : 'failed',
          price: ok ? a.price : null,
          sold: ok ? a.sold : 0,
          settled_at: now,
        })
        .where('id', '=', id)
        .execute();
      for (const b of bids)
        await tx
          .updateTable('bulk_bid')
          .set({ won: ok ? (a.won.get(b.rest_id) ?? 0) : 0 })
          .where('lot_id', '=', id)
          .where('rest_id', '=', b.rest_id)
          .execute();
      if (ok)
        await postNews(
          tx,
          {
            shardId,
            type: 'bulk.deal',
            params: { foodsId: lot.foods_id, sold: a.sold, price: a.price, demand: a.demand, qty: lot.qty },
          },
          now,
        );
      return true;
    });
    if (closed) n++;
  }
  return n;
}

/**
 * 第二段：已结束（成交、流拍、取消）的批次里还没处理的出价，每家店一个事务（锁店）：
 * 中标的按成交价扣、多冻结的退回、发货（橱柜放不下的进交易所账户）；落选、流拍、取消的全额退回；
 * 差一点没中的发安慰奖。写了 settled_at 的不再处理，重跑不会重复；某家失败只记日志，下一分钟重试
 */
export async function payOut(
  d: GameDeps,
  shardId: number,
  now: Date,
  log: Log = NO_LOG,
): Promise<{ done: number; failed: number }> {
  const todo = await d.db
    .selectFrom('bulk_bid as b')
    .innerJoin('bulk_lot as l', 'l.id', 'b.lot_id')
    .select(['b.rest_id', 'b.lot_id'])
    .where('b.shard_id', '=', shardId)
    .where('b.settled_at', 'is', null)
    .where('l.status', '!=', 'open')
    .orderBy('b.rest_id')
    .orderBy('b.lot_id')
    .limit(BATCH)
    .execute();
  const byRest = new Map<number, string[]>();
  for (const r of todo) byRest.set(r.rest_id, [...(byRest.get(r.rest_id) ?? []), r.lot_id]);
  let done = 0;
  let failed = 0;
  for (const [restId, lotIds] of byRest) {
    try {
      done += await runSystemOp(d, shardId, restId, { source: 'bulk', now }, async (op) => {
        const bids = await op.tx
          .selectFrom('bulk_bid')
          .selectAll()
          .where('rest_id', '=', restId)
          .where('lot_id', 'in', lotIds)
          .where('settled_at', 'is', null)
          .forUpdate()
          .execute();
        const lots = new Map(
          (await op.tx.selectFrom('bulk_lot').selectAll().where('id', 'in', lotIds).execute()).map((l) => [
            l.id,
            l,
          ]),
        );
        const credits = newCredits();
        let n = 0;
        for (const b of bids) {
          const lot = lots.get(b.lot_id)!;
          const frozen = Number(b.frozen);
          const base = { lotId: Number(lot.id), foodsId: lot.foods_id };
          let paid = 0;
          let consolation = false;
          if (lot.status === 'settled' && (b.won ?? 0) > 0) {
            const won = b.won!;
            const price = Number(lot.price);
            paid = price * won;
            // 冻结的钱不够付：数据坏了，这一家整个回滚，留给人查（正常出价不会出现）
            if (paid > frozen)
              throw new Error(`bulk bid ${lot.id}/${restId} frozen ${frozen} < paid ${paid}`);
            const plan = await addFoods(op, lot.foods_id, won, { source: 'bulk', keepDropped: true });
            if (plan.dropped > 0) addCredit(credits, op.rest.id, 0, lot.foods_id, plan.dropped);
            gainCoin(op, frozen - paid, { source: 'bulk.refund' });
            restLog(op, 'bulk.won', {
              ...base,
              won,
              qty: b.qty,
              price,
              paid,
              refunded: frozen - paid,
              toWallet: plan.dropped,
            });
          } else {
            gainCoin(op, frozen, { source: 'bulk.refund' });
            if (lot.status === 'settled') {
              // 一份都没中、出价不低于成交价 × consolationRate：安慰奖（设计 §1.4）
              const c = op.tuning.bulk.consolation;
              consolation = Number(b.price) >= consolationLine(Number(lot.price), op.tuning.bulk);
              if (consolation) await grantGoodsOp(op, c.goods, c.num, { source: 'bulk.consolation' });
              restLog(op, 'bulk.lost', { ...base, qty: b.qty, refunded: frozen, consolation });
            } else
              restLog(op, lot.status === 'failed' ? 'bulk.failed' : 'bulk.cancelled', {
                ...base,
                refunded: frozen,
              });
          }
          await op.tx
            .updateTable('bulk_bid')
            .set({ paid, refunded: frozen - paid, consolation, settled_at: now })
            .where('lot_id', '=', b.lot_id)
            .where('rest_id', '=', restId)
            .execute();
          n++;
        }
        await creditWallets(op.tx, credits);
        return n;
      });
    } catch (err) {
      log.error({ err, shardId, restId }, 'bulk pay out failed');
      failed++;
    }
  }
  return { done, failed };
}

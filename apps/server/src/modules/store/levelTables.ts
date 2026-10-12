import { GOODS } from '@dt/config';
import { restLog, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { consumeGoods, countGoods } from './goods';
import { addTables } from './use';

/**
 * 升级自动摆餐桌（用户 2026-10-12）：每升一级餐桌上限 +1，就补一张桌。先用仓库里的餐桌A，没有再按商店价花银币买；
 * 楼层放满（要升星）、银币不够、商店不卖时不买不扣，动态里写明没买成和原因。成功的合成一条动态，没买成的另写一条
 */
export async function levelUpTables(op: Op, levels: number): Promise<void> {
  if (levels <= 0 || op.rest.npc) return;
  const g = op.config.requireGoods(GOODS.tableA);
  const price = g.onSale ? g.coin : 0;
  const tr = await op.tx
    .selectFrom('restaurant_tables')
    .select('tables')
    .where('rest_id', '=', op.rest.id)
    .executeTakeFirst();
  if (!tr) return;
  const cap = Math.min(op.rest.table_num, (op.rest.star_level + 1) * op.tuning.rest.tablesPerFloor);
  let count = tr.tables.length;
  let fromStore = 0;
  let coin = 0;
  let failed = 0;
  let reason: 'full' | 'coin' | null = null;
  let stock = await countGoods(op, GOODS.tableA);
  for (let i = 0; i < levels; i++) {
    if (count >= cap) {
      failed += 1;
      reason ??= 'full';
      continue;
    }
    if (stock > 0) {
      await consumeGoods(op, GOODS.tableA, 1, { source: 'table.auto' });
      stock -= 1;
      fromStore += 1;
    } else if (price > 0 && op.rest.coin >= price) {
      spendCoin(op, price, { source: 'table.auto', event: false });
      coin += price;
    } else {
      failed += 1;
      reason ??= 'coin';
      continue;
    }
    count = await addTables(op, 1);
  }
  const added = levels - failed;
  if (added > 0) restLog(op, 'table.auto', { num: added, store: fromStore, coin, goodsId: GOODS.tableA });
  if (failed > 0)
    restLog(op, 'table.autoFail', { num: failed, reason, price: g.coin, goodsId: GOODS.tableA });
}

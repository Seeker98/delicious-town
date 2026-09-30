import type { Op } from '../../core/op';
import { grantGoodsOp } from '../store/goods';

/** 给勋章：已持有且没过期时在剩余时间上再加 hours 小时（规格书 05 §5.6 "或延长 1 小时"） */
export async function extendHonor(op: Op, goodsId: number, hours: number): Promise<void> {
  const row = await op.tx
    .selectFrom('store_item')
    .select('expires_at')
    .where('rest_id', '=', op.rest.id)
    .where('goods_id', '=', goodsId)
    .executeTakeFirst();
  const left =
    row?.expires_at && row.expires_at > op.now
      ? (row.expires_at.getTime() - op.now.getTime()) / 3_600_000
      : 0;
  await grantGoodsOp(op, goodsId, 1, { hours: left + hours });
}

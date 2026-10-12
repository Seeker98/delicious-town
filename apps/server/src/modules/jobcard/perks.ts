import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { DB } from '../../db/schema';
import { validNum } from '../takeaway/common';

/**
 * 工作证上写的费率（天气改版 PR③）：持有有效的证时返回证上 key 的值（交易所手续费、期货定金等直接换成这个数），
 * 没有证返回 null。不在操作里也能用（卖方可能不是正在操作的这家店）
 */
export async function cardValue(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  goodsId: number,
  key: string,
  now: Date,
): Promise<number | null> {
  if ((await validNum(db, restId, goodsId, now)) <= 0) return null;
  return config.requireGoods(goodsId).effects[key] ?? null;
}

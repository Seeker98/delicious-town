import type { GameConfig } from '@dt/config';
import { ErrorCode, type RewardItems } from '@dt/shared';
import { restLog, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainExp } from '../../core/resources';
import { AppError } from '../../http/errors';
import { addFoods } from '../cupboard/foods';
import { grantHatOp } from '../equip/hats';
import { grantGoodsOp } from '../store/goods';

/** 附件里的道具、食材必须在配置里存在（发送邮件、创建兑换码时检查） */
export function checkRewardItems(config: GameConfig, items: RewardItems): void {
  const bad: Array<{ path: string; message: string }> = [];
  (items.goods ?? []).forEach((g, i) => {
    if (!config.goods.has(g.id)) bad.push({ path: `items.goods.${i}.id`, message: 'unknown' });
  });
  (items.foods ?? []).forEach((f, i) => {
    if (!config.foods.has(f.id)) bad.push({ path: `items.foods.${i}.id`, message: 'unknown' });
  });
  if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
}

/**
 * 发放附件（设计 §4）：橱柜满了进冰箱、仓库满了照发；流水来源、个人日志类型由调用方给。
 * 补偿、邮件领取、兑换码都走这里
 */
export async function grantRewardOp(
  op: Op,
  items: RewardItems,
  opts: { source: string; logType: string; logParams?: Record<string, unknown> },
): Promise<void> {
  const source = opts.source;
  if (items.coin) gainCoin(op, items.coin, { source });
  if (items.diamond) gainDiamond(op, items.diamond, { source });
  if (items.exp) gainExp(op, items.exp, { source });
  for (const g of items.goods ?? []) await grantGoodsOp(op, g.id, g.num, { source });
  for (const f of items.foods ?? []) await addFoods(op, f.id, f.num, { source });
  for (const h of items.hats ?? []) await grantHatOp(op, h.tier, h.name, source);
  restLog(op, opts.logType, { ...opts.logParams, items });
}

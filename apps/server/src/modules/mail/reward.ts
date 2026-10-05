import type { GameConfig } from '@dt/config';
import { ErrorCode, type RewardItems } from '@dt/shared';
import { restLog, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainExp } from '../../core/resources';
import { AppError } from '../../http/errors';
import { addFoods } from '../cupboard/foods';
import { grantHatOp } from '../equip/hats';
import { grantGoodsOp } from '../store/goods';

/** 后台填的奖励里一项道具或食材的问题：不存在 unknown；已下架 retired（问题记录 367：活动、兑换码、邮件不能再发） */
function itemProblem(item: { retired?: true } | undefined): 'unknown' | 'retired' | null {
  if (!item) return 'unknown';
  return item.retired ? 'retired' : null;
}

/** 附件里的道具、食材必须在配置里存在、没下架（发送邮件、创建兑换码时检查） */
export function checkRewardItems(config: GameConfig, items: RewardItems): void {
  const bad: Array<{ path: string; message: string }> = [];
  (items.goods ?? []).forEach((g, i) => {
    const m = itemProblem(config.goods.get(g.id));
    if (m) bad.push({ path: `items.goods.${i}.id`, message: m });
  });
  (items.foods ?? []).forEach((f, i) => {
    const m = itemProblem(config.foods.get(f.id));
    if (m) bad.push({ path: `items.foods.${i}.id`, message: m });
  });
  if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
}

/**
 * 活动定义等嵌套结构里所有 goods / foods 列表的 id 都必须存在（backlog 148-2：手填错了的话
 * 每次兑换、领奖都会报错回滚，活动开始后又改不了定义）。路径带前缀，前端按路径标出错的格子
 */
export function checkNestedItems(config: GameConfig, value: unknown, prefix: string): void {
  const bad: Array<{ path: string; message: string }> = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}.${i}`));
      return;
    }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      const set = k === 'goods' ? config.goods : k === 'foods' ? config.foods : null;
      if (set && Array.isArray(x)) {
        x.forEach((it: unknown, i) => {
          const id = (it as { id?: unknown } | null)?.id;
          const m = typeof id === 'number' ? itemProblem(set.get(id)) : null;
          if (m) bad.push({ path: `${path}.${k}.${i}.id`, message: m });
        });
      } else walk(x, `${path}.${k}`);
    }
  };
  walk(value, prefix);
  if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
}

/** 附件里有配置中已不存在的道具或食材（发出后配置删了）：邮件标成失效、兑换码报 code_broken */
export function brokenItems(config: GameConfig, items: RewardItems | null): boolean {
  if (!items) return false;
  return (
    (items.goods ?? []).some((g) => !config.goods.has(g.id)) ||
    (items.foods ?? []).some((f) => !config.foods.has(f.id))
  );
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

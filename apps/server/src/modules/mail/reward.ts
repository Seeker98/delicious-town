import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { ErrorCode, type RewardIcon, type RewardItems } from '@dt/shared';
import type { DB } from '../../db/schema';
import { restLog, type Op } from '../../core/op';
import { gainCoin, gainDiamond, gainExp } from '../../core/resources';
import { AppError } from '../../http/errors';
import { addFoods } from '../cupboard/foods';
import { grantHatOp } from '../equip/hats';
import { grantGoodsOp } from '../store/goods';
import { iconDefs } from '../icons/defs';
import { expiryOf, grantIcon } from '../icons/grant';

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

/**
 * 附件里的称号（定制称号设计 三）：存在、没停用、到某个时间的没过；每项的名字换成现在的名字（快照，不信前端）。
 * 发邮件、建兑换码时调用，返回要存的附件
 */
export async function checkRewardIcons(
  db: Kysely<DB>,
  config: GameConfig,
  items: RewardItems,
  now: Date,
): Promise<RewardItems> {
  if (!items.icons?.length) return items;
  const defs = await iconDefs(
    db,
    config,
    items.icons.map((i) => i.key),
  );
  const bad: Array<{ path: string; message: string }> = [];
  const icons = items.icons.map((i, n): RewardIcon => {
    const def = defs.get(i.key);
    if (!def) bad.push({ path: `items.icons.${n}.key`, message: 'unknown' });
    else if (def.retired) bad.push({ path: `items.icons.${n}.key`, message: 'retired' });
    if (expiryOf(i, now) === 'expired') bad.push({ path: `items.icons.${n}.until`, message: 'past' });
    return {
      key: i.key,
      title: def?.title ?? i.title,
      ...(i.days !== undefined ? { days: i.days } : {}),
      ...(i.until !== undefined ? { until: i.until } : {}),
    };
  });
  if (bad.length > 0) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { issues: bad });
  return { ...items, icons };
}

/** 一批附件里出现的称号，哪些还有定义（判断附件失效用；一次查完，不要每封查一次） */
export async function liveIconKeys(
  db: Kysely<DB>,
  config: GameConfig,
  list: Array<RewardItems | null>,
): Promise<Set<string>> {
  const keys = list.flatMap((i) => (i?.icons ?? []).map((x) => x.key));
  if (keys.length === 0) return new Set();
  return new Set((await iconDefs(db, config, keys)).keys());
}

/**
 * 附件里有配置中已不存在的道具或食材（发出后配置删了）、或称号的定义没了：邮件标成失效、兑换码报 code_broken。
 * 称号要先用 liveIconKeys 查好传进来
 */
export function brokenItems(
  config: GameConfig,
  items: RewardItems | null,
  icons: ReadonlySet<string>,
): boolean {
  if (!items) return false;
  return (
    (items.goods ?? []).some((g) => !config.goods.has(g.id)) ||
    (items.foods ?? []).some((f) => !config.foods.has(f.id)) ||
    (items.icons ?? []).some((i) => !icons.has(i.key))
  );
}

/** 附件里有已下架的道具、食材（问题记录 367 之前建的兑换码；backlog #143） */
export function retiredItems(config: GameConfig, items: RewardItems | null): boolean {
  if (!items) return false;
  return (
    (items.goods ?? []).some((g) => config.goods.get(g.id)?.retired) ||
    (items.foods ?? []).some((f) => config.foods.get(f.id)?.retired)
  );
}

/**
 * 发放附件（设计 §4）：橱柜满了进冰箱、仓库满了照发；流水来源、个人日志类型由调用方给。
 * 补偿、邮件领取、兑换码都走这里。称号到某个时间已过的跳过（不报错，别的照发），
 * 返回实际的附件：跳过的称号标 expired
 */
export async function grantRewardOp(
  op: Op,
  items: RewardItems,
  opts: { source: string; logType: string; logParams?: Record<string, unknown> },
): Promise<RewardItems> {
  const source = opts.source;
  if (items.coin) gainCoin(op, items.coin, { source });
  if (items.diamond) gainDiamond(op, items.diamond, { source });
  if (items.exp) gainExp(op, items.exp, { source });
  for (const g of items.goods ?? []) await grantGoodsOp(op, g.id, g.num, { source });
  for (const f of items.foods ?? []) await addFoods(op, f.id, f.num, { source });
  for (const h of items.hats ?? []) await grantHatOp(op, h.tier, h.name, source);
  let out = items;
  if (items.icons?.length) {
    const icons: RewardIcon[] = [];
    for (const i of items.icons) {
      const expiresAt = expiryOf(i, op.now);
      if (expiresAt === 'expired') icons.push({ ...i, expired: true });
      else {
        await grantIcon(op.tx, { restId: op.rest.id, key: i.key, expiresAt, now: op.now });
        icons.push(i);
      }
    }
    out = { ...items, icons };
  }
  restLog(op, opts.logType, { ...opts.logParams, items: out });
  return out;
}

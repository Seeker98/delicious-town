import { ErrorCode } from '@dt/shared';
import type { Op } from '../../core/op';
import type { TowerStateRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { randomAward, type RandomAward } from '../award/random';
import { sparAward } from './rules';

/** 每日计数键（日期一律传游戏日；shop 的日期是本周一） */
export const KEY = {
  done: 'tower.done',
  ticket: 'tower.ticket',
  rankDone: 'tower.rankDone',
  spar: 'tower.spar',
  /** 厨塔挑战赢的次数（试打不算）：进赛厨榜要本周赢过（用户 2026-10-25） */
  win: 'tower.win',
  floor: (n: number) => `tower.floor:${n}`,
  duel: (restId: number) => `tower.duel:${restId}`,
  shop: (goodsId: number) => `renownShop:${goodsId}`,
} as const;

export const badInput = (reason: string): AppError =>
  new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** 取本店的厨塔状态行并锁住；第一次时先插入（整个操作已经锁了店） */
export async function lockTowerState(o: Op): Promise<TowerStateRow> {
  await o.tx
    .insertInto('tower_state')
    .values({ rest_id: o.rest.id })
    .onConflict((oc) => oc.column('rest_id').doNothing())
    .execute();
  return o.tx
    .selectFrom('tower_state')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .forUpdate()
    .executeTakeFirstOrThrow();
}

/**
 * 切磋奖励（设计文档裁定 7）：before = 本次之前的今日切磋总次数。
 * 抽到厨具改发银币（2026-10-16：切磋刷厨具卖店），别的道具概率不变；经验、银币仍按 sparEquipFlag 算
 */
export async function sparAwards(o: Op, before: number): Promise<RandomAward[]> {
  const t = o.tuning.tower;
  const { times, level } = sparAward(before, t);
  const out: RandomAward[] = [];
  for (let i = 0; i < times; i++)
    out.push(await randomAward(o, { level, equipFlag: t.sparEquipFlag, equipToCoin: true }));
  return out;
}

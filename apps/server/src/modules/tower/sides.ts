import type { Kysely } from 'kysely';
import type { GameConfig, TowerFloor } from '@dt/config';
import type { DuelSideDto } from '@dt/shared';
import { opAgg } from '../../core/luck';
import type { Op } from '../../core/op';
import type { DB, RestaurantRow } from '../../db/schema';
import { restGear, suitEffect } from '../equip/power';
import { duelPower, type DuelSide, type Scores } from './duel';

export type DuelMode = 'attack' | 'defend';

/** 在售特色菜每份价值：mc_cook_id 指向、没结束、还有剩；没有为 0 */
export async function mcPriceOf(db: Kysely<DB>, rest: RestaurantRow): Promise<number> {
  if (rest.mc_cook_id === null) return 0;
  const r = await db
    .selectFrom('mc_cook')
    .select(['price', 'left_num', 'ended_at'])
    .where('id', '=', rest.mc_cook_id)
    .executeTakeFirst();
  return r && r.left_num > 0 && r.ended_at === null ? r.price : 0;
}

/**
 * 一方的对决属性（设计文档 §3.1）：加点 + 厨具 + 宝石，四项乘套装百分比；
 * 刀工、火候再乘套装的进攻或防守加成；幸运 = 基础幸运 + 加成的 luckValue
 */
export async function sideOf(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  luckValue: number,
  mode: DuelMode,
): Promise<DuelSide> {
  const gear = await restGear(db, rest, config.suits);
  const cut = suitEffect(gear.suits, mode === 'attack' ? 'attackCutting' : 'defendCutting');
  const fire = suitEffect(gear.suits, mode === 'attack' ? 'attackFire' : 'defendFire');
  return {
    name: rest.name,
    attrs: {
      ...gear.total,
      cutting: Math.round(gear.total.cutting * (1 + cut)),
      fire: Math.round(gear.total.fire * (1 + fire)),
      luck: rest.luck + luckValue,
    },
    mcPrice: await mcPriceOf(db, rest),
  };
}

/** 操作里的一方（已锁店）：加成汇总按需重算 */
export async function playerSide(o: Op, mode: DuelMode): Promise<DuelSide> {
  return sideOf(o.tx, o.config, o.rest, (await opAgg(o)).luckValue ?? 0, mode);
}

/** 不锁对方的店：幸运用它缓存的加成汇总（计划裁定 1） */
export function cachedSide(
  db: Kysely<DB>,
  config: GameConfig,
  rest: RestaurantRow,
  mode: DuelMode,
): Promise<DuelSide> {
  return sideOf(db, config, rest, rest.effect_agg.luckValue ?? 0, mode);
}

/** 守塔人：属性来自配置；只有比拼特色菜的层才算当天的菜 */
export function watchmanSide(f: TowerFloor, price: number): DuelSide {
  return { name: f.name, attrs: f.attrs, mcPrice: f.mc ? price : 0 };
}

export function sideDto(s: DuelSide, r: { scores: Scores; sum: number }): DuelSideDto {
  return { name: s.name, power: duelPower(s.attrs), scores: r.scores, sum: r.sum };
}

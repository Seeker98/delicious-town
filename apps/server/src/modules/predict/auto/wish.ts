import { featureAvailable } from '../../../core/features';
import { roundWindow } from '../../wishtree/rules';
import { clampP, dayLabel } from './odds';
import type { AutoKind } from './types';

/**
 * 今天许愿树会不会结某样道具（2026-10-16 换掉全服营业银币题）：从奖品表里等概率挑一样，
 * 概率按它在奖品表里的权重占比；判定读当天开的那一轮结的道具，不看数量
 */
export const wish: AutoKind = {
  kind: 'wish',
  async create(c) {
    if (!featureAvailable(c.settings, 'wishtree')) return null;
    const t = c.settings.tuning.wishTree;
    const { opensAt } = roundWindow(c.day, t.hour);
    const closeAt = new Date(opensAt.getTime() - c.settings.tuning.predict.auto.wishCloseMin * 60_000);
    if (closeAt.getTime() < c.now.getTime() + 3_600_000) return null;
    const weights = new Map<number, number>();
    for (const p of t.prizes) weights.set(p.goods, (weights.get(p.goods) ?? 0) + p.weight);
    const total = [...weights.values()].reduce((s, w) => s + w, 0);
    if (total <= 0) return null;
    const ids = [...weights.keys()];
    const goods = ids[c.rng.int(ids.length)]!;
    const name = c.d.config.goods.get(goods)?.name ?? String(goods);
    return {
      title: `今天 ${t.hour} 点许愿树会结出${name}吗`,
      description: `以今天 ${t.hour} 点开的这一轮许愿树结的道具为准, 不看数量。`,
      p0: clampP(weights.get(goods)! / total),
      closeAt,
      resolveAt: opensAt,
      params: { day: c.day, hour: t.hour, goods },
    };
  },
  async resolve(c, p) {
    const day = String(p.day);
    // 那一轮还没开（任务晚了、上一轮还没开奖）先不判；过 24 小时还没有按数据缺失作废
    const round = await c.d.db
      .selectFrom('wish_round')
      .select(['goods_id', 'num'])
      .where('shard_id', '=', c.shardId)
      .where('day', '=', day)
      .executeTakeFirst();
    if (!round) return null;
    const name = c.d.config.goods.get(round.goods_id)?.name ?? String(round.goods_id);
    return {
      outcome: round.goods_id === Number(p.goods),
      note: `${dayLabel(day)}许愿树结的是${name} ×${round.num}`,
      noteParams: { day, goods: round.goods_id, num: round.num },
    };
  },
};

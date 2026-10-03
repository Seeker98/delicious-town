import { addDays, gameParts, gameTime } from '@dt/shared';
import { aggregateDay } from '../../admin/stats';
import { dayLabel } from './odds';
import type { AutoKind } from './types';

/** 出题任务过了这个点才跑的那天不出这题：大半天的数据已经能看出趋势（238-2 终审 I1） */
const LATEST_HOUR = 6;

const coinOf = async (c: Parameters<AutoKind['resolve']>[0], day: string) =>
  (await aggregateDay(c.d.db, c.shardId, day))
    .filter((r) => r.kind === 'coin' && r.source === 'settlement')
    .reduce((s, r) => s + r.amount, 0);

/**
 * 今天全服营业银币会不会超过昨天（238-2 设计 §4.5）。
 * 只问营业银币：活跃店数一个小号做一次操作就算一家，太容易被刷（终审 I1，用户已确认）
 */
export const stats: AutoKind = {
  kind: 'stats',
  async create(c) {
    if (gameParts(c.now).hour >= LATEST_HOUR) return null;
    const close = c.settings.tuning.predict.auto.statsCloseHour;
    return {
      title: '今天全服营业银币会超过昨天吗',
      description: `以今天全天全服餐厅的营业银币为准，明天 0 点后判定；严格多于昨天才算"是"。${close} 点截止交易。`,
      p0: 0.5,
      closeAt: gameTime(c.day, close),
      resolveAt: gameTime(addDays(c.day, 1), 0, 10),
      params: { day: c.day, metric: 'coin', close },
    };
  },
  async resolve(c, p) {
    const day = String(p.day);
    const today = await coinOf(c, day);
    const yesterday = await coinOf(c, addDays(day, -1));
    const f = (n: number) => n.toLocaleString('en-US');
    return {
      outcome: today > yesterday,
      note: `${dayLabel(day)} ${f(today)}，${dayLabel(addDays(day, -1))} ${f(yesterday)}`,
      noteParams: { day, today, prevDay: addDays(day, -1), yesterday },
    };
  },
};

import { addDays, gameTime } from '@dt/shared';
import { aggregateDay } from '../../admin/stats';
import type { AutoKind } from './types';

const METRIC = {
  coin: { title: '今天全服营业银币会超过昨天吗', kind: 'coin', source: 'settlement' },
  active: { title: '今天全服活跃店数会超过昨天吗', kind: 'active', source: 'rest' },
} as const;
type Metric = keyof typeof METRIC;

const valueOf = async (c: Parameters<AutoKind['resolve']>[0], day: string, m: Metric) =>
  (await aggregateDay(c.d.db, c.shardId, day))
    .filter((r) => r.kind === METRIC[m].kind && r.source === METRIC[m].source)
    .reduce((s, r) => s + r.amount, 0);

/** 今天全服营业银币 / 活跃店数会不会超过昨天（238-2 设计 §4.5）：单数日问银币，双数日问店数 */
export const stats: AutoKind = {
  kind: 'stats',
  async create(c) {
    const metric: Metric = Number(c.day.slice(8)) % 2 === 1 ? 'coin' : 'active';
    const close = c.settings.tuning.predict.auto.statsCloseHour;
    return {
      title: METRIC[metric].title,
      description: `以今天全天的统计为准，明天 0 点后判定；严格多于昨天才算"是"。${close} 点截止交易。`,
      p0: 0.5,
      closeAt: gameTime(c.day, close),
      resolveAt: gameTime(addDays(c.day, 1), 0, 10),
      params: { day: c.day, metric },
    };
  },
  async resolve(c, p) {
    const day = String(p.day);
    const m = p.metric as Metric;
    const today = await valueOf(c, day, m);
    const yesterday = await valueOf(c, addDays(day, -1), m);
    const f = (n: number) => n.toLocaleString('en-US');
    return { outcome: today > yesterday, note: `今天 ${f(today)}，昨天 ${f(yesterday)}` };
  },
};

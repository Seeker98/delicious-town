import { gameTime, seededRng, slotKey } from '@dt/shared';
import { featureAvailable } from '../../../core/features';
import { clampP, dayLabel, marketRareChance } from './odds';
import type { AutoKind } from './types';

const SIMS = 2000;

/** 今天某个整点日常货架会不会出稀有食材（238-2 设计 §4.3）：读系统进货（不看玩家手动进的货） */
export const market: AutoKind = {
  kind: 'market',
  async create(c) {
    if (!featureAvailable(c.settings, 'market')) return null;
    const mt = c.settings.tuning.market;
    const closeMin = c.settings.tuning.predict.auto.marketCloseMin;
    const hours = mt.dailyHours.filter(
      (h) => gameTime(c.day, h).getTime() - closeMin * 60_000 >= c.now.getTime() + 3_600_000,
    );
    if (hours.length === 0) return null;
    const hour = hours[c.rng.int(hours.length)]!;
    const sim = seededRng(c.rng.int(2 ** 31));
    const odds = [1, 2].map((level) => ({
      level,
      p: marketRareChance(c.d.config, mt, hour, level, SIMS, sim),
    }));
    const best = odds.sort((a, b) => Math.abs(a.p - 0.5) - Math.abs(b.p - 0.5))[0]!;
    return {
      title: `今天 ${hour} 点的日常货架会出现 ${best.level} 级稀有食材吗`,
      description: `以 ${hour} 点系统进货的日常货架为准，玩家手动进的货不算。`,
      p0: clampP(best.p),
      closeAt: new Date(gameTime(c.day, hour).getTime() - closeMin * 60_000),
      resolveAt: gameTime(c.day, hour),
      params: { hour, level: best.level, period: slotKey(c.day, hour) },
    };
  },
  async resolve(c, p) {
    const rows = await c.d.db
      .selectFrom('market_item')
      .select('foods_id')
      .where('shard_id', '=', c.shardId)
      .where('shelf', '=', 0)
      .where('period', '=', String(p.period))
      .where('owner_rest_id', 'is', null)
      .execute();
    if (rows.length === 0) return null;
    const level = Number(p.level);
    const rare = rows
      .map((r) => c.d.config.requireFood(r.foods_id))
      .filter((f) => f.level === level && f.odds < 100);
    const hour = Number(p.hour);
    const day = String(p.period).split('@')[0]!;
    const when = `${dayLabel(day)} ${hour} 点`;
    const noteParams = { day, hour, level, foods: rare.map((f) => f.id) };
    return rare.length > 0
      ? {
          outcome: true,
          note: `${when}日常货架上了 ${level} 级稀有食材：${rare.map((f) => f.name).join('、')}`,
          noteParams,
        }
      : { outcome: false, note: `${when}日常货架没有 ${level} 级稀有食材`, noteParams };
  },
};

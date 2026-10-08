import { sql } from 'kysely';
import { gameTime, seededRng, slotKey } from '@dt/shared';
import { gameSeed } from '../../../core/seed';
import { rollShelf } from '../../market/rules';
import { featureAvailable } from '../../../core/features';
import { clampP, dayLabel, marketRareChance } from './odds';
import { finishedRound } from './rounds';
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
      description: `以 ${hour} 点系统进货的日常货架为准, 玩家手动进的货不算。`,
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
    let foods = rows.map((r) => r.foods_id);
    if (rows.length === 0) {
      // 货架已经被下一轮清掉（判定晚了）：那一轮没跑过先不判（backlog 238-2）
      const period = String(p.period);
      const round = await finishedRound(c.d.db, c.shardId, 'market-daily', period);
      if (round === null) return null;
      // 按那一轮刷新时发的进货新闻判：运营中途改了菜场数值，按现在的数值重算会和当时不一样（backlog #113）
      const news = await c.d.db
        .selectFrom('news')
        .select('params')
        .where('shard_id', '=', c.shardId)
        .where('type', '=', 'market.restock')
        .where(sql<string>`params->>'shelf'`, '=', '0')
        .where('created_at', '>=', round.startedAt)
        .where('created_at', '<=', round.finishedAt)
        .orderBy('id')
        .executeTakeFirst();
      const logged = (news?.params as { foods?: unknown } | undefined)?.foods;
      if (Array.isArray(logged)) foods = logged.map(Number);
      else {
        // 新闻没有了（老数据）：按同一个种子重算系统进货
        const rng = seededRng(gameSeed(c.shardId, 'market', 0, period));
        foods = rollShelf(0, Number(p.hour), c.d.config, c.settings.tuning.market, rng).map((x) => x.foodsId);
      }
    }
    const level = Number(p.level);
    const rare = foods
      // 进货新闻里的食材之后可能从配置里删掉了：找不到的跳过（质量期 ⑤ 终审）
      .flatMap((id) => c.d.config.foods.get(id) ?? [])
      .filter((f) => f.level === level && f.odds < 100);
    const hour = Number(p.hour);
    const day = String(p.period).split('@')[0]!;
    const when = `${dayLabel(day)} ${hour} 点`;
    const noteParams = { day, hour, level, foods: rare.map((f) => f.id) };
    return rare.length > 0
      ? {
          outcome: true,
          note: `${when}日常货架上了 ${level} 级稀有食材: ${rare.map((f) => f.name).join('、')}`,
          noteParams,
        }
      : { outcome: false, note: `${when}日常货架没有 ${level} 级稀有食材`, noteParams };
  },
};

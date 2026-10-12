import { sql } from 'kysely';
import { gameTime, nextSlot, seededRng, slotKey } from '@dt/shared';
import { gameSeed } from '../../../core/seed';
import { featureAvailable } from '../../../core/features';
import { rollWeather } from '../../world/rules';
import { chainTypeShares, clampP, dayLabel, poolTypeShares, WEATHER_TYPE_NAMES } from './odds';
import { finishedRound } from './rounds';
import type { AutoKind } from './types';

/**
 * 今天某次换天后的自然天气是不是某类（238-2 设计 §4.4；天气改版设计 §1.8）：
 * 天气链有记忆，出题时从当前自然天气沿链推到那一轮算概率；判定读那一轮换天任务记下的结果，
 * 罗盘、晴雨签盖的不算但写进判定依据
 */
export const weather: AutoKind = {
  kind: 'weather',
  async create(c) {
    if (!featureAvailable(c.settings, 'world')) return null;
    const w = c.settings.tuning.world;
    const hours = w.weatherHours.filter(
      (h) => gameTime(c.day, h).getTime() >= c.now.getTime() + 3 * 3_600_000,
    );
    if (hours.length === 0) return null;
    const ws = await c.d.db
      .selectFrom('world_state')
      .select('weather_id')
      .where('shard_id', '=', c.shardId)
      .executeTakeFirst();
    const hour = hours[c.rng.int(hours.length)]!;
    const start = gameTime(c.day, hour);
    // 区服还没有天气（新区服第一次换天前）按天气池的占比
    const shares = [
      ...(ws
        ? chainTypeShares(c.d.config, w, ws.weather_id, c.now, start)
        : poolTypeShares(c.d.config, w, hour)),
    ];
    const mid = shares.filter(([, s]) => s >= 0.15 && s <= 0.85);
    const [type, p] =
      mid.length > 0
        ? mid[c.rng.int(mid.length)]!
        : shares.sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5))[0]!;
    return {
      title: `今天 ${hour} 点换天后是${WEATHER_TYPE_NAMES[type]}类天气吗`,
      description: `以 ${hour} 点换天时的天气为准, 之后有人用司天罗盘、晴雨签改的不算。`,
      p0: clampP(p),
      closeAt: new Date(start.getTime() - 5 * 60_000),
      resolveAt: nextSlot(start, w.weatherHours).start,
      params: { hour, type, period: slotKey(c.day, hour) },
    };
  },
  async resolve(c, p) {
    const hour = Number(p.hour);
    const period = String(p.period);
    // 那一轮没跑过（world 关掉、worker 漏跑）先不判；道具只算换天之后的（backlog 238-2）。
    // 天气在换天任务开始时就换了，按开始时间截（质量期 ②）
    const round = await finishedRound(c.d.db, c.shardId, 'weather', period);
    if (round === null) return null;
    const day = period.split('@')[0]!;
    const start = gameTime(day, hour);
    const end = nextSlot(start, c.settings.tuning.world.weatherHours).start;
    // 换天任务记下的自然天气；没有（旧任务没记）按那一轮换天的新闻
    let toId = Number((round.stats as { to?: unknown }).to);
    if (!Number.isFinite(toId) || toId <= 0) {
      const n = await c.d.db
        .selectFrom('news')
        .select('params')
        .where('shard_id', '=', c.shardId)
        .where('type', '=', 'weather.change')
        .where('created_at', '>=', new Date(start.getTime() - 600_000))
        .where('created_at', '<', end)
        .where(sql<boolean>`not (params ? 'by')`)
        .orderBy('created_at')
        .executeTakeFirst();
      toId = Number((n?.params as { to?: unknown } | undefined)?.to);
    }
    // 最后的退路：天气链以前的独立抽（种子重算）
    const auto =
      c.d.config.weather.get(toId) ??
      rollWeather(
        c.d.config,
        hour,
        c.settings.tuning.world,
        seededRng(gameSeed(c.shardId, 'weather', period)),
      );
    const typeName = WEATHER_TYPE_NAMES[auto.type] ?? String(auto.type);
    let note = `${dayLabel(day)} ${hour} 点换天后是${auto.name} (${typeName}类)`;
    const noteParams: Record<string, unknown> = { day, hour, weather: auto.id, type: auto.type };
    // 换天之后有人用罗盘、晴雨签盖了别的天气（旧数据是雷神锤：weather.change 带 by）
    const tool = await c.d.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', c.shardId)
      .where((eb) =>
        eb.or([
          eb('type', '=', 'weather.tool'),
          eb.and([eb('type', '=', 'weather.change'), sql<boolean>`params ? 'by'`]),
        ]),
      )
      .where('created_at', '>=', round.startedAt)
      .where('created_at', '<', end)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (tool) {
      const to = c.d.config.weather.get(Number((tool.params as { to?: number }).to));
      if (to) {
        note += `；之后有人用道具改成了${to.name}, 按题目规则不算`;
        noteParams.coverTo = to.id;
      }
    }
    return { outcome: auto.type === Number(p.type), note, noteParams };
  },
};

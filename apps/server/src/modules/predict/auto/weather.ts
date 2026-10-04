import { sql } from 'kysely';
import { gameTime, seededRng, slotKey } from '@dt/shared';
import { gameSeed } from '../../../core/seed';
import { featureAvailable } from '../../../core/features';
import { rollWeather } from '../../world/rules';
import { clampP, dayLabel, WEATHER_TYPE_NAMES, weatherTypeShares } from './odds';
import { roundFinishedAt } from './rounds';
import type { AutoKind } from './types';

const SLOT_MS = 2 * 3_600_000;

/** 今天某个时段自动轮换的天气是不是某类（238-2 设计 §4.4）：按种子重算，雷神锤改的不算但写进判定依据 */
export const weather: AutoKind = {
  kind: 'weather',
  async create(c) {
    if (!featureAvailable(c.settings, 'world')) return null;
    const w = c.settings.tuning.world;
    const hours = w.weatherHours.filter(
      (h) => gameTime(c.day, h).getTime() >= c.now.getTime() + 3 * 3_600_000,
    );
    if (hours.length === 0) return null;
    const hour = hours[c.rng.int(hours.length)]!;
    const shares = [...weatherTypeShares(c.d.config, w, hour)];
    const mid = shares.filter(([, s]) => s >= 0.15 && s <= 0.85);
    const [type, p] =
      mid.length > 0
        ? mid[c.rng.int(mid.length)]!
        : shares.sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5))[0]!;
    const start = gameTime(c.day, hour);
    return {
      title: `今天 ${hour} 点自动轮换的天气是${WEATHER_TYPE_NAMES[type]}类吗`,
      description: `以 ${hour} 点系统自动轮换出的天气为准，之后有人用雷神锤改的不算。`,
      p0: clampP(p),
      closeAt: new Date(start.getTime() - 5 * 60_000),
      resolveAt: new Date(start.getTime() + SLOT_MS),
      params: { hour, type, period: slotKey(c.day, hour) },
    };
  },
  async resolve(c, p) {
    const hour = Number(p.hour);
    const period = String(p.period);
    // 那一轮没跑过（world 关掉、worker 漏跑）先不判；雷神锤只算轮换之后的（backlog 238-2）
    const rotatedAt = await roundFinishedAt(c.d.db, c.shardId, 'weather', period);
    if (rotatedAt === null) return null;
    const auto = rollWeather(
      c.d.config,
      hour,
      c.settings.tuning.world,
      seededRng(gameSeed(c.shardId, 'weather', period)),
    );
    const typeName = WEATHER_TYPE_NAMES[auto.type] ?? String(auto.type);
    const day = period.split('@')[0]!;
    let note = `${dayLabel(day)} ${hour} 点自动轮换的天气是${auto.name}（${typeName}类）`;
    const noteParams: Record<string, unknown> = { day, hour, weather: auto.id, type: auto.type };
    const start = gameTime(day, hour);
    const hammer = await c.d.db
      .selectFrom('news')
      .select('params')
      .where('shard_id', '=', c.shardId)
      .where('type', '=', 'weather.change')
      .where('created_at', '>=', rotatedAt)
      .where('created_at', '<', new Date(start.getTime() + SLOT_MS))
      .where(sql<boolean>`params ? 'by'`)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();
    if (hammer) {
      const to = c.d.config.weather.get(Number((hammer.params as { to?: number }).to));
      if (to) {
        note += `；之后有人用雷神锤改成了${to.name}，按题目规则不算`;
        noteParams.hammerTo = to.id;
      }
    }
    return { outcome: auto.type === Number(p.type), note, noteParams };
  },
};

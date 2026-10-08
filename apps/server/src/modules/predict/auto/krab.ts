import { addDays, gameTime, seededRng, slotKey } from '@dt/shared';
import { gameSeed } from '../../../core/seed';
import { featureAvailable } from '../../../core/features';
import { rollKrabStreet } from '../../world/rules';
import { dayLabel } from './odds';
import { roundFinishedAt } from './rounds';
import type { AutoKind } from './types';

const SPAN = 6;

/** 明天蟹老板在哪（238-2 设计 §4.1）：以明天 krabHour 按种子刷新的街为准 */
export const krab: AutoKind = {
  kind: 'krab',
  async create(c) {
    if (!featureAvailable(c.settings, 'world')) return null;
    const w = c.settings.tuning.world;
    const total = w.krabStreetMax - w.krabStreetMin + 1;
    if (total <= SPAN) return null;
    const from = w.krabStreetMin + c.rng.int(total - SPAN + 1);
    const to = from + SPAN - 1;
    const tomorrow = addDays(c.day, 1);
    return {
      title: `明天蟹老板会在 ${from}~${to} 号街出现吗`,
      description: `以明天 ${w.krabHour} 点系统刷新的位置为准, 之后被驱赶改变的不算。`,
      p0: SPAN / total,
      closeAt: gameTime(c.day, 23, 50),
      resolveAt: gameTime(tomorrow, w.krabHour),
      params: { day: tomorrow, from, to, hour: w.krabHour },
    };
  },
  async resolve(c, p) {
    const w = c.settings.tuning.world;
    const day = String(p.day);
    // 按出题时记下的整点判，之后改了 krabHour 也不变；那一轮没跑过（world 关掉、worker 漏跑）先不判（backlog 238-2）
    const hour = p.hour === undefined ? w.krabHour : Number(p.hour);
    const period = slotKey(day, hour);
    if ((await roundFinishedAt(c.d.db, c.shardId, 'daily-event', period)) === null) return null;
    const street = rollKrabStreet(w, seededRng(gameSeed(c.shardId, 'krab', period)));
    return {
      outcome: street >= Number(p.from) && street <= Number(p.to),
      note: `${dayLabel(day)} ${hour} 点蟹老板刷新在 ${street} 号街`,
      noteParams: { day, hour, street },
    };
  },
};

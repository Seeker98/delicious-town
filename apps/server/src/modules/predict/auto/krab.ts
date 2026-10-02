import { addDays, gameTime, seededRng, slotKey } from '@dt/shared';
import { gameSeed } from '../../../core/seed';
import { featureAvailable } from '../../../core/features';
import { rollKrabStreet } from '../../world/rules';
import { dayLabel } from './odds';
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
      description: `以明天 ${w.krabHour} 点系统刷新的位置为准，之后被驱赶改变的不算。`,
      p0: SPAN / total,
      closeAt: gameTime(c.day, 23, 50),
      resolveAt: gameTime(tomorrow, w.krabHour),
      params: { day: tomorrow, from, to },
    };
  },
  async resolve(c, p) {
    const w = c.settings.tuning.world;
    const day = String(p.day);
    const street = rollKrabStreet(w, seededRng(gameSeed(c.shardId, 'krab', slotKey(day, w.krabHour))));
    return {
      outcome: street >= Number(p.from) && street <= Number(p.to),
      note: `${dayLabel(day)} ${w.krabHour} 点蟹老板刷新在 ${street} 号街`,
    };
  },
};

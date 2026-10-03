import { addDays, gameTime, HIPHOP_PLACE_NAMES, type HiphopPlace } from '@dt/shared';
import { featureAvailable } from '../../../core/features';
import { placeWeightsFor } from '../../hiphop/day';
import { clampP, dayLabel } from './odds';
import type { AutoKind } from './types';

const placeName = (p: number) => HIPHOP_PLACE_NAMES[p as HiphopPlace] ?? `地点 ${p}`;

/** 明天嘻哈男孩在哪（238-2 设计 §4.2）：读明天生成的地点记录 */
export const hiphop: AutoKind = {
  kind: 'hiphop',
  async create(c) {
    if (!featureAvailable(c.settings, 'hiphop')) return null;
    const t = c.settings.tuning.hiphop;
    // 只考虑本区服开着的功能的地点（问题记录 256），和每天抽地点时一致
    const weights = placeWeightsFor(c.settings);
    const total = weights.reduce((s, [, x]) => s + x, 0);
    if (total <= 0) return null;
    let r = c.rng.next() * total;
    let pick = weights[0]!;
    for (const pw of weights) {
      if (r < pw[1]) {
        pick = pw;
        break;
      }
      r -= pw[1];
    }
    const [place, weight] = pick;
    const tomorrow = addDays(c.day, 1);
    return {
      title: place === 9 ? '明天嘻哈男孩会去某家玩家餐厅吗' : `明天嘻哈男孩会出现在${placeName(place)}吗`,
      description: `以明天 ${t.hour} 点嘻哈男孩出现的地点为准。`,
      p0: clampP(weight / total),
      closeAt: gameTime(c.day, 23, 50),
      resolveAt: gameTime(tomorrow, t.hour),
      params: { day: tomorrow, place, hour: t.hour },
    };
  },
  async resolve(c, p) {
    const row = await c.d.db
      .selectFrom('hiphop_day')
      .select('place')
      .where('shard_id', '=', c.shardId)
      .where('day', '=', String(p.day))
      .executeTakeFirst();
    if (!row) return null;
    return {
      outcome: row.place === Number(p.place),
      note: `${dayLabel(String(p.day))}嘻哈男孩出现在${placeName(row.place)}`,
      noteParams: { day: String(p.day), place: row.place },
    };
  },
};

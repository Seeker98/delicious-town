import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { addDays, gameParts, type Rng } from '@dt/shared';
import type { DB } from '../../db/schema';
import type { TowerTuning } from './rules';

/** 换菜的周期（游戏日）：今天到了 hour:minute 就是今天，否则是昨天 */
export function watchmanPeriod(now: Date, t: TowerTuning): string {
  const p = gameParts(now);
  const reached = p.hour * 60 + p.minute >= t.watchmanCook.hour * 60 + t.watchmanCook.minute;
  return reached ? p.day : addDays(p.day, -1);
}

/**
 * 守塔人换菜（设计文档裁定 2）：比拼特色菜的层各从 [⌊(层−2)/2⌋, +3] 级的特色菜里均匀抽一道，
 * 每份价值 = ⌊营养值 × (1 + rand × priceSpread)⌋，覆盖这一层的菜。每层随机数顺序：抽菜 → 抽价值
 */
export async function cookWatchmen(
  db: Kysely<DB>,
  config: GameConfig,
  shardId: number,
  day: string,
  rng: Rng,
  t: TowerTuning,
): Promise<number> {
  let n = 0;
  for (const f of config.towerFloors.values()) {
    if (!f.mc) continue;
    const lo = Math.floor((f.floor - 2) / 2);
    const pool = config.bundle.mysteriousCookbooks.filter((m) => m.level >= lo && m.level <= lo + 3);
    if (pool.length === 0) continue;
    const mc = pool[rng.int(pool.length)]!;
    const price = Math.floor(mc.nutritive * (1 + rng.next() * t.watchmanCook.priceSpread));
    await db
      .insertInto('tower_watchman_mc')
      .values({ shard_id: shardId, floor: f.floor, mc_id: mc.id, price, day })
      .onConflict((oc) => oc.columns(['shard_id', 'floor']).doUpdateSet({ mc_id: mc.id, price, day }))
      .execute();
    n += 1;
  }
  return n;
}

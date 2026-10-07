import type { GameConfig } from '@dt/config';

const cache = new WeakMap<GameConfig, ReadonlySet<string>>();

/**
 * 任务（主线、支线、每周）用到的计数键（| 连接的拆开）。按街道这类会生出很多键的计数，只在有任务用到时才记，
 * 免得每家店多出几十行没用的计数、每次看任务都要读（问题记录 515 支线扩充终审）
 */
export function questCounterKeys(config: GameConfig): ReadonlySet<string> {
  let keys = cache.get(config);
  if (!keys) {
    const b = config.bundle;
    keys = new Set([
      ...b.quests.filter((q) => q.cond.kind === 'counter').flatMap((q) => q.cond.key.split('|')),
      ...b.weeklyGroups.flatMap((g) => g.quests.flatMap((q) => q.key.split('|'))),
    ]);
    cache.set(config, keys);
  }
  return keys;
}

import { createDeps } from '../deps';
import { loadEnv } from '../env';
import { createGame } from '../game';
import { rescaleEquips } from '../modules/equip/rescale';

/**
 * 按当前配置的强化数值表重算全部已生成的厨具（问题记录 120）；可重复跑。
 * 每家店一个锁店的短事务，不用停服；穿着的厨具变了会同步缓存的幸运和套装加成
 */
const deps = createDeps(loadEnv());
try {
  const r = await rescaleEquips(createGame(deps).deps);
  console.log(`equip rescaled: ${r.changed} / ${r.total}`);
} finally {
  await deps.db.destroy();
  deps.redis.disconnect();
}

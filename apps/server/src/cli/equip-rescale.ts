import { loadGameConfig } from '@dt/config';
import { createDb } from '../db';
import { loadEnv } from '../env';
import { rescaleEquips } from '../modules/equip/rescale';

/** 按当前配置的强化数值表重算全部已生成的厨具（问题记录 120）；可重复跑 */
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
try {
  const r = await rescaleEquips(db, loadGameConfig(env.CONFIG_BUNDLE_PATH));
  console.log(`equip rescaled: ${r.changed} / ${r.total}`);
} finally {
  await db.destroy();
}

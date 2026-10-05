/** 从 ../analysis/dataset 复制配置源数据到 data/。只复制配置表，不复制含玩家信息的快照。 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const analysis = process.env.DT_ANALYSIS_DIR ?? resolve(pkgDir, '../../../analysis/dataset');

// goods、foods、cookbooks 不再同步：定义在 data/master 主表（重新编号 PR 1）；菜谱原版在 analysis/dataset
// 特色菜用料、老虎机奖品、菜场竞猜食材里有食材、道具编号，重新编号后不再同步（原版数据里是旧编号，重新编号 PR 4）
const DATASET = [
  'streets',
  'roads',
  'devices',
  'activation_tasks',
  'activation_rewards',
  'tower_floors',
  'hiphop_places',
  'suit_pot',
  'suit_painting',
  'suit_zodiac',
  'suit_pet',
  'suit_sculpture',
  'goods_sources',
  'goods_source_legend',
];

mkdirSync(join(pkgDir, 'data/dataset'), { recursive: true });
mkdirSync(join(pkgDir, 'data/designed'), { recursive: true });
for (const name of DATASET) {
  copyFileSync(join(analysis, `${name}.json`), join(pkgDir, 'data/dataset', `${name}.json`));
}
for (const file of readdirSync(join(analysis, 'designed'))) {
  if (file.endsWith('.json'))
    copyFileSync(join(analysis, 'designed', file), join(pkgDir, 'data/designed', file));
}
console.log(`synced from ${analysis}`);

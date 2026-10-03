/** 从 ../analysis/dataset 复制配置源数据到 data/。只复制配置表，不复制含玩家信息的快照。 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const analysis = process.env.DT_ANALYSIS_DIR ?? resolve(pkgDir, '../../../analysis/dataset');

// cookbooks 不再同步：仓库里的是老街道修订后的版本（问题记录 284），原版在 analysis/dataset
const DATASET = [
  'foods',
  'goods',
  'streets',
  'mysterious_cookbooks',
  'roads',
  'devices',
  'activation_tasks',
  'activation_rewards',
  'tower_floors',
  'bar_slot_machine_award',
  'hiphop_places',
  'suit_pot',
  'suit_painting',
  'suit_zodiac',
  'suit_pet',
  'suit_sculpture',
  'market_guess_foods',
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

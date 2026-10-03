import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18N_SOURCE_FILES } from './i18n';

export type SourceData = Record<string, unknown>;

/** 配置源文件（相对 data/，不含 .json） */
export const SOURCE_FILES = [
  'dataset/foods',
  'dataset/goods',
  'dataset/cookbooks',
  'dataset/streets',
  'dataset/mysterious_cookbooks',
  'dataset/devices',
  'dataset/activation_tasks',
  'dataset/activation_rewards',
  'dataset/suit_pot',
  'dataset/suit_painting',
  'dataset/market_guess_foods',
  'dataset/bar_slot_machine_award',
  'dataset/tower_floors',
  'designed/cookbooks_price',
  // 新街道（问题记录 284）：构建时和 dataset 里的同类数据拼在一起
  'designed/cookbooks_price_new',
  'designed/cookbooks_new',
  'designed/foods_new',
  'designed/streets_new',
  'designed/street_medals_new',
  'designed/street_medal_map',
  'designed/cookbook_grades',
  'designed/goods_awardflag',
  'designed/weather',
  'designed/star_need',
  'designed/star_award',
  'designed/oil_need',
  'designed/activation_extra',
  'designed/quest_chapters',
  'designed/quest_main',
  'designed/quest_lines',
  'designed/quest_weekly',
  'designed/seeds',
  'designed/seed_exchange',
  'designed/foods_formula',
  'designed/income_action',
  'designed/goods_exchange',
  'designed/renown_shop',
  'designed/bless',
  'designed/shop_special_rate',
  'designed/shop_pools',
  'designed/equip_suits',
  'designed/mc_proficiency',
  'game/tuning',
  'game/holidays',
  'game/market_guess_award',
  'game/action_map',
  'game/looks',
  'game/equip_lore',
  'game/tower_fix',
  'game/setting_docs',
  'game/newbie_codes',
  'game/souvenirs',
  'game/kuji',
  'restaurant_defaults',
] as const;

export function defaultDataDir(): string {
  return fileURLToPath(new URL('../data', import.meta.url));
}

/** 读取数据目录：数据集文件取其中的 data 数组，restaurant_defaults 取整个对象 */
export function readSourceDir(dir: string): SourceData {
  const out: SourceData = {};
  for (const name of [...SOURCE_FILES, ...I18N_SOURCE_FILES]) {
    const json = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as { data?: unknown };
    // data/game/ 下的文件和 restaurant_defaults 是整个对象；数据集文件取 data 数组
    // 翻译数据（data/i18n/，问题记录 272）也是整个对象
    out[name] =
      name === 'restaurant_defaults' || name.startsWith('game/') || name.startsWith('i18n/')
        ? json
        : json.data;
  }
  return out;
}

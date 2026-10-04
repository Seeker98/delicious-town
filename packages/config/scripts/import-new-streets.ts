/**
 * 导入另一个 agent 生成的新街道数据（问题记录 284，设计文档 §5.1~5.3）：
 *   pnpm -F @dt/config import-streets [新街道菜谱目录] [i18n 目录]
 * 默认读仓库外的 ../data/新街道菜谱 和 ../data/i18n。写出 data/designed/*_new.json，补 8~10 品级，
 * 再把新菜的英法西菜名并进 data/i18n/<语言>/cookbooks.json。重跑会整份替换这些文件，
 * 并删掉已经不存在的新菜谱译名、给勋章对照表补上新街道的行（backlog 284）。
 * 新菜谱 id 已上线：要求数据那边固定 id，不能顺移
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seededRng } from '@dt/shared';
import { collectTransitions, extendGrades, type GradeTable } from '../src/gradeGen';
import { addMedalRows, pruneNames } from '../src/streetImport';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = process.argv[2] ?? resolve(pkg, '../../../data/新街道菜谱');
const i18nDir = process.argv[3] ?? resolve(pkg, '../../../data/i18n');
const data = join(pkg, 'data');
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
/** 和 data/designed 下其他文件一样：1 空格缩进、结尾没有换行 */
const write = (name: string, rule: string, list: unknown[]) =>
  writeFileSync(
    join(data, 'designed', `${name}.json`),
    JSON.stringify(
      { source: '新设计(data/新街道菜谱，import-new-streets.ts 导入)', rule, count: list.length, data: list },
      null,
      1,
    ),
  );
const pick = (o: object, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, (o as Record<string, unknown>)[k]]));

type Cb = {
  id: number;
  name: string;
  streetId: number;
  taste: number[];
  coin: number;
  level: number;
  desc: string;
  needFoodsByLevel: GradeTable;
};
type Food = { id: number; level: number };
const streets = read<{ data: object[] }>(join(srcDir, 'streets_new.json')).data;
const foods = read<{ data: Food[] }>(join(srcDir, 'foods_new.json')).data;
const medals = read<{ data: Array<Record<string, unknown>> }>(join(srcDir, 'street_medals_new.json')).data;
const cookbooks = read<{ data: Cb[] }>(join(srcDir, 'cookbooks_new.json')).data;

const old = read<{ data: Array<{ id: number; needFoodsByLevel: GradeTable }> }>(
  join(data, 'dataset/cookbooks.json'),
).data;
const level = new Map(
  [...read<{ data: Food[] }>(join(data, 'dataset/foods.json')).data, ...foods].map((f) => [f.id, f.level]),
);
const t89 = collectTransitions(old, 8, 9);
const t910 = collectTransitions(old, 9, 10);
const rng = seededRng(284);
/**
 * 勋章换号：数据里的 628~643 已被装备设定（game/equip_lore.json）新增的厨具占用，
 * 改成 92000 + 街道 id（纪念品 90xxx、一番赏 91xxx 也是单独一段）
 */
const medalId = (streetId: number) => 92000 + streetId;

write(
  'streets_new',
  '新增街道 14~29；desc = 街道加成文字（与勋章 desc 一致）',
  streets.map((s) => pick(s, ['id', 'name', 'cookname', 'cookshortname', 'desc'])),
);
write(
  'foods_new',
  '新增食材：13 种基础 + 10 种高级版（定级参照、用途见 data/新街道菜谱/foods_new.json）',
  foods.map((f) =>
    pick(f, [
      'id',
      'name',
      'level',
      'coin',
      'odds',
      'maxNum',
      'masterClass',
      'lockflag',
      'desc',
      'type',
      'typeName',
    ]),
  ),
);
write(
  'street_medals_new',
  '新街道勋章（type 9，devicetype = 街道 id；id = 92000 + 街道 id；对应关系以 street_medal_map 为准）',
  medals.map((m) => ({
    ...Object.fromEntries(Object.entries(m).filter(([k]) => k !== '_src')),
    id: medalId(m.devicetype as number),
  })),
);
const sorted = [...cookbooks].sort((a, b) => a.id - b.id);
write(
  'cookbooks_new',
  '新街道菜谱；1~7 品级来自 data/新街道菜谱，8~10 品级按老数据换料频率生成（gradeGen.ts，种子 284）',
  sorted.map((c) => ({
    id: c.id,
    name: c.name,
    streetId: c.streetId,
    taste: c.taste,
    needFoodsByLevel: extendGrades(c.needFoodsByLevel, t89, t910, (id) => level.get(id) === 7, rng),
  })),
);
write(
  'cookbooks_price_new',
  '新街道菜谱的售价、推荐等级、描述（规则同 cookbooks_price）',
  sorted.map((c) => ({ id: c.id, coin: c.coin, level: c.level, desc: c.desc })),
);

const mapPath = join(data, 'designed', 'street_medal_map.json');
const map = read<{
  source: string;
  rule: string;
  count: number;
  data: Array<{ streetId: number; goodsId: number }>;
}>(mapPath);
const medalRows = addMedalRows(
  map.data,
  streets.map((x) => (x as { id: number }).id),
  medalId,
);
if (medalRows.added.length > 0) {
  writeFileSync(
    mapPath,
    JSON.stringify({ ...map, count: medalRows.rows.length, data: medalRows.rows }, null, 1),
  );
  console.log(`street_medal_map: added streets ${medalRows.added.join(', ')}`);
}

const oldIds = new Set(old.map((c) => c.id));
const newIds = new Set(sorted.map((c) => c.id));
for (const l of ['en', 'fr', 'es']) {
  const p = join(data, 'i18n', l, 'cookbooks.json');
  const { names: mine, removed } = pruneNames(read<Record<string, { name: string }>>(p), oldIds, newIds);
  if (removed.length > 0)
    console.log(`${l}: removed names of ${removed.length} cookbooks no longer imported`);
  const theirs = read<Record<string, { name: string }>>(join(i18nDir, l, 'cookbooks.json'));
  for (const c of sorted) {
    const e = theirs[c.id];
    if (e) mine[c.id] = { name: e.name };
  }
  writeFileSync(p, JSON.stringify(mine, null, 2) + '\n');
}
console.log(
  `streets ${streets.length}, foods ${foods.length}, medals ${medals.length}, cookbooks ${sorted.length}`,
);

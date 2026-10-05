/**
 * 导入另一个 agent 生成的新街道数据（问题记录 284，设计文档 §5.1~5.3）：
 *   pnpm -F @dt/config import-streets [新街道菜谱目录] [i18n 目录]
 * 默认读仓库外的 ../data/新街道菜谱 和 ../data/i18n。新街道的食材、勋章、菜谱写进 data/master 三份主表
 * （替换 src 为 streets 的条目，重新编号 PR 1），街道写 data/designed/streets_new.json；补 8~10 品级，
 * 再把新菜的英法西菜名并进 data/i18n/<语言>/cookbooks.json。重跑会整份替换这些文件，
 * 并删掉已经不存在的新菜谱译名、给勋章对照表补上新街道的行（backlog 284）。
 * 外部数据仍是重新编号前的编号（重新编号 PR 4）：按主表的 legacyId 对上新编号；新出现的条目按编号规则分配
 * （食材 等级 × 1000 + 序号、菜谱 100000 + 街道 × 1000 + 序号、勋章 60000 + 街道），legacyId 记外部编号。
 * 新菜谱 id 已上线：要求数据那边固定 id，不能顺移。上次导入过的 id 没了或换了街道时什么都不写、直接退出，
 * 确认无误后加 --allow-removed 重跑
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { seededRng } from '@dt/shared';
import { collectTransitions, extendGrades, type GradeTable } from '../src/gradeGen';
import {
  foodFromRaw,
  formatMaster,
  goodsFromRaw,
  replaceSrc,
  type MasterCookbook,
  type MasterFood,
  type MasterGoods,
} from '../src/master';
import type { rawFood, rawGoods } from '../src/raw';
import { addMedalRows, assignIds, assignSlots, importConflicts, pruneNames } from '../src/streetImport';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const allowRemoved = process.argv.includes('--allow-removed');
const srcDir = args[0] ?? resolve(pkg, '../../../data/新街道菜谱');
const i18nDir = args[1] ?? resolve(pkg, '../../../data/i18n');
const data = join(pkg, 'data');
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
/** 先全部算好再统一写：中途出错（例如勋章 value 坏了）时不留下写了一半的数据（质量期第 ⑦ 批） */
const pending = new Map<string, string>();
const stage = (path: string, text: string) => pending.set(path, text);
/** 和 data/designed 下其他文件一样：1 空格缩进、结尾没有换行 */
const write = (name: string, rule: string, list: unknown[]) =>
  stage(
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
type Food = z.infer<typeof rawFood>;
const streets = read<{ data: object[] }>(join(srcDir, 'streets_new.json')).data;
const foods = read<{ data: Food[] }>(join(srcDir, 'foods_new.json')).data;
const medals = read<{ data: Array<Record<string, unknown>> }>(join(srcDir, 'street_medals_new.json')).data;
const cookbooks = read<{ data: Cb[] }>(join(srcDir, 'cookbooks_new.json')).data;

const master = <T>(name: string) => read<{ rule: string; data: T[] }>(join(data, 'master', `${name}.json`));
const mGoods = master<MasterGoods>('goods');
const mFoods = master<MasterFood>('foods');
const mCookbooks = master<MasterCookbook>('cookbooks');

// ---------- 外部旧编号 → 新编号（重新编号 PR 4） ----------
const legacyOf = (list: ReadonlyArray<{ id: number; legacyId?: number }>) =>
  new Map(list.filter((x) => x.legacyId !== undefined).map((x) => [x.legacyId!, x.id]));
/** 食材：原版食材也在里面（新菜谱的用料引用原版食材的旧编号） */
const foodId = assignIds(
  legacyOf(mFoods.data),
  foods.map((f) => ({ legacyId: f.id, base: f.level * 1000 })),
  mFoods.data.map((f) => f.id),
);
for (const [old, id] of legacyOf(mFoods.data)) if (!foodId.has(old)) foodId.set(old, id);
const toFood = (old: number) => {
  const id = foodId.get(old);
  if (id === undefined) throw new Error(`food ${old} not found`);
  return id;
};
const mapGrades = (g: GradeTable): GradeTable =>
  Object.fromEntries(
    Object.entries(g).map(([grade, list]) => [
      grade,
      list.map((f) => ({ ...f, foodsId: toFood(f.foodsId) })),
    ]),
  );
/** 街道勋章：60000 + 街道编号（小类 streetMedal）；旧编号是之前的 92000 + 街道编号 */
const medalId = (streetId: number) => 60000 + streetId;

// 老菜谱的换料统计：按旧编号的顺序遍历，和重新编号前一样（选项顺序影响按种子抽的结果）
const old = mCookbooks.data
  .filter((c) => c.src === 'original')
  .sort((a, b) => a.legacyId! - b.legacyId!)
  .map((c) => ({ id: c.id, needFoodsByLevel: c.needFoods }));
const level = new Map(
  [...mFoods.data.filter((f) => f.src === 'original'), ...foods.map((f) => ({ ...f, id: toFood(f.id) }))].map(
    (f) => [f.id, f.level],
  ),
);
const t89 = collectTransitions(old, 8, 9);
const t910 = collectTransitions(old, 9, 10);
const rng = seededRng(284);

const sorted = [...cookbooks].sort((a, b) => a.id - b.id);
// 新菜谱 id 已上线：上次导入过的 id 没了或换了街道（多半是顺移了 id），先停下，什么都不写（backlog 284 终审）
// 外部数据是旧编号，主表一侧也按 legacyId 比
const conflicts = importConflicts(
  mCookbooks.data.filter((c) => c.src === 'streets').map((c) => ({ ...c, id: c.legacyId! })),
  sorted,
);
if (!allowRemoved && (conflicts.removed.length > 0 || conflicts.restreeted.length > 0)) {
  console.error(
    `上次导入过的新菜谱 id 这次没了 ${JSON.stringify(conflicts.removed)}，或换了街道 ${JSON.stringify(conflicts.restreeted)}。` +
      '新菜谱 id 已经上线，不能顺移；确认确实要删或改，再加 --allow-removed 重跑。',
  );
  process.exit(1);
}
const cbId = assignIds(
  legacyOf(mCookbooks.data),
  sorted.map((c) => ({ legacyId: c.id, base: 100000 + c.streetId * 1000 })),
  mCookbooks.data.map((c) => c.id),
);

write(
  'streets_new',
  '新增街道 14~29；desc = 街道加成文字（与勋章 desc 一致）',
  streets.map((s) => pick(s, ['id', 'name', 'cookname', 'cookshortname', 'desc'])),
);
/** 主表：只换 src 为 streets 的那一块，再按编号排序 */
const writeMaster = <T extends { src: string; id: number }>(
  name: string,
  m: { rule: string; data: T[] },
  entries: T[],
) =>
  stage(
    join(data, 'master', `${name}.json`),
    formatMaster(
      m.rule,
      replaceSrc(m.data, 'streets', entries).sort((a, b) => a.id - b.id),
    ),
  );
writeMaster(
  'foods',
  mFoods,
  foods.map((f) => foodFromRaw(f, 'streets', { id: toFood(f.id), legacyId: f.id })),
);
writeMaster(
  'goods',
  mGoods,
  medals.map((m) =>
    goodsFromRaw(
      Object.fromEntries(Object.entries(m).filter(([k]) => k !== '_src')) as z.infer<typeof rawGoods>,
      'streets',
      {
        id: medalId(m.devicetype as number),
        legacyId: 92000 + (m.devicetype as number),
        group: 'streetMedal',
      },
    ),
  ),
);
// 学会记录的存储位（重新编号 PR 3）：已有的菜保留，新菜从 next 往后分，删掉的不回收
const slotsPath = join(data, 'game', 'cookbook_slots.json');
const slotsFile = read<{ next: number }>(slotsPath);
const assigned = assignSlots(
  mCookbooks.data,
  sorted.map((c) => cbId.get(c.id)!),
  slotsFile.next,
);
if (assigned.next !== slotsFile.next) {
  stage(slotsPath, `${JSON.stringify({ next: assigned.next }, null, 2)}\n`);
  console.log(`cookbook_slots: next ${slotsFile.next} -> ${assigned.next}`);
}
writeMaster(
  'cookbooks',
  mCookbooks,
  sorted.map((c): MasterCookbook => {
    const id = cbId.get(c.id)!;
    return {
      id,
      legacyId: c.id,
      src: 'streets',
      slot: assigned.slots.get(id)!,
      name: c.name,
      streetId: c.streetId,
      taste: c.taste,
      coin: c.coin,
      level: c.level,
      desc: c.desc,
      // 外部数据的用料还带食材名、等级，主表只存编号和数量
      needFoods: Object.fromEntries(
        Object.entries(
          extendGrades(mapGrades(c.needFoodsByLevel), t89, t910, (f) => level.get(f) === 7, rng),
        ).map(([grade, list]) => [grade, list.map((f) => ({ foodsId: f.foodsId, num: f.num }))]),
      ),
    };
  }),
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
  stage(mapPath, JSON.stringify({ ...map, count: medalRows.rows.length, data: medalRows.rows }, null, 1));
  console.log(`street_medal_map: added streets ${medalRows.added.join(', ')}`);
}

const oldIds = new Set(old.map((c) => c.id));
const newIds = new Set(sorted.map((c) => cbId.get(c.id)!));
for (const l of ['en', 'fr', 'es']) {
  const p = join(data, 'i18n', l, 'cookbooks.json');
  const { names: mine, removed } = pruneNames(read<Record<string, { name: string }>>(p), oldIds, newIds);
  if (removed.length > 0)
    console.log(`${l}: removed names of ${removed.length} cookbooks no longer imported`);
  // 外部译名按旧编号
  const theirs = read<Record<string, { name: string }>>(join(i18nDir, l, 'cookbooks.json'));
  for (const c of sorted) {
    const e = theirs[c.id];
    if (e) mine[cbId.get(c.id)!] = { name: e.name };
  }
  stage(p, JSON.stringify(mine, null, 2) + '\n');
}
for (const [path, text] of pending) writeFileSync(path, text);
console.log(
  `streets ${streets.length}, foods ${foods.length}, medals ${medals.length}, cookbooks ${sorted.length}`,
);

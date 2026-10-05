/**
 * 已于重新编号 PR 4 执行；主表已是新编号，重跑会报错或跳过，留作记录。
 * 重新编号 第 4 步（一次性）：按 data/renumber/map.json 把配置数据换成新编号。
 *   pnpm -F @dt/config exec tsx scripts/renumber-apply.ts
 * - SOURCE_FILES 里的每个文件按 rewriteIds 的通用规则 + 下面 FILE_RULES 的位置规则换，按路径就地替换数字，排版不动；
 * - 菜谱主表的 slot 按新编号顺序重排（对照表的 cookbookSlots），cookbook_slots.json 的 next 改成菜谱总数；
 * - 翻译表（data/i18n/<语言>/{goods,foods,cookbooks}.json）换键；
 * - dataset/goods_sources.json 不在 SOURCE_FILES 里，按设计 §3 保留旧编号。
 * 主表已经是新编号时什么都不做（防止重跑）；有查不到对照的旧编号时报错、什么都不写
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultDataDir, SOURCE_FILES } from '../src/index';
import { patchJsonText, rewriteIds, TUNING_ID_PATHS, type IdMaps, type PathRule } from '../src/renumber';

const data = defaultDataDir();
const read = (name: string) => readFileSync(join(data, `${name}.json`), 'utf8');
const map = JSON.parse(read('renumber/map')) as Record<string, Array<[number, number]>>;
const maps: IdMaps = {
  goods: new Map(map.goods),
  foods: new Map(map.foods),
  cookbooks: new Map(map.cookbooks),
};
const slotOf = new Map(map.cookbookSlots);

const master = JSON.parse(read('master/goods')) as { data: Array<{ id: number }> };
if (master.data.every((g) => g.id >= 10000)) {
  console.log('主表已经是新编号，跳过');
  process.exit(0);
}

/** 按位置认的编号（通用键名规则认不出的）；路径从文件的根算 */
const FILE_RULES: Record<string, readonly PathRule[]> = {
  'master/goods': [
    [['data', '*', 'id'], 'goods'],
    // 鞋带：value.goods 捆成 value.targetGoods（标量，不是列表）
    [['data', '*', 'value', 'goods'], 'goods'],
    [['data', '*', 'value', 'targetGoods'], 'goods'],
  ],
  'master/foods': [[['data', '*', 'id'], 'foods']],
  'master/cookbooks': [[['data', '*', 'id'], 'cookbooks']],
  'game/kuji': [[['themes', '*', 'figures', '*'], 'goods']],
  'game/fund': [[['medals', '*', 'id'], 'goods']],
  'game/tuning': TUNING_ID_PATHS,
  'dataset/market_guess_foods': [[['data', '*', 'i'], 'foods']],
  restaurant_defaults: [
    [['giftGoods', '*', 'id'], 'goods'],
    [['giftFoods', '*', 'id'], 'foods'],
  ],
};

const out = new Map<string, string>();
const problems: string[] = [];
for (const name of SOURCE_FILES) {
  const text = read(name);
  const r = rewriteIds(JSON.parse(text), maps, { paths: FILE_RULES[name] ?? [] });
  for (const o of r.orphans) problems.push(`${name} ${o.path.join('.')}: ${o.kind} ${o.id} 没有对照`);
  const edits = new Map(r.edits);
  if (name === 'master/cookbooks') {
    const list = (JSON.parse(text) as { data: Array<{ id: number; slot: number }> }).data;
    list.forEach((c, i) => {
      if (c.slot !== c.id)
        problems.push(`cookbook ${c.id} slot ${c.slot} ≠ id（对照表按 slot = 旧编号生成）`);
      edits.set(JSON.stringify(['data', i, 'slot']), slotOf.get(c.id)!);
    });
  }
  if (name === 'game/cookbook_slots') edits.set(JSON.stringify(['next']), slotOf.size);
  if (edits.size > 0) {
    out.set(name, patchJsonText(text, edits));
    console.log(`${name}: ${edits.size}`);
  }
}
// 翻译表换键（JSON.stringify(…, null, 2) + 换行，和原文件一样）
for (const l of ['en', 'fr', 'es']) {
  for (const kind of ['goods', 'foods', 'cookbooks'] as const) {
    const name = `i18n/${l}/${kind}`;
    const t = JSON.parse(read(name)) as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) {
      const n = maps[kind].get(Number(k));
      if (n === undefined) problems.push(`${name} ${k} 没有对照`);
      else next[String(n)] = v;
    }
    out.set(name, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`${name}: ${Object.keys(next).length} keys`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
for (const [name, text] of out) writeFileSync(join(data, `${name}.json`), text);

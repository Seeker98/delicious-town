# 重新编号 PR 1：主表整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 道具、食材、菜谱的定义各收进一份仓库自己维护的主表（`data/master/`），编号不变、构建结果逐字节不变。

**Architecture:** 一次性脚本从现在的构建结果生成三份主表（只存“写出来的”字段，派生字段照旧由构建算）；构建改成从主表读，删掉被合并的 11 份定义文件，一番赏、基金、新手礼包、厨具设定文件只留非定义内容；新街道导入脚本改成按 `src` 整块替换主表里的新街道条目；`sync-data` 不再同步道具、食材。

**Tech Stack:** TypeScript、zod、Vitest、tsx（`packages/config`）。

**Spec:** `docs/superpowers/specs/2026-10-05-id-renumber-design.md`（第 3 节、第 6 节 PR 1）

## Global Constraints

- 编号不变；构建产出的 `packages/config/generated/bundle.json` 与改动前逐字节相同（版本号不变）。
- 主表路径：`data/master/goods.json`、`data/master/foods.json`、`data/master/cookbooks.json`；格式 `{ "rule": "...", "data": [ ...每条一行... ] }`。
- `data/` 在 `.prettierignore` 里，主表格式由脚本决定。
- 回复、注释、提交说明用中文；提交末尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 只 `git add` 明确路径（`apps/web/e2e/_*.spec.ts` 等临时文件不提交）。
- 推送前跑 `pnpm format:check`（只允许 问题记录.md、`e2e/_*.spec.ts`、`apps/web/shots/v100/overflow.json` 报警告）。

## 与设计的出入（裁定）

- 设计第 6 节 PR 1 写了同时加 `legacyId`、道具 `group`、菜谱 `slot`。这三个字段 PR 1 用不上（编号不变时 `legacyId` 恒等于 `id`），放到真正用到它们的 PR：`slot` 在 PR 3，`legacyId`、`group` 在 PR 4。PR 1 只加 `src`（来历），导入脚本要靠它整块替换。
- 道具定义还有第 8 处来源：`game/equip_lore.json` 的 `rename`、`add`（厨具改名、新增厨具），一起收进主表；该文件只留 `suits`、`stressTables`。

## Review Focus

1. 改完重跑新街道导入（仓库外 `../data/新街道菜谱` 存在），主表不应有任何变化——Task 4 Step 6 验证。
2. 下架名单非空时，主表存的是下架前的商店、随机奖励字段，构建再清掉——`retired.test.ts` 已有用例，Task 3 跑全量配置测试覆盖。
3. 主表某条字段写错（类型错、重复 id、引用不存在的食材）时，错误要指出 `master/<表>` 和路径——Task 3 Step 1 的坏数据用例。
4. 一番赏主题引用的手办、基金勋章、随机券在主表里不存在或类型不对时构建要报错（原来定义和引用在同一份文件，天然一致；拆开后要显式检查）——Task 3 Step 1。
5. 服务端、前端不读这些源文件，但服务端测试用生成的配置包——Task 5 全量测试覆盖。

---

## File Structure

- Create `packages/config/src/master.ts`：主表的格式化 `formatMaster`、原始道具/食材转主表条目 `goodsFromRaw` / `foodFromRaw`、整块替换 `replaceSrc`。生成脚本和导入脚本共用。
- Create `packages/config/src/master.test.ts`
- Modify `packages/config/src/raw.ts`：加 `masterGoods`、`masterFood`、`masterCookbook`；改 `kujiFile`、`fundFile`、`newbiePackFile`、`equipLoreFile`；删 `souvenirsFile`、`devicesExtraFile`、`rawCookbookPrice`、`rawAwardFlag`。
- Modify `packages/config/src/source.ts`：源文件清单。
- Modify `packages/config/src/build.ts`：道具、食材、菜谱从主表构建。
- Modify `packages/config/src/lore.ts`：只剩套装叠加。
- Create `packages/config/data/master/{goods,foods,cookbooks}.json`（脚本生成）。
- Delete `data/dataset/{goods,foods,cookbooks}.json`、`data/designed/{foods_new,cookbooks_new,cookbooks_price,cookbooks_price_new,street_medals_new,goods_awardflag}.json`、`data/game/{souvenirs,devices_extra}.json`。
- Modify `data/game/{kuji,fund,newbie_pack,equip_lore}.json`：去掉定义。
- Modify tests：`build.test.ts`、`devicesExtra.test.ts`、`fund.test.ts`、`kuji.test.ts`、`souvenir.test.ts`、`lore.test.ts`（如引用 rename/add）。
- Modify `packages/config/scripts/import-new-streets.ts`、`packages/config/scripts/sync-data.ts`。
- Modify `docs/data-maintenance.md`。

---

### Task 1: 主表工具函数

**Files:**
- Create: `packages/config/src/master.ts`
- Create: `packages/config/src/master.test.ts`
- Modify: `packages/config/src/raw.ts`（加三个主表 schema）

**Interfaces:**
- Produces:
  - `type GoodsSrc = 'original' | 'lore' | 'streets' | 'souvenir' | 'kuji' | 'newbie' | 'fund' | 'poster'`
  - `raw.masterGoods`、`raw.masterFood`、`raw.masterCookbook`（zod），对应类型 `MasterGoods`、`MasterFood`、`MasterCookbook`（`z.infer`）
  - `formatMaster(rule: string, list: readonly object[]): string`
  - `goodsFromRaw(g: RawGoods, src: GoodsSrc): MasterGoods`
  - `foodFromRaw(f: RawFood, src: 'original' | 'streets'): MasterFood`
  - `replaceSrc<T extends { src: string }>(list: readonly T[], src: string, entries: readonly T[]): T[]`

- [ ] **Step 1: 写失败的测试**

```ts
// packages/config/src/master.test.ts
import { describe, expect, it } from 'vitest';
import { foodFromRaw, formatMaster, goodsFromRaw, replaceSrc } from './master';

describe('主表（重新编号 PR 1）', () => {
  it('格式：rule + data，每条一行，结尾换行', () => {
    const text = formatMaster('说明', [{ id: 1, a: [1, 2] }, { id: 2 }]);
    expect(text).toBe('{\n "rule": "说明",\n "data": [\n  {"id":1,"a":[1,2]},\n  {"id":2}\n ]\n}\n');
    expect(JSON.parse(text)).toEqual({ rule: '说明', data: [{ id: 1, a: [1, 2] }, { id: 2 }] });
  });

  it('空表也合法', () => {
    expect(JSON.parse(formatMaster('x', []))).toEqual({ rule: 'x', data: [] });
  });

  it('原始道具转主表：value 解析成 JSON，标志位换成布尔，缺省补齐', () => {
    expect(
      goodsFromRaw(
        { id: 5, name: '甲', type: 9, devicetype: 20, value: '{"coinValue":2}', subflag: 1, saleflag: 0, awardflag: 3 },
        'streets',
      ),
    ).toEqual({
      id: 5,
      src: 'streets',
      name: '甲',
      type: 9,
      deviceType: 20,
      invalidHours: null,
      maxNum: 9999,
      stackable: true,
      level: 1,
      coin: 0,
      diamond: 0,
      onSale: false,
      awardFlag: 3,
      desc: '',
      value: { coinValue: 2 },
    });
    expect(goodsFromRaw({ id: 6, name: '乙', type: 1, value: '' }, 'original').value).toBeNull();
  });

  it('原始食材转主表：maxNum 缺省 999，type 缺省 null', () => {
    expect(foodFromRaw({ id: 7, name: '丙', level: 2, coin: 10, odds: 100 }, 'streets')).toEqual({
      id: 7,
      src: 'streets',
      name: '丙',
      level: 2,
      coin: 10,
      odds: 100,
      maxNum: 999,
      type: null,
    });
  });

  it('按来历整块替换：留在原位置，别的条目不动；原来没有就接在最后', () => {
    const list = [
      { id: 1, src: 'original' },
      { id: 2, src: 'streets' },
      { id: 3, src: 'streets' },
      { id: 4, src: 'lore' },
    ];
    expect(replaceSrc(list, 'streets', [{ id: 9, src: 'streets' }])).toEqual([
      { id: 1, src: 'original' },
      { id: 9, src: 'streets' },
      { id: 4, src: 'lore' },
    ]);
    expect(replaceSrc(list, 'kuji', [{ id: 8, src: 'kuji' }]).at(-1)).toEqual({ id: 8, src: 'kuji' });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd packages/config && npx vitest run src/master.test.ts`
Expected: FAIL，`Cannot find module './master'`

- [ ] **Step 3: 加 schema（raw.ts 末尾）**

```ts
/** 主表（重新编号 PR 1）：道具、食材、菜谱的定义只在 data/master 下；src = 来历，新街道导入按它整块替换 */
const goodsSrc = z.enum(['original', 'lore', 'streets', 'souvenir', 'kuji', 'newbie', 'fund', 'poster']);
export const masterGoods = z
  .object({
    id: int,
    src: goodsSrc,
    name: z.string().min(1),
    type: int,
    deviceType: int.nullable(),
    invalidHours: z.number().nullable(),
    maxNum: int,
    stackable: z.boolean(),
    level: int,
    coin: z.number(),
    diamond: z.number(),
    onSale: z.boolean(),
    awardFlag: int.nullable(),
    desc: z.string(),
    value: z.unknown(),
    /** 后期海报奖杯（问题记录 146） */
    needStar: int.optional(),
    /** 一到五级食材随机券（问题记录 331）：value 是空的，用法直接写 */
    use: z.object({ kind: z.literal('randomFood'), level: int.min(1).max(7) }).strict().optional(),
  })
  .strict();
export const masterFood = z
  .object({
    id: int,
    src: z.enum(['original', 'streets']),
    name: z.string().min(1),
    level: int,
    coin: z.number(),
    odds: z.number(),
    maxNum: int,
    type: int.nullable(),
  })
  .strict();
export const masterCookbook = z
  .object({
    id: int,
    src: z.enum(['original', 'streets']),
    name: z.string().min(1),
    streetId: int,
    taste: z.array(int),
    coin: z.number(),
    level: int,
    desc: z.string(),
    needFoods: z.record(z.string(), z.array(z.object({ foodsId: int, num: int }).strict())),
  })
  .strict();
```

- [ ] **Step 4: 写 master.ts**

```ts
// packages/config/src/master.ts
import type { z } from 'zod';
import type { masterCookbook, masterFood, masterGoods, rawFood, rawGoods } from './raw';

/** 主表（重新编号 PR 1，设计 §3）：data/master 下道具、食材、菜谱的定义 */
export type MasterGoods = z.infer<typeof masterGoods>;
export type MasterFood = z.infer<typeof masterFood>;
export type MasterCookbook = z.infer<typeof masterCookbook>;
export type GoodsSrc = MasterGoods['src'];

/** 主表文件的格式：rule + data，每条一行（diff 时一条改动就是一行），结尾换行 */
export function formatMaster(rule: string, list: readonly object[]): string {
  const rows = list.map((x) => `  ${JSON.stringify(x)}`).join(',\n');
  return `{\n "rule": ${JSON.stringify(rule)},\n "data": [${rows ? `\n${rows}\n ` : ''}]\n}\n`;
}

/** 原版格式的道具（数据集、新街道勋章）转成主表条目；和构建原来的缺省值一致 */
export function goodsFromRaw(g: z.infer<typeof rawGoods>, src: GoodsSrc): MasterGoods {
  const text = g.value?.trim() ?? '';
  return {
    id: g.id,
    src,
    name: g.name,
    type: g.type,
    deviceType: g.devicetype ?? null,
    invalidHours: g.invalidhour ?? null,
    maxNum: g.maxNum ?? 9999,
    stackable: g.subflag === 1,
    level: g.level ?? 1,
    coin: g.coin ?? 0,
    diamond: g.diamond ?? 0,
    onSale: g.saleflag === 1,
    awardFlag: g.awardflag ?? null,
    desc: g.desc ?? '',
    value: text === '' ? null : (JSON.parse(text) as unknown),
  };
}

/** 原版格式的食材转成主表条目 */
export function foodFromRaw(f: z.infer<typeof rawFood>, src: MasterFood['src']): MasterFood {
  return {
    id: f.id,
    src,
    name: f.name,
    level: f.level,
    coin: f.coin,
    odds: f.odds,
    maxNum: f.maxNum ?? 999,
    type: f.type ?? null,
  };
}

/** 把某个来历的条目整块换掉：放在原来第一条的位置，别的条目顺序不变；原来没有就接在最后 */
export function replaceSrc<T extends { src: string }>(list: readonly T[], src: string, entries: readonly T[]): T[] {
  const at = list.findIndex((x) => x.src === src);
  const rest = list.filter((x) => x.src !== src);
  if (at < 0) return [...rest, ...entries];
  const before = list.slice(0, at).filter((x) => x.src !== src).length;
  return [...rest.slice(0, before), ...entries, ...rest.slice(before)];
}
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `cd packages/config && npx vitest run src/master.test.ts`
Expected: PASS（5 条）

- [ ] **Step 6: 提交**

```bash
git add packages/config/src/master.ts packages/config/src/master.test.ts packages/config/src/raw.ts
git commit -m "feat(config): 主表格式和转换工具（重新编号 PR 1）"
```

---

### Task 2: 生成主表数据（一次性脚本，不提交）

**Files:**
- Create（不提交）: `packages/config/scripts/_make-master.ts`
- Create: `packages/config/data/master/{goods,foods,cookbooks}.json`
- Create（不提交）: scratchpad 里的 `bundle-before.json`

**Interfaces:**
- Consumes: Task 1 的 `formatMaster`、`MasterGoods` 等类型；现有 `buildBundle`、`readSourceDir`、`applyEquipLore`、`rawGoods`。
- Produces: 三份主表文件，条目顺序 = 现在构建结果里的顺序。

- [ ] **Step 1: 保存改动前的构建结果**

Run:
```bash
pnpm -F @dt/config build && cp packages/config/generated/bundle.json "$SCRATCH/bundle-before.json"
```
（`$SCRATCH` = 会话的 scratchpad 目录）
Expected: 构建成功；`git status` 下 `data/game/retired.json` 是空名单（主表要存下架前的字段，空名单时构建结果就是下架前的）。

- [ ] **Step 2: 写生成脚本**

```ts
// packages/config/scripts/_make-master.ts（一次性，不提交）
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { buildBundle } from '../src/build';
import { applyEquipLore } from '../src/lore';
import { formatMaster, type GoodsSrc, type MasterCookbook, type MasterFood, type MasterGoods } from '../src/master';
import * as raw from '../src/raw';
import { defaultDataDir, readSourceDir } from '../src/source';

const dir = defaultDataDir();
const src = readSourceDir(dir);
const retired = src['game/retired'] as { goods: unknown[]; foods: unknown[] };
if (retired.goods.length || retired.foods.length) throw new Error('retired.json 要先清空');
const b = buildBundle(src).bundle;
if (!b) throw new Error('build failed');

const ids = (key: string) => new Set((src[key] as Array<{ id: number }>).map((x) => x.id));
const lore = raw.equipLoreFile.parse(src['game/equip_lore']);
const kuji = raw.kujiFile.parse(src['game/kuji']);
const srcOf = new Map<number, GoodsSrc>();
for (const id of ids('dataset/goods')) srcOf.set(id, 'original');
for (const id of ids('designed/street_medals_new')) srcOf.set(id, 'streets');
for (const a of lore.add) srcOf.set(a.id, 'lore');
for (const s of raw.souvenirsFile.parse(src['game/souvenirs']).souvenirs) srcOf.set(s.id, 'souvenir');
srcOf.set(kuji.ticket.id, 'kuji');
srcOf.set(kuji.deluxeTicket.id, 'kuji');
for (const t of kuji.themes) for (const f of Object.values(t.figures)) srcOf.set(f.id, 'kuji');
for (const v of raw.newbiePackFile.parse(src['game/newbie_pack']).vouchers) srcOf.set(v.id, 'newbie');
for (const m of raw.fundFile.parse(src['game/fund']).medals) srcOf.set(m.id, 'fund');
for (const x of raw.devicesExtraFile.parse(src['game/devices_extra']).items) srcOf.set(x.id, 'poster');

// 厨具的说明在构建时按强化表改写过；主表存改写前的（构建照旧改写）
const goodsRaw = z.array(raw.rawGoods);
const lored = applyEquipLore(
  [...goodsRaw.parse(src['dataset/goods']), ...goodsRaw.parse(src['designed/street_medals_new'])],
  z.array(raw.rawSuit).parse(src['designed/equip_suits']),
  lore,
  [],
);
const loredDesc = new Map(lored.goods.map((g) => [g.id, g.desc ?? '']));

const goods: MasterGoods[] = b.goods.map((g) => {
  const s = srcOf.get(g.id);
  if (!s) throw new Error(`no src for goods ${g.id}`);
  return {
    id: g.id,
    src: s,
    name: g.name,
    type: g.type,
    deviceType: g.deviceType,
    invalidHours: g.invalidHours,
    maxNum: g.maxNum,
    stackable: g.stackable,
    level: g.level,
    coin: g.coin,
    diamond: g.diamond,
    onSale: g.onSale,
    awardFlag: g.awardFlag,
    desc: g.equip ? loredDesc.get(g.id)! : g.desc,
    value: g.value,
    ...(g.needStar !== undefined ? { needStar: g.needStar } : {}),
    ...(s === 'newbie' && g.use?.kind === 'randomFood' ? { use: g.use } : {}),
  };
});
const newFoods = ids('designed/foods_new');
const foods: MasterFood[] = b.foods.map((f) => ({
  id: f.id,
  src: newFoods.has(f.id) ? 'streets' : 'original',
  name: f.name,
  level: f.level,
  coin: f.coin,
  odds: f.odds,
  maxNum: f.maxNum,
  type: f.type,
}));
const newCb = ids('designed/cookbooks_new');
const cookbooks: MasterCookbook[] = b.cookbooks.map((c) => ({
  id: c.id,
  src: newCb.has(c.id) ? 'streets' : 'original',
  name: c.name,
  streetId: c.streetId,
  taste: c.taste,
  coin: c.coin,
  level: c.level,
  desc: c.desc,
  needFoods: Object.fromEntries(Object.entries(c.needFoods)),
}));

mkdirSync(join(dir, 'master'), { recursive: true });
const RULE = {
  goods: '全部道具的定义（重新编号 PR 1）：src = 来历（original 原版、lore 厨具设定新增、streets 新街道导入、souvenir 节日纪念品、kuji 一番赏、newbie 新手券、fund 发展基金、poster 后期海报奖杯）；厨具说明是强化表改写前的',
  foods: '全部食材的定义（重新编号 PR 1）：src = original 原版 / streets 新街道导入；出现权重 weight 由构建按需求算',
  cookbooks: '全部菜谱的定义（重新编号 PR 1）：src = original 原版（老街道修订版）/ streets 新街道导入（8~10 品级按老数据换料频率生成）；含售价、推荐等级、描述',
};
writeFileSync(join(dir, 'master', 'goods.json'), formatMaster(RULE.goods, goods));
writeFileSync(join(dir, 'master', 'foods.json'), formatMaster(RULE.foods, foods));
writeFileSync(join(dir, 'master', 'cookbooks.json'), formatMaster(RULE.cookbooks, cookbooks));
console.log(`goods ${goods.length}, foods ${foods.length}, cookbooks ${cookbooks.length}`);
```

- [ ] **Step 3: 运行**

Run: `cd packages/config && npx tsx scripts/_make-master.ts`
Expected: `goods 715, foods 336, cookbooks 3810`；`data/master/` 下三份文件。

- [ ] **Step 4: 抽查**

Run: `head -c 600 packages/config/data/master/goods.json; grep -c '"src":"kuji"' packages/config/data/master/goods.json`
Expected: 格式如 Task 1；`"src":"kuji"` 50 条（抽赏券 2 + 月度手办 48）；`"src":"souvenir"` 16 条（节日纪念品 12 + 初代手办 90101~90104，后者原本就在 `souvenirs.json`）。

（不提交：数据和构建改动在 Task 3 一起提交，否则中间状态构建不过。）

---

### Task 3: 构建从主表读，删掉旧定义文件

**Files:**
- Modify: `packages/config/src/source.ts`、`packages/config/src/raw.ts`、`packages/config/src/build.ts`、`packages/config/src/lore.ts`
- Modify: `packages/config/data/game/{kuji,fund,newbie_pack,equip_lore}.json`
- Delete: 第 File Structure 节列的 11 份文件
- Test: `packages/config/src/build.test.ts`、`devicesExtra.test.ts`、`fund.test.ts`、`kuji.test.ts`、`souvenir.test.ts`

**Interfaces:**
- Consumes: Task 1 的 schema 和类型；Task 2 的主表文件。
- Produces: `buildBundle` 读 `master/goods`、`master/foods`、`master/cookbooks`；`kujiFile.themes[].figures` 变成 `{ A: number; B: number; C: number; last: number }`；`fundFile.medals[]` 变成 `{ id, icon }`；`newbiePackFile` 去掉 `vouchers`；`equipLoreFile` 去掉 `rename`、`add`；`applyEquipLore(suits, lore)` 只返回套装。

- [ ] **Step 1: 先改测试（坏数据用例改成改主表，加拆分后需要的引用检查）**

`build.test.ts` 里：
- 「厨具引用了不存在的套装」：改 `src['master/goods']`，`g.value.suitid = 777`（value 已是对象）。
- 「食谱引用了不存在的食材」：改 `src['master/cookbooks']`，`cookbooks[0].needFoods['1'][0].foodsId = 999999`。
- 「礼包引用了不存在的道具」：`goods.find((g) => g.id === 117).value = [{ type: 'goods', id: 888888, num: 1, rate: 1 }]`。
- 「字段类型错误时指出表名和路径」：改 `master/foods`，断言 `errors.some((e) => e.startsWith('master/foods: 0.coin'))`。
- 删掉「改名引用了不存在的道具、新增道具 id 重复」用例；「overlay 写错键名…」用例去掉 `lore.rename[0].awardFlag` 那段，留套装三条断言。
- 「食谱售价表的检查」整段换成：

```ts
describe('主表的检查（重新编号 PR 1）', () => {
  it('道具、食谱编号重复时构建报错', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<{ id: number }>;
    goods.push({ ...goods[0]! });
    const cookbooks = structuredClone(src['master/cookbooks']) as Array<{ id: number }>;
    cookbooks.push({ ...cookbooks[0]! });
    const { errors } = buildBundle({ ...src, 'master/goods': goods, 'master/cookbooks': cookbooks });
    expect(errors).toContain(`goods: duplicate id ${goods[0]!.id}`);
    expect(errors).toContain(`cookbooks: duplicate id ${cookbooks[0]!.id}`);
  });

  it('一番赏主题的手办、基金勋章要在主表里，类型对', () => {
    const src = source();
    const kuji = structuredClone(src['game/kuji']) as { themes: Array<{ figures: { A: number } }> };
    kuji.themes[0]!.figures.A = 999_999;
    kuji.themes[1]!.figures.A = 1; // 神秘礼券不是纪念品
    const fund = structuredClone(src['game/fund']) as { medals: Array<{ id: number }> };
    fund.medals[0]!.id = 1;
    const { errors } = buildBundle({ ...src, 'game/kuji': kuji, 'game/fund': fund });
    expect(errors).toContain('kuji theme 1 figure A 999999 is not a souvenir');
    expect(errors).toContain('kuji theme 2 figure A 1 is not a souvenir');
    expect(errors).toContain('fund medal 1 is not an honor');
  });
});
```

- 「随机券那一级没有可抽的食材」：改 `master/foods`（`for (const f of foods) if (f.level === 5) f.odds = 0`），断言 `'goods 93005 randomFood level 5 has no food to draw'`。

`devicesExtra.test.ts`「检查：星级越界、设施位不对、id 重复」改成改主表：

```ts
  it('检查：星级越界、设施位不对、id 重复', () => {
    const src = source();
    const goods = structuredClone(src['master/goods']) as Array<Record<string, unknown>>;
    const posters = goods.filter((g) => g.src === 'poster');
    posters[0]!.needStar = 13;
    posters[1]!.deviceType = 6;
    posters[2]!.id = 13;
    posters[3]!.needStar = -1;
    const errs = buildBundle({ ...src, 'master/goods': goods }).errors.join('\n');
    expect(errs).toContain(`goods ${posters[0]!.id as number} needStar 13`);
    expect(errs).toContain('goods 93204 needStar -1');
    expect(errs).toContain(`goods ${posters[1]!.id as number} poster deviceType 6`);
    expect(errs).toContain('goods: duplicate id 13');
  });
```

`fund.test.ts`：`f.medals[0].icon = 'nope'` 不变（`fund.json` 仍有 icon），确认仍断言 `'fund medal 93101 icon nope not in looks.icons'`。

`kuji.test.ts`「月度主题校验」不变（`themes[].month` 仍在 `kuji.json`）。

`souvenir.test.ts`「id 和已有道具冲突」改成：

```ts
  it('id 和已有道具冲突时构建报错', () => {
    const src = readSourceDir(defaultDataDir());
    const goods = structuredClone(src['master/goods']) as Array<{ id: number; src: string }>;
    goods.find((g) => g.src === 'souvenir')!.id = 1;
    const r = buildBundle({ ...src, 'master/goods': goods });
    expect(r.bundle).toBeNull();
    expect(r.errors).toContain('goods: duplicate id 1');
  });
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd packages/config && npx vitest run`
Expected: 上面改过的用例 FAIL（`master/goods` 等还没被构建读、`src['master/goods']` 是 undefined）；其余照旧。

- [ ] **Step 3: 源文件清单（source.ts）**

从 `SOURCE_FILES` 删掉：`'dataset/foods'`、`'dataset/goods'`、`'dataset/cookbooks'`、`'designed/cookbooks_price'`、`'designed/cookbooks_price_new'`、`'designed/cookbooks_new'`、`'designed/foods_new'`、`'designed/street_medals_new'`、`'designed/goods_awardflag'`、`'game/souvenirs'`、`'game/devices_extra'`；在最前面加：

```ts
  // 道具、食材、菜谱的定义（重新编号 PR 1，设计 §3）
  'master/goods',
  'master/foods',
  'master/cookbooks',
```

`readSourceDir` 不用改：`master/` 文件和数据集一样取 `data` 数组。

- [ ] **Step 4: 改 schema（raw.ts）**

- `kujiFile`：删 `ticket`、`deluxeTicket`；`themes[].figures` 改成 `z.object({ A: int, B: int, C: int, last: int }).strict()`；删 `kujiFigure`。
- `fundFile.medals[]` 改成 `z.object({ id: int.min(1), icon: z.string().min(1) }).strict()`（注释：名字、说明、时长、加成在主表）。
- `newbiePackFile`：删 `vouchers`（`rule` 改写成只说礼包）。
- `equipLoreFile`：删 `rename`、`add`。
- 删 `souvenirsFile`、`devicesExtraFile`、`rawCookbookPrice`、`rawAwardFlag`。

- [ ] **Step 5: 改数据文件**

这几份文件是手工排版的（一行一个对象），用正则就地改，保留原排版；改完用 `JSON.parse` 读回来和预期结构比对。脚本用 Write 写成 .cjs 再跑（避免 shell 转义）：

```js
// $SCRATCH/trim-game.cjs
const fs = require('fs');
const d = 'C:/Working Dir/custom_projects/mwxz/delicious-town/packages/config/data/game/';
const edit = (f, fn, check) => {
  const p = d + f;
  const before = JSON.parse(fs.readFileSync(p, 'utf8'));
  const text = fn(fs.readFileSync(p, 'utf8'));
  const after = JSON.parse(text); // 改坏了这里就抛错
  check(before, after);
  fs.writeFileSync(p, text);
};
const same = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(what);
};
edit(
  'kuji.json',
  (s) =>
    s
      .replace(/\n  "ticket": \{[^\n]*\},?/, '')
      .replace(/\n  "deluxeTicket": \{[^\n]*\},?/, '')
      .replace(/\{ "id": (\d+), "name": "[^"]*", "desc": "[^"]*" \}/g, '$1'),
  (b, a) => {
    same(Object.keys(a).sort(), Object.keys(b).filter((k) => k !== 'ticket' && k !== 'deluxeTicket').sort(), 'kuji keys');
    b.themes.forEach((t, i) => same(a.themes[i].figures, Object.fromEntries(Object.entries(t.figures).map(([k, f]) => [k, f.id])), `kuji theme ${t.month}`));
  },
);
edit(
  'fund.json',
  (s) => s.replace(/\{ "id": (\d+), "name": [^\n]*"icon": ("[^"]*") \}/g, '{ "id": $1, "icon": $2 }'),
  (b, a) => same(a.medals, b.medals.map((m) => ({ id: m.id, icon: m.icon })), 'fund medals'),
);
// newbie_pack、equip_lore 里要删的是多行的数组：按 JSON 删掉后整份重写（这两份文件剩下的部分不多）
const rewrite = (f, fn) => {
  const p = d + f;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  fn(j);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
};
rewrite('newbie_pack.json', (j) => {
  delete j.vouchers;
  j.rule = '新手大礼包（goods 54）的内容；一到五级食材随机券的定义在 data/master/goods.json';
});
rewrite('equip_lore.json', (j) => {
  delete j.rename;
  delete j.add;
});
```

正则没命中时 `check` 会报错（例如 fund 某行的字段顺序不同），按报错调整正则，不要放宽检查。
删文件：

```bash
cd packages/config/data && git rm -q dataset/goods.json dataset/foods.json dataset/cookbooks.json \
  designed/foods_new.json designed/cookbooks_new.json designed/cookbooks_price.json designed/cookbooks_price_new.json \
  designed/street_medals_new.json designed/goods_awardflag.json game/souvenirs.json game/devices_extra.json
```

- [ ] **Step 6: lore.ts 只剩套装**

```ts
import type { z } from 'zod';
import type { equipLoreFile, rawSuit } from './raw';

type RawSuit = z.infer<typeof rawSuit>;

/** 厨具套装的设定（data/game/equip_lore.json）：叠加到原版套装上；厨具本身的定义在主表 */
export function applyEquipLore(suits: RawSuit[], lore: z.infer<typeof equipLoreFile>): RawSuit[] {
  const loreSuits = new Map(lore.suits.map((s) => [s.suitid, s]));
  const out = suits.map((s) => loreSuits.get(s.suitid) ?? s);
  const known = new Set(suits.map((s) => s.suitid));
  for (const s of lore.suits) if (!known.has(s.suitid)) out.push(s);
  return out;
}
```

- [ ] **Step 7: build.ts——解析**

把 `foodsRaw`、`goodsRaw`、`cookbooksRaw`、`pricesRaw`、`awardFlagsRaw`、`souvenirsRaw`、`devicesExtra` 的 `parse` 换成：

```ts
  const foodsRaw = parse('master/foods', z.array(raw.masterFood));
  const goodsRaw = parse('master/goods', z.array(raw.masterGoods));
  const cookbooksRaw = parse('master/cookbooks', z.array(raw.masterCookbook));
```

并从后面的空值检查里删掉 `!pricesRaw`、`!awardFlagsRaw`、`!souvenirsRaw`、`!devicesExtra`。

- [ ] **Step 8: build.ts——食材**

```ts
  const foods: Food[] = foodsRaw.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    coin: f.coin,
    odds: f.odds,
    // 菜谱建好后按需求回填（问题记录 50）
    weight: f.odds,
    type: f.type,
    maxNum: f.maxNum,
  }));
```

- [ ] **Step 9: build.ts——道具**

把从 `// ---------- 道具 ----------` 到 `const goods = [ ...applyStressTables(...), ...souvenirGoods, ... ];` 的整段换成：

```ts
  // ---------- 道具（定义在主表，重新编号 PR 1） ----------
  const suitsAll = applyEquipLore(suitsRaw, equipLore);
  const builtGoods: Goods[] = goodsRaw.map((m) => {
    const value = m.value ?? null;
    let gift: GiftItem[] | null = null;
    if (Array.isArray(value)) {
      const r = z.array(raw.giftItemSchema).safeParse(value);
      if (r.success) gift = r.data;
      else errors.push(`goods ${m.id} gift is malformed: ${r.error.issues[0]?.message ?? ''}`);
    }
    const item: Goods = {
      id: m.id,
      name: m.name,
      type: m.type,
      deviceType: m.deviceType,
      invalidHours: m.invalidHours,
      maxNum: m.maxNum,
      stackable: m.stackable,
      level: m.level,
      coin: m.coin,
      diamond: m.diamond,
      onSale: m.onSale,
      awardFlag: m.awardFlag,
      desc: m.desc,
      value,
      effects: numericEntries(value),
      gift,
      use: null,
      equip: null,
      gem: null,
    };
    item.use = m.use ?? deriveGoodsUse(item);
    if (item.type === GOODS_TYPE.equip) {
      const d = parseEquipDef(value);
      if (typeof d === 'string') errors.push(`goods ${m.id} equip ${d}`);
      else item.equip = d;
    } else if (item.type === GOODS_TYPE.gem) {
      const d = parseGemDef(value);
      if (typeof d === 'string') errors.push(`goods ${m.id} gem ${d}`);
      else item.gem = d;
    }
    if (m.needStar !== undefined) item.needStar = m.needStar;
    return item;
  });
  // 后期的宣传海报、奖杯（问题记录 146）：设施位只能是 1、2，星级不超过最高星
  const maxStar = Math.max(...starNeedRaw.map((s) => s.starlevel));
  for (const m of goodsRaw) {
    if (m.needStar !== undefined && (m.needStar < 0 || m.needStar > maxStar))
      errors.push(`goods ${m.id} needStar ${m.needStar}`);
    if (m.src === 'poster' && m.deviceType !== 1 && m.deviceType !== 2)
      errors.push(`goods ${m.id} poster deviceType ${m.deviceType}`);
  }
  // 新手大礼包（goods 54）：内容按 newbie_pack.json 配（问题记录 331）
  const withPack = builtGoods.map((g) =>
    g.id === newbieRaw.pack.goodsId ? { ...g, gift: newbieRaw.pack.gift, use: { kind: 'gift' as const } } : g,
  );
  if (!builtGoods.some((g) => g.id === newbieRaw.pack.goodsId))
    errors.push(`newbie_pack references unknown goods ${newbieRaw.pack.goodsId}`);
  const goods = applyStressTables(withPack, equipLore.stressTables, errors);
```

注意：
- `Goods` 对象的键顺序必须和原来一样（逐字节相同的前提）：`needStar` 放在最后、只在有值时加；`retired` 由下架那段追加在更后面。
- 原来 `newbie_pack` 那段的“清掉 value”不再需要：主表里 goods 54 的 value 已经是 null。
- 一番赏手办、基金勋章、随机券现在都在 `goods` 里，删掉 `souvenirGoods`、`kujiTicket`、`kujiDeluxeTicket`、`kujiFigures` 的构建、`foodVouchers`、`fundMedals`、`extraDevices`、`souvenirLike` 函数。
- `kujiThemes` 的构建改成直接用 `t.figures`，并加检查：

```ts
  const kujiThemes: KujiTheme[] = [];
  {
    const seenMonth = new Set<number>();
    for (const t of kujiRaw.themes) {
      if (seenMonth.has(t.month)) errors.push(`kuji themes duplicate month ${t.month}`);
      seenMonth.add(t.month);
      for (const [slot, id] of Object.entries(t.figures))
        if (goodsById.get(id)?.type !== GOODS_TYPE.souvenir)
          errors.push(`kuji theme ${t.month} figure ${slot} ${id} is not a souvenir`);
      kujiThemes.push({ month: t.month, name: t.name, desc: t.desc, figures: { ...t.figures } });
    }
    for (let m = 1; m <= 12; m++) if (!seenMonth.has(m)) errors.push(`kuji themes missing month ${m}`);
    kujiThemes.sort((a, b) => a.month - b.month);
  }
```

（`goodsById` 在这段之前建好：`const goodsById = new Map(goods.map((g) => [g.id, g]));`，并删掉后面原有的同名定义。）
- 基金勋章检查，放在 `fundMedals` 原来的位置之后：

```ts
  for (const m of fundRaw.medals) {
    if (!FUND_MEDALS.has(m.id)) errors.push(`fund medal ${m.id} not in FUND`);
    if (goodsById.get(m.id)?.type !== GOODS_TYPE.honor) errors.push(`fund medal ${m.id} is not an honor`);
  }
```

- 随机券检查（原 `newbie_pack voucher …`），放在食材权重回填之后：

```ts
  // 食材随机券那一级要有抽得出的食材：配错时用券会白扣（质量期 ②）
  for (const g of goods)
    if (g.use?.kind === 'randomFood' && !foods.some((f) => f.level === g.use!.level && f.weight > 0))
      errors.push(`goods ${g.id} randomFood level ${g.use.level} has no food to draw`);
```

- 原 `goods_awardflag` 的“引用了不存在的道具”检查删掉（补丁已并进主表）。
- 套装：原来用 `lored.suits` 的地方改用 `suitsAll`。

- [ ] **Step 10: build.ts——菜谱**

把售价表合并那段换成：

```ts
  // ---------- 食谱（定义在主表，含售价、推荐等级、描述） ----------
  const cookbooks: Cookbook[] = cookbooksRaw.map((c) => {
    if (!streetIds.has(c.streetId)) errors.push(`cookbook ${c.id} references unknown street ${c.streetId}`);
    const needFoods: Cookbook['needFoods'] = {};
    for (let grade = 1; grade <= 10; grade++) {
      const list = c.needFoods[String(grade)];
      if (!list || list.length === 0) {
        errors.push(`cookbook ${c.id} is missing grade ${grade}`);
        continue;
      }
      for (const f of list)
        if (!foodIds.has(f.foodsId))
          errors.push(`cookbook ${c.id} grade ${grade} references unknown food ${f.foodsId}`);
      needFoods[grade] = list.map((f) => ({ foodsId: f.foodsId, num: f.num }));
    }
    return {
      id: c.id,
      name: c.name,
      streetId: c.streetId,
      taste: c.taste,
      coin: c.coin,
      level: c.level,
      desc: c.desc,
      needFoods,
    };
  });
```

删掉 `cookbooks_price` 的唯一性、未知食谱定价、`has no price` 检查（售价已是菜谱自己的字段，schema 保证有）。
- 删掉 `import` 里用不到的名字（`souvenirLike` 相关、`KujiTheme` 仍要）。

- [ ] **Step 11: 构建，逐字节比对**

Run:
```bash
pnpm -F @dt/config build && cmp packages/config/generated/bundle.json "$SCRATCH/bundle-before.json" && echo SAME
```
Expected: `SAME`。不同时用 `node -e` 逐表比较找出第一处不同，修到相同为止；不许为了相同去改测试或数据语义。最可能的几处：
- `Goods` 键顺序（`needStar` 要在 `gem` 之后）；
- 原来用 `souvenirLike` 造的几类（纪念品、手办、抽赏券、基金勋章、海报奖杯）`use` 固定是 null，现在走 `deriveGoodsUse`——它按名字判断，正常不会命中；万一命中，给主表 `use` 加一个显式的 `null` 选项；
- `gift` 由 zod 解析，键按 schema 顺序，和原来同一套解析，应当一致。

- [ ] **Step 12: 跑配置包全部测试**

Run: `cd packages/config && npx vitest run`
Expected: 全部 PASS（Step 1 改过的用例转绿）。另外 `npx tsc -p tsconfig.json` 无错。

- [ ] **Step 13: 提交**

```bash
git add packages/config/src packages/config/data/master packages/config/data/game/kuji.json \
  packages/config/data/game/fund.json packages/config/data/game/newbie_pack.json packages/config/data/game/equip_lore.json
git commit -F - <<'EOF'
refactor(config): 道具、食材、菜谱的定义收进 data/master 主表（重新编号 PR 1）

- 三份主表由一次性脚本从改动前的构建结果生成，每条带来历 src；构建结果与改动前逐字节相同
- 删掉被合并的 11 份文件：dataset/goods、foods、cookbooks，designed/foods_new、cookbooks_new、cookbooks_price、cookbooks_price_new、street_medals_new、goods_awardflag，game/souvenirs、devices_extra
- 一番赏、基金、新手礼包、厨具设定只留非定义内容，引用主表编号；拆开后补上手办、基金勋章的引用检查

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
（删除的文件已在 Step 5 用 `git rm` 暂存。生成脚本 `_make-master.ts` 不提交，提交前删掉。）

---

### Task 4: 新街道导入写主表；同步脚本不再同步道具、食材

**Files:**
- Modify: `packages/config/scripts/import-new-streets.ts`
- Modify: `packages/config/scripts/sync-data.ts`
- Modify: `docs/data-maintenance.md`

**Interfaces:**
- Consumes: Task 1 的 `formatMaster`、`goodsFromRaw`、`foodFromRaw`、`replaceSrc`、`MasterCookbook`；Task 2 的主表。

- [ ] **Step 1: 改导入脚本的读**

- “老菜谱”（算 8~10 品级换料频率）改读主表里 `src === 'original'` 的菜谱，字段名 `needFoods`：

```ts
const master = <T>(name: string) => read<{ rule: string; data: T[] }>(join(data, 'master', `${name}.json`));
const mGoods = master<MasterGoods>('goods');
const mFoods = master<MasterFood>('foods');
const mCookbooks = master<MasterCookbook>('cookbooks');
const old = mCookbooks.data
  .filter((c) => c.src === 'original')
  .map((c) => ({ id: c.id, needFoodsByLevel: c.needFoods }));
const level = new Map([...mFoods.data.filter((f) => f.src === 'original'), ...foods].map((f) => [f.id, f.level]));
```

- 已导入过的新菜谱（冲突检查）改读 `mCookbooks.data.filter((c) => c.src === 'streets')`。

- [ ] **Step 2: 改导入脚本的写**

删掉写 `foods_new`、`street_medals_new`、`cookbooks_new`、`cookbooks_price_new` 的四段（`streets_new` 照旧写），换成：

```ts
const writeMaster = <T extends { src: string }>(name: string, m: { rule: string; data: T[] }, entries: T[]) =>
  writeFileSync(join(data, 'master', `${name}.json`), formatMaster(m.rule, replaceSrc(m.data, 'streets', entries)));

writeMaster('foods', mFoods, foods.map((f) => foodFromRaw(f, 'streets')));
writeMaster(
  'goods',
  mGoods,
  medals.map((m) =>
    goodsFromRaw(
      { ...(Object.fromEntries(Object.entries(m).filter(([k]) => k !== '_src')) as RawGoods), id: medalId(m.devicetype as number) },
      'streets',
    ),
  ),
);
writeMaster(
  'cookbooks',
  mCookbooks,
  sorted.map((c) => ({
    id: c.id,
    src: 'streets' as const,
    name: c.name,
    streetId: c.streetId,
    taste: c.taste,
    coin: c.coin,
    level: c.level,
    desc: c.desc,
    needFoods: extendGrades(c.needFoodsByLevel, t89, t910, (id) => level.get(id) === 7, rng),
  })),
);
```

`foods` 的类型改成 `z.infer<typeof rawFood>`（外部数据和原版同格式），`RawGoods = z.infer<typeof rawGoods>`。注释、文件头说明里的 `designed/*_new.json` 改成主表。

- [ ] **Step 3: sync-data 停同步道具、食材**

`DATASET` 里删 `'foods'`、`'goods'`，加注释：`// goods、foods、cookbooks 不再同步：定义在 data/master（重新编号 PR 1）`。

- [ ] **Step 4: 文档**

`docs/data-maintenance.md`：
- 「新街道数据」一节：第 1 条的“整份替换 `data/designed/` 下的 `*_new.json`”改成“替换 `data/master/` 三份主表里 `src` 为 `streets` 的条目、整份替换 `designed/streets_new.json`”。
- 新增一节：

```markdown
## 道具、食材、菜谱的定义（重新编号 PR 1）

- 全部在 `packages/config/data/master/`：`goods.json`、`foods.json`、`cookbooks.json`，每条一行，`src` 写来历。
- 原版数据集（`../analysis/dataset`）不再同步这三类；原版获取途径表 `dataset/goods_sources.json` 仍同步，按原版编号。
- 改定义直接改主表；新街道的条目由导入脚本整块替换，不要手改。
- 一番赏主题、基金勋章、新手大礼包、厨具套装和强化表仍在 `data/game/` 各自的文件里，只引用主表的编号。
```

- [ ] **Step 5: 导入脚本重跑前确认基线**

Run: `git stash -q && cd packages/config && pnpm import-streets && git status --short data; git checkout -q -- data; cd ../.. && git stash pop -q`
Expected: 改动前的脚本重跑后 `data/` 没有变化（确认外部数据和仓库一致，下一步的比较才有意义）。若有变化，记下来并在提交说明里写明，不要混进本 PR。

- [ ] **Step 6: 用新脚本重跑，主表不变**

Run: `cd packages/config && pnpm import-streets && git status --short data`
Expected: 没有任何改动（三份主表、`streets_new.json`、`street_medal_map.json`、翻译都不变）。

- [ ] **Step 7: 类型检查、提交**

Run: `pnpm -F @dt/config typecheck`
Expected: 无错。

```bash
git add packages/config/scripts/import-new-streets.ts packages/config/scripts/sync-data.ts docs/data-maintenance.md
git commit -F - <<'EOF'
refactor(config): 新街道导入改写主表的 streets 条目；sync-data 不再同步道具、食材（重新编号 PR 1）

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: 全量验证、审查、PR

- [ ] **Step 1: 全量检查**

Run:
```bash
pnpm -F @dt/config build && pnpm -r typecheck && pnpm lint && pnpm format:check
cd packages/config && npx vitest run; cd ../../apps/server && npx vitest run; cd ../web && npx vitest run
```
Expected: 全部通过；`format:check` 只有约定的本地文件警告。

- [ ] **Step 2: 再比一次构建结果**

Run: `cmp packages/config/generated/bundle.json "$SCRATCH/bundle-before.json" && echo SAME`
Expected: `SAME`

- [ ] **Step 3: 推送、开 PR**

Run:
```bash
git push -u origin feat/id-renumber
"/c/Program Files/GitHub CLI/gh.exe" pr create --base feat/item-curator --title "重新编号 PR 1：道具、食材、菜谱的定义收进主表" --body-file "$SCRATCH/renumber-pr1.md"
```
PR 说明写：做了什么、与设计的两处出入（见本计划“与设计的出入”）、验证（逐字节比对、导入重跑无变化、测试数），末尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。#141 合并后用 `gh pr edit --base main` 改基准。

- [ ] **Step 4: opus 审查整个分支**

派 opus 审查 `git diff feat/item-curator...feat/id-renumber`，带上设计、本计划和 Review Focus。Critical、Important 先写测试再修；Minor 记进 `docs/backlog.md`。

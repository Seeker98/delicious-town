/**
 * 已于重新编号 PR 4 执行；主表已是新编号，重跑会报错或跳过，留作记录。
 * 重新编号 第 4 步：按设计 §2 生成新旧编号对照和审阅报告（docs/superpowers/specs/2026-10-05-id-renumber-design.md）。
 *   pnpm -F @dt/config exec tsx scripts/renumber-map.ts
 * 输出：
 *   data/renumber/map.json          —— 旧编号 → 新编号（道具、食材、菜谱）和菜谱新存储位
 *   data/renumber/goods_groups.json —— 道具小类：名字、起始编号、容量
 *   docs/design/重新编号对照.md      —— 给人审的报告
 * 只读主表，不改任何现有数据；结果固定（同样的主表永远生成同样的对照）
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(pkg, 'data');
const read = <T>(p: string): T => JSON.parse(readFileSync(join(data, p), 'utf8')) as T;

type G = {
  id: number;
  src: string;
  name: string;
  type: number;
  deviceType: number | null;
  value: unknown;
  desc: string;
};
type F = { id: number; name: string; level: number; odds: number };
type C = { id: number; name: string; streetId: number; slot: number };
const goods = read<{ data: G[] }>('master/goods.json').data;
const foods = read<{ data: F[] }>('master/foods.json').data;
const cookbooks = read<{ data: C[] }>('master/cookbooks.json').data;
const streets = [
  ...read<{ data: Array<{ id: number; name: string }> }>('dataset/streets.json').data,
  ...read<{ data: Array<{ id: number; name: string }> }>('designed/streets_new.json').data,
];
const medalMap = read<{ data: Array<{ streetId: number; goodsId: number }> }>(
  'designed/street_medal_map.json',
).data;
const kuji = read<{ themes: Array<{ month: number; figures: Record<'A' | 'B' | 'C' | 'last', number> }> }>(
  'game/kuji.json',
);
const retired = new Set(read<{ goods: Array<{ id: number }> }>('game/retired.json').goods.map((x) => x.id));

// ---------- 道具小类 ----------
interface Group {
  key: string;
  name: string;
  base: number;
  size: number;
  /** 固定位置：旧编号 → 新编号（“基数 + 等级”这类要连续、按等级排的） */
  fixed?: Array<[number, number]>;
  /** 其余成员从这里往后按旧编号排 */
  from?: number;
}
const groups: Group[] = [];
const member = new Map<number, string>();
function group(
  key: string,
  name: string,
  base: number,
  ids: number[],
  extra: Partial<Group> = {},
  size = 100,
) {
  groups.push({ key, name, base, size, ...extra });
  for (const id of ids) {
    if (member.has(id)) throw new Error(`goods ${id} in two groups`);
    member.set(id, key);
  }
}
const byType = (t: number) => goods.filter((g) => g.type === t);
const idsWhere = (f: (g: G) => boolean) => goods.filter(f).map((g) => g.id);

// 1xxxx 消耗品、功能道具
group('currency', '货币与代币', 10000, [1, 84, 85, 137, 180, 240, 310]);
group('levelTicket', 'N 级食材兑换券（基数 + 等级）', 10100, [241, 242, 243, 244, 245, 20], {
  fixed: [
    [241, 10101],
    [242, 10102],
    [243, 10103],
    [244, 10104],
    [245, 10105],
  ],
  from: 10110,
});
group('foodVoucher', '食材随机券（基数 + 等级）', 10200, [93001, 93002, 93003, 93004, 93005, 139], {
  fixed: [
    [93001, 10201],
    [93002, 10202],
    [93003, 10203],
    [93004, 10204],
    [93005, 10205],
  ],
  from: 10210,
});
group('pass', '入场券、抽赏券', 10300, [136, 263, 90201, 90202]);
group('card', '功能卡', 10400, [2, 3, 4, 5, 6, 7, 8, 9, 28, 29, 53, 55, 82, 169, 302, 303, 315, 491]);
group('growth', '升星、油壶', 10500, [24, 25, 26, 27, 86, 610]);
group('forge', '厨具强化', 10600, [40, 46, 52, 224, 225]);
group('temple', '神殿', 10700, [17, 18, 19, 170, 171, 172, 396, 434]);
group(
  'mysterious',
  '特色菜（残卷碎片 = 基数 + 等级）',
  10800,
  [181, 182, 183, 184, 185, 186, 162, 163, 164, 165, 176, 177, 178, 179, 394],
  {
    fixed: [181, 182, 183, 184, 185, 186].map((id, i) => [id, 10801 + i] as [number, number]),
    from: 10811,
  },
);
group('yard', '菜园、池塘', 10900, [427, 428, 464, 470, 506, 507, 508, 517, 518]);

// 2xxxx 礼包
group('giftDaily', '新手、签到、随机礼包', 20000, [51, 54, 115, 131, 160]);
group('giftStar', '升星礼包', 20100, [117, 118, 119, 120, 121, 122, 124, 321]);
group('giftShop', '商店礼包', 20200, [125, 126, 155, 226, 329, 330, 331, 376, 379, 386]);
group('giftRank', '排行礼包', 20300, [202, 203, 204, 205, 206, 450, 451, 452, 453, 454, 455]);
group('giftJob', '工作礼包', 20400, [233, 234, 235, 236, 237]);

// 3xxxx 设施：按摆放类型
const DEVICE: Array<[number, string, string]> = [
  [1, 'poster', '宣传海报'],
  [2, 'trophy', '奖杯'],
  [3, 'oilSaver', '节油器'],
  [4, 'mouseTrap', '老鼠夹'],
  [5, 'roach', '蟑螂药'],
  [6, 'plaque', '牌匾'],
];
DEVICE.forEach(([dt, key, name], i) =>
  group(
    key,
    name,
    30000 + i * 100,
    idsWhere((g) => g.type === 3 && g.deviceType === dt),
  ),
);

// 4xxxx 厨具：按套装
const SUITS: Array<[number, string]> = [
  [0, '见习、中厨'],
  [3, '宋嫂'],
  [4, '沙利叶'],
  [5, '度玛'],
  [6, '巴贝雷特'],
  [7, '茵蔯'],
  [80, '阿卡玛'],
  [81, '食神'],
  [82, '古尔图格'],
  [100, '真爱'],
  [90, '玉•帽（赞助、原版专属）'],
  [99, '铉•帽（赞助、原版专属）'],
];
const suitOf = (g: G) => ((g.value ?? {}) as { suitid?: number }).suitid;
SUITS.forEach(([s, name], i) =>
  group(
    `suit${s}`,
    `厨具·${name}`,
    40000 + i * 100,
    idsWhere((g) => g.type === 4 && suitOf(g) === s),
  ),
);

// 5xxxx 宝石：按种类，块内 = 基数 + 阶
const GEMS = ['智慧石', '红晶石', '黄玉石', '蓝冥石', '绿玄石'];
const STEP: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
GEMS.forEach((kind, i) => {
  const list = byType(5).filter((g) => g.name.endsWith(kind));
  const base = 50000 + i * 100;
  group(
    `gem${i + 1}`,
    `宝石·${kind}（基数 + 阶）`,
    base,
    list.map((g) => g.id),
    {
      fixed: list.map((g) => [g.id, base + STEP[/\[(.)阶\]/.exec(g.name)![1]!]!] as [number, number]),
    },
  );
});

// 6xxxx 荣誉：街道勋章 = 60000 + 街道编号；其余按摆放类型
group(
  'streetMedal',
  '街道勋章（60000 + 街道编号）',
  60000,
  medalMap.map((m) => m.goodsId),
  {
    fixed: medalMap.map((m) => [m.goodsId, 60000 + m.streetId] as [number, number]),
  },
);
const HONOR: Array<[number | null, string, string, number?]> = [
  [30, 'honorBeta', '内测、测试勋章'],
  [31, 'honorShop', '店铺勋章'],
  [32, 'honorLucky', '吉祥物'],
  [33, 'honorJob', '工作证'],
  [34, 'honorTown', '小镇人物'],
  [35, 'honorPet', '宠物'],
  [36, 'honorPot', '盆栽'],
  [37, 'honorDecor', '摆设'],
  [38, 'honorChef', '厨神称号'],
  [39, 'honorMatch', '赛厨'],
  [40, 'honorDelicious', '美味勋章'],
  [41, 'honorPainting', '名画'],
  [42, 'honorZodiac', '十二生肖'],
  [43, 'honorFunc', '功能勋章'],
  [44, 'honorAchieve', '成就'],
  [20, 'honorStatue', '雕像'],
  [999, 'honorTeach', '教学'],
  [998, 'honorChefSpirit', '厨神附体'],
  [null, 'honorMisc', '基金勋章和其他'],
  [98, 'honorExclusiveDecor', '原版专属摆设'],
  [99, 'honorExclusive', '原版玩家专属勋章', 200],
];
let honorBase = 60100;
for (const [dt, key, name, size = 100] of HONOR) {
  group(
    key,
    name,
    honorBase,
    idsWhere((g) => g.type === 9 && g.deviceType === dt && !member.has(g.id)),
    {},
    size,
  );
  honorBase += size;
}

// 7xxxx 纪念品、手办
group(
  'festival',
  '节日纪念品',
  70000,
  [90001, 90002, 90003, 90004, 90005, 90006, 90007, 90008, 90009, 90010, 90011, 90012],
);
group('kujiFirst', '一番赏初代手办', 70100, [90101, 90102, 90103, 90104]);
const SLOT = { A: 1, B: 2, C: 3, last: 4 } as const;
group(
  'kujiMonthly',
  '一番赏月度手办（71000 + 月份 × 10 + 档位）',
  71000,
  kuji.themes.flatMap((t) => Object.values(t.figures)),
  {
    fixed: kuji.themes.flatMap((t) =>
      (Object.keys(SLOT) as Array<keyof typeof SLOT>).map(
        (k) => [t.figures[k], 71000 + t.month * 10 + SLOT[k]] as [number, number],
      ),
    ),
  },
  200,
);

// ---------- 道具：排号 ----------
const unassigned = goods.filter((g) => !member.has(g.id));
if (unassigned.length)
  throw new Error(`goods without group: ${unassigned.map((g) => `${g.id} ${g.name}`).join(', ')}`);
const goodsMap = new Map<number, number>();
const groupOfNew = new Map<number, Group>();
for (const gr of groups) {
  const ids = goods.filter((g) => member.get(g.id) === gr.key).map((g) => g.id);
  const fixed = new Map(gr.fixed ?? []);
  let n = gr.from ?? gr.base + 1;
  for (const id of [...ids].sort((a, b) => a - b)) {
    const v = fixed.get(id) ?? n++;
    if (v < gr.base || v >= gr.base + gr.size) throw new Error(`${gr.key}: goods ${id} → ${v} out of range`);
    goodsMap.set(id, v);
    groupOfNew.set(v, gr);
  }
}
// 区段不重叠、新编号不重复、新旧号段不重叠
const sortedGroups = [...groups].sort((a, b) => a.base - b.base);
sortedGroups.forEach((g, i) => {
  const next = sortedGroups[i + 1];
  if (next && g.base + g.size > next.base) throw new Error(`groups ${g.key} and ${next.key} overlap`);
});
const newIds = [...goodsMap.values()];
if (new Set(newIds).size !== newIds.length) throw new Error('duplicate new goods id');
for (const v of newIds) if (v < 10000 || v > 89999) throw new Error(`goods ${v} out of 10000~89999`);
for (const g of goods) if (goodsMap.get(g.id)! === g.id) throw new Error(`goods ${g.id} keeps its id`);

// ---------- 食材：等级 × 1000 + 序号（按旧编号） ----------
const foodsMap = new Map<number, number>();
for (const lv of [...new Set(foods.map((f) => f.level))].sort((a, b) => a - b)) {
  const list = foods.filter((f) => f.level === lv).sort((a, b) => a.id - b.id);
  if (list.length > 999) throw new Error(`level ${lv} too many foods`);
  list.forEach((f, i) => foodsMap.set(f.id, lv * 1000 + i + 1));
}

// ---------- 菜谱：100000 + 街道 × 1000 + 序号；存储位按新编号顺序 0 起 ----------
const cookbooksMap = new Map<number, number>();
for (const s of [...new Set(cookbooks.map((c) => c.streetId))].sort((a, b) => a - b)) {
  const list = cookbooks.filter((c) => c.streetId === s).sort((a, b) => a.id - b.id);
  if (list.length > 999) throw new Error(`street ${s} too many cookbooks`);
  list.forEach((c, i) => cookbooksMap.set(c.id, 100000 + s * 1000 + i + 1));
}
const slotMap = new Map(
  [...cookbooksMap].sort((a, b) => a[1] - b[1]).map(([oldId], i) => [oldId, i] as [number, number]),
);

// 算术约定（代码里按“基数 + 等级”算的）
const assert = (ok: boolean, what: string) => {
  if (!ok) throw new Error(what);
};
for (let lv = 1; lv <= 5; lv++) {
  assert(goodsMap.get(240 + lv) === 10100 + lv, `levelTicket ${lv}`);
  assert(goodsMap.get(93000 + lv) === 10200 + lv, `foodVoucher ${lv}`);
  assert(foodsMap.get(466 + lv) === 9000 + lv, `master food ${lv}`);
}
for (let lv = 1; lv <= 6; lv++) assert(goodsMap.get(180 + lv) === 10800 + lv, `fragment ${lv}`);

// ---------- 输出 ----------
mkdirSync(join(data, 'renumber'), { recursive: true });
const pairs = (m: Map<number, number>) => [...m].sort((a, b) => a[0] - b[0]);
writeFileSync(
  join(data, 'renumber', 'map.json'),
  `{\n "rule": "重新编号对照（设计 docs/superpowers/specs/2026-10-05-id-renumber-design.md §2）：[旧, 新]；cookbookSlots 是菜谱旧编号 → 新存储位",\n` +
    (['goods', 'foods', 'cookbooks', 'cookbookSlots'] as const)
      .map((k) => {
        const m =
          k === 'goods' ? goodsMap : k === 'foods' ? foodsMap : k === 'cookbooks' ? cookbooksMap : slotMap;
        return ` "${k}": [\n${pairs(m)
          .map((p) => `  ${JSON.stringify(p)}`)
          .join(',\n')}\n ]`;
      })
      .join(',\n') +
    '\n}\n',
);
writeFileSync(
  join(data, 'renumber', 'goods_groups.json'),
  `${JSON.stringify(
    sortedGroups.map(({ key, name, base, size }) => ({ key, name, base, size })),
    null,
    1,
  )}\n`,
);

// ---------- 报告 ----------
const nameOfGoods = new Map(goods.map((g) => [g.id, g.name]));
const segName: Record<number, string> = {
  1: '1xxxx 消耗品、功能道具',
  2: '2xxxx 礼包',
  3: '3xxxx 设施',
  4: '4xxxx 厨具',
  5: '5xxxx 宝石',
  6: '6xxxx 荣誉',
  7: '7xxxx 纪念品、手办',
};
const lines: string[] = [
  '# 重新编号对照（审阅用）',
  '',
  '由 `pnpm -F @dt/config renumber-map` 生成（`packages/config/scripts/renumber-map.ts`），设计见 [2026-10-05-id-renumber-design.md](../superpowers/specs/2026-10-05-id-renumber-design.md)。完整对照在 `packages/config/data/renumber/map.json`。',
  '',
  '- 道具：5 位，按类别分段（第一位），段内按小类从整百开始，小类内按旧编号排；标 ✝ 的是已下架的。',
  '- 代码里按“基数 + 等级”算的保持连续：N 级食材兑换券 10101~10105、食材随机券 10201~10205、残卷碎片 10801~10806、万能食材 9001~9005。',
  '- 街道勋章 = 60000 + 街道编号；一番赏月度手办 = 71000 + 月份 × 10 + 档位（A 1、B 2、C 3、最后赏 4）；宝石 = 种类起始 + 阶。',
  `- 道具 ${goods.length}、食材 ${foods.length}、菜谱 ${cookbooks.length}。`,
  '',
  '## 道具',
];
let seg = 0;
for (const gr of sortedGroups) {
  const s = Math.floor(gr.base / 10000);
  if (s !== seg) {
    seg = s;
    lines.push('', `### ${segName[s]}`);
  }
  const rows = [...goodsMap].filter(([, v]) => groupOfNew.get(v) === gr).sort((a, b) => a[1] - b[1]);
  lines.push(
    '',
    `#### ${gr.name}（${gr.base}~${gr.base + gr.size - 1}，${rows.length} 件）`,
    '',
    '| 新 | 旧 | 名称 |',
    '|---|---|---|',
    ...rows.map(([o, v]) => `| ${v} | ${o} | ${nameOfGoods.get(o)}${retired.has(o) ? ' ✝' : ''} |`),
  );
}
lines.push(
  '',
  '## 食材（等级 × 1000 + 序号，同级按旧编号排）',
  '',
  '| 新 | 旧 | 名称 | 等级 |',
  '|---|---|---|---|',
);
for (const [o, v] of [...foodsMap].sort((a, b) => a[1] - b[1])) {
  const f = foods.find((x) => x.id === o)!;
  lines.push(`| ${v} | ${o} | ${f.name}${f.odds < 100 ? '（稀有）' : ''} | ${f.level} |`);
}
lines.push(
  '',
  '## 菜谱（100000 + 街道 × 1000 + 序号，同街按旧编号排）',
  '',
  '每条街只列范围；逐道的对照在 map.json。学会记录的存储位按新编号顺序从 0 排到 ' +
    (cookbooks.length - 1) +
    '。',
  '',
  '| 街道 | 道数 | 新编号 | 旧编号范围 |',
  '|---|---|---|---|',
);
for (const s of [...new Set(cookbooks.map((c) => c.streetId))].sort((a, b) => a - b)) {
  const list = cookbooks.filter((c) => c.streetId === s);
  const news = list.map((c) => cookbooksMap.get(c.id)!);
  const olds = list.map((c) => c.id);
  lines.push(
    `| ${s} ${streets.find((x) => x.id === s)?.name ?? ''} | ${list.length} | ${Math.min(...news)}~${Math.max(...news)} | ${Math.min(...olds)}~${Math.max(...olds)} |`,
  );
}
const doc = resolve(pkg, '../../docs/design/重新编号对照.md');
writeFileSync(doc, lines.join('\n') + '\n');
console.log(
  `goods ${goodsMap.size}, foods ${foodsMap.size}, cookbooks ${cookbooksMap.size}, groups ${groups.length}`,
);

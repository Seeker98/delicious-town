# 子项目 4A「特色菜与教室」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家能鉴定神秘食谱得到残卷、用残卷学会特色菜、烹制开售并在结算里卖出、被好友品尝、在教室开课 / 学习 / 偷学；每天 9 点发昨日特色菜冠军奖励。

**Architecture:** 配置包整理特色菜（食材只留 id）、加载熟练度表，运行时按道具 id 索引鉴定道具和教师证，新增 `tuning.mysterious`。迁移 0008 建 `rest_mc`、`mc_remnant`、`mc_cook`、`mc_eat`、`mc_lesson`、`mc_lesson_student`，餐厅加 `mc_cook_id`。服务端新增 `modules/mysterious/`（纯规则、残卷、鉴定、烹制与在售、品尝、教室、冠军任务、路由），结算读 `mc_cook_id` 填入已有的 `special` 并扣份数。前端新增特色菜页、神殿页、教室页，好友详情加品尝卡片。

**Tech Stack:** TypeScript strict、Fastify 5、Kysely、PostgreSQL 16、Vue 3、Pinia、Vitest、Playwright

**Spec:** `docs/superpowers/specs/2026-09-30-subproject4a-mysterious-design.md`

## Global Constraints

- 所有写接口用 POST，参数用 zod 校验；读接口 GET；新接口挂在 `/api/v1/mc/...` 下，由 `modules/mysterious/routes.ts` 的 `mysteriousRoutes(svc)` 注册
- 特色菜的所有写操作走 `runOp`（锁自己的店）或 `runPairOp`（品尝、学习：锁两家店），功能名 `mysterious`；读接口开头调用 `d.shards.ensureFeature(ctx.shardId, 'mysterious')`
- 不新增错误码。原因名（与现有一致用下划线）：
  - `INVALID_STATE` reason：`mc_cooking`（已有在售）、`no_cooking`（没有在售）、`mc_learned`（已学过）、`mc_not_learned`（没学）、`lesson_over`（课程已结束 / 过期 / 不存在）、`steal_full`（偷学人数已满）、`own_lesson`（学自己的课）、`no_lesson`（没有进行中的课）、`lesson_not_full`（强制结束时人没满）、`target_closed`（对方打烊，已有）、`target_no_special`（对方没有在售）、`target_self`（已有）
  - `REQUIREMENT_NOT_MET` reason：`star`（params `need`，已有）、`mc_count`（已学特色菜数，params `need`）、`cookbooks`（普通食谱数，params `need`，已有）、`statue`（需要持有道具，params `goodsId`，已有）
  - `LIMIT_REACHED` what：`taste`（params `max`）、`lesson_full`、`lesson_open`
  - `ALREADY_DONE` what：`taste`（这批吃过）、`lesson`（这门课试过）
  - `VALIDATION_FAILED` reason：`cook_num`、`not_appraise_tool`、`not_teacher_cert`、`cert_level`
  - 资源不够一律用现有 `consumeGoods` / `subFoods` / `spendCoin` / `spendStrength` 和新增的 `subRemnant`（`NOT_ENOUGH` kind `goods` / `foods` / `coin` / `strength` / `remnant`，后者带 `id` = 特色菜 id）
- 事件键（`emitAction`，驱动任务和活跃）：`mc.appraise`、`mc.cook`、`lesson.start`、`lesson.learn`；任务状态键 `mc.learned`（已学特色菜数）
- 流水来源（`runOp` 的 source）：`mc.appraise`、`mc.remnant.sell`、`mc.remnant.decompose`、`mc.learn`、`mc.cook`、`mc.dump`、`mc.taste`、`lesson.open`、`lesson.learn`、`lesson.close`、`mc.champion`；结算扣份数不写流水
- 流水 / 事件 kind 新增 `'remnant'`（`id` = 特色菜 id）
- 新闻类型：`mc.cook`（`{mcId, grade, num}`）、`mc.champion`（`{value}`）；个人日志类型：`mc.learn`、`mc.levelUp`（`{mcId, curlevel}`）、`mc.forget`（`{cookbooks: number[], mcId: number | null}`）；好友动态（对方日志，经 `feedLog`）：`mc.eaten`、`lesson.taught`（`{mcId, type, success}`）
- 界面文字全部中文；前端错误提示走 `errorMessage`
- 迁移用 `sql` 模板逐条执行，写进 `db/migrations/index.ts`
- 每个任务结束时 `pnpm test` 全绿再提交；提交信息结尾带 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 改了 `packages/config/data` 或 `packages/config/src` 之后跑 `pnpm --filter @dt/config build` 并重启 `pnpm dev`（测试的 globalSetup 自己生成）；`packages/config/data` 被 prettier 忽略，改 JSON 时手工插入文本块，不要整体重写文件

## 计划层面的裁定（相对设计文档）

1. `mc_cook.id` 用 `integer generated always as identity`（不是 bigserial）：Kysely 把 bigint 读成字符串，和 `restaurant.mc_cook_id` 比较、传参都要转换，没必要。代价：单区服 21 亿次烹制后溢出，不现实
2. 人类之子-名画(349) 的 value 是 `"mcCoinAddExStar":"1"`（字符串），不会进加成汇总的数值项；改为直接判断是否持有有效的 349（`hasValidHonor`）。代价：以后若有别的来源给这个键，需要回来改
3. 偷学遗忘的数值放进 tuning：`forgetPerLevel: 3`（遗忘 等级×3+1 道）、`forgetMcFromLevel: 4`、`forgetMcPerLevel: 0.05`。设计文档的 tuning 块里漏了这三个
4. 学习（锁老师和学生两家店）用 `runPairOp(friend: 'none')`：它要求双方都验证了邮箱、都没被封。老师开课时本人也必须验证邮箱才能被学（原版只要求学生）。代价：没验证邮箱的老师开的课没人能学——开课接口直接要求老师验证邮箱，避免白开
5. 熟练度 `curexp` 存累计值；升级条件是 `curexp ≥ 本级 expNext`（表里的 200、800、1800… 按累计看），和原版 `sumExp` 一致
6. 特色菜的 `NOT_ENOUGH` 份数（品尝时剩余不够）用 kind `portions`
7. 好友品尝走 `runPairOp` 的公共检查，所以"双方验证邮箱、没被封"直接复用；`requireVerifiedEmail` 关掉时也一起放开（和其他好友互动一致）
8. 前端路由：`/mc`、`/temple`、`/classroom`；任务表里的 href（`/cookbooks/mysterious` 等）不改，前端现在不按 href 跳转（2B 计划裁定 3）

## Review Focus

1. **结算和品尝同时扣同一批的份数**：结算锁店主、品尝锁两家店（含店主），按店主行锁串行；`left_num` 用条件更新 `left_num >= n`，不会扣成负数；卖完只结束一次、指针清空一次。→ Task 5、Task 6 测试（先品尝到剩 1 份，再结算，剩余为 0 且 `end_reason = 'sold'`）
2. **学生碎片或银币不够时去学课**：报 `NOT_ENOUGH`，整个双店事务回滚——学生体力和银币没扣、老师没拿到学费和碎片、没有 `mc_lesson_student` 记录（不会出现"钱扣了课没上"）。（偷学遗忘的数量不会超过已学数：学课要求已学 等级×10 道，遗忘 等级×3+1 道。）→ Task 7 测试
3. **课程过期但 `closed_at` 还是空**，老师想开新课：开课前自动补写 `closed_at`，部分唯一索引不挡；学生看不到过期课、学不了。→ Task 7 测试
4. **鉴定一次 99 次**：只写合并后的事件（同一道菜一条），流水条数不超过 特色菜种数 + 2；耗时和批量开礼包同级。→ Task 4 测试
5. **老师自己被删号（级联删除）后学生打开课程列表 / 学生被删号**：外键级联，列表不报错。→ Task 2 迁移测试

---

## 文件结构

```
packages/config/src/types.ts                 MysteriousCookbook.foods: number[] + appraisable；McProficiency、AppraiseDef、TeacherCertDef；ConfigBundle.mcProficiency
packages/config/src/raw.ts                   rawMysterious.appraisable；rawMcProficiency
packages/config/src/mysterious.ts            parseAppraiseDef、parseTeacherCert（纯函数）
packages/config/src/mysterious.test.ts
packages/config/src/build.ts                 特色菜整理、熟练度表、鉴定道具 / 教师证校验
packages/config/src/runtime.ts               GameConfig.mysterious / mcProficiency / appraiseTools / teacherCerts / requireMc
packages/config/src/source.ts                designed/mc_proficiency
packages/config/src/ids.ts                   GOODS 新增 mysteryRecipe、luckyCookie、spongeBob、humanSon、hundredMaster、fragmentBase、thinker
packages/config/src/tuning.ts、data/game/tuning.json   mysterious 段
packages/shared/src/envelope.ts              GameEvent.kind 加 'remnant'
packages/shared/src/schemas/mysterious.ts    接口 body 和 DTO
packages/shared/src/schemas/world.ts         CatalogDto.mysterious
packages/shared/src/schemas/friend.ts        FriendRestDto.special
apps/server/src/db/migrations/0008_mysterious.ts、0008.test.ts
apps/server/src/db/schema.ts                 6 张表类型、restaurant.mc_cook_id
apps/server/src/modules/ledger/ledger.ts     kind 加 'remnant'
apps/server/src/core/features.ts             IMPLEMENTED_FEATURES 加 'mysterious'
apps/server/src/modules/cookbook/rules.ts    applyForget
apps/server/src/modules/equip/power.ts       restPower（厨力，读库）
apps/server/src/modules/mysterious/
  rules.ts           纯规则：品级、份数、价值、熟练度、道份数加成、鉴定、学 / 偷成功率、品尝
  rules.test.ts
  remnant.ts         addRemnant / subRemnant（带流水和事件）
  cook.ts            consumeSpecial（结算和品尝共用：扣份数、卖完结束）
  service.ts         overview、appraise、remnant sell/decompose、learn、preview、cook、dump、taste
  lesson.ts          lessons、open、learn（学 / 偷）、close
  jobs.ts            mc-champion
  routes.ts
  mysterious.test.ts、cook.test.ts、taste.test.ts、lesson.test.ts、jobs.test.ts
apps/server/src/modules/settlement/runner.ts  读在售、扣份数
apps/server/src/modules/settlement/runner.test.ts
apps/server/src/modules/friend/reads.ts       detail 加 special；FEED_TYPES 加 mc.eaten、lesson.taught
apps/server/src/modules/task/service.ts       extra['mc.learned']
apps/server/src/modules/world/service.ts      catalog 加 mysterious
apps/server/src/modules/index.ts、game.ts     装配
apps/web/src/api/endpoints.ts                 mc* / lesson* 接口
apps/web/src/i18n/zh-CN.ts                    错误文案
apps/web/src/stores/catalog.ts                mcMap、mcName、mc()
apps/web/src/utils/events.ts                  remnant 事件、日志文案
apps/web/src/utils/feed.ts                    mc.eaten、lesson.taught
apps/web/src/utils/labels.ts                  ROAD_NAMES
apps/web/src/views/McView.vue、McView.test.ts
apps/web/src/views/TempleView.vue、TempleView.test.ts
apps/web/src/views/ClassroomView.vue、ClassroomView.test.ts
apps/web/src/views/FriendRestView.vue、FriendRestView.test.ts   品尝卡片
apps/web/src/views/MoreView.vue、MoreView.test.ts               入口
apps/web/src/router.ts
apps/web/e2e/mysterious.spec.ts
docs/rules/收益与加成.md、docs/deploy.md
```

---

### Task 1: 配置——特色菜整理、熟练度表、鉴定道具和教师证、数值

**Files:**
- Create: `packages/config/src/mysterious.ts`、`packages/config/src/mysterious.test.ts`
- Modify: `packages/config/src/types.ts`、`raw.ts`、`build.ts`、`runtime.ts`、`source.ts`、`ids.ts`、`tuning.ts`、`index.ts`（如需导出）、`build.test.ts`、`runtime.test.ts`
- Modify: `packages/config/data/game/tuning.json`

**Interfaces:**
- Produces:
  - `MysteriousCookbook { id; name; level; road; nutritive; coin; odds; taste: number[]; appraisable: boolean; foods: number[] }`
  - `McProficiency { curlevel: number; name: string; expNext: number | null }`（`null` = 满级）
  - `AppraiseDef { min: number; max: number; rate: number; num: number }`
  - `TeacherCertDef { levels: number[]; needStrength: number; maxNum: number; lessonHour: number }`
  - `parseAppraiseDef(value: unknown): AppraiseDef | null`（value 没有 `mysterious` 字段 → null）
  - `parseTeacherCert(value: unknown): TeacherCertDef | string`（string = 错误说明）
  - `GameConfig.mysterious: ReadonlyMap<number, MysteriousCookbook>`、`GameConfig.mcProficiency: readonly McProficiency[]`（下标 = curlevel - 1）、`GameConfig.appraiseTools: ReadonlyMap<number, AppraiseDef>`、`GameConfig.teacherCerts: ReadonlyMap<number, TeacherCertDef>`、`GameConfig.requireMc(id): MysteriousCookbook`
  - `Tuning['mysterious']`（见 Step 7）
  - `GOODS.mysteryRecipe = 162`、`GOODS.luckyCookie = 491`、`GOODS.spongeBob = 304`、`GOODS.starBook = 323`、`GOODS.humanSon = 349`、`GOODS.hundredMaster = 216`、`GOODS.fragmentBase = 180`、`GOODS.thinker = 397`

- [ ] **Step 1: 写纯函数的失败测试**

`packages/config/src/mysterious.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseAppraiseDef, parseTeacherCert } from './mysterious';

describe('parseAppraiseDef（规格书 04 §4.3）', () => {
  it('value 有 mysterious 时解析出等级范围、成功率、张数', () => {
    expect(parseAppraiseDef({ mysterious: [3, 5], rate: 1, num: 2, info: 'x' })).toEqual({
      min: 3,
      max: 5,
      rate: 1,
      num: 2,
    });
  });

  it('没有 num 时按 1 张；没有 mysterious 或不是对象时返回 null', () => {
    expect(parseAppraiseDef({ mysterious: [1, 6], rate: 0.28 })).toEqual({ min: 1, max: 6, rate: 0.28, num: 1 });
    expect(parseAppraiseDef({ luckValue: 3 })).toBeNull();
    expect(parseAppraiseDef(null)).toBeNull();
    expect(parseAppraiseDef('1')).toBeNull();
  });
});

describe('parseTeacherCert（规格书 04 §4.7）', () => {
  it('解析教师证', () => {
    expect(parseTeacherCert({ level: [1, 2], needStrength: 50, maxNum: 5, lessonHour: 24 })).toEqual({
      levels: [1, 2],
      needStrength: 50,
      maxNum: 5,
      lessonHour: 24,
    });
  });

  it('字段缺失或类型不对时返回错误说明', () => {
    expect(typeof parseTeacherCert({ level: [], needStrength: 50, maxNum: 5, lessonHour: 24 })).toBe('string');
    expect(typeof parseTeacherCert({ level: [1], needStrength: '50', maxNum: 5, lessonHour: 24 })).toBe('string');
    expect(typeof parseTeacherCert(null)).toBe('string');
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run src/mysterious.test.ts`
Expected: FAIL，`Cannot find module './mysterious'`

- [ ] **Step 3: 实现纯函数和类型**

`packages/config/src/types.ts`：把 `MysteriousCookbook` 改成下面这样，并在它后面加三个类型；`ConfigBundle` 加 `mcProficiency`：

```ts
export interface MysteriousCookbook {
  id: number;
  name: string;
  level: number;
  /** 1~6 一道~六道，7 兽 */
  road: number;
  nutritive: number;
  /** 残卷出售单价，也是学费的基数 */
  coin: number;
  odds: number;
  taste: number[];
  /** 能不能被鉴定 / 探险抽到 */
  appraisable: boolean;
  /** 所需食材 id：每批每种消耗 1 个（设计文档 裁定 1） */
  foods: number[];
}

/** 熟练度等级（规格书 20 §20.4）；curexp 为累计值，达到 expNext 升级，null = 满级 */
export interface McProficiency {
  curlevel: number;
  name: string;
  expNext: number | null;
}

/** 鉴定道具的 value（规格书 04 §4.3） */
export interface AppraiseDef {
  min: number;
  max: number;
  rate: number;
  num: number;
}

/** 教师证（devicetype 177）的 value（规格书 04 §4.7） */
export interface TeacherCertDef {
  levels: number[];
  needStrength: number;
  maxNum: number;
  lessonHour: number;
}
```

`ConfigBundle` 里 `mysteriousCookbooks: MysteriousCookbook[];` 下面加一行：

```ts
  mcProficiency: McProficiency[];
```

`packages/config/src/mysterious.ts`：

```ts
import type { AppraiseDef, TeacherCertDef } from './types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** 鉴定道具：value 里有 mysterious: [min, max]；其他道具返回 null */
export function parseAppraiseDef(value: unknown): AppraiseDef | null {
  if (!isObj(value) || !Array.isArray(value.mysterious)) return null;
  const [min, max] = value.mysterious as unknown[];
  if (!isInt(min) || !isInt(max) || min > max || !isNum(value.rate)) return null;
  return { min, max, rate: value.rate, num: isInt(value.num) && value.num > 0 ? value.num : 1 };
}

/** 教师证 value → 定义；数据不对时返回错误说明 */
export function parseTeacherCert(value: unknown): TeacherCertDef | string {
  if (!isObj(value)) return 'value is not an object';
  const levels = value.level;
  if (!Array.isArray(levels) || levels.length === 0 || !levels.every(isInt)) return 'bad level';
  for (const k of ['needStrength', 'maxNum', 'lessonHour'] as const)
    if (!isInt(value[k]) || (value[k] as number) <= 0) return `bad ${k}`;
  return {
    levels: levels as number[],
    needStrength: value.needStrength as number,
    maxNum: value.maxNum as number,
    lessonHour: value.lessonHour as number,
  };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/config exec vitest run src/mysterious.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 写构建和运行时的失败测试**

`packages/config/src/build.test.ts` 的 `describe('buildBundle（真实数据）'` 里加：

```ts
  it('特色菜：食材只留 id（"[4]海参"的 4 是等级，设计文档 裁定 1）；熟练度表 10 级', () => {
    const { bundle } = buildBundle(source());
    expect(bundle!.mysteriousCookbooks).toHaveLength(277);
    const m1 = bundle!.mysteriousCookbooks.find((m) => m.id === 1)!;
    expect(m1.foods).toEqual([390, 412, 261]);
    expect(m1.appraisable).toBe(true);
    expect(bundle!.mysteriousCookbooks.filter((m) => !m.appraisable)).toHaveLength(27);
    expect(bundle!.mcProficiency).toHaveLength(10);
    expect(bundle!.mcProficiency[0]).toEqual({ curlevel: 1, name: '初学', expNext: 200 });
    expect(bundle!.mcProficiency[9]).toEqual({ curlevel: 10, name: '化境', expNext: null });
  });
```

`packages/config/src/runtime.test.ts` 末尾加（文件顶部已有 `const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);`）：

```ts
describe('特色菜索引（子项目 4A）', () => {
  it('鉴定道具和教师证按道具 id 索引', () => {
    expect(config.appraiseTools.get(165)).toEqual({ min: 3, max: 5, rate: 1, num: 2 });
    expect(config.appraiseTools.get(163)).toEqual({ min: 1, max: 6, rate: 0.28, num: 1 });
    expect(config.appraiseTools.has(162)).toBe(false);
    expect(config.teacherCerts.get(394)).toEqual({ levels: [6], needStrength: 100, maxNum: 5, lessonHour: 32 });
    expect([...config.teacherCerts.keys()].sort((a, b) => a - b)).toEqual([177, 178, 179, 394]);
    expect(config.requireMc(1).name).toBe('秘·仿膳饽饽');
    expect(() => config.requireMc(99999)).toThrow();
    expect(config.mcProficiency[2]!.name).toBe('熟练');
  });
});
```

- [ ] **Step 6: 运行，确认失败**

Run: `pnpm --filter @dt/config exec vitest run`
Expected: FAIL（`foods` 还是对象数组、`mcProficiency` 未定义、`appraiseTools` 未定义）

- [ ] **Step 7: 实现构建、运行时、tuning、ids**

`packages/config/src/raw.ts`：`rawMysterious` 加一行 `appraisable: z.boolean().nullish(),`；文件末尾加：

```ts
export const rawMcProficiency = z.object({ curlevel: int, name: z.string(), expNext: int });
```

`packages/config/src/source.ts` 的 `SOURCE_FILES` 在 `'designed/equip_suits',` 后加 `'designed/mc_proficiency',`。

`packages/config/src/build.ts`：
- 顶部 import 加 `import { parseAppraiseDef, parseTeacherCert } from './mysterious';`
- 在 `const suitsRaw = ...` 后加：`const mcProfRaw = parse('designed/mc_proficiency', z.array(raw.rawMcProficiency));`
- 在"缺数据"的大 `if (errors.length > 0 || ... )` 条件里加 `!mcProfRaw ||`
- 特色菜段改为：

```ts
  // ---------- 特色菜 ----------
  const mysteriousCookbooks = mysteriousRaw.map((m) => {
    for (const f of m.foods) {
      if (!foodIds.has(f.foodsId)) errors.push(`mysterious ${m.id} references unknown food ${f.foodsId}`);
    }
    return {
      id: m.id,
      name: m.name,
      level: m.level,
      road: m.road,
      nutritive: m.nutritive ?? 0,
      coin: m.coin ?? 0,
      odds: m.odds ?? 0,
      taste: splitTaste(m.taste),
      appraisable: m.appraisable ?? true,
      // 数据里的 num 是食材等级，不是数量（设计文档 裁定 1）
      foods: m.foods.map((f) => f.foodsId),
    };
  });
  unique(
    'mysterious_cookbooks',
    mysteriousCookbooks.map((m) => m.id),
  );
  const mcProficiency = [...mcProfRaw]
    .sort((a, b) => a.curlevel - b.curlevel)
    .map((p) => ({ curlevel: p.curlevel, name: p.name, expNext: p.expNext < 0 ? null : p.expNext }));
  mcProficiency.forEach((p, i) => {
    if (p.curlevel !== i + 1) errors.push(`mc_proficiency: curlevel ${p.curlevel} out of order`);
  });
  for (const g of goods) {
    if (g.deviceType === 177) {
      const c = parseTeacherCert(g.value);
      if (typeof c === 'string') errors.push(`goods ${g.id} teacher cert ${c}`);
    }
    const a = parseAppraiseDef(g.value);
    if (a && !mysteriousCookbooks.some((m) => m.appraisable && m.level >= a.min && m.level <= a.max))
      errors.push(`goods ${g.id} appraise range ${a.min}-${a.max} has no dish`);
  }
```

- `body` 里 `mysteriousCookbooks,` 下面加 `mcProficiency,`

`packages/config/src/runtime.ts`：
- import 加 `AppraiseDef, McProficiency, MysteriousCookbook, TeacherCertDef`，以及 `import { parseAppraiseDef, parseTeacherCert } from './mysterious';`
- `GameConfig` 接口加：

```ts
  readonly mysterious: ReadonlyMap<number, MysteriousCookbook>;
  /** 下标 = curlevel - 1 */
  readonly mcProficiency: readonly McProficiency[];
  readonly appraiseTools: ReadonlyMap<number, AppraiseDef>;
  readonly teacherCerts: ReadonlyMap<number, TeacherCertDef>;
  requireMc(id: number): MysteriousCookbook;
```

- 在构造 GameConfig 的函数里（`suits: new Map(...)` 附近）先算：

```ts
  const mysterious = byId(bundle.mysteriousCookbooks);
  const appraiseTools = new Map<number, AppraiseDef>();
  const teacherCerts = new Map<number, TeacherCertDef>();
  for (const g of bundle.goods) {
    const a = parseAppraiseDef(g.value);
    if (a) appraiseTools.set(g.id, a);
    if (g.deviceType === 177) {
      const c = parseTeacherCert(g.value);
      if (typeof c !== 'string') teacherCerts.set(g.id, c);
    }
  }
```

  返回对象里加：

```ts
    mysterious,
    mcProficiency: bundle.mcProficiency,
    appraiseTools,
    teacherCerts,
    requireMc(id) {
      const m = mysterious.get(id);
      if (!m) throw new Error(`unknown mysterious cookbook ${id}`);
      return m;
    },
```

`packages/config/src/ids.ts` 的 `GOODS` 在 `krabburgerBook: 165,` 后加：

```ts
  mysteryRecipe: 162, // 神秘食谱
  fragmentBase: 180, // 残卷碎片 = 180 + 特色菜等级（181~186）
  hundredMaster: 216, // 百世之师（强制结束课程）
  spongeBob: 304, // 海绵宝宝（烹制时点赞）
  starBook: 323, // 星神之书（鉴定重抽）
  humanSon: 349, // 人类之子-名画（每份价值加成，计划裁定 2）
  thinker: 397, // 思想者-雕像
  luckyCookie: 491, // 幸运饼干
```

`packages/config/src/tuning.ts` 的 `tuningSchema` 在 `equip: z.object({...}),` 后加：

```ts
  mysterious: z.object({
    cookNums: z.array(int.min(1)).min(1),
    baseNum: int,
    /** 等级大于它的特色菜份数打折 */
    highLevel: int,
    highLevelNumRange: z.tuple([num, num]),
    /** 品级 2~7 的下限（规格书 04 §4.5 mcGradeRate） */
    gradeBounds: z.array(num).length(6),
    /** 品级 1~7 的份数系数区间（mcGradeRatio） */
    gradeRatio: z.array(z.tuple([num, num])).length(7),
    levelBonusPerLevel: num,
    roadSame: num,
    roadSameMax: num,
    roadOther: num,
    roadOtherMax: num,
    cookNumPowerDiv: num,
    bobRatePerNutritive: num,
    appraiseRetryBelow: int,
    tasteDaily: int.min(1),
    tasteAwardMax: int,
    tasteMcRate: num,
    tasteGradeFactor: num,
    lessonLearnRate: num,
    lessonStealRate: num,
    lessonStealPerLevel: num,
    thinkerStealBonus: num,
    learnStrength: int,
    stealStrength: int,
    tuitionTimes: num,
    teacherShare: num,
    learnFragments: int,
    teacherFragments: int,
    forgetPerLevel: int,
    forgetMcFromLevel: int,
    forgetMcPerLevel: num,
    forceCloseCoinPerLevel: int,
    championHour: int.min(0).max(23),
    championGoodsId: int,
  }),
```

`packages/config/data/game/tuning.json`：在 `"equip": { ... }` 这一段的右花括号后面插入（给 `equip` 段结尾的 `}` 后补逗号），不要重排整个文件：

```json
  "mysterious": {
    "cookNums": [1, 5, 10, 15, 25, 50],
    "baseNum": 360,
    "highLevel": 5,
    "highLevelNumRange": [0.70, 0.95],
    "gradeBounds": [0.5, 0.8, 0.95, 1.05, 1.15, 1.25],
    "gradeRatio": [[0, 0.30], [0.28, 0.52], [0.50, 0.64], [0.62, 0.76], [0.74, 0.88], [0.86, 1.00], [0.98, 1.12]],
    "levelBonusPerLevel": 0.04,
    "roadSame": 0.02, "roadSameMax": 0.30, "roadOther": 0.005, "roadOtherMax": 0.10,
    "cookNumPowerDiv": 400,
    "bobRatePerNutritive": 0.0002,
    "appraiseRetryBelow": 5,
    "tasteDaily": 2, "tasteAwardMax": 20, "tasteMcRate": 0.016, "tasteGradeFactor": 0.2,
    "lessonLearnRate": 0.9, "lessonStealRate": 0.4, "lessonStealPerLevel": 0.02, "thinkerStealBonus": 0.05,
    "learnStrength": 50, "stealStrength": 80,
    "tuitionTimes": 3, "teacherShare": 2, "learnFragments": 2, "teacherFragments": 1,
    "forgetPerLevel": 3, "forgetMcFromLevel": 4, "forgetMcPerLevel": 0.05,
    "forceCloseCoinPerLevel": 50000,
    "championHour": 9,
    "championGoodsId": 165
  }
```

新类型经 `packages/config/src/index.ts` 的 `export * from './types'` 自动导出；`parseAppraiseDef`、`parseTeacherCert` 只在配置包内部（build、runtime）使用，不导出。

- [ ] **Step 8: 运行，确认通过，并重新生成 bundle**

Run: `pnpm --filter @dt/config exec vitest run && pnpm --filter @dt/config build`
Expected: PASS；`generated/bundle.json` 更新

- [ ] **Step 9: 全量测试并提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿（服务端没有代码引用 `MysteriousCookbook.foods` 的旧结构）

```bash
git add packages/config
git commit -m "feat(config): mysterious dishes keep food ids only, proficiency table, appraisal tools and teacher certificates, mysterious tuning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 迁移 0008、表类型、流水 kind

**Files:**
- Create: `apps/server/src/db/migrations/0008_mysterious.ts`、`apps/server/src/db/migrations/0008.test.ts`
- Modify: `apps/server/src/db/migrations/index.ts`、`apps/server/src/db/schema.ts`、`apps/server/src/modules/ledger/ledger.ts`、`packages/shared/src/envelope.ts`

**Interfaces:**
- Produces（`schema.ts`）：`RestMcTable`、`McRemnantTable`、`McCookTable`、`McEatTable`、`McLessonTable`、`McLessonStudentTable`；`DB.rest_mc / mc_remnant / mc_cook / mc_eat / mc_lesson / mc_lesson_student`；`RestaurantTable.mc_cook_id: Nullable<number>`；`McCookRow = Selectable<McCookTable>`、`McLessonRow = Selectable<McLessonTable>`
- Produces：`LedgerEntry.kind` 与 `GameEvent.kind` 都包含 `'remnant'`

- [ ] **Step 1: 写迁移的失败测试**

`apps/server/src/db/migrations/0008.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());
let shard: number;
let a: number;
let b: number;
beforeAll(async () => {
  shard = await createShard(db);
  a = await createRestaurantRow(db, shard, await createAccountRow(db));
  b = await createRestaurantRow(db, shard, await createAccountRow(db));
});

const cook = (rest: number) =>
  db
    .insertInto('mc_cook')
    .values({ rest_id: rest, shard_id: shard, mc_id: 1, level: 4, grade: 3, cook_num: 1, total_num: 400, left_num: 400, price: 40 })
    .returning('id')
    .executeTakeFirstOrThrow();

describe('迁移 0008', () => {
  it('rest_mc 默认值；残卷不能为负；同店同菜唯一', async () => {
    await db.insertInto('rest_mc').values({ rest_id: a, mc_id: 1, way: 1 }).execute();
    const r = await db.selectFrom('rest_mc').selectAll().where('rest_id', '=', a).executeTakeFirstOrThrow();
    expect(r).toMatchObject({ curlevel: 1, curexp: 0, trial_worth: 0, trial_exp: 0, master_rest_id: null });
    await expect(db.insertInto('rest_mc').values({ rest_id: a, mc_id: 1, way: 1 }).execute()).rejects.toThrow();
    await expect(db.insertInto('mc_remnant').values({ rest_id: a, mc_id: 1, num: -1 }).execute()).rejects.toThrow();
  });

  it('mc_cook：剩余不能为负；餐厅指针删行后置空；品尝同批同人唯一', async () => {
    const c = await cook(a);
    await db.updateTable('restaurant').set({ mc_cook_id: c.id }).where('id', '=', a).execute();
    await expect(db.updateTable('mc_cook').set({ left_num: -1 }).where('id', '=', c.id).execute()).rejects.toThrow();
    await db.insertInto('mc_eat').values({ cook_id: c.id, eater_rest_id: b }).execute();
    await expect(db.insertInto('mc_eat').values({ cook_id: c.id, eater_rest_id: b }).execute()).rejects.toThrow();
    await db.deleteFrom('mc_cook').where('id', '=', c.id).execute();
    const r = await db.selectFrom('restaurant').select('mc_cook_id').where('id', '=', a).executeTakeFirstOrThrow();
    expect(r.mc_cook_id).toBeNull();
    expect(await db.selectFrom('mc_eat').selectAll().where('cook_id', '=', c.id).execute()).toEqual([]);
  });

  it('每位老师只能有一门未关闭的课；关闭后可以再开；删老师级联删课和学生', async () => {
    const t = await createRestaurantRow(db, shard, await createAccountRow(db));
    const lesson = (closed: Date | null) =>
      db
        .insertInto('mc_lesson')
        .values({ shard_id: shard, teacher_rest_id: t, mc_id: 1, level: 4, max_num: 5, ends_at: new Date(Date.now() + 3600_000), closed_at: closed })
        .returning('id')
        .executeTakeFirstOrThrow();
    const l1 = await lesson(null);
    await expect(lesson(null)).rejects.toThrow();
    await db.updateTable('mc_lesson').set({ closed_at: new Date() }).where('id', '=', l1.id).execute();
    const l2 = await lesson(null);
    await db.insertInto('mc_lesson_student').values({ lesson_id: l2.id, rest_id: b, type: 1, success: true }).execute();
    await expect(
      db.insertInto('mc_lesson_student').values({ lesson_id: l2.id, rest_id: b, type: 2, success: false }).execute(),
    ).rejects.toThrow();
    await db.deleteFrom('restaurant').where('id', '=', t).execute();
    expect(await db.selectFrom('mc_lesson').selectAll().where('teacher_rest_id', '=', t).execute()).toEqual([]);
    expect(await db.selectFrom('mc_lesson_student').selectAll().where('lesson_id', '=', l2.id).execute()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0008.test.ts`
Expected: FAIL（表不存在；类型检查也会报 `mc_cook` 不在 DB 里——vitest 不做类型检查，所以看运行时错误 `relation "rest_mc" does not exist`）

- [ ] **Step 3: 写迁移**

`apps/server/src/db/migrations/0008_mysterious.ts`：

```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create table rest_mc (
      rest_id integer not null references restaurant(id) on delete cascade,
      mc_id integer not null,
      curlevel smallint not null default 1,
      curexp integer not null default 0,
      trial_worth integer not null default 0,
      trial_exp integer not null default 0,
      way smallint not null,
      master_rest_id integer,
      learned_at timestamptz not null default now(),
      primary key (rest_id, mc_id)
    )`,
    sql`create table mc_remnant (
      rest_id integer not null references restaurant(id) on delete cascade,
      mc_id integer not null,
      num integer not null check (num >= 0),
      primary key (rest_id, mc_id)
    )`,
    sql`create table mc_cook (
      id integer generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      shard_id integer not null,
      mc_id integer not null,
      level smallint not null,
      grade smallint not null,
      cook_num integer not null,
      total_num integer not null,
      left_num integer not null check (left_num >= 0),
      price integer not null,
      luck boolean not null default false,
      eat_count integer not null default 0,
      created_at timestamptz not null default now(),
      ended_at timestamptz,
      end_reason text
    )`,
    sql`create index mc_cook_shard_time on mc_cook (shard_id, created_at)`,
    sql`create index mc_cook_rest on mc_cook (rest_id)`,
    sql`alter table restaurant add column mc_cook_id integer references mc_cook(id) on delete set null`,
    sql`create table mc_eat (
      cook_id integer not null references mc_cook(id) on delete cascade,
      eater_rest_id integer not null references restaurant(id) on delete cascade,
      eaten_at timestamptz not null default now(),
      primary key (cook_id, eater_rest_id)
    )`,
    sql`create index mc_eat_eater_time on mc_eat (eater_rest_id, eaten_at)`,
    sql`create table mc_lesson (
      id integer generated always as identity primary key,
      shard_id integer not null,
      teacher_rest_id integer not null references restaurant(id) on delete cascade,
      mc_id integer not null,
      level smallint not null,
      max_num integer not null,
      ends_at timestamptz not null,
      learned integer not null default 0,
      stolen integer not null default 0,
      closed_at timestamptz,
      created_at timestamptz not null default now()
    )`,
    sql`create unique index mc_lesson_one_open on mc_lesson (teacher_rest_id) where closed_at is null`,
    sql`create index mc_lesson_shard_ends on mc_lesson (shard_id, ends_at)`,
    sql`create table mc_lesson_student (
      lesson_id integer not null references mc_lesson(id) on delete cascade,
      rest_id integer not null references restaurant(id) on delete cascade,
      type smallint not null,
      success boolean not null,
      created_at timestamptz not null default now(),
      primary key (lesson_id, rest_id)
    )`,
    sql`create index mc_lesson_student_rest on mc_lesson_student (rest_id)`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  await sql`alter table restaurant drop column if exists mc_cook_id`.execute(db);
  for (const t of ['mc_lesson_student', 'mc_lesson', 'mc_eat', 'mc_cook', 'mc_remnant', 'rest_mc']) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts` 加 `import * as m0008 from './0008_mysterious';` 和 `'0008_mysterious': m0008,`。

- [ ] **Step 4: 表类型、流水 kind、事件 kind**

`apps/server/src/db/schema.ts`：
- `RestaurantTable` 在 `plankton_cooldown_until: TsNullable;` 后加：

```ts
  /** 当前在售的特色菜（子项目 4A）；卖完、倒掉、被吃完后置空 */
  mc_cook_id: Nullable<number>;
```

- 在 `export type EquipRow = ...` 之前加：

```ts
/** 已学特色菜（子项目 4A）；curexp 为累计熟练度 */
export interface RestMcTable {
  rest_id: number;
  mc_id: number;
  curlevel: Default<number>;
  curexp: Default<number>;
  trial_worth: Default<number>;
  trial_exp: Default<number>;
  /** 1 残卷 / 2 课程 / 3 偷学 */
  way: number;
  master_rest_id: Nullable<number>;
  learned_at: TsDefault;
}

export interface McRemnantTable {
  rest_id: number;
  mc_id: number;
  num: number;
}

/** 一次烹制；price 为每份价值 */
export interface McCookTable {
  id: Generated<number>;
  rest_id: number;
  shard_id: number;
  mc_id: number;
  level: number;
  grade: number;
  cook_num: number;
  total_num: number;
  left_num: number;
  price: number;
  luck: Default<boolean>;
  eat_count: Default<number>;
  created_at: TsDefault;
  ended_at: TsNullable;
  /** sold / dumped / eaten */
  end_reason: Nullable<string>;
}

export interface McEatTable {
  cook_id: number;
  eater_rest_id: number;
  eaten_at: TsDefault;
}

export interface McLessonTable {
  id: Generated<number>;
  shard_id: number;
  teacher_rest_id: number;
  mc_id: number;
  level: number;
  max_num: number;
  ends_at: Ts;
  learned: Default<number>;
  stolen: Default<number>;
  closed_at: TsNullable;
  created_at: TsDefault;
}

export interface McLessonStudentTable {
  lesson_id: number;
  rest_id: number;
  /** 1 学 / 2 偷 */
  type: number;
  success: boolean;
  created_at: TsDefault;
}
```

- `DB` 接口末尾加：

```ts
  rest_mc: RestMcTable;
  mc_remnant: McRemnantTable;
  mc_cook: McCookTable;
  mc_eat: McEatTable;
  mc_lesson: McLessonTable;
  mc_lesson_student: McLessonStudentTable;
```

- 文件末尾（`RestaurantRow` 后）加：

```ts
export type McCookRow = Selectable<McCookTable>;
export type McLessonRow = Selectable<McLessonTable>;
```

`apps/server/src/modules/ledger/ledger.ts` 与 `packages/shared/src/envelope.ts` 的 `kind` 联合类型末尾都加 `| 'remnant'`。

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/db/migrations/0008.test.ts && pnpm typecheck`
Expected: PASS；类型检查通过（`restaurant` 新列可空，现有插入不受影响）

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm test`
Expected: 全绿

```bash
git add apps/server/src/db packages/shared/src/envelope.ts apps/server/src/modules/ledger/ledger.ts
git commit -m "feat(db): migration 0008 for learned dishes, remnants, cooking batches, tastings and lessons; remnant ledger kind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 纯规则

**Files:**
- Create: `apps/server/src/modules/mysterious/rules.ts`、`apps/server/src/modules/mysterious/rules.test.ts`

**Interfaces:**
- Consumes: `MysteriousCookbook`、`McProficiency`、`AppraiseDef`、`Tuning['mysterious']`（Task 1）
- Produces（全部纯函数，随机数用注入的 `Rng`）：
  - `type McTuning = Tuning['mysterious']`
  - `LEARN_REMNANTS = 3`
  - `gradeOf(rate: number, bounds: readonly number[]): number`
  - `roadRate(road: number, others: readonly MysteriousCookbook[], t: McTuning): number`
  - `interface CookInput { mc; cookNum; curlevel; trialWorth; star; luckRate; goldRate; numRate; roadRate; power; coinAdd; humanSon: boolean; cookie: boolean }`
  - `interface CookOutcome { grade: number; luck: boolean; num: number; price: number; exp: number }`
  - `cookDish(i: CookInput, t: McTuning, rng: Rng): CookOutcome`（抽随机数的顺序：品级 → 6 级份数折扣（仅高等级）→ 份数系数 → 厨力项 → 人子（仅持有）→ 饼干（仅勾选））
  - `addProficiency(curlevel: number, curexp: number, add: number, table: readonly McProficiency[]): { curlevel: number; curexp: number }`
  - `bobChance(mc: MysteriousCookbook, cookNum: number, t: McTuning): number`
  - `trialRestExp(num: number, restLevel: number, trialExp: number): number`
  - `appraiseRate(def: AppraiseDef, bonus: number, luckRate: number): number`
  - `appraisePick(pool: WeightedPool<MysteriousCookbook>, retry: boolean, t: McTuning, rng: Rng): { mc: MysteriousCookbook; blessed: boolean }`
  - `learnRate(thinker: boolean, luckRate: number, t: McTuning): number`
  - `stealRate(level: number, thinker: boolean, luckRate: number, t: McTuning): number`
  - `forgetCount(level: number, t: McTuning): number`、`forgetMcChance(level: number, t: McTuning): number`
  - `teacherStar(level: number): number`、`studentStar(level: number): number`
  - `tasteStrength(price: number, friend: boolean): number`、`tasteRecipeRate(grade: number, luckRate: number, t: McTuning): number`、`tasteTickets(strength: number, ownerStar: number, rng: Rng): number`
  - `pickSome<T>(items: readonly T[], n: number, rng: Rng): T[]`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/mysterious/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { MysteriousCookbook } from '@dt/config';
import { buildPool, sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import {
  addProficiency,
  appraisePick,
  appraiseRate,
  bobChance,
  cookDish,
  forgetCount,
  forgetMcChance,
  gradeOf,
  learnRate,
  pickSome,
  roadRate,
  stealRate,
  studentStar,
  tasteRecipeRate,
  tasteStrength,
  tasteTickets,
  teacherStar,
  trialRestExp,
  type CookInput,
} from './rules';

const config = testConfig();
const t = config.tuning.mysterious;
const dish = (patch: Partial<MysteriousCookbook> = {}): MysteriousCookbook => ({
  id: 1,
  name: '秘·测试',
  level: 4,
  road: 1,
  nutritive: 100,
  coin: 1000,
  odds: 1,
  taste: [],
  appraisable: true,
  foods: [1, 2, 3],
  ...patch,
});
const input = (patch: Partial<CookInput> = {}): CookInput => ({
  mc: dish(),
  cookNum: 1,
  curlevel: 1,
  trialWorth: 0,
  star: 1,
  luckRate: 0,
  goldRate: 0,
  numRate: 0,
  roadRate: 0,
  power: 0,
  coinAdd: 0,
  humanSon: false,
  cookie: false,
  ...patch,
});

describe('品级（规格书 04 §4.5，设计文档 裁定 16）', () => {
  it('按区间判定，≥1.25 为佳肴；[1, 1.25) 不会直接判佳肴', () => {
    expect(gradeOf(0, t.gradeBounds)).toBe(1);
    expect(gradeOf(0.5, t.gradeBounds)).toBe(2);
    expect(gradeOf(1.0, t.gradeBounds)).toBe(4);
    expect(gradeOf(1.1, t.gradeBounds)).toBe(5);
    expect(gradeOf(1.2499, t.gradeBounds)).toBe(6);
    expect(gradeOf(1.25, t.gradeBounds)).toBe(7);
    expect(gradeOf(3.5, t.gradeBounds)).toBe(7);
  });
});

describe('cookDish', () => {
  it('没有加成：rand 0.9 → 上品；份数 = 360×(1+0.57)；每份 = 营养×1.57；熟练度 = 品级×份数/200', () => {
    const r = cookDish(input(), t, sequenceRng([0.9, 0.5, 0.5]));
    expect(r).toEqual({ grade: 3, luck: false, num: 565, price: 157, exp: 8 });
  });

  it('6 级菜份数打折；加成把品级抬到佳肴时标记幸运；熟练度、试炼价值、人子、饼干、名画都算进每份价值', () => {
    const r = cookDish(
      input({
        mc: dish({ level: 6 }),
        cookNum: 5,
        curlevel: 3,
        trialWorth: 10,
        star: 4,
        goldRate: 0.4,
        numRate: 0.2,
        roadRate: 0.1,
        power: 200,
        coinAdd: 3,
        humanSon: true,
        cookie: true,
      }),
      t,
      // 品级 0.9；份数折扣 0.70+0.4×0.25=0.8；份数系数 0.98+0.5×0.14；厨力项 0.05×0.5；人子 rand[1,2]→1；饼干 rand[1,3]→3
      sequenceRng([0.9, 0.4, 0.5, 0.5, 0, 0.99]),
    );
    expect(r.grade).toBe(7);
    expect(r.luck).toBe(true);
    // 1440 × 2.05 × (1 + 0.1 + 0.2 + 0.025) = 3911.4
    expect(r.num).toBe(3911);
    // ⌊100 × 2.05 × (1 + 0.08 + 0.1)⌋ + 1 + 3 + 3
    expect(r.price).toBe(248);
    expect(r.exp).toBe(Math.floor((7 * 3911) / 200));
  });
});

describe('熟练度（规格书 20 §20.4，计划裁定 5）', () => {
  const table = config.mcProficiency;
  it('累计值达到本级 expNext 升级，可以连升；满级停', () => {
    expect(addProficiency(1, 0, 199, table)).toEqual({ curlevel: 1, curexp: 199 });
    expect(addProficiency(1, 0, 800, table)).toEqual({ curlevel: 3, curexp: 800 });
    expect(addProficiency(9, 16000, 5000, table)).toEqual({ curlevel: 10, curexp: 21000 });
    expect(addProficiency(10, 21000, 100, table)).toEqual({ curlevel: 10, curexp: 21100 });
  });
});

describe('道份数加成（规格书 20 §20.4）', () => {
  it('同道每道 2%（上限 30%），他道每道 0.5%（上限 10%）', () => {
    const same = (n: number) => Array.from({ length: n }, () => dish({ road: 2 }));
    const other = (n: number) => Array.from({ length: n }, () => dish({ road: 3 }));
    expect(roadRate(2, [...same(3), ...other(5)], t)).toBeCloseTo(0.085, 10);
    expect(roadRate(2, [...same(20), ...other(30)], t)).toBeCloseTo(0.4, 10);
    expect(roadRate(2, [], t)).toBe(0);
  });
});

describe('海绵宝宝、试炼经验', () => {
  it('6 级菜必中，否则 0.0002 × 营养 × 批数', () => {
    expect(bobChance(dish({ level: 6 }), 1, t)).toBe(1);
    expect(bobChance(dish({ nutritive: 50 }), 10, t)).toBeCloseTo(0.1, 10);
  });
  it('试炼经验 = 份数 × 餐厅等级 × 试炼经验 / 1200', () => {
    expect(trialRestExp(1200, 30, 10)).toBe(300);
  });
});

describe('鉴定（规格书 04 §4.3）', () => {
  it('成功率 = 道具 + 加成 + 幸运/8', () => {
    expect(appraiseRate({ min: 1, max: 6, rate: 0.28, num: 1 }, 0.2, 0.4)).toBeCloseTo(0.53, 10);
  });

  it('星神之书：第一次抽到低于 5 级时重抽，取等级高的并标记眷恋', () => {
    const pool = buildPool([dish({ id: 10, level: 3 }), dish({ id: 11, level: 5 })], (m) => m.odds);
    expect(appraisePick(pool, true, t, sequenceRng([0.1, 0.9]))).toMatchObject({ mc: { id: 11 }, blessed: true });
    expect(appraisePick(pool, false, t, sequenceRng([0.1, 0.9]))).toMatchObject({ mc: { id: 10 }, blessed: false });
    expect(appraisePick(pool, true, t, sequenceRng([0.1, 0.1]))).toMatchObject({ mc: { id: 10 }, blessed: false });
    expect(appraisePick(pool, true, t, sequenceRng([0.9]))).toMatchObject({ mc: { id: 11 }, blessed: false });
  });
});

describe('教室（规格书 04 §4.7）', () => {
  it('学：0.9（思想者 1）+ 幸运/5；偷：0.4 - 等级×0.02（思想者 +0.05）+ 幸运/5', () => {
    expect(learnRate(false, 0.1, t)).toBeCloseTo(0.92, 10);
    expect(learnRate(true, 0, t)).toBe(1);
    expect(stealRate(5, false, 0.1, t)).toBeCloseTo(0.32, 10);
    expect(stealRate(5, true, 0, t)).toBeCloseTo(0.35, 10);
  });

  it('遗忘 等级×3+1 道；4 级起才可能遗忘特色菜，概率 等级×5%', () => {
    expect(forgetCount(4, t)).toBe(13);
    expect(forgetMcChance(3, t)).toBe(0);
    expect(forgetMcChance(4, t)).toBeCloseTo(0.2, 10);
  });

  it('星级门槛：老师 max(1, ⌊(等级-1)/2⌋)，学生 ⌊(等级-1)/2⌋+1', () => {
    expect([1, 4, 5, 6].map(teacherStar)).toEqual([1, 1, 2, 2]);
    expect([1, 4, 6].map(studentStar)).toEqual([1, 2, 3]);
  });

  it('pickSome：不重复，最多 n 个，不够时全给', () => {
    expect(pickSome([1, 2, 3, 4, 5], 2, sequenceRng([0]))).toEqual([1, 2]);
    expect(pickSome([1, 2], 5, sequenceRng([0.5])).sort()).toEqual([1, 2]);
    const r = pickSome([1, 2, 3, 4, 5], 3, sequenceRng([0.99, 0.5, 0.2]));
    expect(new Set(r).size).toBe(3);
  });
});

describe('品尝（规格书 13 §13.6）', () => {
  it('体力 = 每份价值（非好友减半）；神秘食谱概率；店主礼券 rand[1, 体力/(10×(0星?2:1))+1]', () => {
    expect(tasteStrength(157, true)).toBe(157);
    expect(tasteStrength(157, false)).toBe(78);
    expect(tasteRecipeRate(3, 0.1, t)).toBeCloseTo(0.0266, 10);
    expect(tasteTickets(157, 2, sequenceRng([0.99]))).toBe(16);
    expect(tasteTickets(157, 0, sequenceRng([0.99]))).toBe(8);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/rules.test.ts`
Expected: FAIL，`Cannot find module './rules'`

- [ ] **Step 3: 实现**

`apps/server/src/modules/mysterious/rules.ts`：

```ts
import type { AppraiseDef, McProficiency, MysteriousCookbook, Tuning } from '@dt/config';
import { pickWeighted, type Rng, type WeightedPool } from '@dt/shared';

export type McTuning = Tuning['mysterious'];

/** 用残卷学会要 3 张（规格书 04 §4.4） */
export const LEARN_REMNANTS = 3;

/** 品级：bounds 是品级 2~7 的下限，落在第几段就是几品（设计文档 裁定 16） */
export function gradeOf(rate: number, bounds: readonly number[]): number {
  let g = 1;
  for (const b of bounds) if (rate >= b) g += 1;
  return g;
}

/** 道份数加成（规格书 20 §20.4）：others 是除本道菜以外已学的特色菜 */
export function roadRate(road: number, others: readonly MysteriousCookbook[], t: McTuning): number {
  let same = 0;
  let other = 0;
  for (const m of others) {
    if (m.road === road) same += 1;
    else other += 1;
  }
  return Math.min(same * t.roadSame, t.roadSameMax) + Math.min(other * t.roadOther, t.roadOtherMax);
}

export interface CookInput {
  mc: MysteriousCookbook;
  cookNum: number;
  curlevel: number;
  trialWorth: number;
  star: number;
  luckRate: number;
  /** 加成 + 天气的 mcGoldRate */
  goldRate: number;
  /** 加成 + 天气的 mcNumRate */
  numRate: number;
  roadRate: number;
  /** 厨力 */
  power: number;
  /** 集名画的 mcCoinAdd */
  coinAdd: number;
  humanSon: boolean;
  cookie: boolean;
}

export interface CookOutcome {
  grade: number;
  /** 加成把品级抬高了（设计文档 裁定 17） */
  luck: boolean;
  num: number;
  /** 每份价值 */
  price: number;
  /** 本次增加的熟练度 */
  exp: number;
}

/** 烹制（规格书 04 §4.5） */
export function cookDish(i: CookInput, t: McTuning, rng: Rng): CookOutcome {
  const levelRate = (i.curlevel - 1) * t.levelBonusPerLevel;
  const r0 = rng.next();
  const grade = gradeOf(r0 + i.luckRate / 8 + levelRate + i.goldRate, t.gradeBounds);
  const luck = gradeOf(r0, t.gradeBounds) < grade;
  const [lo, hi] = t.highLevelNumRange;
  const base = t.baseNum * i.cookNum * (i.mc.level > t.highLevel ? lo + rng.next() * (hi - lo) : 1);
  const [a, b] = t.gradeRatio[grade - 1]!;
  const ratio = 1 + a + rng.next() * (b - a) + i.luckRate / 8;
  const cookNumRate = (Math.sqrt(Math.max(0, i.power) * 2) / t.cookNumPowerDiv) * rng.next();
  const num = Math.floor(base * ratio * (1 + i.roadRate + i.numRate + cookNumRate));
  const halfStar = Math.floor(i.star / 2);
  const son = i.humanSon ? rng.intMin1(Math.max(1, 4 - halfStar)) : 0;
  const cookie = i.cookie ? rng.intMin1(Math.max(1, 5 - halfStar)) : 0;
  const price =
    Math.floor(i.mc.nutritive * ratio * (1 + levelRate + i.trialWorth / 100)) + son + Math.floor(i.coinAdd) + cookie;
  return { grade, luck, num, price, exp: Math.floor((grade * num) / 200) };
}

/** 熟练度：curexp 为累计值，达到本级 expNext 升级（计划裁定 5） */
export function addProficiency(
  curlevel: number,
  curexp: number,
  add: number,
  table: readonly McProficiency[],
): { curlevel: number; curexp: number } {
  const exp = curexp + add;
  let lv = curlevel;
  for (;;) {
    const row = table[lv - 1];
    if (!row || row.expNext === null || exp < row.expNext) break;
    lv += 1;
  }
  return { curlevel: lv, curexp: exp };
}

/** 海绵宝宝点赞（BOB）概率 */
export function bobChance(mc: MysteriousCookbook, cookNum: number, t: McTuning): number {
  return mc.level > t.highLevel ? 1 : t.bobRatePerNutritive * mc.nutritive * cookNum;
}

/** 试炼经验带来的餐厅经验 */
export function trialRestExp(num: number, restLevel: number, trialExp: number): number {
  return Math.floor((num * restLevel * trialExp) / 1200);
}

/** 鉴定成功率；bonus = 天气 + 加成的 starMCBookRate */
export function appraiseRate(def: AppraiseDef, bonus: number, luckRate: number): number {
  return def.rate + bonus + luckRate / 8;
}

/** 按 odds 抽一道；retry（有星神之书且没勾"不重抽"）时低于 appraiseRetryBelow 级再抽一次取高的 */
export function appraisePick(
  pool: WeightedPool<MysteriousCookbook>,
  retry: boolean,
  t: McTuning,
  rng: Rng,
): { mc: MysteriousCookbook; blessed: boolean } {
  const first = pickWeighted(pool, rng);
  if (!retry || first.level >= t.appraiseRetryBelow) return { mc: first, blessed: false };
  const second = pickWeighted(pool, rng);
  return second.level > first.level ? { mc: second, blessed: true } : { mc: first, blessed: false };
}

export function learnRate(thinker: boolean, luckRate: number, t: McTuning): number {
  return (thinker ? 1 : t.lessonLearnRate) + luckRate / 5;
}

export function stealRate(level: number, thinker: boolean, luckRate: number, t: McTuning): number {
  return t.lessonStealRate - level * t.lessonStealPerLevel + (thinker ? t.thinkerStealBonus : 0) + luckRate / 5;
}

export function forgetCount(level: number, t: McTuning): number {
  return level * t.forgetPerLevel + 1;
}

export function forgetMcChance(level: number, t: McTuning): number {
  return level >= t.forgetMcFromLevel ? level * t.forgetMcPerLevel : 0;
}

/** 开课的星级门槛 */
export function teacherStar(level: number): number {
  return Math.max(1, Math.floor((level - 1) / 2));
}

/** 学课的星级门槛 */
export function studentStar(level: number): number {
  return Math.floor((level - 1) / 2) + 1;
}

export function tasteStrength(price: number, friend: boolean): number {
  return Math.floor(price / (friend ? 1 : 2));
}

export function tasteRecipeRate(grade: number, luckRate: number, t: McTuning): number {
  return t.tasteMcRate * (1 + grade * t.tasteGradeFactor) + luckRate / 100;
}

/** 店主得到的神秘礼券 */
export function tasteTickets(strength: number, ownerStar: number, rng: Rng): number {
  return rng.intMin1(Math.floor(strength / (10 * (ownerStar === 0 ? 2 : 1))) + 1);
}

/** 不放回地随机取 n 个（不够时全取） */
export function pickSome<T>(items: readonly T[], n: number, rng: Rng): T[] {
  const arr = [...items];
  const k = Math.min(n, arr.length);
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(arr.length - i);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr.slice(0, k);
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/rules.test.ts`
Expected: PASS。若第二个 cookDish 用例的 `num` 因浮点差 1，先打印中间值核对公式（`base`、`ratio`、`cookNumRate`），**不要**改期望值去迁就——公式与本步骤代码一致时结果就是 3911

- [ ] **Step 5: 提交**

Run: `pnpm typecheck && pnpm test`
Expected: 全绿

```bash
git add apps/server/src/modules/mysterious
git commit -m "feat(mysterious): pure rules for grade, portions, value, proficiency, appraisal, lessons and tasting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 服务骨架——概览、鉴定、残卷、学习、目录、任务、路由

**Files:**
- Create: `apps/server/src/modules/mysterious/remnant.ts`、`service.ts`、`routes.ts`、`mysterious.test.ts`
- Create: `packages/shared/src/schemas/mysterious.ts`
- Modify: `packages/shared/src/index.ts`、`packages/shared/src/schemas/world.ts`
- Modify: `apps/server/src/core/features.ts`、`apps/server/src/game.ts`、`apps/server/src/modules/index.ts`、`apps/server/src/modules/world/service.ts`、`apps/server/src/modules/task/service.ts`

**Interfaces:**
- Consumes: Task 1 的 `GameConfig.mysterious / appraiseTools / mcProficiency / requireMc`、`GOODS.*`；Task 2 的表；Task 3 的 `appraisePick`、`appraiseRate`、`LEARN_REMNANTS`
- Produces:
  - `remnant.ts`：`remnantNum(op, mcId): Promise<number>`、`addRemnant(op, mcId, num, opts?: GainOptions): Promise<void>`、`subRemnant(op, mcId, num, opts?: GainOptions): Promise<void>`（不够时 `NOT_ENOUGH kind 'remnant' id=mcId`）
  - `service.ts`：`createMysteriousService(d: GameDeps, world: WorldService)`，返回对象含 `overview(ctx)`、`appraise(ctx, body)`、`sellRemnant(ctx, body)`、`decomposeRemnant(ctx, body)`、`learn(ctx, body)`；`type MysteriousService`；内部帮助函数 `mcOf(id): MysteriousCookbook`（未知 id → `NOT_FOUND {what:'mc'}`）、`badInput(reason): AppError`（`VALIDATION_FAILED {reason}`）——后续任务在同一文件里继续用
  - `Game.mysterious: MysteriousService`
  - shared：`appraiseBody`、`remnantBody`、`mcLearnBody`、`mcIdParam`、`McLearnedDto`、`McCookDto`、`McToolDto`、`McOverviewDto`、`AppraiseResultDto`；`CatalogDto.mysterious?: CatalogMcDto[]`
  - 任务状态键 `mc.learned`

- [ ] **Step 1: 接口类型**

`packages/shared/src/schemas/mysterious.ts`（本任务先写这些，后续任务往里追加）：

```ts
import { z } from 'zod';

const id = z.number().int().positive();
export const mcIdParam = z.object({ id: z.coerce.number().int().positive() });
export const appraiseBody = z.object({
  toolId: id,
  times: z.number().int().min(1).max(99),
  /** 勾选"低于 5 级不重抽" */
  noRetry: z.boolean().default(false),
});
export const remnantBody = z.object({ mcId: id, num: z.number().int().min(1).max(9999) });
export const mcLearnBody = z.object({ mcId: id });

export interface McLearnedDto {
  mcId: number;
  curlevel: number;
  levelName: string;
  /** 累计熟练度 */
  curexp: number;
  /** 升到下一级需要的累计熟练度；满级为 null */
  expNext: number | null;
  trialWorth: number;
  trialExp: number;
  /** 1 残卷 / 2 课程 / 3 偷学 */
  way: number;
}

export interface McCookDto {
  id: number;
  mcId: number;
  grade: number;
  totalNum: number;
  leftNum: number;
  /** 每份价值 */
  price: number;
  luck: boolean;
  eatCount: number;
  createdAt: string;
}

export interface McToolDto {
  goodsId: number;
  num: number;
  min: number;
  max: number;
  rate: number;
  /** 每次成功得到的残卷张数上限 */
  perNum: number;
}

export interface McOverviewDto {
  star: number;
  learned: McLearnedDto[];
  remnants: Array<{ mcId: number; num: number }>;
  current: McCookDto | null;
  /** 持有的神秘食谱数 */
  recipes: number;
  tools: McToolDto[];
  cookies: number;
  cookNums: number[];
  /** 有星神之书时鉴定会重抽 */
  starBook: boolean;
}

export interface AppraiseResultDto {
  results: Array<{ ok: boolean; mcId?: number; num?: number; blessed?: boolean; text?: string }>;
}
```

`packages/shared/src/index.ts` 末尾加 `export * from './schemas/mysterious';`。

`packages/shared/src/schemas/world.ts`：`CatalogDto` 的 `suits?` 下面加：

```ts
  /** 特色菜；旧缓存里没有 */
  mysterious?: CatalogMcDto[];
```

并在文件里加：

```ts
export interface CatalogMcDto {
  id: number;
  name: string;
  level: number;
  road: number;
  nutritive: number;
  coin: number;
  foods: number[];
}
```

- [ ] **Step 2: 写失败测试**

`apps/server/src/modules/mysterious/mysterious.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';

const config = testConfig();
let t: TestGame;
/** 固定随机数 0.99：概率判定一律失败 */
let unlucky: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  unlucky = await createTestGame({ rng: () => sequenceRng([0.99]) });
});
afterAll(async () => {
  await t.close();
  await unlucky.close();
});
const s = () => t.game.mysterious;
const remnantOf = async (restId: number, mcId: number) =>
  (
    await t.db
      .selectFrom('mc_remnant')
      .select('num')
      .where('rest_id', '=', restId)
      .where('mc_id', '=', mcId)
      .executeTakeFirst()
  )?.num ?? 0;
const giveRemnant = (ctx: RestCtx, mcId: number, num: number) =>
  t.db.insertInto('mc_remnant').values({ rest_id: ctx.restaurantId, mc_id: mcId, num }).execute();

describe('鉴定（规格书 04 §4.3）', () => {
  it('蟹黄堡秘方 100% 成功：3~5 级残卷，每次 1~2 张；扣神秘食谱和秘方；同一道菜只有一个事件', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 10, 165: 10 } });
    const r = await s().appraise(ctx, { toolId: 165, times: 10, noRetry: false });
    expect(r.data.results).toHaveLength(10);
    let total = 0;
    for (const x of r.data.results) {
      expect(x.ok).toBe(true);
      const lv = config.requireMc(x.mcId!).level;
      expect(lv).toBeGreaterThanOrEqual(3);
      expect(lv).toBeLessThanOrEqual(5);
      expect(x.num).toBeGreaterThanOrEqual(1);
      expect(x.num).toBeLessThanOrEqual(2);
      total += x.num!;
    }
    expect(await goodsNum(t, ctx.restaurantId, 162)).toBe(0);
    expect(await goodsNum(t, ctx.restaurantId, 165)).toBe(0);
    const gains = r.events.filter((e) => e.kind === 'remnant');
    expect(new Set(gains.map((e) => e.id)).size).toBe(gains.length);
    expect(gains.reduce((n, e) => n + e.num, 0)).toBe(total);
    const rows = await t.db.selectFrom('mc_remnant').select('num').where('rest_id', '=', ctx.restaurantId).execute();
    expect(rows.reduce((n, x) => n + x.num, 0)).toBe(total);
  });

  it('失败只扣道具，给一句文案', async () => {
    const ctx = await newRestaurant(unlucky, { patch: { star_level: 1 }, goods: { 162: 2, 163: 2 } });
    const r = await unlucky.game.mysterious.appraise(ctx, { toolId: 163, times: 2, noRetry: false });
    expect(r.data.results.every((x) => !x.ok && typeof x.text === 'string')).toBe(true);
    expect(await goodsNum(unlucky, ctx.restaurantId, 163)).toBe(0);
  });

  it('0 星报 REQUIREMENT_NOT_MET；不是鉴定道具报 VALIDATION_FAILED；神秘食谱不够时秘方也不扣', async () => {
    const zero = await newRestaurant(t, { goods: { 162: 1, 165: 1 } });
    await expect(s().appraise(zero, { toolId: 165, times: 1, noRetry: false })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 1, 165: 5 } });
    await expect(s().appraise(ctx, { toolId: 85, times: 1, noRetry: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'not_appraise_tool' },
    });
    await expect(s().appraise(ctx, { toolId: 165, times: 2, noRetry: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 162 },
    });
    expect(await goodsNum(t, ctx.restaurantId, 165)).toBe(5);
  });

  it('鉴定 99 次：流水条数不超过 残卷种数 + 2（Review Focus 4）', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 99, 165: 99 } });
    await s().appraise(ctx, { toolId: 165, times: 99, noRetry: false });
    const kinds = await t.db.selectFrom('mc_remnant').select('mc_id').where('rest_id', '=', ctx.restaurantId).execute();
    const ledger = await t.db.selectFrom('ledger').select('kind').where('rest_id', '=', ctx.restaurantId).execute();
    expect(ledger.length).toBeLessThanOrEqual(kinds.length + 2);
  });
});

describe('残卷', () => {
  it('出售得 单价×张数 银币；分解得同数量的对应等级碎片；不够时 NOT_ENOUGH remnant', async () => {
    const ctx = await newRestaurant(t, { patch: { coin: 0 } });
    await giveRemnant(ctx, 1, 5);
    const sold = await s().sellRemnant(ctx, { mcId: 1, num: 2 });
    expect(sold.data.coin).toBe(config.requireMc(1).coin * 2);
    expect((await restRow(t, ctx.restaurantId)).coin).toBe(config.requireMc(1).coin * 2);
    await s().decomposeRemnant(ctx, { mcId: 1, num: 3 });
    expect(await goodsNum(t, ctx.restaurantId, 180 + config.requireMc(1).level)).toBe(3);
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(0);
    await expect(s().sellRemnant(ctx, { mcId: 1, num: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'remnant', id: 1, need: 1, have: 0 },
    });
  });

  it('3 张学会：写入熟练度 1 级；学过再学报 mc_learned 且不扣残卷；未知特色菜 NOT_FOUND', async () => {
    const ctx = await newRestaurant(t);
    await giveRemnant(ctx, 1, 7);
    await s().learn(ctx, { mcId: 1 });
    const row = await t.db
      .selectFrom('rest_mc')
      .selectAll()
      .where('rest_id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ mc_id: 1, curlevel: 1, curexp: 0, way: 1 });
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(4);
    await expect(s().learn(ctx, { mcId: 1 })).rejects.toMatchObject({ params: { reason: 'mc_learned' } });
    expect(await remnantOf(ctx.restaurantId, 1)).toBe(4);
    await expect(s().learn(ctx, { mcId: 99999 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('概览、目录、任务、功能开关', () => {
  it('概览：已学（熟练度名称和下一级）、残卷、鉴定道具和持有数', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 2 }, goods: { 162: 3, 165: 1, 491: 4 } });
    await t.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: 2, way: 1 }).execute();
    await giveRemnant(ctx, 3, 2);
    const o = await s().overview(ctx);
    expect(o).toMatchObject({ star: 2, recipes: 3, cookies: 4, current: null, starBook: false });
    expect(o.learned).toEqual([
      { mcId: 2, curlevel: 1, levelName: '初学', curexp: 0, expNext: 200, trialWorth: 0, trialExp: 0, way: 1 },
    ]);
    expect(o.remnants).toEqual([{ mcId: 3, num: 2 }]);
    expect(o.tools.find((x) => x.goodsId === 165)).toEqual({ goodsId: 165, num: 1, min: 3, max: 5, rate: 1, perNum: 2 });
    expect(o.cookNums).toEqual([1, 5, 10, 15, 25, 50]);
  });

  it('目录带特色菜（名称、等级、道、食材）', () => {
    const m = t.game.world.catalog().mysterious!.find((x) => x.id === 1)!;
    expect(m).toMatchObject({ name: '秘·仿膳饽饽', level: 4, road: 1, foods: [390, 412, 261] });
  });

  it('主线第 22 步「鉴定一次神秘食谱」、第 23 步「学会一道特色菜」不再跳过', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1, main_task_step: 22 }, goods: { 162: 1, 165: 1 } });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 22, key: 'mc.appraise', done: false });
    await s().appraise(ctx, { toolId: 165, times: 1, noRetry: false });
    expect((await t.game.task.tasks(ctx)).main).toMatchObject({ step: 22, done: true });
    const ctx2 = await newRestaurant(t, { patch: { main_task_step: 23 } });
    await giveRemnant(ctx2, 1, 3);
    await s().learn(ctx2, { mcId: 1 });
    expect((await t.game.task.tasks(ctx2)).main).toMatchObject({ step: 23, key: 'mc.learned', progress: 1, done: true });
  });

  it('区服关闭 mysterious：接口报 FEATURE_DISABLED', async () => {
    const ctx = await newRestaurant(t, { patch: { star_level: 1 }, goods: { 162: 1, 165: 1 } });
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: ctx.shardId, override: JSON.stringify({ features: { mysterious: false } }) })
      .execute();
    t.game.shards.invalidate(ctx.shardId);
    await expect(s().overview(ctx)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(s().appraise(ctx, { toolId: 165, times: 1, noRetry: false })).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/mysterious.test.ts`
Expected: FAIL（`t.game.mysterious` 为 undefined）

- [ ] **Step 4: 实现残卷增减**

`apps/server/src/modules/mysterious/remnant.ts`：

```ts
import { sql } from 'kysely';
import { notEnough } from '../../core/errors';
import type { Op } from '../../core/op';
import { recordChange, type GainOptions } from '../../core/resources';

export async function remnantNum(op: Op, mcId: number): Promise<number> {
  const r = await op.tx
    .selectFrom('mc_remnant')
    .select('num')
    .where('rest_id', '=', op.rest.id)
    .where('mc_id', '=', mcId)
    .executeTakeFirst();
  return r?.num ?? 0;
}

export async function addRemnant(op: Op, mcId: number, num: number, opts: GainOptions = {}): Promise<void> {
  if (num <= 0) return;
  op.config.requireMc(mcId);
  await op.tx
    .insertInto('mc_remnant')
    .values({ rest_id: op.rest.id, mc_id: mcId, num })
    .onConflict((oc) => oc.columns(['rest_id', 'mc_id']).doUpdateSet({ num: sql<number>`mc_remnant.num + ${num}` }))
    .execute();
  recordChange(op, 'remnant', num, opts, mcId);
}

/** 扣残卷；扣到 0 删行 */
export async function subRemnant(op: Op, mcId: number, num: number, opts: GainOptions = {}): Promise<void> {
  if (num <= 0) return;
  const row = await op.tx
    .updateTable('mc_remnant')
    .set({ num: sql<number>`num - ${num}` })
    .where('rest_id', '=', op.rest.id)
    .where('mc_id', '=', mcId)
    .where('num', '>=', num)
    .returning('num')
    .executeTakeFirst();
  if (!row) throw notEnough('remnant', num, await remnantNum(op, mcId), mcId);
  if (row.num === 0)
    await op.tx.deleteFrom('mc_remnant').where('rest_id', '=', op.rest.id).where('mc_id', '=', mcId).execute();
  recordChange(op, 'remnant', -num, opts, mcId);
}
```

- [ ] **Step 5: 实现服务**

`apps/server/src/modules/mysterious/service.ts`：

```ts
import { GOODS, type MysteriousCookbook } from '@dt/config';
import {
  buildPool,
  ErrorCode,
  type AppraiseResultDto,
  type McCookDto,
  type McOverviewDto,
  type WeightedPool,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, runOp, type Op, type OpResult } from '../../core/op';
import { gainCoin } from '../../core/resources';
import type { McCookRow } from '../../db/schema';
import { AppError } from '../../http/errors';
import { consumeGoods, grantGoodsOp } from '../store/goods';
import type { WorldService } from '../world/service';
import { addRemnant, subRemnant } from './remnant';
import { appraisePick, appraiseRate, LEARN_REMNANTS } from './rules';

/** 鉴定失败的文案（规格书 04 §4.3） */
const FAIL_TEXTS = [
  '这只是一堆厕纸而已',
  '上面只有一些看不懂的涂鸦',
  '字迹被油渍糊住了，什么也看不清',
  '原来是一张过期的菜单',
];

export function badInput(reason: string): AppError {
  return new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });
}

export function cookDto(c: McCookRow): McCookDto {
  return {
    id: c.id,
    mcId: c.mc_id,
    grade: c.grade,
    totalNum: c.total_num,
    leftNum: c.left_num,
    price: c.price,
    luck: c.luck,
    eatCount: c.eat_count,
    createdAt: c.created_at.toISOString(),
  };
}

export function createMysteriousService(d: GameDeps, world: WorldService) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>): Promise<OpResult<T>> =>
    runOp(d, ctx, { feature: 'mysterious', source }, fn);

  function mcOf(id: number): MysteriousCookbook {
    const m = d.config.mysterious.get(id);
    if (!m) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'mc', id });
    return m;
  }

  const pools = new Map<string, WeightedPool<MysteriousCookbook>>();
  function poolOf(min: number, max: number): WeightedPool<MysteriousCookbook> {
    const key = `${min}-${max}`;
    let p = pools.get(key);
    if (!p) {
      p = buildPool(
        d.config.bundle.mysteriousCookbooks.filter((m) => m.appraisable && m.level >= min && m.level <= max),
        (m) => m.odds,
      );
      pools.set(key, p);
    }
    return p;
  }

  return {
    async overview(ctx: RestCtx): Promise<McOverviewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const rid = ctx.restaurantId;
      const rest = await d.db
        .selectFrom('restaurant')
        .select(['star_level', 'mc_cook_id'])
        .where('id', '=', rid)
        .executeTakeFirstOrThrow();
      const learned = await d.db.selectFrom('rest_mc').selectAll().where('rest_id', '=', rid).orderBy('mc_id').execute();
      const remnants = await d.db
        .selectFrom('mc_remnant')
        .select(['mc_id', 'num'])
        .where('rest_id', '=', rid)
        .orderBy('mc_id')
        .execute();
      const current =
        rest.mc_cook_id === null
          ? undefined
          : await d.db.selectFrom('mc_cook').selectAll().where('id', '=', rest.mc_cook_id).executeTakeFirst();
      const toolIds = [...d.config.appraiseTools.keys()];
      const held = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num', 'expires_at'])
        .where('rest_id', '=', rid)
        .where('goods_id', 'in', [...toolIds, GOODS.mysteryRecipe, GOODS.luckyCookie, GOODS.starBook])
        .execute();
      const now = d.now();
      const have = (id: number) => {
        const r = held.find((x) => x.goods_id === id);
        return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
      };
      return {
        star: rest.star_level,
        learned: learned.map((m) => {
          const p = d.config.mcProficiency[m.curlevel - 1];
          return {
            mcId: m.mc_id,
            curlevel: m.curlevel,
            levelName: p?.name ?? '',
            curexp: m.curexp,
            expNext: p?.expNext ?? null,
            trialWorth: m.trial_worth,
            trialExp: m.trial_exp,
            way: m.way,
          };
        }),
        remnants: remnants.map((r) => ({ mcId: r.mc_id, num: r.num })),
        current: current ? cookDto(current) : null,
        recipes: have(GOODS.mysteryRecipe),
        tools: toolIds.map((goodsId) => {
          const def = d.config.appraiseTools.get(goodsId)!;
          return { goodsId, num: have(goodsId), min: def.min, max: def.max, rate: def.rate, perNum: def.num };
        }),
        cookies: have(GOODS.luckyCookie),
        cookNums: s.tuning.mysterious.cookNums,
        starBook: have(GOODS.starBook) > 0,
      };
    },

    appraise(ctx: RestCtx, b: { toolId: number; times: number; noRetry: boolean }) {
      return op(ctx, 'mc.appraise', async (o): Promise<AppraiseResultDto> => {
        const def = o.config.appraiseTools.get(b.toolId);
        if (!def) throw badInput('not_appraise_tool');
        if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
        await consumeGoods(o, GOODS.mysteryRecipe, b.times);
        await consumeGoods(o, b.toolId, b.times);
        const agg = await opAgg(o);
        const { rate: luck } = await opLuck(o);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const rate = appraiseRate(def, (weather.starMCBookRate ?? 0) + (agg.starMCBookRate ?? 0), luck);
        const pool = poolOf(def.min, def.max);
        const retry = (agg.starMCBook ?? 0) > 0 && !b.noRetry;
        const results: AppraiseResultDto['results'] = [];
        const got = new Map<number, number>();
        for (let i = 0; i < b.times; i++) {
          if (!o.rng.chance(rate)) {
            results.push({ ok: false, text: FAIL_TEXTS[o.rng.int(FAIL_TEXTS.length)]! });
            continue;
          }
          const { mc, blessed } = appraisePick(pool, retry, o.tuning.mysterious, o.rng);
          const num = o.rng.intMin1(def.num);
          got.set(mc.id, (got.get(mc.id) ?? 0) + num);
          results.push({ ok: true, mcId: mc.id, num, blessed });
        }
        for (const [mcId, num] of got) await addRemnant(o, mcId, num);
        await emitAction(o, 'mc.appraise', b.times);
        return { results };
      });
    },

    sellRemnant(ctx: RestCtx, b: { mcId: number; num: number }) {
      return op(ctx, 'mc.remnant.sell', async (o) => {
        const mc = mcOf(b.mcId);
        await subRemnant(o, mc.id, b.num);
        const coin = mc.coin * b.num;
        gainCoin(o, coin);
        return { coin };
      });
    },

    decomposeRemnant(ctx: RestCtx, b: { mcId: number; num: number }) {
      return op(ctx, 'mc.remnant.decompose', async (o) => {
        const mc = mcOf(b.mcId);
        await subRemnant(o, mc.id, b.num);
        const goodsId = GOODS.fragmentBase + mc.level;
        await grantGoodsOp(o, goodsId, b.num);
        return { goodsId, num: b.num };
      });
    },

    learn(ctx: RestCtx, b: { mcId: number }) {
      return op(ctx, 'mc.learn', async (o) => {
        const mc = mcOf(b.mcId);
        const has = await o.tx
          .selectFrom('rest_mc')
          .select('mc_id')
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .executeTakeFirst();
        if (has) throw invalidState('mc_learned');
        await subRemnant(o, mc.id, LEARN_REMNANTS);
        await o.tx.insertInto('rest_mc').values({ rest_id: o.rest.id, mc_id: mc.id, way: 1, learned_at: o.now }).execute();
        restLog(o, 'mc.learn', { mcId: mc.id, via: 'remnant' });
        return { mcId: mc.id };
      });
    },
  };
}

export type MysteriousService = ReturnType<typeof createMysteriousService>;
```

注意：`mcOf` 在返回对象外定义；Task 5~7 往 `return { ... }` 里追加方法时直接调用 `mcOf`、`op`、`badInput`、`cookDto`。

- [ ] **Step 6: 路由、装配、功能、目录、任务状态**

`apps/server/src/modules/mysterious/routes.ts`：

```ts
import type { FastifyPluginAsync } from 'fastify';
import { appraiseBody, mcLearnBody, remnantBody } from '@dt/shared';
import { restCtxOf } from '../../core/deps';
import { ok, okOp } from '../../http/reply';
import { parse } from '../../http/validate';
import type { MysteriousService } from './service';

export function mysteriousRoutes(svc: MysteriousService): FastifyPluginAsync {
  return async (r) => {
    r.get('/mc', async (req) => ok(await svc.overview(restCtxOf(req))));
    r.post('/mc/appraise', async (req) => okOp(await svc.appraise(restCtxOf(req), parse(appraiseBody, req.body))));
    r.post('/mc/remnant/sell', async (req) =>
      okOp(await svc.sellRemnant(restCtxOf(req), parse(remnantBody, req.body))),
    );
    r.post('/mc/remnant/decompose', async (req) =>
      okOp(await svc.decomposeRemnant(restCtxOf(req), parse(remnantBody, req.body))),
    );
    r.post('/mc/learn', async (req) => okOp(await svc.learn(restCtxOf(req), parse(mcLearnBody, req.body))));
  };
}
```

`apps/server/src/modules/index.ts`：import `mysteriousRoutes`，在 `equipRoutes` 那一行后面加 `app.register(mysteriousRoutes(game.mysterious), { prefix: '/api/v1' });`

`apps/server/src/game.ts`：import `createMysteriousService, type MysteriousService`；`Game` 接口加 `mysterious: MysteriousService;`；返回对象加 `mysterious: createMysteriousService(deps, world),`

`apps/server/src/core/features.ts`：`IMPLEMENTED_FEATURES` 在 `'equip',` 后加 `'mysterious',`

`apps/server/src/modules/world/service.ts` 的 `catalog()`：`suits: ...` 后加：

```ts
        mysterious: d.config.bundle.mysteriousCookbooks.map((m) => ({
          id: m.id,
          name: m.name,
          level: m.level,
          road: m.road,
          nutritive: m.nutritive,
          coin: m.coin,
          foods: m.foods,
        })),
```

`apps/server/src/modules/task/service.ts` 的 `snapshot`：在 `maxStress` 查询后加：

```ts
    const mcLearned = await db
      .selectFrom('rest_mc')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('rest_id', '=', rest.id)
      .executeTakeFirstOrThrow();
```

`extra` 里加 `'mc.learned': Number(mcLearned.n),`

- [ ] **Step 7: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious`
Expected: PASS（rules + mysterious 两个文件）

- [ ] **Step 8: 全量测试并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server packages/shared
git commit -m "feat(mysterious): overview, appraisal with star-book retry, remnant sell / decompose / learn, catalog and tasks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 烹制、预览、倒掉、结算接入

**Files:**
- Create: `apps/server/src/modules/mysterious/cook.ts`、`apps/server/src/modules/mysterious/cook.test.ts`
- Create: `apps/server/src/modules/equip/power.ts`、`apps/server/src/modules/equip/power.test.ts`
- Modify: `apps/server/src/modules/mysterious/service.ts`、`routes.ts`
- Modify: `apps/server/src/modules/settlement/runner.ts`、`runner.test.ts`
- Modify: `packages/shared/src/schemas/mysterious.ts`

**Interfaces:**
- Consumes: Task 3 的 `cookDish`、`roadRate`、`addProficiency`、`bobChance`、`trialRestExp`；Task 4 的 `mcOf`、`op`、`badInput`、`cookDto`
- Produces:
  - `cook.ts`：`currentCook(op: Op): Promise<McCookRow | null>`、`endCook(op: Op, cookId: number, reason: 'sold' | 'dumped' | 'eaten'): Promise<void>`、`consumeSpecial(op: Op, cookId: number, n: number, reason: 'sold' | 'eaten'): Promise<number>`（返回剩余份数；`op` 必须是店主的 op）
  - `power.ts`：`restPower(db: Kysely<DB>, rest: RestaurantRow, suits: ReadonlyMap<number, SuitDef>): Promise<number>`
  - 服务：`preview(ctx, mcId): Promise<McPreviewDto>`、`cook(ctx, body): Promise<OpResult<CookResultDto>>`、`dump(ctx)`
  - shared：`mcCookBody`、`McPreviewDto`、`CookResultDto`

- [ ] **Step 1: 接口类型**

`packages/shared/src/schemas/mysterious.ts` 追加：

```ts
export const mcCookBody = z.object({
  mcId: id,
  cookNum: z.number().int().min(1).max(50),
  cookie: z.boolean().default(false),
});

export interface McPreviewDto {
  mcId: number;
  learned: boolean;
  /** 已经有在售的特色菜 */
  cooking: boolean;
  foods: Array<{ foodsId: number; have: number }>;
  cookNums: Array<{ n: number; ok: boolean }>;
  cookies: number;
}

export interface CookResultDto {
  cook: McCookDto;
  /** 本次增加的熟练度 */
  proficiency: number;
  curlevel: number;
  levelUp: boolean;
  /** 海绵宝宝点赞 */
  bob: boolean;
  /** 试炼经验带来的餐厅经验 */
  restExp: number;
}
```

- [ ] **Step 2: 写失败测试**

`apps/server/src/modules/equip/power.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { restPower } from './power';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('restPower（规格书 20 §20.18）', () => {
  it('厨力 = 五项之和 + ⌊幸运/2⌋，含穿戴的厨具', async () => {
    const ctx = await newRestaurant(t, { patch: { attr_cook: 10, attr_fire: 3, luck: 5 } });
    expect(await restPower(t.db, await restRow(t, ctx.restaurantId), t.deps.config.suits)).toBe(15);
    await t.db
      .insertInto('equip')
      .values({ rest_id: ctx.restaurantId, goods_id: 30, part: 1, worn: true, base_cook: 7 })
      .execute();
    expect(await restPower(t.db, await restRow(t, ctx.restaurantId), t.deps.config.suits)).toBe(22);
  });
});
```

`apps/server/src/modules/mysterious/cook.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, foodNum, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0.5：结果可复现 */
let fixed: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  fixed = await createTestGame({ rng: () => sequenceRng([0.5]) });
});
afterAll(async () => {
  await t.close();
  await fixed.close();
});

const MC = 1; // 秘·仿膳饽饽：4 级，食材 390、412、261
const foodsOf = (id: number) => config.requireMc(id).foods;
async function cookReady(g: TestGame, opts: { mcId?: number; star?: number; each?: number; goods?: Record<number, number> } = {}) {
  const mcId = opts.mcId ?? MC;
  const foods = Object.fromEntries(foodsOf(mcId).map((f) => [f, opts.each ?? 10]));
  const ctx = await newRestaurant(g, { patch: { star_level: opts.star ?? 1 }, foods, goods: opts.goods });
  await g.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: mcId, way: 1 }).execute();
  return ctx;
}
const cookRow = (g: TestGame, id: number) =>
  g.db.selectFrom('mc_cook').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('预览', () => {
  it('食材持有数和每个批数够不够', async () => {
    const ctx = await cookReady(t, { each: 7 });
    const p = await t.game.mysterious.preview(ctx, MC);
    expect(p).toMatchObject({ mcId: MC, learned: true, cooking: false, cookies: 0 });
    expect(p.foods).toEqual(foodsOf(MC).map((foodsId) => ({ foodsId, have: 7 })));
    expect(p.cookNums).toEqual([
      { n: 1, ok: true },
      { n: 5, ok: true },
      { n: 10, ok: false },
      { n: 15, ok: false },
      { n: 25, ok: false },
      { n: 50, ok: false },
    ]);
  });
});

describe('烹制（规格书 04 §4.5）', () => {
  it('扣每种食材 ×批数；写入在售批次和餐厅指针；新闻、活跃计数、熟练度', async () => {
    const ctx = await cookReady(t);
    const r = await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: false });
    for (const f of foodsOf(MC)) expect((await foodNum(t, ctx.restaurantId, f)).num).toBe(5);
    const c = await cookRow(t, r.data.cook.id);
    expect(c).toMatchObject({ rest_id: ctx.restaurantId, mc_id: MC, level: 4, cook_num: 5, ended_at: null });
    expect(c.left_num).toBe(c.total_num);
    expect(c.total_num).toBeGreaterThan(0);
    expect(c.price).toBeGreaterThan(0);
    expect((await restRow(t, ctx.restaurantId)).mc_cook_id).toBe(c.id);
    const news = await t.db.selectFrom('news').select('type').where('rest_id', '=', ctx.restaurantId).execute();
    expect(news.map((n) => n.type)).toContain('mc.cook');
    const counter = await t.db
      .selectFrom('event_counter')
      .select('count')
      .where('rest_id', '=', ctx.restaurantId)
      .where('key', '=', 'mc.cook')
      .executeTakeFirst();
    expect(counter?.count).toBe(1);
    const m = await t.db.selectFrom('rest_mc').selectAll().where('rest_id', '=', ctx.restaurantId).executeTakeFirstOrThrow();
    expect(m.curexp).toBe(r.data.proficiency);
  });

  it('批数不在列表 VALIDATION_FAILED；没学、0 星、已在售、食材不够都报错，且食材一个都不扣', async () => {
    const ctx = await cookReady(t, { each: 3 });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 3, cookie: false })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'cook_num' },
    });
    await expect(t.game.mysterious.cook(ctx, { mcId: 2, cookNum: 1, cookie: false })).rejects.toMatchObject({
      params: { reason: 'mc_not_learned' },
    });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: false })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'foods' },
    });
    for (const f of foodsOf(MC)) expect((await foodNum(t, ctx.restaurantId, f)).num).toBe(3);
    const zero = await cookReady(t, { star: 0 });
    await expect(t.game.mysterious.cook(zero, { mcId: MC, cookNum: 1, cookie: false })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star' },
    });
    await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false })).rejects.toMatchObject({
      params: { reason: 'mc_cooking' },
    });
    for (const f of foodsOf(MC)) expect((await foodNum(t, ctx.restaurantId, f)).num).toBe(2);
  });

  it('幸运饼干：每批扣 1 个；不够时报错', async () => {
    const ctx = await cookReady(t, { goods: { 491: 3 } });
    await expect(t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: true })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 491 },
    });
    await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: true });
    expect(await goodsNum(t, ctx.restaurantId, 491)).toBe(2);
  });

  it('烹饪魔书：随机一种非 7 级食材不扣（rng 0.5 → 第 2 种）', async () => {
    const ctx = await cookReady(fixed);
    await grantGoods(fixed.db, config, ctx.restaurantId, 346, 1, new Date());
    await fixed.game.mysterious.cook(ctx, { mcId: MC, cookNum: 5, cookie: false });
    const [a, b, c] = foodsOf(MC);
    expect((await foodNum(fixed, ctx.restaurantId, a!)).num).toBe(5);
    expect((await foodNum(fixed, ctx.restaurantId, b!)).num).toBe(10);
    expect((await foodNum(fixed, ctx.restaurantId, c!)).num).toBe(5);
  });

  it('6 级特色菜必得海绵宝宝；熟练度到 200 升到 2 级', async () => {
    const six = config.bundle.mysteriousCookbooks.find((m) => m.level === 6)!;
    const ctx = await cookReady(t, { mcId: six.id });
    await t.db.updateTable('rest_mc').set({ curexp: 199 }).where('rest_id', '=', ctx.restaurantId).execute();
    const r = await t.game.mysterious.cook(ctx, { mcId: six.id, cookNum: 1, cookie: false });
    expect(r.data.bob).toBe(true);
    expect(await goodsNum(t, ctx.restaurantId, 304)).toBe(1);
    expect(r.data).toMatchObject({ curlevel: 2, levelUp: true });
  });
});

describe('倒掉', () => {
  it('结束当前批次、清空指针；没有在售时报 no_cooking', async () => {
    const ctx = await cookReady(t);
    const r = await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false });
    await t.game.mysterious.dump(ctx);
    expect(await cookRow(t, r.data.cook.id)).toMatchObject({ end_reason: 'dumped' });
    expect((await restRow(t, ctx.restaurantId)).mc_cook_id).toBeNull();
    await expect(t.game.mysterious.dump(ctx)).rejects.toMatchObject({ params: { reason: 'no_cooking' } });
  });
});

describe('概览里的当前在售', () => {
  it('烹制后 current 有值', async () => {
    const ctx: RestCtx = await cookReady(t);
    await t.game.mysterious.cook(ctx, { mcId: MC, cookNum: 1, cookie: false });
    const o = await t.game.mysterious.overview(ctx);
    expect(o.current).toMatchObject({ mcId: MC });
  });
});
```

`apps/server/src/modules/settlement/runner.test.ts` 末尾加：

```ts
describe('特色菜（子项目 4A，规格书 01 §1.7）', () => {
  /** 桌桌坐满、没有挑剔顾客：每桌普通顾客吃 1 份 */
  const busy = { tuning: { rest: { atRateBase: 5, spRateBase: -5 } } };
  async function withDish(left: number) {
    const shardId = await createShard(t.db);
    await t.db.insertInto('shard_config').values({ shard_id: shardId, override: JSON.stringify(busy) }).execute();
    const ctx = await newRestaurant(t, { shardId, patch: { coin: 1000, oil: 100000, star_level: 1 } });
    const c = await t.db
      .insertInto('mc_cook')
      .values({ rest_id: ctx.restaurantId, shard_id: shardId, mc_id: 1, level: 4, grade: 3, cook_num: 1, total_num: left, left_num: left, price: 50 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db.updateTable('restaurant').set({ mc_cook_id: c.id }).where('id', '=', ctx.restaurantId).execute();
    return { shardId, ctx, cookId: c.id };
  }
  const cookOf = (id: number) => t.db.selectFrom('mc_cook').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  it('有在售时按顾客扣份数', async () => {
    const { shardId, cookId } = await withDish(1000);
    await settle(shardId);
    const c = await cookOf(cookId);
    expect(c.left_num).toBeLessThan(1000);
    expect(c.ended_at).toBeNull();
  });

  it('卖完：结束这批（sold）、清空餐厅指针', async () => {
    const { shardId, ctx, cookId } = await withDish(1);
    await settle(shardId);
    const c = await cookOf(cookId);
    expect(c).toMatchObject({ left_num: 0, end_reason: 'sold' });
    expect(c.ended_at).not.toBeNull();
    expect((await restRow(t, ctx.restaurantId)).mc_cook_id).toBeNull();
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/cook.test.ts src/modules/equip/power.test.ts src/modules/settlement/runner.test.ts`
Expected: FAIL（`restPower`、`preview`、`cook` 不存在；结算里 `left_num` 没变）

- [ ] **Step 4: 实现厨力**

`apps/server/src/modules/equip/power.ts`：

```ts
import type { Kysely } from 'kysely';
import type { SuitDef } from '@dt/config';
import type { DB, RestaurantRow } from '../../db/schema';
import { loadGems, pieceTotal } from './instances';
import { activeSuits, addAttrs, attrSummary, suitPct, zeroAttrs } from './rules';

/** 厨力（烹制份数、以后的厨塔都用）：加点 + 穿戴厨具（含宝石），乘套装百分比（规格书 20 §20.18） */
export async function restPower(
  db: Kysely<DB>,
  rest: RestaurantRow,
  suits: ReadonlyMap<number, SuitDef>,
): Promise<number> {
  const worn = await db.selectFrom('equip').selectAll().where('rest_id', '=', rest.id).where('worn', '=', true).execute();
  const gems = await loadGems(
    db,
    worn.map((w) => w.id),
  );
  const gear = worn.reduce((acc, e) => addAttrs(acc, pieceTotal(e, gems.get(e.id) ?? [])), zeroAttrs());
  const points = {
    cook: rest.attr_cook,
    cutting: rest.attr_cutting,
    fire: rest.attr_fire,
    season: rest.attr_season,
    creatives: rest.attr_creatives,
    luck: rest.luck,
  };
  const suitList = activeSuits(
    worn.map((w) => w.suit_id),
    suits,
  );
  return attrSummary(points, gear, suitPct(suitList)).power;
}
```

- [ ] **Step 5: 实现在售批次的公共操作**

`apps/server/src/modules/mysterious/cook.ts`：

```ts
import { sql } from 'kysely';
import { setRest, type Op } from '../../core/op';
import type { McCookRow } from '../../db/schema';

/** 这家店当前在售的批次 */
export async function currentCook(op: Op): Promise<McCookRow | null> {
  if (op.rest.mc_cook_id === null) return null;
  const r = await op.tx.selectFrom('mc_cook').selectAll().where('id', '=', op.rest.mc_cook_id).executeTakeFirst();
  return r ?? null;
}

/** 结束一批：写结束时间和原因，清空店主指针 */
export async function endCook(op: Op, cookId: number, reason: 'sold' | 'dumped' | 'eaten'): Promise<void> {
  await op.tx
    .updateTable('mc_cook')
    .set({ ended_at: op.now, end_reason: reason })
    .where('id', '=', cookId)
    .where('ended_at', 'is', null)
    .execute();
  if (op.rest.mc_cook_id === cookId) setRest(op, 'mc_cook_id', null);
}

/**
 * 扣份数（结算、品尝共用；op 是店主的 op，店已锁）：调用方保证 n ≤ 剩余份数。
 * 扣到 0 时结束这批。返回剩余份数
 */
export async function consumeSpecial(
  op: Op,
  cookId: number,
  n: number,
  reason: 'sold' | 'eaten',
): Promise<number> {
  const row = await op.tx
    .updateTable('mc_cook')
    .set({ left_num: sql<number>`left_num - ${n}` })
    .where('id', '=', cookId)
    .where('ended_at', 'is', null)
    .where('left_num', '>=', n)
    .returning('left_num')
    .executeTakeFirst();
  if (!row) throw new Error(`mc_cook ${cookId}: cannot take ${n} portions`);
  if (row.left_num === 0) await endCook(op, cookId, reason);
  return row.left_num;
}
```

- [ ] **Step 6: 实现预览、烹制、倒掉**

`apps/server/src/modules/mysterious/service.ts`：
- import 补充：`MysteriousCookbook` 已有；加 `type CookResultDto, type McPreviewDto`（`@dt/shared`）；`invalidState`、`restLog` 已有；`opNews, setRest`（`../../core/op`）；`gainExp`（`../../core/resources`）；`foodsMap, subFoods`（`../cupboard/foods`）；`hasValidHonor`（`../store/goods`）；`restPower`（`../equip/power`）；`currentCook, endCook`（`./cook`）；`addProficiency, bobChance, cookDish, roadRate, trialRestExp`（`./rules`）
- 在返回对象里（`learn` 之后）加：

```ts
    async preview(ctx: RestCtx, mcId: number): Promise<McPreviewDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const mc = mcOf(mcId);
      const rid = ctx.restaurantId;
      const learned = await d.db
        .selectFrom('rest_mc')
        .select('mc_id')
        .where('rest_id', '=', rid)
        .where('mc_id', '=', mc.id)
        .executeTakeFirst();
      const rest = await d.db.selectFrom('restaurant').select('mc_cook_id').where('id', '=', rid).executeTakeFirstOrThrow();
      const fm = await foodsMap(d.db, rid);
      const have = (f: number) => fm.get(f)?.num ?? 0;
      const cookie = await d.db
        .selectFrom('store_item')
        .select('num')
        .where('rest_id', '=', rid)
        .where('goods_id', '=', GOODS.luckyCookie)
        .executeTakeFirst();
      return {
        mcId: mc.id,
        learned: learned !== undefined,
        cooking: rest.mc_cook_id !== null,
        foods: mc.foods.map((foodsId) => ({ foodsId, have: have(foodsId) })),
        cookNums: s.tuning.mysterious.cookNums.map((n) => ({ n, ok: mc.foods.every((f) => have(f) >= n) })),
        cookies: cookie?.num ?? 0,
      };
    },

    cook(ctx: RestCtx, b: { mcId: number; cookNum: number; cookie: boolean }) {
      return op(ctx, 'mc.cook', async (o): Promise<CookResultDto> => {
        const t = o.tuning.mysterious;
        const mc = mcOf(b.mcId);
        if (!t.cookNums.includes(b.cookNum)) throw badInput('cook_num');
        if (o.rest.star_level < 1) throw requirement('star', { need: 1 });
        const row = await o.tx
          .selectFrom('rest_mc')
          .selectAll()
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .executeTakeFirst();
        if (!row) throw invalidState('mc_not_learned');
        if (o.rest.mc_cook_id !== null) throw invalidState('mc_cooking');
        const agg = await opAgg(o);
        const { rate: luck } = await opLuck(o);
        // 烹饪魔书：随机指定一种非 7 级食材不消耗
        const normal = mc.foods.filter((f) => o.config.requireFood(f).level < 7);
        const free = (agg.magicBook ?? 0) > 0 && normal.length > 0 ? normal[o.rng.int(normal.length)]! : null;
        for (const f of mc.foods) if (f !== free) await subFoods(o, f, b.cookNum);
        if (b.cookie) await consumeGoods(o, GOODS.luckyCookie, b.cookNum);
        const weather = (await world.ensure(o.shardId, o.now, o.tx)).weather.effects;
        const others = (
          await o.tx.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', o.rest.id).where('mc_id', '!=', mc.id).execute()
        ).flatMap((r) => {
          const m = o.config.mysterious.get(r.mc_id);
          return m ? [m] : [];
        });
        const out = cookDish(
          {
            mc,
            cookNum: b.cookNum,
            curlevel: row.curlevel,
            trialWorth: row.trial_worth,
            star: o.rest.star_level,
            luckRate: luck,
            goldRate: (agg.mcGoldRate ?? 0) + (weather.mcGoldRate ?? 0),
            numRate: (agg.mcNumRate ?? 0) + (weather.mcNumRate ?? 0),
            roadRate: roadRate(mc.road, others, t),
            power: await restPower(o.tx, o.rest, o.config.suits),
            coinAdd: agg.mcCoinAdd ?? 0,
            humanSon: await hasValidHonor(o, GOODS.humanSon),
            cookie: b.cookie,
          },
          t,
          o.rng,
        );
        const prof = addProficiency(row.curlevel, row.curexp, out.exp, o.config.mcProficiency);
        await o.tx
          .updateTable('rest_mc')
          .set({ curlevel: prof.curlevel, curexp: prof.curexp })
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .execute();
        if (prof.curlevel > row.curlevel) restLog(o, 'mc.levelUp', { mcId: mc.id, curlevel: prof.curlevel });
        const restExp = row.trial_exp > 0 ? trialRestExp(out.num, o.rest.level, row.trial_exp) : 0;
        if (restExp > 0) gainExp(o, restExp);
        const bob = o.rng.chance(bobChance(mc, b.cookNum, t));
        if (bob) await grantGoodsOp(o, GOODS.spongeBob, 1);
        const c = await o.tx
          .insertInto('mc_cook')
          .values({
            rest_id: o.rest.id,
            shard_id: o.shardId,
            mc_id: mc.id,
            level: mc.level,
            grade: out.grade,
            cook_num: b.cookNum,
            total_num: out.num,
            left_num: out.num,
            price: out.price,
            luck: out.luck,
            created_at: o.now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        setRest(o, 'mc_cook_id', c.id);
        await emitAction(o, 'mc.cook');
        opNews(o, 'mc.cook', { mcId: mc.id, grade: out.grade, num: out.num });
        return {
          cook: cookDto(c),
          proficiency: out.exp,
          curlevel: prof.curlevel,
          levelUp: prof.curlevel > row.curlevel,
          bob,
          restExp,
        };
      });
    },

    dump(ctx: RestCtx) {
      return op(ctx, 'mc.dump', async (o) => {
        const c = await currentCook(o);
        if (!c) throw invalidState('no_cooking');
        await endCook(o, c.id, 'dumped');
        return { id: c.id };
      });
    },
```

`routes.ts` 加（import `mcCookBody, mcIdParam`）：

```ts
    r.get('/mc/:id/preview', async (req) =>
      ok(await svc.preview(restCtxOf(req), parse(mcIdParam, req.params).id)),
    );
    r.post('/mc/cook', async (req) => okOp(await svc.cook(restCtxOf(req), parse(mcCookBody, req.body))));
    r.post('/mc/dump', async (req) => okOp(await svc.dump(restCtxOf(req))));
```

- [ ] **Step 7: 结算接入**

`apps/server/src/modules/settlement/runner.ts`：
- import 加 `import { consumeSpecial } from '../mysterious/cook';`
- `settleOne` 里 `const agg = await opAgg(op);` 之后加：

```ts
  // 当前在售的特色菜（规格书 01 §1.7）；没有在售的店不多查
  const cook =
    op.rest.mc_cook_id === null
      ? undefined
      : await op.tx
          .selectFrom('mc_cook')
          .select(['id', 'price', 'level', 'left_num'])
          .where('id', '=', op.rest.mc_cook_id)
          .executeTakeFirst();
```

- `input` 里 `special: null,` 改为：

```ts
    special: cook && cook.left_num > 0 ? { price: cook.price, level: cook.level, leftNum: cook.left_num } : null,
```

- 在 `for (const f of r.foodsUsed) ...` 之后、`for (const l of r.logs)` 之前加：

```ts
  if (cook && r.specialUsed > 0) await consumeSpecial(op, cook.id, r.specialUsed, 'sold');
```

- [ ] **Step 8: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious src/modules/equip/power.test.ts src/modules/settlement`
Expected: PASS

- [ ] **Step 9: 全量测试并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server packages/shared
git commit -m "feat(mysterious): cook with grade, portions, value, proficiency, magic book and SpongeBob; dump; settlement sells portions and ends sold-out batches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 好友品尝、好友详情的特色菜

**Files:**
- Create: `apps/server/src/modules/mysterious/taste.test.ts`
- Modify: `apps/server/src/modules/mysterious/service.ts`、`routes.ts`
- Modify: `apps/server/src/modules/friend/reads.ts`
- Modify: `packages/shared/src/schemas/mysterious.ts`、`packages/shared/src/schemas/friend.ts`
- Modify: `apps/web/src/views/FriendRestView.test.ts`（fixture 补 `special: null`，保持类型检查通过）

**Interfaces:**
- Consumes: Task 5 的 `currentCook`、`consumeSpecial`；`runPairOp`、`feedLog`、`isFriend`（`core/pair.ts`）；Task 3 的 `tasteStrength`、`tasteRecipeRate`、`tasteTickets`
- Produces:
  - 服务：`taste(ctx, { restId }): Promise<OpResult<TasteResultDto>>`
  - shared：`tasteBody`、`TasteResultDto { strength: number; recipe: boolean; left: number }`；`FriendRestDto.special: { mcId: number; grade: number; leftNum: number; price: number; eaten: boolean } | null`
  - 好友动态类型 `mc.eaten`（`{ mcId, portions }`）

- [ ] **Step 1: 接口类型**

`packages/shared/src/schemas/mysterious.ts` 追加：

```ts
export const tasteBody = z.object({ restId: id });

export interface TasteResultDto {
  /** 得到的体力 */
  strength: number;
  /** 得到了神秘食谱 */
  recipe: boolean;
  /** 这批剩余份数 */
  left: number;
}
```

`packages/shared/src/schemas/friend.ts` 的 `FriendRestDto` 在 `equips` 后加：

```ts
  /** 对方当前在售的特色菜（子项目 4A）；eaten = 这一批我已经吃过 */
  special: { mcId: number; grade: number; leftNum: number; price: number; eaten: boolean } | null;
```

`apps/web/src/views/FriendRestView.test.ts` 里构造 `FriendRestDto` 的 fixture 补 `special: null,`。

- [ ] **Step 2: 写失败测试**

`apps/server/src/modules/mysterious/taste.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundOf, sequenceRng } from '@dt/shared';
import { befriend, createTestGame, goodsNum, newPair, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { settleShardRound } from '../settlement/runner';

let t: TestGame;
/** 随机数固定 0：概率判定一律成功，礼券取 1 */
let lucky: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  lucky = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await lucky.close();
});

async function serve(g: TestGame, host: RestCtx, opts: { left?: number; price?: number; eatCount?: number } = {}) {
  const c = await g.db
    .insertInto('mc_cook')
    .values({
      rest_id: host.restaurantId,
      shard_id: host.shardId,
      mc_id: 1,
      level: 4,
      grade: 3,
      cook_num: 1,
      total_num: 500,
      left_num: opts.left ?? 500,
      price: opts.price ?? 157,
      eat_count: opts.eatCount ?? 0,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await g.db.updateTable('restaurant').set({ mc_cook_id: c.id, star_level: 2 }).where('id', '=', host.restaurantId).execute();
  return c.id;
}
const cookOf = (g: TestGame, id: number) => g.db.selectFrom('mc_cook').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('品尝（规格书 13 §13.6）', () => {
  it('好友：消耗 2 份，体力 = 每份价值；店主得礼券、好友动态；我概率得神秘食谱', async () => {
    const [me, host] = await newPair(lucky, { patch: { strength: 0 } });
    await befriend(lucky, me.restaurantId, host.restaurantId);
    const id = await serve(lucky, host);
    const r = await lucky.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(r.data).toEqual({ strength: 157, recipe: true, left: 498 });
    expect((await restRow(lucky, me.restaurantId)).strength).toBe(157);
    expect(await goodsNum(lucky, me.restaurantId, 162)).toBe(1);
    expect(await goodsNum(lucky, host.restaurantId, 1)).toBe(1);
    expect(await cookOf(lucky, id)).toMatchObject({ left_num: 498, eat_count: 1 });
    const feed = await lucky.db.selectFrom('rest_log').select('type').where('rest_id', '=', host.restaurantId).execute();
    expect(feed.map((x) => x.type)).toContain('mc.eaten');
  });

  it('非好友：消耗 1 份，体力减半', async () => {
    const [me, host] = await newPair(t, { patch: { strength: 0 } });
    await serve(t, host);
    const r = await t.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(r.data).toMatchObject({ strength: 78, left: 499 });
  });

  it('同一批只能吃一次；每天最多 2 次', async () => {
    const [me, h1] = await newPair(t);
    const h2 = await newRestaurant(t, { verified: true, shardId: me.shardId });
    const h3 = await newRestaurant(t, { verified: true, shardId: me.shardId });
    for (const h of [h1, h2, h3]) await serve(t, h);
    await t.game.mysterious.taste(me, { restId: h1.restaurantId });
    await expect(t.game.mysterious.taste(me, { restId: h1.restaurantId })).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'taste' },
    });
    await t.game.mysterious.taste(me, { restId: h2.restaurantId });
    await expect(t.game.mysterious.taste(me, { restId: h3.restaurantId })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'taste', max: 2 },
    });
  });

  it('第 21 次起没有奖励（店主不得礼券，我不得神秘食谱）', async () => {
    const [me, host] = await newPair(lucky);
    await serve(lucky, host, { eatCount: 20 });
    const r = await lucky.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(r.data.recipe).toBe(false);
    expect(await goodsNum(lucky, host.restaurantId, 1)).toBe(0);
  });

  it('吃完这批：结束（eaten）、清空店主指针；份数不够时报 NOT_ENOUGH portions', async () => {
    const [me, host] = await newPair(t);
    await befriend(t, me.restaurantId, host.restaurantId);
    const id = await serve(t, host, { left: 2 });
    await t.game.mysterious.taste(me, { restId: host.restaurantId });
    expect(await cookOf(t, id)).toMatchObject({ left_num: 0, end_reason: 'eaten' });
    expect((await restRow(t, host.restaurantId)).mc_cook_id).toBeNull();
    const [me2, host2] = await newPair(t);
    await befriend(t, me2.restaurantId, host2.restaurantId);
    await serve(t, host2, { left: 1 });
    await expect(t.game.mysterious.taste(me2, { restId: host2.restaurantId })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'portions' },
    });
  });

  it('对方打烊、没有在售、品尝自己都报错', async () => {
    const [me, host] = await newPair(t);
    await expect(t.game.mysterious.taste(me, { restId: host.restaurantId })).rejects.toMatchObject({
      params: { reason: 'target_no_special' },
    });
    await serve(t, host);
    await t.db.updateTable('restaurant').set({ state: 2 }).where('id', '=', host.restaurantId).execute();
    await expect(t.game.mysterious.taste(me, { restId: host.restaurantId })).rejects.toMatchObject({
      params: { reason: 'target_closed' },
    });
    await expect(t.game.mysterious.taste(me, { restId: me.restaurantId })).rejects.toMatchObject({
      params: { reason: 'target_self' },
    });
  });

  it('品尝后再结算：两边扣同一批不会扣成负数，卖完只结束一次（Review Focus 1）', async () => {
    const [me, host] = await newPair(t);
    await befriend(t, me.restaurantId, host.restaurantId);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: host.shardId, override: JSON.stringify({ tuning: { rest: { atRateBase: 5, spRateBase: -5 } } }) })
      .execute();
    t.game.shards.invalidate(host.shardId);
    await t.db.updateTable('restaurant').set({ oil: 100000 }).where('id', '=', host.restaurantId).execute();
    const id = await serve(t, host, { left: 3 });
    await t.game.mysterious.taste(me, { restId: host.restaurantId });
    await settleShardRound(t.game.deps, t.game.world, host.shardId, roundOf(new Date()), new Date());
    expect(await cookOf(t, id)).toMatchObject({ left_num: 0, end_reason: 'sold' });
    expect((await restRow(t, host.restaurantId)).mc_cook_id).toBeNull();
  });
});

describe('好友详情显示对方特色菜', () => {
  it('special 带品级、剩余、每份价值和我吃没吃过', async () => {
    const [me, host] = await newPair(t);
    await serve(t, host);
    expect((await t.game.social.reads.detail(me, host.restaurantId)).special).toMatchObject({
      mcId: 1,
      grade: 3,
      leftNum: 500,
      price: 157,
      eaten: false,
    });
    await t.game.mysterious.taste(me, { restId: host.restaurantId });
    expect((await t.game.social.reads.detail(me, host.restaurantId)).special?.eaten).toBe(true);
    const other = await newRestaurant(t, { shardId: me.shardId });
    expect((await t.game.social.reads.detail(me, other.restaurantId)).special).toBeNull();
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/taste.test.ts`
Expected: FAIL（`taste` 不存在、`special` 为 undefined）

- [ ] **Step 4: 实现品尝**

`apps/server/src/modules/mysterious/service.ts`：
- import 补充：加 `gameDay, gameTime, type TasteResultDto`（`@dt/shared`）；`limitReached, notEnough`（`../../core/errors`）；`feedLog, isFriend, runPairOp`（`../../core/pair`）；`gainStrength`（`../../core/resources`）；`consumeSpecial`（`./cook`）；`tasteRecipeRate, tasteStrength, tasteTickets`（`./rules`）
- 返回对象里加：

```ts
    taste(ctx: RestCtx, b: { restId: number }) {
      return runPairOp(
        d,
        ctx,
        b.restId,
        { feature: 'mysterious', source: 'mc.taste', friend: 'none' },
        async (p): Promise<TasteResultDto> => {
          const t = p.me.tuning.mysterious;
          if (p.them.rest.state !== 1) throw invalidState('target_closed');
          const c = await currentCook(p.them);
          if (!c) throw invalidState('target_no_special');
          const dayStart = gameTime(gameDay(p.me.now), 0);
          const today = await p.me.tx
            .selectFrom('mc_eat')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('eater_rest_id', '=', p.me.rest.id)
            .where('eaten_at', '>=', dayStart)
            .executeTakeFirstOrThrow();
          const again = await p.me.tx
            .selectFrom('mc_eat')
            .select('cook_id')
            .where('cook_id', '=', c.id)
            .where('eater_rest_id', '=', p.me.rest.id)
            .executeTakeFirst();
          if (again) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'taste' });
          if (Number(today.n) >= t.tasteDaily) throw limitReached('taste', { max: t.tasteDaily });
          const friend = await isFriend(p.me.tx, p.me.rest.id, p.them.rest.id);
          const portions = friend ? 2 : 1;
          if (c.left_num < portions) throw notEnough('portions', portions, c.left_num);
          await p.me.tx.insertInto('mc_eat').values({ cook_id: c.id, eater_rest_id: p.me.rest.id, eaten_at: p.me.now }).execute();
          const eatCount = c.eat_count + 1;
          await p.me.tx.updateTable('mc_cook').set({ eat_count: eatCount }).where('id', '=', c.id).execute();
          const left = await consumeSpecial(p.them, c.id, portions, 'eaten');
          const strength = tasteStrength(c.price, friend);
          gainStrength(p.me, strength);
          let recipe = false;
          if (eatCount <= t.tasteAwardMax) {
            const { rate } = await opLuck(p.me);
            recipe = p.me.rng.chance(tasteRecipeRate(c.grade, rate, t));
            if (recipe) await grantGoodsOp(p.me, GOODS.mysteryRecipe, 1);
            const tickets = tasteTickets(strength, p.them.rest.star_level, p.me.rng);
            await grantGoodsOp(p.them, GOODS.mysteryTicket, tickets, { event: false });
          }
          feedLog(p, 'mc.eaten', { mcId: c.mc_id, portions });
          return { strength, recipe, left };
        },
      );
    },
```

检查顺序说明：先"这批吃过"再"今天次数"——同一批重复品尝时给出更准确的原因（测试第 3 个用例依赖这个顺序）。

`routes.ts` 加（import `tasteBody`）：

```ts
    r.post('/mc/taste', async (req) => okOp(await svc.taste(restCtxOf(req), parse(tasteBody, req.body))));
```

- [ ] **Step 5: 好友详情、好友动态**

`apps/server/src/modules/friend/reads.ts`：
- `FEED_TYPES` 在 `'thumb',` 后加 `'mc.eaten',` 和 `'lesson.taught',`（后者 Task 7 写入）
- `detail` 里 `equips` 查询之后加：

```ts
      const cook =
        r.mc_cook_id === null
          ? undefined
          : await d.db
              .selectFrom('mc_cook')
              .select(['id', 'mc_id', 'grade', 'left_num', 'price'])
              .where('id', '=', r.mc_cook_id)
              .executeTakeFirst();
      const ate = cook
        ? await d.db
            .selectFrom('mc_eat')
            .select('cook_id')
            .where('cook_id', '=', cook.id)
            .where('eater_rest_id', '=', ctx.restaurantId)
            .executeTakeFirst()
        : undefined;
```

- 返回对象 `equips: ...` 后加：

```ts
        special: cook
          ? { mcId: cook.mc_id, grade: cook.grade, leftNum: cook.left_num, price: cook.price, eaten: ate !== undefined }
          : null,
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious src/modules/friend`
Expected: PASS

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server packages/shared apps/web/src/views/FriendRestView.test.ts
git commit -m "feat(mysterious): friends and visitors taste the special dish for strength, recipe drops and host tickets; friend page shows it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 教室——开课、学习、偷学（遗忘）、强制结束、课程列表

**Files:**
- Create: `apps/server/src/modules/mysterious/lesson.ts`、`apps/server/src/modules/mysterious/lesson.test.ts`
- Modify: `apps/server/src/modules/mysterious/service.ts`（返回对象展开 lesson 的方法）、`routes.ts`
- Modify: `apps/server/src/modules/cookbook/rules.ts`、`apps/server/src/modules/cookbook/rules.test.ts`（如无该文件则新建测试文件同名）
- Modify: `packages/shared/src/schemas/mysterious.ts`

**Interfaces:**
- Consumes: Task 3 的 `learnRate`、`stealRate`、`forgetCount`、`forgetMcChance`、`teacherStar`、`studentStar`、`pickSome`；Task 4 的 `subRemnant`、`badInput`；`runOp`、`runPairOp`、`feedLog`；`normalizeCounts`（`settlement/globals`）
- Produces:
  - `cookbook/rules.ts`：`applyForget(counts: CookbookCounts, streetId: number, from: number): CookbookCounts`
  - `lesson.ts`：`createLessonOps(d: GameDeps)`，返回 `{ lessons(ctx), openLesson(ctx, body), learnLesson(ctx, id, body), closeLesson(ctx) }`
  - shared：`lessonOpenBody`、`lessonLearnBody`、`lessonIdParam`、`LessonDto`、`LessonCertDto`、`LessonsDto`、`LessonLearnDto`
  - 好友动态 `lesson.taught`（`{ mcId, type, success }`）；个人日志 `mc.forget`（`{ cookbooks, mcId }`）；事件键 `lesson.start`、`lesson.learn`

- [ ] **Step 1: 接口类型**

`packages/shared/src/schemas/mysterious.ts` 追加：

```ts
export const lessonOpenBody = z.object({ mcId: id, certId: id });
export const lessonLearnBody = z.object({ type: z.union([z.literal(1), z.literal(2)]) });
export const lessonIdParam = z.object({ id: z.coerce.number().int().positive() });

export interface LessonDto {
  id: number;
  teacherId: number;
  teacherName: string;
  mcId: number;
  level: number;
  maxNum: number;
  learned: number;
  stolen: number;
  endsAt: string;
  /** 我已经试过这门课 */
  tried: boolean;
}

export interface LessonCertDto {
  goodsId: number;
  num: number;
  levels: number[];
  needStrength: number;
  maxNum: number;
  lessonHour: number;
}

export interface LessonsDto {
  items: LessonDto[];
  /** 我正在开的课 */
  mine: LessonDto | null;
  certs: LessonCertDto[];
  /** 持有百世之师，可以强制结束 */
  canForceClose: boolean;
  forceCloseCoinPerLevel: number;
  /** 偷学失败遗忘 等级×forgetPerLevel+1 道食谱 */
  forgetPerLevel: number;
}

export interface LessonLearnDto {
  success: boolean;
  /** 偷学失败时遗忘的普通食谱和特色菜 */
  forgot: { cookbooks: number[]; mcId: number | null };
}
```

- [ ] **Step 2: 写失败测试**

在 `apps/server/src/modules/cookbook/rules.test.ts`（已有就追加；没有就新建，头部 `import { describe, expect, it } from 'vitest';`）加：

```ts
import { applyForget } from './rules';

describe('applyForget（设计文档 裁定 9）', () => {
  it('学会数 -1、原品级计数 -1、街道计数 -1', () => {
    const c = applyForget({ learned: 3, grade: [0, 1, 2, 0], street: { '5': 2, '6': 1 } }, 5, 2);
    expect(c).toEqual({ learned: 2, grade: [0, 1, 1, 0], street: { '5': 1, '6': 1 } });
  });
});
```

`apps/server/src/modules/mysterious/lesson.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sequenceRng } from '@dt/shared';
import { testConfig } from '../../../test/config';
import { createTestGame, goodsNum, newRestaurant, restRow, type TestGame } from '../../../test/game';
import type { RestCtx } from '../../core/deps';
import { grantGoods } from '../store/grant';

const config = testConfig();
let t: TestGame;
/** 随机数固定 0：学 / 偷都成功 */
let win: TestGame;
beforeAll(async () => {
  t = await createTestGame();
  win = await createTestGame({ rng: () => sequenceRng([0]) });
});
afterAll(async () => {
  await t.close();
  await win.close();
});

const lvl = (n: number) => config.bundle.mysteriousCookbooks.filter((m) => m.level === n);
const MC3 = lvl(3)[0]!; // 3 级：中级教师证 178 能开
const MC4 = lvl(4)[0]!;
const cookbookIds = (n: number) => Object.fromEntries(config.cookbookIndex.allIds.slice(0, n).map((id) => [id, 1]));

async function teacher(g: TestGame, mcId: number, patch: Record<string, number> = {}): Promise<RestCtx> {
  const ctx = await newRestaurant(g, {
    verified: true,
    patch: { star_level: 2, strength: 500, ...patch },
    goods: { 177: 1, 178: 1, 179: 1 },
  });
  await g.db.insertInto('rest_mc').values({ rest_id: ctx.restaurantId, mc_id: mcId, way: 1 }).execute();
  await g.db.insertInto('mc_remnant').values({ rest_id: ctx.restaurantId, mc_id: mcId, num: 2 }).execute();
  return ctx;
}
async function student(g: TestGame, shardId: number, level: number, patch: Record<string, number> = {}): Promise<RestCtx> {
  return newRestaurant(g, {
    shardId,
    verified: true,
    cookbooks: cookbookIds(level * 10),
    patch: { star_level: 3, strength: 500, coin: 10_000_000, ...patch },
    goods: { [180 + level]: 10 },
  });
}
const lessonRow = (g: TestGame, id: number) =>
  g.db.selectFrom('mc_lesson').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

describe('开课（规格书 04 §4.7）', () => {
  it('扣残卷 1、教师证 1、体力；课程按教师证的时长和人数；列表里能看到', async () => {
    const tc = await teacher(t, MC3.id);
    const r = await t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    const l = await lessonRow(t, r.data.id);
    expect(l).toMatchObject({ teacher_rest_id: tc.restaurantId, mc_id: MC3.id, level: 3, max_num: 5, closed_at: null });
    expect(l.ends_at.getTime() - t.clock.now.getTime()).toBe(24 * 3600_000);
    expect(await goodsNum(t, tc.restaurantId, 178)).toBe(0);
    expect((await restRow(t, tc.restaurantId)).strength).toBe(500 - 65);
    const list = await t.game.mysterious.lessons(tc);
    expect(list.mine).toMatchObject({ id: r.data.id, teacherId: tc.restaurantId });
    expect(list.certs.find((c) => c.goodsId === 177)).toMatchObject({ num: 1, levels: [1, 2] });
  });

  it('教师证等级不符、没学、星级不够、已有进行中的课都报错；过期的课自动关闭后可以再开（Review Focus 3）', async () => {
    const tc = await teacher(t, MC4.id);
    await expect(t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 177 })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { reason: 'cert_level' },
    });
    await expect(t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 })).rejects.toMatchObject({
      params: { reason: 'mc_not_learned' },
    });
    const low = await teacher(t, MC4.id, { star_level: 0 });
    await expect(t.game.mysterious.openLesson(low, { mcId: MC4.id, certId: 178 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'star', need: 1 },
    });
    const first = await t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
    await t.db.insertInto('store_item').values({ rest_id: tc.restaurantId, goods_id: 178, num: 1 }).execute();
    await expect(t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'lesson_open' },
    });
    await t.db.updateTable('mc_lesson').set({ ends_at: new Date(t.clock.now.getTime() - 1000) }).where('id', '=', first.data.id).execute();
    await t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
    expect((await lessonRow(t, first.data.id)).closed_at).not.toBeNull();
  });
});

describe('学习（规格书 04 §4.7）', () => {
  it('学成功：扣体力 50、学费 售价×3、碎片 2；老师得 售价×2 和碎片 1；学生学会（way 2，记老师）', async () => {
    const tc = await teacher(win, MC3.id);
    const { data } = await win.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    const st = await student(win, tc.shardId, 3);
    const teacherCoin = (await restRow(win, tc.restaurantId)).coin;
    const r = await win.game.mysterious.learnLesson(st, data.id, { type: 1 });
    expect(r.data.success).toBe(true);
    const s = await restRow(win, st.restaurantId);
    expect(s.strength).toBe(450);
    expect(s.coin).toBe(10_000_000 - MC3.coin * 3);
    expect(await goodsNum(win, st.restaurantId, 183)).toBe(8);
    expect((await restRow(win, tc.restaurantId)).coin).toBe(teacherCoin + MC3.coin * 2);
    expect(await goodsNum(win, tc.restaurantId, 183)).toBe(1);
    const m = await win.db.selectFrom('rest_mc').selectAll().where('rest_id', '=', st.restaurantId).executeTakeFirstOrThrow();
    expect(m).toMatchObject({ mc_id: MC3.id, way: 2, master_rest_id: tc.restaurantId });
    expect((await lessonRow(win, data.id)).learned).toBe(1);
    const feed = await win.db.selectFrom('rest_log').select('type').where('rest_id', '=', tc.restaurantId).execute();
    expect(feed.map((x) => x.type)).toContain('lesson.taught');
    await expect(win.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'ALREADY_DONE',
      params: { what: 'lesson' },
    });
  });

  it('碎片不够：报错，体力、学费没扣，老师什么也没拿到，没有学习记录', async () => {
    const tc = await teacher(t, MC3.id);
    const { data } = await t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    const st = await student(t, tc.shardId, 3);
    await t.db.deleteFrom('store_item').where('rest_id', '=', st.restaurantId).where('goods_id', '=', 183).execute();
    const before = (await restRow(t, tc.restaurantId)).coin;
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'NOT_ENOUGH',
      params: { kind: 'goods', id: 183 },
    });
    expect((await restRow(t, st.restaurantId)).strength).toBe(500);
    expect((await restRow(t, tc.restaurantId)).coin).toBe(before);
    expect(await t.db.selectFrom('mc_lesson_student').selectAll().where('lesson_id', '=', data.id).execute()).toEqual([]);
  });

  it('学自己的课、课满、偷学人数满、课程过期、普通食谱不够、4 级课特色菜不够都报错', async () => {
    const tc = await teacher(t, MC4.id);
    const { data } = await t.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
    await expect(t.game.mysterious.learnLesson(tc, data.id, { type: 1 })).rejects.toMatchObject({
      params: { reason: 'own_lesson' },
    });
    const st = await student(t, tc.shardId, 4);
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'mc_count', need: 4 },
    });
    const few = await student(t, tc.shardId, 1);
    await expect(t.game.mysterious.learnLesson(few, data.id, { type: 1 })).rejects.toMatchObject({
      params: { reason: 'cookbooks', need: 40 },
    });
    await t.db.updateTable('mc_lesson').set({ stolen: 2 }).where('id', '=', data.id).execute();
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 2 })).rejects.toMatchObject({
      params: { reason: 'steal_full' },
    });
    await t.db.updateTable('mc_lesson').set({ learned: 3 }).where('id', '=', data.id).execute();
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      code: 'LIMIT_REACHED',
      params: { what: 'lesson_full' },
    });
    await t.db.updateTable('mc_lesson').set({ learned: 0, stolen: 0, ends_at: new Date(t.clock.now.getTime() - 1000) }).where('id', '=', data.id).execute();
    await expect(t.game.mysterious.learnLesson(st, data.id, { type: 1 })).rejects.toMatchObject({
      params: { reason: 'lesson_over' },
    });
    expect((await t.game.mysterious.lessons(st)).items.some((x) => x.id === data.id)).toBe(false);
  });
});

describe('偷学失败的遗忘（设计文档 裁定 8、9）', () => {
  it('遗忘 等级×3+1 道普通食谱，计数跟着改；4 级课还可能遗忘一道更低级的特色菜，但不会是正在售卖的', async () => {
    // 抽随机数的顺序：偷学判定 0.9（失败）→ 13 次挑食谱 → 遗忘特色菜判定 0（中）→ 挑特色菜 0
    const g = await createTestGame({ rng: () => sequenceRng([0.9, ...Array<number>(13).fill(0), 0, 0]) });
    try {
      const tc = await teacher(g, MC4.id);
      const { data } = await g.game.mysterious.openLesson(tc, { mcId: MC4.id, certId: 178 });
      const st = await student(g, tc.shardId, 4);
      const [x, y] = lvl(1);
      const [z] = lvl(5);
      const [w] = lvl(6);
      for (const m of [x!, y!, z!, w!])
        await g.db.insertInto('rest_mc').values({ rest_id: st.restaurantId, mc_id: m.id, way: 1 }).execute();
      const c = await g.db
        .insertInto('mc_cook')
        .values({ rest_id: st.restaurantId, shard_id: st.shardId, mc_id: x!.id, level: 1, grade: 1, cook_num: 1, total_num: 10, left_num: 10, price: 5 })
        .returning('id')
        .executeTakeFirstOrThrow();
      await g.db.updateTable('restaurant').set({ mc_cook_id: c.id }).where('id', '=', st.restaurantId).execute();

      const r = await g.game.mysterious.learnLesson(st, data.id, { type: 2 });
      expect(r.data.success).toBe(false);
      expect(r.data.forgot.cookbooks).toHaveLength(13);
      expect(r.data.forgot.mcId).toBe(y!.id);
      const s = await restRow(g, st.restaurantId);
      expect(s.cookbook_counts.learned).toBe(40 - 13);
      const cb = await g.db.selectFrom('restaurant_cookbooks').select('levels').where('rest_id', '=', st.restaurantId).executeTakeFirstOrThrow();
      for (const id of r.data.forgot.cookbooks) expect(cb.levels[id]).toBe(0);
      const left = (await g.db.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', st.restaurantId).execute()).map((m) => m.mc_id);
      expect(left).toContain(x!.id);
      expect(left).not.toContain(y!.id);
      const logs = await g.db.selectFrom('rest_log').select('type').where('rest_id', '=', st.restaurantId).execute();
      expect(logs.map((l) => l.type)).toContain('mc.forget');
      expect((await lessonRow(g, data.id)).stolen).toBe(0);
    } finally {
      await g.close();
    }
  });
});

describe('强制结束', () => {
  it('持有百世之师且人满时花 等级×50000 银币结束；人没满、没有勋章都不行', async () => {
    const tc = await teacher(t, MC3.id, { coin: 1_000_000 });
    const { data } = await t.game.mysterious.openLesson(tc, { mcId: MC3.id, certId: 178 });
    await expect(t.game.mysterious.closeLesson(tc)).rejects.toMatchObject({
      code: 'REQUIREMENT_NOT_MET',
      params: { reason: 'statue', goodsId: 216 },
    });
    await grantGoods(t.db, config, tc.restaurantId, 216, 1, new Date());
    await expect(t.game.mysterious.closeLesson(tc)).rejects.toMatchObject({ params: { reason: 'lesson_not_full' } });
    await t.db.updateTable('mc_lesson').set({ learned: 5 }).where('id', '=', data.id).execute();
    await t.game.mysterious.closeLesson(tc);
    expect((await lessonRow(t, data.id)).closed_at).not.toBeNull();
    expect((await restRow(t, tc.restaurantId)).coin).toBe(1_000_000 - 3 * 50000);
    expect((await t.game.mysterious.lessons(tc)).canForceClose).toBe(true);
  });
});
```

- [ ] **Step 3: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/lesson.test.ts src/modules/cookbook`
Expected: FAIL（`applyForget`、`openLesson` 不存在）

- [ ] **Step 4: 实现 applyForget**

`apps/server/src/modules/cookbook/rules.ts` 在 `applyLearn` 之后加：

```ts
/** 遗忘一道已学食谱（偷学失败，子项目 4A 设计文档 裁定 9）：applyLearn 的反向 */
export function applyForget(counts: CookbookCounts, streetId: number, from: number): CookbookCounts {
  const c: CookbookCounts = {
    learned: Math.max(0, counts.learned - 1),
    grade: [...counts.grade],
    street: { ...counts.street },
  };
  c.grade[from] = Math.max(0, (c.grade[from] ?? 0) - 1);
  c.street[String(streetId)] = Math.max(0, (c.street[String(streetId)] ?? 0) - 1);
  return c;
}
```

- [ ] **Step 5: 实现教室**

`apps/server/src/modules/mysterious/lesson.ts`：

```ts
import { GOODS } from '@dt/config';
import { ErrorCode, type LessonDto, type LessonLearnDto, type LessonsDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState, limitReached, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, runOp, setRest, type Op } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainCoin, spendCoin, spendStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { applyForget } from '../cookbook/rules';
import { normalizeCounts } from '../settlement/globals';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { subRemnant } from './remnant';
import {
  forgetCount,
  forgetMcChance,
  learnRate,
  pickSome,
  stealRate,
  studentStar,
  teacherStar,
} from './rules';

const badInput = (reason: string) => new AppError(ErrorCode.VALIDATION_FAILED, 400, { reason });

/** 偷学失败：遗忘普通食谱，4 级起可能遗忘一道更低级的特色菜（正在售卖的除外） */
async function forget(o: Op, level: number): Promise<LessonLearnDto['forgot']> {
  const t = o.tuning.mysterious;
  const cb = await o.tx
    .selectFrom('restaurant_cookbooks')
    .select('levels')
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirstOrThrow();
  const levels = new Uint8Array(cb.levels);
  const learned: number[] = [];
  for (let id = 0; id < levels.length; id++) if (levels[id]! > 0 && o.config.cookbooks.has(id)) learned.push(id);
  const picks = pickSome(learned, forgetCount(level, t), o.rng);
  if (picks.length > 0) {
    let counts = normalizeCounts(o.rest.cookbook_counts);
    for (const id of picks) {
      counts = applyForget(counts, o.config.requireCookbook(id).streetId, levels[id]!);
      levels[id] = 0;
    }
    await o.tx
      .updateTable('restaurant_cookbooks')
      .set({ levels: Buffer.from(levels) })
      .where('rest_id', '=', o.rest.id)
      .execute();
    setRest(o, 'cookbook_counts', counts);
  }
  let mcId: number | null = null;
  if (o.rng.chance(forgetMcChance(level, t))) {
    const current =
      o.rest.mc_cook_id === null
        ? null
        : ((await o.tx.selectFrom('mc_cook').select('mc_id').where('id', '=', o.rest.mc_cook_id).executeTakeFirst())
            ?.mc_id ?? null);
    const cands = (await o.tx.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', o.rest.id).orderBy('mc_id').execute())
      .map((r) => r.mc_id)
      .filter((id) => id !== current && (o.config.mysterious.get(id)?.level ?? Infinity) < level);
    if (cands.length > 0) {
      mcId = cands[o.rng.int(cands.length)]!;
      await o.tx.deleteFrom('rest_mc').where('rest_id', '=', o.rest.id).where('mc_id', '=', mcId).execute();
    }
  }
  restLog(o, 'mc.forget', { cookbooks: picks, mcId });
  return { cookbooks: picks, mcId };
}

export function createLessonOps(d: GameDeps) {
  return {
    async lessons(ctx: RestCtx): Promise<LessonsDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mysterious');
      const now = d.now();
      const rows = await d.db
        .selectFrom('mc_lesson as l')
        .innerJoin('restaurant as r', 'r.id', 'l.teacher_rest_id')
        .select(['l.id', 'l.teacher_rest_id', 'r.name', 'l.mc_id', 'l.level', 'l.max_num', 'l.learned', 'l.stolen', 'l.ends_at'])
        .where('l.shard_id', '=', ctx.shardId)
        .where('l.closed_at', 'is', null)
        .where('l.ends_at', '>', now)
        .orderBy('l.ends_at')
        .limit(200)
        .execute();
      const tried = new Set(
        rows.length === 0
          ? []
          : (
              await d.db
                .selectFrom('mc_lesson_student')
                .select('lesson_id')
                .where('rest_id', '=', ctx.restaurantId)
                .where(
                  'lesson_id',
                  'in',
                  rows.map((r) => r.id),
                )
                .execute()
            ).map((r) => r.lesson_id),
      );
      const items: LessonDto[] = rows.map((r) => ({
        id: r.id,
        teacherId: r.teacher_rest_id,
        teacherName: r.name,
        mcId: r.mc_id,
        level: r.level,
        maxNum: r.max_num,
        learned: r.learned,
        stolen: r.stolen,
        endsAt: r.ends_at.toISOString(),
        tried: tried.has(r.id),
      }));
      const certIds = [...d.config.teacherCerts.keys()];
      const held = await d.db
        .selectFrom('store_item')
        .select(['goods_id', 'num', 'expires_at'])
        .where('rest_id', '=', ctx.restaurantId)
        .where('goods_id', 'in', [...certIds, GOODS.hundredMaster])
        .execute();
      const have = (id: number) => {
        const r = held.find((x) => x.goods_id === id);
        return r && (r.expires_at === null || r.expires_at > now) ? r.num : 0;
      };
      return {
        items,
        mine: items.find((x) => x.teacherId === ctx.restaurantId) ?? null,
        certs: certIds.map((goodsId) => {
          const c = d.config.teacherCerts.get(goodsId)!;
          return { goodsId, num: have(goodsId), ...c };
        }),
        canForceClose: have(GOODS.hundredMaster) > 0,
        forceCloseCoinPerLevel: s.tuning.mysterious.forceCloseCoinPerLevel,
        forgetPerLevel: s.tuning.mysterious.forgetPerLevel,
      };
    },

    openLesson(ctx: RestCtx, b: { mcId: number; certId: number }) {
      return runOp(d, ctx, { feature: 'mysterious', source: 'lesson.open' }, async (o) => {
        const mc = o.config.mysterious.get(b.mcId);
        if (!mc) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'mc', id: b.mcId });
        const cert = o.config.teacherCerts.get(b.certId);
        if (!cert) throw badInput('not_teacher_cert');
        if (!cert.levels.includes(mc.level)) throw badInput('cert_level');
        // 计划裁定 4：学生要锁老师的店做双店检查，老师也必须验证邮箱
        const acc = await o.tx
          .selectFrom('account')
          .select('email_verified_at')
          .where('id', '=', o.rest.account_id)
          .executeTakeFirstOrThrow();
        if (o.tuning.friend.requireVerifiedEmail && acc.email_verified_at === null)
          throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403, { who: 'me' });
        const learned = await o.tx
          .selectFrom('rest_mc')
          .select('mc_id')
          .where('rest_id', '=', o.rest.id)
          .where('mc_id', '=', mc.id)
          .executeTakeFirst();
        if (!learned) throw invalidState('mc_not_learned');
        const need = teacherStar(mc.level);
        if (o.rest.star_level < need) throw requirement('star', { need });
        // 过期没关闭的课补写 closed_at（设计文档 §4.6）
        await o.tx
          .updateTable('mc_lesson')
          .set({ closed_at: o.now })
          .where('teacher_rest_id', '=', o.rest.id)
          .where('closed_at', 'is', null)
          .where('ends_at', '<=', o.now)
          .execute();
        const open = await o.tx
          .selectFrom('mc_lesson')
          .select('id')
          .where('teacher_rest_id', '=', o.rest.id)
          .where('closed_at', 'is', null)
          .executeTakeFirst();
        if (open) throw limitReached('lesson_open');
        await subRemnant(o, mc.id, 1);
        await consumeGoods(o, b.certId, 1);
        spendStrength(o, cert.needStrength);
        const l = await o.tx
          .insertInto('mc_lesson')
          .values({
            shard_id: o.shardId,
            teacher_rest_id: o.rest.id,
            mc_id: mc.id,
            level: mc.level,
            max_num: cert.maxNum,
            ends_at: new Date(o.now.getTime() + cert.lessonHour * 3600_000),
            created_at: o.now,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await emitAction(o, 'lesson.start');
        return { id: l.id };
      });
    },

    async learnLesson(ctx: RestCtx, id: number, b: { type: 1 | 2 }) {
      const pre = await d.db
        .selectFrom('mc_lesson')
        .select(['teacher_rest_id', 'shard_id'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!pre || pre.shard_id !== ctx.shardId) throw invalidState('lesson_over');
      if (pre.teacher_rest_id === ctx.restaurantId) throw invalidState('own_lesson');
      return runPairOp(
        d,
        ctx,
        pre.teacher_rest_id,
        { feature: 'mysterious', source: 'lesson.learn', friend: 'none' },
        async (p): Promise<LessonLearnDto> => {
          const o = p.me;
          const t = o.tuning.mysterious;
          const l = await o.tx.selectFrom('mc_lesson').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
          if (!l || l.closed_at !== null || l.ends_at <= o.now) throw invalidState('lesson_over');
          const tried = await o.tx
            .selectFrom('mc_lesson_student')
            .select('lesson_id')
            .where('lesson_id', '=', id)
            .where('rest_id', '=', o.rest.id)
            .executeTakeFirst();
          if (tried) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'lesson' });
          const mine = await o.tx.selectFrom('rest_mc').select('mc_id').where('rest_id', '=', o.rest.id).execute();
          if (mine.some((m) => m.mc_id === l.mc_id)) throw invalidState('mc_learned');
          if (l.learned + l.stolen >= l.max_num) throw limitReached('lesson_full');
          if (b.type === 2 && l.stolen > 1) throw invalidState('steal_full');
          if (normalizeCounts(o.rest.cookbook_counts).learned < l.level * 10)
            throw requirement('cookbooks', { need: l.level * 10 });
          if (l.level >= 4 && mine.length < l.level) throw requirement('mc_count', { need: l.level });
          const needStar = studentStar(l.level);
          if (o.rest.star_level < needStar) throw requirement('star', { need: needStar });
          const mc = o.config.requireMc(l.mc_id);
          const agg = await opAgg(o);
          const { rate: luck } = await opLuck(o);
          const thinker = (agg.thinker ?? 0) > 0;
          let success: boolean;
          let forgot: LessonLearnDto['forgot'] = { cookbooks: [], mcId: null };
          if (b.type === 1) {
            spendStrength(o, t.learnStrength);
            spendCoin(o, Math.floor(mc.coin * t.tuitionTimes));
            await consumeGoods(o, GOODS.fragmentBase + mc.level, t.learnFragments);
            gainCoin(p.them, Math.floor(mc.coin * t.teacherShare), { event: false });
            await grantGoodsOp(p.them, GOODS.fragmentBase + mc.level, t.teacherFragments, { event: false });
            success = o.rng.chance(learnRate(thinker, luck, t)) || ((agg.magicLamp ?? 0) > 0 && o.rng.chance(0.5));
          } else {
            spendStrength(o, t.stealStrength);
            success = o.rng.chance(stealRate(l.level, thinker, luck, t));
            if (!success) forgot = await forget(o, l.level);
          }
          await o.tx
            .insertInto('mc_lesson_student')
            .values({ lesson_id: id, rest_id: o.rest.id, type: b.type, success, created_at: o.now })
            .execute();
          if (success) {
            await o.tx
              .insertInto('rest_mc')
              .values({ rest_id: o.rest.id, mc_id: l.mc_id, way: 1 + b.type, master_rest_id: l.teacher_rest_id, learned_at: o.now })
              .execute();
            await o.tx
              .updateTable('mc_lesson')
              .set(b.type === 1 ? { learned: l.learned + 1 } : { stolen: l.stolen + 1 })
              .where('id', '=', id)
              .execute();
            restLog(o, 'mc.learn', { mcId: l.mc_id, via: b.type === 1 ? 'lesson' : 'steal' });
            await emitAction(o, 'lesson.learn');
          }
          feedLog(p, 'lesson.taught', { mcId: l.mc_id, type: b.type, success });
          return { success, forgot };
        },
      );
    },

    closeLesson(ctx: RestCtx) {
      return runOp(d, ctx, { feature: 'mysterious', source: 'lesson.close' }, async (o) => {
        const l = await o.tx
          .selectFrom('mc_lesson')
          .selectAll()
          .where('teacher_rest_id', '=', o.rest.id)
          .where('closed_at', 'is', null)
          .where('ends_at', '>', o.now)
          .forUpdate()
          .executeTakeFirst();
        if (!l) throw invalidState('no_lesson');
        if (!(await hasValidHonor(o, GOODS.hundredMaster)))
          throw requirement('statue', { goodsId: GOODS.hundredMaster });
        if (l.learned + l.stolen < l.max_num) throw invalidState('lesson_not_full');
        spendCoin(o, l.level * o.tuning.mysterious.forceCloseCoinPerLevel);
        await o.tx.updateTable('mc_lesson').set({ closed_at: o.now }).where('id', '=', l.id).execute();
        return { id: l.id };
      });
    },
  };
}
```

`apps/server/src/modules/mysterious/service.ts`：import `createLessonOps`（`./lesson`）；把 `return { ... }` 改成先 `const lessons = createLessonOps(d);`，返回对象末尾加 `...lessons,`。

`routes.ts` 加（import `lessonIdParam, lessonLearnBody, lessonOpenBody`）：

```ts
    r.get('/mc/lessons', async (req) => ok(await svc.lessons(restCtxOf(req))));
    r.post('/mc/lesson/open', async (req) =>
      okOp(await svc.openLesson(restCtxOf(req), parse(lessonOpenBody, req.body))),
    );
    r.post('/mc/lesson/:id/learn', async (req) =>
      okOp(
        await svc.learnLesson(restCtxOf(req), parse(lessonIdParam, req.params).id, parse(lessonLearnBody, req.body)),
      ),
    );
    r.post('/mc/lesson/close', async (req) => okOp(await svc.closeLesson(restCtxOf(req))));
```

说明：`/mc/lessons` 与 `/mc/:id/preview` 层级不同，不会冲突。

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious src/modules/cookbook`
Expected: PASS。遗忘用例依赖"偷学判定 → 13 次挑食谱 → 特色菜判定 → 挑特色菜"的抽随机数顺序；若失败先核对 `learnLesson` 里偷学分支在判定前没有额外的 rng 调用

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server packages/shared
git commit -m "feat(mysterious): classroom lessons with teacher certificates, learning with tuition and fragments, stealing with recipe forgetting, force close

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 昨日特色菜冠军

**Files:**
- Create: `apps/server/src/modules/mysterious/jobs.ts`、`apps/server/src/modules/mysterious/jobs.test.ts`
- Modify: `apps/server/src/game.ts`

**Interfaces:**
- Consumes: `PeriodicJob`、`JobContext`（`core/jobs.ts`）；`runSystemOp`、`opNews`；`grantGoodsOp`
- Produces: `mysteriousJobs(d: GameDeps): PeriodicJob[]`（`name: 'mc-champion'`，`feature: 'mysterious'`）；`awardChampion(d, shardId, day, now): Promise<{ winners: number; value: number }>`

- [ ] **Step 1: 写失败测试**

`apps/server/src/modules/mysterious/jobs.test.ts`：

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, gameDay, gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, goodsNum, newRestaurant, type TestGame } from '../../../test/game';
import { awardChampion, mysteriousJobs } from './jobs';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

async function cooked(restId: number, shardId: number, at: Date, total: number, price: number) {
  await t.db
    .insertInto('mc_cook')
    .values({ rest_id: restId, shard_id: shardId, mc_id: 1, level: 4, grade: 3, cook_num: 1, total_num: total, left_num: 0, price, created_at: at, ended_at: at, end_reason: 'sold' })
    .execute();
}

describe('昨日特色菜冠军（规格书 16）', () => {
  it('只算昨天开始烹制的批次，取单批价值最高者，并列都给蟹黄堡秘方', async () => {
    const shardId = await createShard(t.db);
    const today = gameDay(new Date());
    const yesterday = addDays(today, -1);
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => newRestaurant(t, { shardId })));
    await cooked(a!.restaurantId, shardId, gameTime(yesterday, 10), 100, 10);
    await cooked(b!.restaurantId, shardId, gameTime(yesterday, 20), 50, 20);
    await cooked(c!.restaurantId, shardId, gameTime(yesterday, 11), 10, 10);
    await cooked(c!.restaurantId, shardId, gameTime(today, 1), 100000, 100);
    const r = await awardChampion(t.game.deps, shardId, today, gameTime(today, 9));
    expect(r).toEqual({ winners: 2, value: 1000 });
    expect(await goodsNum(t, a!.restaurantId, 165)).toBe(1);
    expect(await goodsNum(t, b!.restaurantId, 165)).toBe(1);
    expect(await goodsNum(t, c!.restaurantId, 165)).toBe(0);
    const news = await t.db.selectFrom('news').select('type').where('shard_id', '=', shardId).execute();
    expect(news.filter((n) => n.type === 'mc.champion')).toHaveLength(2);
  });

  it('昨天没人烹制时什么也不发；任务按区服功能 mysterious 调度、每天 9 点一个周期', async () => {
    const shardId = await createShard(t.db);
    const today = gameDay(new Date());
    expect(await awardChampion(t.game.deps, shardId, today, gameTime(today, 9))).toEqual({ winners: 0, value: 0 });
    const job = mysteriousJobs(t.game.deps)[0]!;
    expect(job).toMatchObject({ name: 'mc-champion', feature: 'mysterious' });
    const settings = await t.game.shards.settings(shardId);
    expect(job.period(gameTime(today, 10), settings)).toBe(`${today}@09`);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/jobs.test.ts`
Expected: FAIL，`Cannot find module './jobs'`

- [ ] **Step 3: 实现**

`apps/server/src/modules/mysterious/jobs.ts`：

```ts
import { sql } from 'kysely';
import { addDays, gameTime, latestSlot, parseSlotKey } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import type { PeriodicJob } from '../../core/jobs';
import { opNews, runSystemOp } from '../../core/op';
import { grantGoodsOp } from '../store/goods';

/** 昨日特色菜冠军（规格书 16，设计文档 §4.7）：day 为今天（区服时区），统计昨天开始烹制的批次 */
export async function awardChampion(
  d: GameDeps,
  shardId: number,
  day: string,
  now: Date,
): Promise<{ winners: number; value: number }> {
  const { tuning } = await d.shards.settings(shardId);
  const rows = await d.db
    .selectFrom('mc_cook')
    .select(['rest_id', sql<number>`max(total_num::float8 * price)`.as('v')])
    .where('shard_id', '=', shardId)
    .where('created_at', '>=', gameTime(addDays(day, -1), 0))
    .where('created_at', '<', gameTime(day, 0))
    .groupBy('rest_id')
    .execute();
  if (rows.length === 0) return { winners: 0, value: 0 };
  const top = Math.max(...rows.map((r) => Number(r.v)));
  const winners = rows.filter((r) => Number(r.v) === top).map((r) => r.rest_id);
  for (const restId of winners) {
    await runSystemOp(d, shardId, restId, { source: 'mc.champion', now }, async (op) => {
      await grantGoodsOp(op, tuning.mysterious.championGoodsId, 1);
      opNews(op, 'mc.champion', { value: top });
    });
  }
  return { winners: winners.length, value: top };
}

export function mysteriousJobs(d: GameDeps): PeriodicJob[] {
  return [
    {
      name: 'mc-champion',
      feature: 'mysterious',
      period: (now, s) => latestSlot(now, [s.tuning.mysterious.championHour]).key,
      run: ({ shardId, period, now }) => awardChampion(d, shardId, parseSlotKey(period).day, now),
    },
  ];
}
```

`apps/server/src/game.ts`：import `mysteriousJobs`；在 `jobs.push(...equipJobs(deps));` 后加 `jobs.push(...mysteriousJobs(deps));`

- [ ] **Step 4: 运行，确认通过**

Run: `pnpm --filter @dt/server exec vitest run src/modules/mysterious/jobs.test.ts`
Expected: PASS

- [ ] **Step 5: 全量测试并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/server
git commit -m "feat(mysterious): daily 9 o'clock champion job rewards yesterday's most valuable batch, ties all win

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 前端——接口、文案、目录、特色菜页、入口

**Files:**
- Modify: `apps/web/src/api/endpoints.ts`、`apps/web/src/i18n/zh-CN.ts`、`apps/web/src/stores/catalog.ts`、`apps/web/src/utils/events.ts`、`apps/web/src/utils/events.test.ts`、`apps/web/src/utils/feed.ts`、`apps/web/src/utils/feed.test.ts`、`apps/web/src/utils/labels.ts`、`apps/web/src/router.ts`、`apps/web/src/views/MoreView.vue`、`apps/web/src/views/MoreView.test.ts`
- Create: `apps/web/src/views/McView.vue`、`apps/web/src/views/McView.test.ts`

**Interfaces:**
- Consumes: Task 4~7 的 DTO 与接口路径
- Produces:
  - `endpoints.mc()`、`mcPreview(mcId)`、`mcAppraise(toolId, times, noRetry)`、`mcRemnantSell(mcId, num)`、`mcRemnantDecompose(mcId, num)`、`mcLearn(mcId)`、`mcCook(mcId, cookNum, cookie)`、`mcDump()`、`mcTaste(restId)`、`lessons()`、`lessonOpen(mcId, certId)`、`lessonLearn(id, type)`、`lessonClose()`
  - 目录 store：`mcMap`、`mcName(id)`、`mc(id)`
  - `ROAD_NAMES`（labels）
  - 路由 `/mc`、`/temple`、`/classroom`（后两个页面 Task 10 创建；本任务先只注册 `/mc`）

- [ ] **Step 1: 写失败测试**

`apps/web/src/utils/events.test.ts` 追加：

```ts
describe('特色菜（子项目 4A）', () => {
  const names = { goodsName: (id: number) => `道具${id}`, foodName: (id: number) => `食材${id}`, mcName: (id: number) => `秘·${id}` };
  it('残卷事件显示特色菜名', () => {
    expect(eventText({ type: 'gain', kind: 'remnant', id: 7, num: 2 }, names)).toBe('获得 秘·7残卷×2');
  });
  it('学会、遗忘的日志', () => {
    const at = '2026-09-30T00:00:00Z';
    expect(logText({ type: 'mc.learn', params: { mcId: 7, via: 'remnant' }, at } as never, names)).toBe('学会了特色菜「秘·7」');
    expect(logText({ type: 'mc.forget', params: { cookbooks: [1, 2, 3], mcId: 9 }, at } as never, names)).toBe(
      '偷学失败，遗忘了 3 道食谱和特色菜「秘·9」',
    );
  });
});
```

（`events.test.ts` 顶部已 import `eventText`；若没有 import `logText` 则补上。）

`apps/web/src/utils/feed.test.ts` 追加：

```ts
describe('特色菜动态', () => {
  const at = '2026-09-30T00:00:00Z';
  it('品尝、课堂', () => {
    expect(describeFeed({ type: 'mc.eaten', params: { byName: '甲', mcId: 1, portions: 2 }, at } as never, () => '')).toBe(
      '甲 品尝了你的特色菜',
    );
    expect(
      describeFeed({ type: 'lesson.taught', params: { byName: '甲', type: 2, success: true }, at } as never, () => ''),
    ).toBe('甲 在你的课上偷学成功');
    expect(
      describeFeed({ type: 'lesson.taught', params: { byName: '甲', type: 1, success: false }, at } as never, () => ''),
    ).toBe('甲 在你的课上没学会');
  });
});
```

`apps/web/src/views/MoreView.test.ts` 追加：

```ts
  it('有特色菜、神殿、教室入口', () => {
    useSessionStore().me = me('player');
    const text = mountView().text();
    for (const x of ['特色菜', '神殿', '教室']) expect(text).toContain(x);
  });
```

`apps/web/src/views/McView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import McView from './McView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    mc: vi.fn(),
    mcPreview: vi.fn(),
    mcCook: vi.fn(),
    mcDump: vi.fn(),
    mcLearn: vi.fn(),
    mcRemnantSell: vi.fn(),
    mcRemnantDecompose: vi.fn(),
  },
}));

const overview: McOverviewDto = {
  star: 1,
  learned: [{ mcId: 1, curlevel: 2, levelName: '入门', curexp: 300, expNext: 800, trialWorth: 0, trialExp: 0, way: 1 }],
  remnants: [
    { mcId: 3, num: 5 },
    { mcId: 4, num: 2 },
  ],
  current: null,
  recipes: 0,
  tools: [],
  cookies: 2,
  cookNums: [1, 5, 10],
  starBook: false,
};

function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: McView }] });
  return mount(McView, { global: { plugins: [router] } });
}

describe('McView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [
        { id: 390, name: '海参', level: 4, odds: 1, coin: 1, type: 0 },
        { id: 412, name: '渤海对虾', level: 4, odds: 1, coin: 1, type: 0 },
      ],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [
        { id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 31, coin: 38333, foods: [390, 412] },
        { id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 22, coin: 26944, foods: [] },
        { id: 4, name: '秘·芙蓉大虾', level: 5, road: 1, nutritive: 40, coin: 50278, foods: [] },
      ],
    } as never);
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(overview));
  });

  it('已学显示熟练度；烹制面板里食材不够的批数禁用；带饼干烹制后提示品级和份数', async () => {
    vi.mocked(endpoints.mcPreview).mockResolvedValue({
      mcId: 1,
      learned: true,
      cooking: false,
      foods: [
        { foodsId: 390, have: 7 },
        { foodsId: 412, have: 9 },
      ],
      cookNums: [
        { n: 1, ok: true },
        { n: 5, ok: true },
        { n: 10, ok: false },
      ],
      cookies: 2,
    });
    vi.mocked(endpoints.mcCook).mockResolvedValue({
      cook: { id: 9, mcId: 1, grade: 7, totalNum: 600, leftNum: 600, price: 70, luck: true, eatCount: 0, createdAt: '' },
      proficiency: 21,
      curlevel: 2,
      levelUp: false,
      bob: true,
      restExp: 0,
    });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="learned-1"]').text()).toContain('入门');
    await w.find('[data-testid="cook-1"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="cooknum-10"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="cookie"]').setValue(true);
    // 饼干只有 2 个：5 批也不能选
    expect(w.find('[data-testid="cooknum-5"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="cooknum-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcCook).toHaveBeenCalledWith(1, 1, true);
    const text = useToastStore().items.map((x) => x.text).join('|');
    expect(text).toContain('佳肴（幸运）');
    expect(text).toContain('600 份');
    expect(text).toContain('海绵宝宝');
  });

  it('在售卡片：倒掉要确认', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({
      ...structuredClone(overview),
      current: { id: 9, mcId: 1, grade: 3, totalNum: 600, leftNum: 120, price: 40, luck: false, eatCount: 1, createdAt: '' },
    });
    vi.mocked(endpoints.mcDump).mockResolvedValue({} as never);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="mc-current"]').text()).toContain('120');
    expect(w.find('[data-testid="cook-1"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="dump"]').trigger('click');
    expect(endpoints.mcDump).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="dump"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcDump).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('残卷：不到 3 张不能学；出售数量按输入（不超过持有）', async () => {
    vi.mocked(endpoints.mcRemnantSell).mockResolvedValue({ coin: 1 });
    const w = mountView();
    await flushPromises();
    expect(w.find('[data-testid="learn-4"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="learn-3"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="remnant-num-3"]').setValue('9');
    await w.find('[data-testid="sell-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcRemnantSell).toHaveBeenCalledWith(3, 5);
  });
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/views/McView.test.ts src/views/MoreView.test.ts src/utils/events.test.ts src/utils/feed.test.ts`
Expected: FAIL（`McView.vue` 不存在；文案未实现）

- [ ] **Step 3: 接口、目录、文案**

`apps/web/src/api/endpoints.ts`：类型 import 加 `AppraiseResultDto, CookResultDto, LessonLearnDto, LessonsDto, McOverviewDto, McPreviewDto, TasteResultDto`；`endpoints` 末尾加：

```ts
  mc: () => api.get<McOverviewDto>('/api/v1/mc'),
  mcPreview: (mcId: number) => api.get<McPreviewDto>(`/api/v1/mc/${mcId}/preview`),
  mcAppraise: (toolId: number, times: number, noRetry: boolean) =>
    api.post<AppraiseResultDto>('/api/v1/mc/appraise', { toolId, times, noRetry }),
  mcRemnantSell: (mcId: number, num: number) => api.post<{ coin: number }>('/api/v1/mc/remnant/sell', { mcId, num }),
  mcRemnantDecompose: (mcId: number, num: number) =>
    api.post<{ goodsId: number; num: number }>('/api/v1/mc/remnant/decompose', { mcId, num }),
  mcLearn: (mcId: number) => api.post<{ mcId: number }>('/api/v1/mc/learn', { mcId }),
  mcCook: (mcId: number, cookNum: number, cookie: boolean) =>
    api.post<CookResultDto>('/api/v1/mc/cook', { mcId, cookNum, cookie }),
  mcDump: () => api.post<{ id: number }>('/api/v1/mc/dump'),
  mcTaste: (restId: number) => api.post<TasteResultDto>('/api/v1/mc/taste', { restId }),
  lessons: () => api.get<LessonsDto>('/api/v1/mc/lessons'),
  lessonOpen: (mcId: number, certId: number) => api.post<{ id: number }>('/api/v1/mc/lesson/open', { mcId, certId }),
  lessonLearn: (id: number, type: 1 | 2) => api.post<LessonLearnDto>(`/api/v1/mc/lesson/${id}/learn`, { type }),
  lessonClose: () => api.post<{ id: number }>('/api/v1/mc/lesson/close'),
```

`apps/web/src/stores/catalog.ts`：
- import 加 `CatalogMcDto`
- state 加 `mcMap: new Map<number, CatalogMcDto>(),`
- `apply` 里加 `this.mcMap = new Map((c.mysterious ?? []).map((m) => [m.id, m]));`，`setNameResolver` 改为：

```ts
      setNameResolver({
        goodsName: (id) => this.goodsName(id),
        foodName: (id) => this.foodName(id),
        mcName: (id) => this.mcName(id),
      });
```

- actions 加：

```ts
    mcName(id: number): string {
      return this.mcMap.get(id)?.name ?? `特色菜${id}`;
    },
    mc(id: number): CatalogMcDto | undefined {
      return this.mcMap.get(id);
    },
```

`apps/web/src/i18n/zh-CN.ts`：
- `NameResolver` 加 `mcName(id: number): string;`，默认值 `names` 加 `mcName: (id) => \`特色菜${id}\``
- `KIND` 加 `portions: '份数',`
- `NOT_ENOUGH` 分支里 `what` 的计算改为：

```ts
    const what =
      kind === 'goods'
        ? names.goodsName(Number(params.id))
        : kind === 'foods'
          ? names.foodName(Number(params.id))
          : kind === 'remnant'
            ? `${names.mcName(Number(params.id))}残卷`
            : (KIND[kind] ?? '数量');
```

- `REQUIREMENT` 加 `mc_count: (p) => \`学会的特色菜不够（需要 ${String(p.need)} 道）\`,`
- `LIMIT` 加：

```ts
  taste: (p) => `今天已经品尝过 ${String(p.max)} 次了`,
  lesson_full: () => '这门课人满了',
  lesson_open: () => '你已经有一门进行中的课了',
```

- `STATE` 加：

```ts
  mc_cooking: '已经有在售的特色菜了，卖完或倒掉后再烹制',
  no_cooking: '现在没有在售的特色菜',
  mc_learned: '已经学会这道特色菜了',
  mc_not_learned: '还没学会这道特色菜',
  lesson_over: '这门课已经结束了',
  steal_full: '这门课偷学的人太多了',
  own_lesson: '不能学自己开的课',
  no_lesson: '你没有进行中的课',
  lesson_not_full: '人还没满，不能强制结束',
  target_no_special: '对方没有在售的特色菜',
```

- `ALREADY` 加 `taste: '这一批特色菜你已经吃过了',` 和 `lesson: '这门课你已经试过了',`

`apps/web/src/utils/labels.ts` 加：

```ts
/** 特色菜的道（规格书 04 §4.1） */
export const ROAD_NAMES = ['', '一道', '二道', '三道', '四道', '五道', '六道', '兽'];
```

`apps/web/src/utils/events.ts`：
- `Names` 加可选的 `mcName?(id: number): string;`，文件内加 `const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? \`特色菜${id}\`;`
- `eventText` 里 `what` 的判断加一支（放在 `foods` 之后）：

```ts
  else if (e.kind === 'remnant') what = `${mcNameOf(names, e.id ?? 0)}残卷×${formatNum(e.num)}`;
```

- `LOGS` 加：

```ts
  'mc.learn': (p, names) => `学会了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
  'mc.levelUp': (p, names) => `「${mcNameOf(names, n(p, 'mcId'))}」熟练度升到 ${n(p, 'curlevel')} 级`,
  'mc.forget': (p, names) => {
    const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
    return `偷学失败，遗忘了 ${k} 道食谱${p.mcId ? `和特色菜「${mcNameOf(names, n(p, 'mcId'))}」` : ''}`;
  },
```

`apps/web/src/utils/feed.ts` 的 `switch` 在 `case 'thumb':` 前加：

```ts
    case 'mc.eaten':
      return `${who} 品尝了你的特色菜`;
    case 'lesson.taught':
      if (!p.success) return `${who} 在你的课上${p.type === 2 ? '偷学失败' : '没学会'}`;
      return `${who} 在你的课上${p.type === 2 ? '偷学成功' : '学会了特色菜'}`;
```

- [ ] **Step 4: 特色菜页、路由、入口**

`apps/web/src/views/McView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { McOverviewDto, McPreviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';
import { GRADE_NAMES, ROAD_NAMES } from '../utils/labels';

const catalog = useCatalogStore();
const toast = useToastStore();
const o = ref<McOverviewDto | null>(null);
const preview = ref<McPreviewDto | null>(null);
const cookie = ref(false);
const qty = reactive<Record<number, number>>({});
const busy = ref(false);

async function load() {
  o.value = await endpoints.mc();
}
async function act(fn: () => Promise<unknown>, ok: string | null, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    if (ok) toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const dish = (id: number) => catalog.mc(id);
const nameOf = (id: number) => catalog.mcName(id);
/** 填的数超过持有时按持有算 */
const numOf = (mcId: number, max: number) => Math.max(1, Math.min(qty[mcId] ?? 1, max));
const learnedIds = computed(() => new Set(o.value?.learned.map((m) => m.mcId) ?? []));

async function openCook(mcId: number) {
  try {
    preview.value = await endpoints.mcPreview(mcId);
    cookie.value = false;
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
function cook(n: number) {
  const p = preview.value;
  if (!p) return;
  return act(
    async () => {
      const r = await endpoints.mcCook(p.mcId, n, cookie.value);
      const extra = [r.levelUp ? '熟练度升级了' : '', r.bob ? '海绵宝宝点了赞' : ''].filter(Boolean).join('，');
      toast.push(
        `烹制完成：${GRADE_NAMES[r.cook.grade]}${r.cook.luck ? '（幸运）' : ''} ${formatNum(r.cook.totalNum)} 份，每份 ${formatNum(r.cook.price)} 银币${extra ? `，${extra}` : ''}`,
      );
      preview.value = null;
    },
    null,
    '烹制失败',
  );
}
function dump() {
  if (!window.confirm('倒掉后剩下的份数全部作废，确定吗？')) return;
  return act(() => endpoints.mcDump(), '已倒掉', '倒掉失败');
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取特色菜失败'), 'danger')));
</script>

<template>
  <div v-if="o">
    <div class="d-flex align-items-center mb-2">
      <h5 class="mb-0 flex-fill">特色菜</h5>
      <RouterLink to="/temple" class="small me-2">神殿鉴定</RouterLink>
      <RouterLink to="/classroom" class="small">教室</RouterLink>
    </div>
    <p v-if="o.star < 1" class="small text-muted">1 星以后才能鉴定和烹制特色菜。</p>

    <div v-if="o.current" class="border rounded p-2 mb-2 small d-flex align-items-center" data-testid="mc-current">
      <div class="flex-fill">
        在售：<b>{{ nameOf(o.current.mcId) }}</b> {{ GRADE_NAMES[o.current.grade] }}{{ o.current.luck ? '（幸运）' : '' }}
        <div class="text-muted">
          剩余 {{ formatNum(o.current.leftNum) }} / {{ formatNum(o.current.totalNum) }} 份 · 每份
          {{ formatNum(o.current.price) }} 银币 · 被品尝 {{ o.current.eatCount }} 次
        </div>
      </div>
      <button class="btn btn-sm btn-outline-danger" data-testid="dump" :disabled="busy" @click="dump">倒掉</button>
    </div>

    <h6>已学（{{ o.learned.length }}）</h6>
    <div v-if="o.learned.length === 0" class="small text-muted mb-2">
      还没有学会特色菜：在神殿鉴定神秘食谱得到残卷，3 张残卷就能学会。
    </div>
    <div v-for="m in o.learned" :key="m.mcId" class="border-bottom py-1 small" :data-testid="`learned-${m.mcId}`">
      <div class="d-flex align-items-center">
        <div class="flex-fill">
          <b>{{ nameOf(m.mcId) }}</b>
          <span class="text-muted">
            {{ dish(m.mcId)?.level }} 级 · {{ ROAD_NAMES[dish(m.mcId)?.road ?? 0] }} · {{ m.levelName }}
          </span>
          <div class="progress mt-1" style="height: 6px">
            <div
              class="progress-bar bg-warning"
              :style="{ width: `${m.expNext ? Math.min(100, (m.curexp / m.expNext) * 100) : 100}%` }"
            ></div>
          </div>
          <div class="text-muted">
            熟练度 {{ formatNum(m.curexp) }}{{ m.expNext ? ` / ${formatNum(m.expNext)}` : '（满级）' }}
          </div>
        </div>
        <button
          class="btn btn-sm btn-primary ms-2"
          :data-testid="`cook-${m.mcId}`"
          :disabled="busy || o.current !== null || o.star < 1"
          @click="openCook(m.mcId)"
        >
          烹制
        </button>
      </div>
      <div v-if="preview && preview.mcId === m.mcId" class="bg-light rounded p-2 mt-1" data-testid="cook-panel">
        <div>
          食材：<span v-for="f in preview.foods" :key="f.foodsId" class="me-2"
            >{{ catalog.foodName(f.foodsId) }} {{ f.have }}</span
          >
        </div>
        <label class="d-block my-1">
          <input
            v-model="cookie"
            type="checkbox"
            class="form-check-input me-1"
            data-testid="cookie"
            :disabled="preview.cookies === 0"
          />用幸运饼干（每批 1 个，持有 {{ preview.cookies }}）
        </label>
        <div class="d-flex flex-wrap gap-1">
          <button
            v-for="c in preview.cookNums"
            :key="c.n"
            class="btn btn-sm btn-outline-primary"
            :data-testid="`cooknum-${c.n}`"
            :disabled="busy || !c.ok || (cookie && preview.cookies < c.n)"
            @click="cook(c.n)"
          >
            {{ c.n }} 批
          </button>
          <button class="btn btn-sm btn-link" @click="preview = null">取消</button>
        </div>
      </div>
    </div>

    <h6 class="mt-3">残卷</h6>
    <div v-if="o.remnants.length === 0" class="small text-muted">没有残卷</div>
    <div v-for="r in o.remnants" :key="r.mcId" class="d-flex align-items-center gap-1 border-bottom py-1 small">
      <div class="flex-fill">
        <b>{{ nameOf(r.mcId) }}</b> ×{{ r.num }}
        <span class="text-muted">{{ dish(r.mcId)?.level }} 级 · 单价 {{ formatNum(dish(r.mcId)?.coin ?? 0) }}</span>
      </div>
      <button
        class="btn btn-sm btn-outline-success"
        :data-testid="`learn-${r.mcId}`"
        :disabled="busy || r.num < 3 || learnedIds.has(r.mcId)"
        @click="act(() => endpoints.mcLearn(r.mcId), `学会了${nameOf(r.mcId)}`, '学习失败')"
      >
        {{ learnedIds.has(r.mcId) ? '已学' : '学习' }}
      </button>
      <input
        v-model.number="qty[r.mcId]"
        type="number"
        min="1"
        :max="r.num"
        class="form-control form-control-sm"
        style="width: 60px"
        :data-testid="`remnant-num-${r.mcId}`"
      />
      <button
        class="btn btn-sm btn-outline-secondary"
        :data-testid="`sell-${r.mcId}`"
        :disabled="busy"
        @click="act(() => endpoints.mcRemnantSell(r.mcId, numOf(r.mcId, r.num)), '已出售', '出售失败')"
      >
        出售
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :data-testid="`decompose-${r.mcId}`"
        :disabled="busy"
        @click="act(() => endpoints.mcRemnantDecompose(r.mcId, numOf(r.mcId, r.num)), '已分解', '分解失败')"
      >
        分解
      </button>
    </div>
  </div>
</template>
```

`apps/web/src/router.ts`：在 `/rest/gem` 路由之后加：

```ts
  {
    path: '/mc',
    name: 'mc',
    component: () => import('./views/McView.vue'),
    meta: { needRestaurant: true },
  },
```

`apps/web/src/views/MoreView.vue` 的 `base` 在 `{ to: '/shop', ... }` 后加：

```ts
  { to: '/mc', icon: 'bi-stars', label: '特色菜' },
  { to: '/temple', icon: 'bi-bank2', label: '神殿' },
  { to: '/classroom', icon: 'bi-easel', label: '教室' },
```

（`/temple`、`/classroom` 的页面在 Task 10 创建；在那之前这两个链接会被兜底路由重定向到首页，不影响本任务测试。）

- [ ] **Step 5: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/views/McView.test.ts src/views/MoreView.test.ts src/utils/events.test.ts src/utils/feed.test.ts`
Expected: PASS

- [ ] **Step 6: 全量测试并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/web
git commit -m "feat(web): mysterious dish page with cooking panel, dump, remnant learn / sell / decompose; texts, catalog names and entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 前端——神殿鉴定、教室、好友品尝

**Files:**
- Create: `apps/web/src/views/TempleView.vue`、`TempleView.test.ts`、`ClassroomView.vue`、`ClassroomView.test.ts`
- Modify: `apps/web/src/views/FriendRestView.vue`、`FriendRestView.test.ts`、`apps/web/src/router.ts`

**Interfaces:**
- Consumes: Task 9 的 `endpoints.mc / mcAppraise / lessons / lessonOpen / lessonLearn / lessonClose / mcTaste`、目录 `mcName / mc`

- [ ] **Step 1: 写失败测试**

`apps/web/src/views/TempleView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import TempleView from './TempleView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { mc: vi.fn(), mcAppraise: vi.fn() } }));

const overview: McOverviewDto = {
  star: 1,
  learned: [],
  remnants: [],
  current: null,
  recipes: 2,
  tools: [
    { goodsId: 163, num: 0, min: 1, max: 6, rate: 0.28, perNum: 1 },
    { goodsId: 165, num: 5, min: 3, max: 5, rate: 1, perNum: 2 },
  ],
  cookies: 0,
  cookNums: [1],
  starBook: true,
};

describe('TempleView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [{ id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 31, coin: 1, foods: [] }],
    } as never);
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(overview));
    vi.mocked(endpoints.mcAppraise).mockResolvedValue({
      results: [
        { ok: true, mcId: 1, num: 2, blessed: true },
        { ok: false, text: '这只是一堆厕纸而已' },
      ],
    });
  });

  it('默认选有货的道具；次数不超过 神秘食谱和道具的持有数；显示结果', async () => {
    const w = mount(TempleView);
    await flushPromises();
    expect((w.find('[data-testid="tool"]').element as HTMLSelectElement).value).toBe('165');
    expect(w.find('[data-testid="no-retry"]').exists()).toBe(true);
    await w.find('[data-testid="times"]').setValue('9');
    await w.find('[data-testid="appraise"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcAppraise).toHaveBeenCalledWith(165, 2, false);
    const text = w.find('[data-testid="results"]').text();
    expect(text).toContain('秘·仿膳饽饽 残卷 ×2（星神眷恋）');
    expect(text).toContain('这只是一堆厕纸而已');
  });
});
```

`apps/web/src/views/ClassroomView.test.ts`：

```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonsDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import ClassroomView from './ClassroomView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { lessons: vi.fn(), mc: vi.fn(), lessonOpen: vi.fn(), lessonLearn: vi.fn(), lessonClose: vi.fn() },
}));

const future = new Date(Date.now() + 5 * 3600_000).toISOString();
const lessons: LessonsDto = {
  items: [
    { id: 7, teacherId: 2, teacherName: '乙店', mcId: 3, level: 3, maxNum: 5, learned: 1, stolen: 0, endsAt: future, tried: false },
  ],
  mine: null,
  certs: [
    { goodsId: 177, num: 1, levels: [1, 2], needStrength: 50, maxNum: 5, lessonHour: 24 },
    { goodsId: 178, num: 1, levels: [3, 4], needStrength: 65, maxNum: 5, lessonHour: 24 },
  ],
  canForceClose: false,
  forceCloseCoinPerLevel: 50000,
  forgetPerLevel: 3,
};
const mc = { learned: [{ mcId: 1, curlevel: 1, levelName: '初学', curexp: 0, expNext: 200, trialWorth: 0, trialExp: 0, way: 1 }] } as McOverviewDto;

describe('ClassroomView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [
        { id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 31, coin: 1, foods: [] },
        { id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 22, coin: 1, foods: [] },
      ],
    } as never);
    vi.mocked(endpoints.lessons).mockResolvedValue(structuredClone(lessons));
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(mc));
  });

  it('偷学先确认（写明会遗忘几道食谱）；失败时提示遗忘了多少', async () => {
    vi.mocked(endpoints.lessonLearn).mockResolvedValue({ success: false, forgot: { cookbooks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mcId: null } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mount(ClassroomView);
    await flushPromises();
    await w.find('[data-testid="steal-7"]').trigger('click');
    expect(confirm.mock.calls[0]![0]).toContain('遗忘 10 道食谱');
    expect(endpoints.lessonLearn).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="steal-7"]').trigger('click');
    await flushPromises();
    expect(endpoints.lessonLearn).toHaveBeenCalledWith(7, 2);
    expect(useToastStore().items.some((x) => x.text.includes('遗忘了 10 道食谱'))).toBe(true);
    confirm.mockRestore();
  });

  it('开课：教师证只列等级合适且持有的', async () => {
    vi.mocked(endpoints.lessonOpen).mockResolvedValue({ id: 9 });
    const w = mount(ClassroomView);
    await flushPromises();
    await w.find('[data-testid="open-mc"]').setValue('1');
    const opts = w.findAll('[data-testid="open-cert"] option').map((o) => o.text());
    // 测试目录里没有道具，名字显示为「道具178」
    expect(opts.some((x) => x.includes('道具178'))).toBe(true);
    expect(opts.some((x) => x.includes('道具177'))).toBe(false);
    await w.find('[data-testid="open-cert"]').setValue('178');
    await w.find('[data-testid="open-lesson"]').trigger('click');
    await flushPromises();
    expect(endpoints.lessonOpen).toHaveBeenCalledWith(1, 178);
  });
});
```

`apps/web/src/views/FriendRestView.test.ts`：`vi.mock` 的 endpoints 里加 `mcTaste: vi.fn(),`；追加用例（文件里已有 `mountView()`（内部已 `await flushPromises()`）和 `detail()`）：

```ts
  it('对方有特色菜时可以品尝；吃过显示已品尝', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({ special: { mcId: 1, grade: 3, leftNum: 20, price: 40, eaten: false } }),
    );
    vi.mocked(endpoints.mcTaste).mockResolvedValue({ strength: 40, recipe: false, left: 18 });
    const w = await mountView();
    expect(w.find('[data-testid="friend-special"]').text()).toContain('剩 20 份');
    await w.find('[data-testid="act-taste"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcTaste).toHaveBeenCalledWith(2);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({ special: { mcId: 1, grade: 3, leftNum: 18, price: 40, eaten: true } }),
    );
    const w2 = await mountView();
    expect(w2.find('[data-testid="act-taste"]').attributes('disabled')).toBeDefined();
    expect(w2.find('[data-testid="act-taste"]').text()).toBe('已品尝');
  });
```

- [ ] **Step 2: 运行，确认失败**

Run: `pnpm --filter @dt/web exec vitest run src/views/TempleView.test.ts src/views/ClassroomView.test.ts src/views/FriendRestView.test.ts`
Expected: FAIL（页面不存在；好友页没有品尝卡片）

- [ ] **Step 3: 神殿页**

`apps/web/src/views/TempleView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AppraiseResultDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const o = ref<McOverviewDto | null>(null);
const toolId = ref<number | null>(null);
const times = ref(1);
const noRetry = ref(false);
const results = ref<AppraiseResultDto['results']>([]);
const busy = ref(false);

async function load() {
  o.value = await endpoints.mc();
  if (toolId.value === null)
    toolId.value = o.value.tools.find((t) => t.num > 0)?.goodsId ?? o.value.tools[0]?.goodsId ?? null;
}
const tool = computed(() => o.value?.tools.find((t) => t.goodsId === toolId.value) ?? null);
const maxTimes = computed(() => Math.min(o.value?.recipes ?? 0, tool.value?.num ?? 0, 99));
const n = computed(() => Math.max(1, Math.min(times.value || 1, maxTimes.value)));

async function appraise() {
  if (busy.value || toolId.value === null) return;
  busy.value = true;
  try {
    const r = await endpoints.mcAppraise(toolId.value, n.value, noRetry.value);
    results.value = r.results;
    toast.push(`鉴定 ${r.results.length} 次，成功 ${r.results.filter((x) => x.ok).length} 次`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '鉴定失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取失败'), 'danger')));
</script>

<template>
  <div v-if="o">
    <h5>神殿</h5>
    <h6>鉴定神秘食谱</h6>
    <p class="small text-muted">
      每次消耗 1 个神秘食谱和 1 个鉴定道具，成功得到残卷。持有神秘食谱 {{ o.recipes }} 个。
      <span v-if="o.star < 1">1 星以后才能鉴定。</span>
    </p>
    <select v-model.number="toolId" class="form-select form-select-sm mb-1" data-testid="tool">
      <option v-for="t in o.tools" :key="t.goodsId" :value="t.goodsId">
        {{ catalog.goodsName(t.goodsId) }}（{{ t.min }}~{{ t.max }} 级，{{ Math.round(t.rate * 100) }}%，持有
        {{ t.num }}）
      </option>
    </select>
    <div class="d-flex gap-1 align-items-center mb-1">
      <input
        v-model.number="times"
        type="number"
        min="1"
        :max="Math.max(1, maxTimes)"
        class="form-control form-control-sm"
        style="width: 80px"
        data-testid="times"
      />
      <button
        class="btn btn-sm btn-primary"
        data-testid="appraise"
        :disabled="busy || maxTimes < 1 || o.star < 1"
        @click="appraise"
      >
        鉴定 ×{{ n }}
      </button>
    </div>
    <label v-if="o.starBook" class="small d-block">
      <input v-model="noRetry" type="checkbox" class="form-check-input me-1" data-testid="no-retry" />低于 5
      级不重抽（星神之书）
    </label>
    <ul class="small mt-2" data-testid="results">
      <li v-for="(r, i) in results" :key="i">
        {{
          r.ok ? `得到 ${catalog.mcName(r.mcId ?? 0)} 残卷 ×${r.num}${r.blessed ? '（星神眷恋）' : ''}` : r.text
        }}
      </li>
    </ul>
    <p class="small text-muted mt-3">守护兽、探险、试炼和克拉肯稍后开放。</p>
  </div>
</template>
```

- [ ] **Step 4: 教室页**

`apps/web/src/views/ClassroomView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { LessonDto, LessonsDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { formatNum } from '../utils/format';

const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<LessonsDto | null>(null);
const mc = ref<McOverviewDto | null>(null);
const pickMc = ref<number | null>(null);
const pickCert = ref<number | null>(null);
const busy = ref(false);

async function load() {
  const [l, m] = await Promise.all([endpoints.lessons(), endpoints.mc()]);
  data.value = l;
  mc.value = m;
}
async function act(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}
const others = computed(() => (data.value?.items ?? []).filter((l) => l.id !== data.value?.mine?.id));
const certsFor = computed(() => {
  const lv = pickMc.value === null ? undefined : catalog.mc(pickMc.value)?.level;
  return (data.value?.certs ?? []).filter((c) => c.num > 0 && lv !== undefined && c.levels.includes(lv));
});
const leftText = (at: string) =>
  `${Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 3_600_000))} 小时`;

function learn(l: LessonDto, type: 1 | 2) {
  const forget = l.level * (data.value?.forgetPerLevel ?? 3) + 1;
  if (
    type === 2 &&
    !window.confirm(
      `偷学不花学费，但失败会遗忘 ${forget} 道食谱${l.level >= 4 ? '，还可能遗忘一道特色菜' : ''}。确定偷学吗？`,
    )
  )
    return;
  return act(async () => {
    const r = await endpoints.lessonLearn(l.id, type);
    if (r.success) toast.push(`学会了${catalog.mcName(l.mcId)}`);
    else if (type === 2)
      toast.push(
        `偷学失败，遗忘了 ${r.forgot.cookbooks.length} 道食谱${r.forgot.mcId ? `和${catalog.mcName(r.forgot.mcId)}` : ''}`,
        'danger',
      );
    else toast.push('没学会，下次再来', 'danger');
  }, '学习失败');
}
function open() {
  const m = pickMc.value;
  const c = pickCert.value;
  if (m === null || c === null) return;
  return act(async () => {
    await endpoints.lessonOpen(m, c);
    toast.push('开课了');
    pickMc.value = null;
    pickCert.value = null;
  }, '开课失败');
}
function close() {
  const mine = data.value?.mine;
  if (!mine || !data.value) return;
  const coin = mine.level * data.value.forceCloseCoinPerLevel;
  if (!window.confirm(`花 ${formatNum(coin)} 银币强制结束这门课？`)) return;
  return act(async () => {
    await endpoints.lessonClose();
    toast.push('课程已结束');
  }, '结束失败');
}

onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取教室失败'), 'danger')));
</script>

<template>
  <div v-if="data">
    <h5>教室</h5>
    <div v-if="data.mine" class="border rounded p-2 mb-2 small" data-testid="my-lesson">
      我的课：<b>{{ catalog.mcName(data.mine.mcId) }}</b> {{ data.mine.level }} 级 ·
      {{ data.mine.learned + data.mine.stolen }}/{{ data.mine.maxNum }} 人 · 还剩 {{ leftText(data.mine.endsAt) }}
      <button
        v-if="data.canForceClose"
        class="btn btn-sm btn-outline-danger ms-2"
        data-testid="force-close"
        :disabled="busy"
        @click="close"
      >
        强制结束
      </button>
    </div>
    <div v-else class="border rounded p-2 mb-2 small" data-testid="open-panel">
      开课（消耗 1 张残卷和 1 张教师证）：
      <select v-model.number="pickMc" class="form-select form-select-sm my-1" data-testid="open-mc">
        <option :value="null" disabled>选择已学的特色菜</option>
        <option v-for="m in mc?.learned ?? []" :key="m.mcId" :value="m.mcId">
          {{ catalog.mcName(m.mcId) }}（{{ catalog.mc(m.mcId)?.level }} 级）
        </option>
      </select>
      <select v-model.number="pickCert" class="form-select form-select-sm mb-1" data-testid="open-cert">
        <option :value="null" disabled>选择教师证</option>
        <option v-for="c in certsFor" :key="c.goodsId" :value="c.goodsId">
          {{ catalog.goodsName(c.goodsId) }}（体力 {{ c.needStrength }}，{{ c.lessonHour }} 小时，{{ c.maxNum }}
          人，持有 {{ c.num }}）
        </option>
      </select>
      <button
        class="btn btn-sm btn-primary"
        data-testid="open-lesson"
        :disabled="busy || pickMc === null || pickCert === null"
        @click="open"
      >
        开课
      </button>
    </div>

    <h6>正在上的课</h6>
    <div v-if="others.length === 0" class="small text-muted">现在没有别人开的课</div>
    <div
      v-for="l in others"
      :key="l.id"
      class="d-flex align-items-center gap-1 border-bottom py-1 small"
      :data-testid="`lesson-${l.id}`"
    >
      <div class="flex-fill">
        <b>{{ catalog.mcName(l.mcId) }}</b> {{ l.level }} 级 · 老师 {{ l.teacherName }}
        <div class="text-muted">
          {{ l.learned + l.stolen }}/{{ l.maxNum }} 人（偷学 {{ l.stolen }}）· 还剩 {{ leftText(l.endsAt) }}
        </div>
      </div>
      <button class="btn btn-sm btn-primary" :data-testid="`learn-${l.id}`" :disabled="busy || l.tried" @click="learn(l, 1)">
        学
      </button>
      <button
        class="btn btn-sm btn-outline-danger"
        :data-testid="`steal-${l.id}`"
        :disabled="busy || l.tried || l.stolen > 1"
        @click="learn(l, 2)"
      >
        偷学
      </button>
    </div>
    <p class="small text-muted mt-2">
      学：花 售价×3 银币和 2 个同级残卷碎片，老师分到 售价×2 和 1 个碎片。每门课只能试一次。
    </p>
  </div>
</template>
```

- [ ] **Step 5: 好友页品尝卡片、路由**

`apps/web/src/views/FriendRestView.vue`：
- `import { PART_NAMES } from '../utils/labels';` 改为 `import { GRADE_NAMES, PART_NAMES } from '../utils/labels';`
- 在 `friend-equips` 那个 `div` 之后加：

```html
    <div
      v-if="rest.special"
      class="border rounded p-2 mb-2 small d-flex align-items-center"
      data-testid="friend-special"
    >
      <div class="flex-fill">
        特色菜：<b>{{ catalog.mcName(rest.special.mcId) }}</b> {{ GRADE_NAMES[rest.special.grade] }} · 剩
        {{ rest.special.leftNum }} 份 · 每份 {{ rest.special.price }} 银币
      </div>
      <button
        v-if="rest.id !== mine"
        class="btn btn-sm btn-outline-success"
        data-testid="act-taste"
        :disabled="busy || rest.special.eaten || rest.state !== 1"
        @click="act(() => endpoints.mcTaste(restId), '品尝成功，体力增加了', '品尝失败')"
      >
        {{ rest.special.eaten ? '已品尝' : '品尝' }}
      </button>
    </div>
```

`apps/web/src/router.ts`：在 `/mc` 路由后加：

```ts
  {
    path: '/temple',
    name: 'temple',
    component: () => import('./views/TempleView.vue'),
    meta: { needRestaurant: true },
  },
  {
    path: '/classroom',
    name: 'classroom',
    component: () => import('./views/ClassroomView.vue'),
    meta: { needRestaurant: true },
  },
```

- [ ] **Step 6: 运行，确认通过**

Run: `pnpm --filter @dt/web exec vitest run src/views/TempleView.test.ts src/views/ClassroomView.test.ts src/views/FriendRestView.test.ts`
Expected: PASS。`ClassroomView` 的教师证选项文字里是目录里的道具名（测试的目录没有道具，所以显示"道具178"）

- [ ] **Step 7: 全量测试并提交**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿

```bash
git add apps/web
git commit -m "feat(web): temple appraisal page, classroom with open / learn / steal confirm / force close, tasting on friend page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 端到端、文档、验收

**Files:**
- Create: `apps/web/e2e/mysterious.spec.ts`
- Modify: `docs/rules/收益与加成.md`、`docs/deploy.md`

- [ ] **Step 1: 写端到端测试**

`apps/web/e2e/mysterious.spec.ts`：

```ts
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { registerAndOpen } from './helpers';

const DB_URL = process.env.E2E_DATABASE_URL ?? 'postgres://dt:dt@localhost:5432/dt';

test('特色菜：鉴定 → 学会 → 烹制 → 倒掉', async ({ page, request }) => {
  await registerAndOpen(page, request);
  const overview = (await (await page.request.get('/api/v1/restaurant/overview')).json()) as { data: { id: number } };
  const restId = overview.data.id;
  // 准备：1 星；神秘食谱和蟹黄堡秘方（100% 成功）；仿膳饽饽的 3 张残卷和食材（等同于奖励发放）
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('update restaurant set star_level = 1 where id = $1', [restId]);
    for (const [goodsId, num] of [
      [162, 1],
      [165, 1],
    ]) {
      await client.query('insert into store_item (rest_id, goods_id, num) values ($1, $2, $3)', [restId, goodsId, num]);
    }
    await client.query('insert into mc_remnant (rest_id, mc_id, num) values ($1, 1, 3)', [restId]);
    for (const foodsId of [390, 412, 261]) {
      await client.query(
        `insert into cupboard_food (rest_id, foods_id, num) values ($1, $2, 10)
         on conflict (rest_id, foods_id) do update set num = 10`,
        [restId, foodsId],
      );
    }
  } finally {
    await client.end();
  }

  await page.goto('/temple');
  await page.getByTestId('tool').selectOption('165');
  await page.getByTestId('appraise').click();
  await expect(page.getByTestId('results')).toContainText('残卷');

  await page.goto('/mc');
  await page.getByTestId('learn-1').click();
  await expect(page.getByTestId('learned-1')).toContainText('秘·仿膳饽饽');
  await page.getByTestId('cook-1').click();
  await page.getByTestId('cooknum-5').click();
  await expect(page.getByTestId('mc-current')).toContainText('秘·仿膳饽饽');

  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('dump').click();
  await expect(page.getByTestId('mc-current')).toHaveCount(0);
});
```

- [ ] **Step 2: 跑端到端**

先确认 dev 环境在跑、迁移已执行（`pnpm --filter @dt/server migrate:dev`，然后重启 `pnpm dev`；Windows 下停 dev 要按进程树清理旧的 API / worker 进程），再运行：

Run: `pnpm --filter @dt/web e2e`
Expected: 全部通过（原有 5 个 + 新增 1 个）

- [ ] **Step 3: 文档**

`docs/rules/收益与加成.md`：
- 第 3 节里"满意时还会吃特色菜（子项目 4 才有）。"改为"满意时还会吃特色菜（见第 6 节）。"
- 文件末尾加：

```markdown
## 6. 特色菜（子项目 4A）

**在售**：一家店同一时间只能卖一道特色菜（一批）。结算时每桌按顾客消耗份数：

| 顾客 | 份数 | 银币 | 经验 |
|---|---|---|---|
| 普通顾客 | 1 | 每份价值 × 0.5 | 1 |
| 挑剔顾客，点到的菜品级够 | 2 | 每份价值 × 2 | 特色菜等级 |
| 挑剔顾客没满足，但有阿狸 | 1 | 每份价值（没学过这道菜时减半） | 特色菜等级（没学过时 1） |
| 章鱼哥 | 4 | 1（有魔笛时算经验） | 1 |

以上银币、经验再乘特色菜银币率 / 经验率（`mcCoinRate` / `mcExpRate`）。份数卖完这一批就结束。

**烹制**（1 星起）：批数 1、5、10、15、25、50，每批每种食材各 1 个。
- 品级：随机数 + 幸运/8 + (熟练度等级−1)×4% + 加成和天气的 `mcGoldRate`，落在 [0.5, 0.8, 0.95, 1.05, 1.15, 1.25] 的哪一段就是几品，≥1.25 为佳肴；加成把品级抬上去时标"幸运"。
- 份数：360 × 批数 ×（6 级菜 0.70~0.95）× 份数系数 ×（1 + 道份数加成 + `mcNumRate` + 厨力项）。道份数加成：同道每道已学 +2%（上限 30%），他道每道 +0.5%（上限 10%）；厨力项 = √(厨力×2)/400 × 随机数。
- 每份价值：营养值 × 份数系数 ×（1 + 熟练度加成 + 试炼价值%）+ 人类之子名画 + 集名画 + 幸运饼干。
- 熟练度 += 品级 × 份数 / 200，累计到 200、800、1800……升级，10 级满。
- 6 级特色菜必得海绵宝宝勋章（特色菜经验 ×3，3 小时）；其他按 0.0002 × 营养值 × 批数 的概率。

**品尝**：好友吃 2 份得 每份价值 的体力，非好友吃 1 份得一半；每天 2 次，同一批只能吃一次。每批前 20 次品尝有奖励：品尝者有小概率得神秘食谱，店主得神秘礼券。

**昨日冠军**：每天 9 点，昨天开始烹制的批次里 份数 × 每份价值 最高的店（并列都算）得蟹黄堡秘方。
```

`docs/deploy.md` 末尾加：

```markdown
## 特色菜与教室（子项目 4A）

- 迁移 0008 新建 `rest_mc`、`mc_remnant`、`mc_cook`、`mc_eat`、`mc_lesson`、`mc_lesson_student`，餐厅表加 `mc_cook_id`（当前在售的批次）
- 新功能开关 `features.mysterious`（默认开）。关闭后特色菜、神殿鉴定、教室接口返回"这个区服暂未开放该功能"；正在售卖的特色菜照常在结算里卖完；昨日冠军任务跳过该区服
- worker 新任务 `mc-champion`：每天 `tuning.mysterious.championHour`（默认 9）点发昨日特色菜冠军奖励
- 数值在 `tuning.mysterious`（批数、份数、品级区间、道份数加成、品尝、教室学 / 偷成功率和遗忘数量、强制结束费用）
- 主线第 22~24 步（鉴定、学会、烹制特色菜）和教室支线不再跳过；第 25、26 步（守护兽、探险）继续跳过，等 4B
```

- [ ] **Step 4: 验收**

Run: `pnpm format:check && pnpm typecheck && pnpm lint && pnpm test`
Expected: 全绿（格式不对就 `pnpm format` 后重跑）

对照设计文档 §1 的完成标志逐条确认：
- 鉴定 → 残卷 → 学会：服务测试 + E2E
- 烹制开售、结算卖出并增加收益：cook.test + runner.test
- 好友品尝：taste.test + FriendRestView.test
- 教室开课、学习、偷学：lesson.test + ClassroomView.test
- 每天 9 点冠军：jobs.test

- [ ] **Step 5: 提交**

```bash
git add apps/web/e2e/mysterious.spec.ts docs
git commit -m "test(e2e): appraise, learn, cook and dump a mysterious dish; docs for mysterious dishes and deployment

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

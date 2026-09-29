# 子项目 1「骨架」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭好美味小镇重写版的工程骨架：玩家能在线注册、验证邮箱、选择区服、开店，并看到一家初始值正确的新餐厅。

**Architecture:** pnpm monorepo，TypeScript 全栈。`packages/shared`（前后端共用的公式、错误码、接口 schema）和 `packages/config`（校验并生成游戏配置包）以 TS 源码形式被引用；`apps/server` 是 Fastify + Kysely + PostgreSQL + Redis 的模块化单体，同一份代码有 api 和 worker 两个入口；`apps/web` 是 Vue 3 前端。写操作统一走"单店行锁 + 事务内同步事件"。

**Tech Stack:** Node 22+、pnpm 10、TypeScript 5（strict、ESM）、zod 3、Fastify 5、Kysely 0.27、pg 8、ioredis 5、@node-rs/argon2、nodemailer、Vue 3.5、Vite 6、Pinia 3、vue-router 4、Bootstrap 5、Vitest 3.2、Playwright、Docker Compose。

**Spec:** `docs/superpowers/specs/2026-09-29-rewrite-architecture-design.md`（第 11 节是本计划的范围和验收标准）。游戏规则依据 `../analysis/spec/`，其中 02（餐厅成长）和 18（账号与接口约定）与本计划直接相关。

## Global Constraints

- Node ≥ 22，pnpm 10；所有包 `"type": "module"`，TypeScript `strict` + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`
- 依赖主版本固定：zod `^3`、fastify `^5`、kysely `^0.27`、vue `^3.5`、vitest `^3.2`
- 包名：`@dt/shared`、`@dt/config`、`@dt/server`、`@dt/web`
- 数据库时间一律 `timestamptz`；"游戏日"按 `Asia/Shanghai` 时区计算
- 银币等大数用 `bigint` 列，读出时转成 JS number
- 服务端不返回 HTML；成功 `{ok:true,data,events}`，失败 `{ok:false,code,params?}`，文案由前端按错误码生成
- 接口一律从会话取账号、区服和 restId，**不接受客户端传 restId**
- 写操作只接受 `POST` + `application/json`
- 会话 Cookie 名 `dt_sid`：httpOnly、SameSite=Lax，生产环境 Secure
- 注册只需要用户名、密码、邮箱、邀请码（可选），**不收集手机号**
- 流水表 `ledger` 和新闻表 `news` 按天分区，保留 30 天
- 新餐厅初始值（来自配置，不写死在代码里）：等级 1、属性点 3、体力 100/100、油 1000/1000、银币 100,000、钻石 0、橱柜 100、仓库 20、单种上限 999、锁定格 15、声望 10、新手街（0）、4 张桌子；赠送道具 81、100、140
- 前端：手机优先，最小宽度 360px，宽屏时内容区最大 720px 居中；界面文字用中文
- 每个任务提交前先运行 `pnpm format`，保证 CI 的 `format:check` 通过
- 服务端测试依赖 Docker 里的测试数据库和 Redis：跑服务端测试前先执行一次 `pnpm infra:test`

## Review Focus

1. **用户名大小写和中文**：注册 `Alice` 后再注册 `alice` 必须失败；中文用户名（如"厨神小王"）必须能注册和登录。→ Task 8 测试
2. **坏的或过期的会话 Cookie**：带着伪造或已失效的 `dt_sid` 访问，必须按"未登录"处理（401 `UNAUTHORIZED`），不能报 500。→ Task 7 测试
3. **不同用户用了相同的 Idempotency-Key**：绝不能把 A 的缓存响应返回给 B。→ Task 7 测试
4. **餐厅名首尾空格、全角符号和 emoji**：首尾空格要去掉后再校验和查重；emoji、全角标点要被拒绝（`bad_chars`）。→ Task 2、Task 11 测试
5. **连点"开张"**：即使没带幂等键、两个请求同时到达，也只能开出一家店，另一个返回 `RESTAURANT_EXISTS`。→ Task 11 测试

## 文件结构

```
delicious-town/
  package.json / pnpm-workspace.yaml / tsconfig.base.json / vitest.config.ts
  eslint.config.js / .prettierrc.json / .prettierignore / .gitignore / .editorconfig / README.md
  packages/shared/src/
    rng.ts            可注入随机数（种子版、安全版、固定序列）+ hashSeed
    weighted.ts       加权池与二分抽取
    formulas.ts       幸运率、升级经验
    time.ts           游戏日
    errors.ts         错误码
    envelope.ts       响应格式、GameEvent
    rules/restaurantName.ts  餐厅名规则
    schemas/auth.ts | shard.ts | restaurant.ts   zod 请求 schema + DTO 类型
    index.ts
  packages/config/
    data/             从 analysis 同步来的源数据（提交进仓库）+ restaurant_defaults.json
    scripts/sync-data.ts
    src/types.ts      规范化后的配置类型
    src/raw.ts        源数据 zod schema
    src/build.ts      校验、规范化、引用检查 → ConfigBundle
    src/source.ts     读取数据目录
    src/runtime.ts    GameConfig（内存索引）
    src/shard.ts      区服覆盖配置合并
    src/cli.ts        生成 generated/bundle.json
    src/index.ts
  apps/server/
    src/env.ts
    src/db/{index,schema,migrate,partitions,tx}.ts  src/db/migrations/{index,0001_init}.ts
    src/infra/{redis,mailer,captcha}.ts
    src/security/{tokens,session,rateLimit,idempotency}.ts
    src/events/bus.ts
    src/http/{errors,reply,validate,clientIp,errorHandling,health}.ts
    src/types/fastify.d.ts
    src/modules/index.ts
    src/modules/ledger/ledger.ts  src/modules/news/news.ts  src/modules/counter/dailyCounter.ts
    src/modules/account/{password,service,routes}.ts
    src/modules/shard/{service,routes}.ts
    src/modules/effects/{aggregate,service}.ts
    src/modules/store/grant.ts
    src/modules/restaurant/{rules,service,routes}.ts
    src/worker/{leader,scheduler,jobs}.ts
    src/app.ts  src/deps.ts  src/main.ts  src/worker.ts  src/cli/{shard,migrate}.ts
    test/{testEnv,globalSetup,db,fixtures,helpers}.ts
    tsup.config.ts  Dockerfile  .env.development
  apps/web/
    src/{main.ts,App.vue,router.ts,env.d.ts}
    src/api/{client,device,endpoints}.ts  src/i18n/zh-CN.ts  src/assets/asset.ts
    src/stores/session.ts  src/components/{GameImg,Turnstile,NumberText}.vue
    src/views/{Login,Register,VerifyEmail,ForgotPassword,ResetPassword,ShardSelect,CreateRestaurant,RestaurantHome}View.vue
    e2e/acceptance.spec.ts  playwright.config.ts  public/_redirects
  infra/compose.test.yml  compose.dev.yml  compose.prod.yml  .env.example  backup.sh
  .github/workflows/ci.yml
  docs/deploy.md
```

---

### Task 0: 前置环境（手动）

**Files:** 无

- [ ] **Step 1: 安装 Docker Desktop**

从 https://www.docker.com/products/docker-desktop/ 下载安装，安装时选择"Use WSL 2 based engine"（本机已有 WSL2）。装好后重启终端。

- [ ] **Step 2: 验证 Docker**

Run: `docker compose version`
Expected: 输出 `Docker Compose version v2.x`

- [ ] **Step 3: 安装 pnpm 10**

Run: `npm i -g pnpm@10`，然后 `pnpm -v`
Expected: `10.x.x`

---

### Task 1: 工作区与公共包基础（随机数、加权抽取、公式、游戏日）

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.editorconfig`, `README.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/rng.ts`, `weighted.ts`, `formulas.ts`, `time.ts`, `index.ts`
- Test: `packages/shared/src/rng.test.ts`, `weighted.test.ts`, `formulas.test.ts`, `time.test.ts`

**Interfaces:**
- Produces（`@dt/shared`）：
  - `interface Rng { next(): number; int(n: number): number; intMin1(n: number): number; chance(p: number): boolean }`
  - `seededRng(seed: number): Rng`、`cryptoRng(): Rng`、`sequenceRng(values: number[]): Rng`、`hashSeed(...parts: Array<string | number>): number`
  - `interface WeightedPool<T> { items: readonly T[]; prefix: readonly number[]; total: number }`、`buildPool<T>(items, weight: (t: T) => number): WeightedPool<T>`、`pickWeighted<T>(pool, rng): T`
  - `luckRate(luck: number): number`、`levelUpExp(level: number): number`
  - `GAME_TIME_ZONE = 'Asia/Shanghai'`、`gameDay(date?: Date): string`（`YYYY-MM-DD`）

- [ ] **Step 1: 写根目录配置文件**

`package.json`：
```json
{
  "name": "delicious-town",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "pnpm -r --parallel typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "infra:test": "docker compose -f infra/compose.test.yml up -d --wait",
    "infra:dev": "docker compose -f infra/compose.dev.yml up -d --wait"
  }
}
```

`pnpm-workspace.yaml`：
```yaml
packages:
  - packages/*
  - apps/*
onlyBuiltDependencies:
  - esbuild
```

`tsconfig.base.json`：
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

`vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { projects: ['packages/*', 'apps/*'] },
});
```

`eslint.config.js`：
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/generated/**',
      '**/.test/**',
      '**/*.vue',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.ts', '**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
```

`.prettierrc.json`：
```json
{ "singleQuote": true, "printWidth": 110, "trailingComma": "all" }
```

`.prettierignore`：
```
pnpm-lock.yaml
docs/
**/generated/
**/.test/
packages/config/data/
apps/web/public/pack/
```

`.gitignore`：
```
node_modules/
dist/
generated/
.test/
coverage/
.env
infra/.env
apps/web/public/pack/
apps/web/playwright-report/
apps/web/test-results/
```

`.editorconfig`：
```
root = true
[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
```

`README.md`：
```markdown
# 美味小镇（重写版）

开发环境：Node 22+、pnpm 10、Docker Desktop。

- 安装依赖：`pnpm install`
- 起测试用数据库和 Redis：`pnpm infra:test`
- 跑全部测试：`pnpm test`
- 设计文档：`docs/superpowers/specs/`
```

- [ ] **Step 2: 创建公共包骨架并安装依赖**

`packages/shared/package.json`：
```json
{
  "name": "@dt/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p tsconfig.json" }
}
```

`packages/shared/tsconfig.json`：
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`packages/shared/vitest.config.ts`：
```ts
import { defineProject } from 'vitest/config';

export default defineProject({ test: { name: 'shared', include: ['src/**/*.test.ts'] } });
```

Run:
```bash
pnpm add -Dw typescript@^5.8 vitest@^3.2 @types/node@^22 prettier@^3 eslint@^9 @eslint/js@^9 typescript-eslint@^8 globals@^16
pnpm --filter @dt/shared add zod@^3.24
```
Expected: 生成 `pnpm-lock.yaml`，无报错。

- [ ] **Step 3: 写失败的测试**

`packages/shared/src/rng.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { hashSeed, seededRng, sequenceRng } from './rng';

describe('seededRng', () => {
  it('同一种子产生相同序列，不同种子不同', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const sa = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(sa);
    expect([c.next(), c.next(), c.next()]).not.toEqual(sa);
  });

  it('next 落在 [0,1)，int/intMin1 落在各自区间', () => {
    const r = seededRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      const m = r.intMin1(5);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(5);
    }
  });

  it('边界：int(0)=0，intMin1(0)=1（与旧版 getRandowWithMin1 一致）', () => {
    const r = seededRng(1);
    expect(r.int(0)).toBe(0);
    expect(r.intMin1(0)).toBe(1);
  });
});

describe('sequenceRng', () => {
  it('按给定序列循环返回', () => {
    const r = sequenceRng([0.1, 0.9]);
    expect([r.next(), r.next(), r.next()]).toEqual([0.1, 0.9, 0.1]);
    expect(sequenceRng([0.5]).chance(0.6)).toBe(true);
    expect(sequenceRng([0.5]).chance(0.5)).toBe(false);
  });
});

describe('hashSeed', () => {
  it('确定且区分输入', () => {
    expect(hashSeed(1, 100, 912)).toBe(hashSeed(1, 100, 912));
    expect(hashSeed(1, 100, 912)).not.toBe(hashSeed(1, 101, 912));
  });
});
```

`packages/shared/src/weighted.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { buildPool, pickWeighted } from './weighted';
import { seededRng, sequenceRng } from './rng';

const items = [
  { id: 'a', w: 1 },
  { id: 'b', w: 2 },
  { id: 'c', w: 3 },
];

describe('weighted pool', () => {
  it('排除权重 <= 0 的项并计算前缀和', () => {
    const pool = buildPool([...items, { id: 'z', w: 0 }], (x) => x.w);
    expect(pool.items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(pool.prefix).toEqual([1, 3, 6]);
    expect(pool.total).toBe(6);
  });

  it('区间判定与旧版一致：rateMax - odds <= r < rateMax', () => {
    const pool = buildPool(items, (x) => x.w);
    expect(pickWeighted(pool, sequenceRng([0])).id).toBe('a');
    expect(pickWeighted(pool, sequenceRng([0.99 / 6])).id).toBe('a');
    expect(pickWeighted(pool, sequenceRng([1 / 6])).id).toBe('b');
    expect(pickWeighted(pool, sequenceRng([3 / 6])).id).toBe('c');
    expect(pickWeighted(pool, sequenceRng([0.9999])).id).toBe('c');
  });

  it('大量抽取时频率接近权重', () => {
    const pool = buildPool(items, (x) => x.w);
    const rng = seededRng(2026);
    const count: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 60000; i++) count[pickWeighted(pool, rng).id]! += 1;
    expect(count.a! / 60000).toBeCloseTo(1 / 6, 1);
    expect(count.c! / 60000).toBeCloseTo(3 / 6, 1);
  });

  it('空池抛错', () => {
    expect(() => pickWeighted(buildPool([], () => 1), seededRng(1))).toThrow('empty pool');
  });
});
```

`packages/shared/src/formulas.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { levelUpExp, luckRate } from './formulas';

describe('luckRate（规格书 00 §0.5）', () => {
  it('规格书示例', () => {
    expect(luckRate(0)).toBe(0);
    expect(luckRate(100)).toBeCloseTo(0.1732, 4);
    expect(luckRate(300)).toBeCloseTo(0.3, 10);
    expect(luckRate(700)).toBeCloseTo(0.4, 10);
    expect(luckRate(-100)).toBeCloseTo(-0.1732, 4);
  });
});

describe('levelUpExp（规格书 02 §2.2）', () => {
  it('规格书示例', () => {
    expect(levelUpExp(1)).toBe(500);
    expect(levelUpExp(10)).toBe(50_000);
    expect(levelUpExp(50)).toBe(1_250_000);
    expect(levelUpExp(99)).toBe(4_900_500);
    expect(levelUpExp(100)).toBe(15_000_000);
  });

  it('114 级以上增速更快', () => {
    const d114 = levelUpExp(115) - levelUpExp(114);
    const d113 = levelUpExp(114) - levelUpExp(113);
    expect(d114).toBeGreaterThan(d113);
  });
});
```

`packages/shared/src/time.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { gameDay } from './time';

describe('gameDay', () => {
  it('按北京时间切日', () => {
    expect(gameDay(new Date('2026-09-29T15:59:59Z'))).toBe('2026-09-29');
    expect(gameDay(new Date('2026-09-29T16:00:00Z'))).toBe('2026-09-30');
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm vitest run --project shared`
Expected: FAIL，提示找不到 `./rng`、`./weighted` 等模块。

- [ ] **Step 5: 实现**

`packages/shared/src/rng.ts`：
```ts
export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, n) 的整数；n <= 0 时返回 0 */
  int(n: number): number;
  /** [1, n] 的整数；n <= 0 时返回 1（对应旧版 getRandowWithMin1） */
  intMin1(n: number): number;
  /** 以概率 p 返回 true */
  chance(p: number): boolean;
}

function fromSource(next: () => number): Rng {
  return {
    next,
    int: (n) => (n <= 0 ? 0 : Math.floor(next() * n)),
    intMin1: (n) => (n <= 0 ? 1 : Math.floor(next() * n) + 1),
    chance: (p) => next() < p,
  };
}

/** sfc32：可复现的伪随机数，用于结算和测试 */
export function seededRng(seed: number): Rng {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;
  const raw = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) raw();
  return fromSource(raw);
}

/** 密码学安全随机数，用于玩家操作 */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(1);
  return fromSource(() => {
    globalThis.crypto.getRandomValues(buf);
    return buf[0]! / 4294967296;
  });
}

/** 固定序列，用于单元测试：依次返回给定的值，用完后循环 */
export function sequenceRng(values: number[]): Rng {
  if (values.length === 0) throw new Error('sequenceRng needs at least one value');
  let i = 0;
  return fromSource(() => values[i++ % values.length]!);
}

/** FNV-1a 32 位哈希，用于从 (区服, 轮次, 餐厅) 生成种子 */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
```

`packages/shared/src/weighted.ts`：
```ts
import type { Rng } from './rng';

export interface WeightedPool<T> {
  readonly items: readonly T[];
  readonly prefix: readonly number[];
  readonly total: number;
}

/** 按权重建池：权重 <= 0 的项被排除；prefix[i] = 前 i+1 项的权重和 */
export function buildPool<T>(items: readonly T[], weight: (item: T) => number): WeightedPool<T> {
  const kept: T[] = [];
  const prefix: number[] = [];
  let total = 0;
  for (const item of items) {
    const w = weight(item);
    if (!(w > 0)) continue;
    total += w;
    kept.push(item);
    prefix.push(total);
  }
  return { items: kept, prefix, total };
}

/** r ∈ [0, total)，选第一个 prefix > r 的项（等价于旧版 rateMax - odds <= r < rateMax） */
export function pickWeighted<T>(pool: WeightedPool<T>, rng: Rng): T {
  if (pool.total <= 0) throw new Error('cannot pick from an empty pool');
  const r = rng.next() * pool.total;
  let lo = 0;
  let hi = pool.prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pool.prefix[mid]! > r) hi = mid;
    else lo = mid + 1;
  }
  return pool.items[lo]!;
}
```

`packages/shared/src/formulas.ts`：
```ts
/** 幸运率（规格书 00 §0.5） */
export function luckRate(luck: number): number {
  if (luck === 0) return 0;
  const sign = Math.sign(luck);
  const abs = Math.abs(luck);
  const a = Math.min(abs, 300);
  const b = Math.max(abs - 300, 0);
  return (sign * (Math.sqrt(3 * a) + Math.sqrt(b) / 2)) / 100;
}

/** 从 level 升到 level+1 所需经验（规格书 02 §2.2，与旧版 getCurLevelExp 一致） */
export function levelUpExp(level: number): number {
  const base = (500 * (level - 2) + 1000) * level;
  const high = level > 99 ? Math.pow(level, 3.5) * (level - 99) : 0;
  const factor = level > 114 ? 2 * Math.sqrt(level - 114) : 1;
  return Math.floor(base + high * factor);
}
```

`packages/shared/src/time.ts`：
```ts
export const GAME_TIME_ZONE = 'Asia/Shanghai';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: GAME_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 游戏日（北京时间），格式 YYYY-MM-DD */
export function gameDay(date: Date = new Date()): string {
  return dayFormat.format(date);
}
```

`packages/shared/src/index.ts`：
```ts
export * from './rng';
export * from './weighted';
export * from './formulas';
export * from './time';
```

- [ ] **Step 6: 运行测试确认通过，并检查类型和格式**

Run: `pnpm vitest run --project shared && pnpm typecheck && pnpm lint && pnpm format && pnpm format:check`
Expected: 全部通过（`pnpm format` 会先把代码格式统一成 Prettier 风格）。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat(shared): workspace scaffold with rng, weighted pool, formulas, game day"
```

---

### Task 2: 公共包：错误码、响应格式、接口 schema、餐厅名规则

**Files:**
- Create: `packages/shared/src/errors.ts`, `envelope.ts`, `rules/restaurantName.ts`, `schemas/auth.ts`, `schemas/shard.ts`, `schemas/restaurant.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/rules/restaurantName.test.ts`, `packages/shared/src/schemas/schemas.test.ts`

**Interfaces:**
- Consumes: 无
- Produces（`@dt/shared`）：
  - `ErrorCode`（常量对象 + 同名联合类型），值见下方代码
  - `GameEvent`、`OkResponse<T>`、`ErrResponse`、`ApiResponse<T>`
  - `RESERVED_NAME_WORDS: readonly string[]`、`type RestaurantNameCheck = 'ok' | 'empty' | 'bad_chars' | 'too_long' | 'reserved'`、`checkRestaurantName(name: string): RestaurantNameCheck`
  - `USERNAME_RE`、`registerBody`、`loginBody`、`verifyEmailBody`、`forgotPasswordBody`、`resetPasswordBody`、`type RegisterInput`、`type LoginInput`、`type ForgotPasswordInput`、`type ResetPasswordInput`、`interface MeDto`
  - `selectShardBody`、`interface ShardDto`、`interface SelectShardResult`
  - `createRestaurantBody`、`interface TableDto`、`interface EffectDto`、`interface RestaurantDto`

- [ ] **Step 1: 写失败的测试**

`packages/shared/src/rules/restaurantName.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { checkRestaurantName } from './restaurantName';

describe('checkRestaurantName（规格书 02 §2.1）', () => {
  it('合法名称', () => {
    expect(checkRestaurantName('美味小馆')).toBe('ok');
    expect(checkRestaurantName('  Tasty_House-1  ')).toBe('ok');
  });
  it('空名称', () => {
    expect(checkRestaurantName('   ')).toBe('empty');
  });
  it('非法字符：emoji、全角标点、空格', () => {
    expect(checkRestaurantName('好吃😋')).toBe('bad_chars');
    expect(checkRestaurantName('好吃！')).toBe('bad_chars');
    expect(checkRestaurantName('好 吃')).toBe('bad_chars');
  });
  it('长度：汉字按 8、字母数字按 5 累计，上限 64', () => {
    expect(checkRestaurantName('一二三四五六七八')).toBe('ok');
    expect(checkRestaurantName('一二三四五六七八九')).toBe('too_long');
    expect(checkRestaurantName('abcdefghijkl')).toBe('ok');
    expect(checkRestaurantName('abcdefghijklm')).toBe('too_long');
  });
  it('保留字', () => {
    expect(checkRestaurantName('镇长的店')).toBe('reserved');
    expect(checkRestaurantName('小蟹老板')).toBe('reserved');
  });
});
```

`packages/shared/src/schemas/schemas.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { registerBody } from './auth';
import { selectShardBody } from './shard';
import { createRestaurantBody } from './restaurant';

describe('registerBody', () => {
  const base = { username: '厨神小王', password: 'secret123', email: 'A@B.com', captchaToken: 't' };
  it('接受中文用户名，邮箱转小写，不需要手机号', () => {
    const r = registerBody.parse(base);
    expect(r.email).toBe('a@b.com');
    expect(r.inviteCode).toBeUndefined();
  });
  it('拒绝过长用户名和过短密码', () => {
    expect(registerBody.safeParse({ ...base, username: '一二三四五六七八九十' }).success).toBe(false);
    expect(registerBody.safeParse({ ...base, password: '123' }).success).toBe(false);
  });
});

describe('其他 schema', () => {
  it('selectShardBody 只接受正整数', () => {
    expect(selectShardBody.safeParse({ shardId: 1 }).success).toBe(true);
    expect(selectShardBody.safeParse({ shardId: -1 }).success).toBe(false);
    expect(selectShardBody.safeParse({ shardId: '1' }).success).toBe(false);
  });
  it('createRestaurantBody 限制长度', () => {
    expect(createRestaurantBody.safeParse({ name: 'x'.repeat(33) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run --project shared`
Expected: FAIL，找不到 `./restaurantName`、`./auth` 等模块。

- [ ] **Step 3: 实现**

`packages/shared/src/errors.ts`：
```ts
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  IDEMPOTENCY_IN_PROGRESS: 'IDEMPOTENCY_IN_PROGRESS',
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_BANNED: 'ACCOUNT_BANNED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  EMAIL_COOLDOWN: 'EMAIL_COOLDOWN',
  SHARD_NOT_FOUND: 'SHARD_NOT_FOUND',
  SHARD_CLOSED: 'SHARD_CLOSED',
  NO_SHARD_SELECTED: 'NO_SHARD_SELECTED',
  RESTAURANT_EXISTS: 'RESTAURANT_EXISTS',
  RESTAURANT_NOT_FOUND: 'RESTAURANT_NOT_FOUND',
  RESTAURANT_NAME_INVALID: 'RESTAURANT_NAME_INVALID',
  RESTAURANT_NAME_TAKEN: 'RESTAURANT_NAME_TAKEN',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

`packages/shared/src/envelope.ts`：
```ts
import type { ErrorCode } from './errors';

/** 结构化的得失提示，前端据此生成文案 */
export interface GameEvent {
  type: 'gain' | 'loss';
  kind: 'goods' | 'foods' | 'coin' | 'diamond' | 'exp' | 'renown' | 'oil' | 'strength';
  id?: number;
  num: number;
  lucky?: boolean;
}

export interface OkResponse<T> {
  ok: true;
  data: T;
  events: GameEvent[];
}

export interface ErrResponse {
  ok: false;
  code: ErrorCode;
  params?: Record<string, unknown>;
}

export type ApiResponse<T> = OkResponse<T> | ErrResponse;
```

`packages/shared/src/rules/restaurantName.ts`：
```ts
export const RESERVED_NAME_WORDS: readonly string[] = [
  '镇长', '蟹老板', '菜园姐', '雯姐', '奸商', '蟹堡皇', '测试',
  '痞老板', '海绵宝宝', '派大星', '珊迪', '章鱼哥', '市长', '主席',
];

export type RestaurantNameCheck = 'ok' | 'empty' | 'bad_chars' | 'too_long' | 'reserved';

const ALLOWED = /^[A-Za-z0-9_\-一-龥]+$/;
const ALNUM = /[A-Za-z0-9]/;

/** 餐厅名规则（规格书 02 §2.1）：先去掉首尾空格；字母数字计 5、其他计 8，累计 <= 64 */
export function checkRestaurantName(raw: string): RestaurantNameCheck {
  const name = raw.trim();
  if (!name) return 'empty';
  if (!ALLOWED.test(name)) return 'bad_chars';
  let weight = 0;
  for (const ch of name) weight += ALNUM.test(ch) ? 5 : 8;
  if (weight > 64) return 'too_long';
  if (RESERVED_NAME_WORDS.some((w) => name.includes(w))) return 'reserved';
  return 'ok';
}
```

`packages/shared/src/schemas/auth.ts`：
```ts
import { z } from 'zod';

export const USERNAME_RE = /^[A-Za-z0-9_\-一-龥]{2,9}$/;

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
const password = z.string().min(6).max(64);
const token = z.string().min(16).max(128);
const captchaToken = z.string().min(1).max(4096);

export const registerBody = z.object({
  username: z.string().regex(USERNAME_RE),
  password,
  email,
  inviteCode: z.string().trim().max(16).optional(),
  captchaToken,
});
export const loginBody = z.object({ username: z.string().min(1).max(32), password: z.string().min(1).max(64) });
export const verifyEmailBody = z.object({ token });
export const forgotPasswordBody = z.object({ email, captchaToken });
export const resetPasswordBody = z.object({ token, password });

export type RegisterInput = z.input<typeof registerBody>;
export type LoginInput = z.input<typeof loginBody>;
export type ForgotPasswordInput = z.input<typeof forgotPasswordBody>;
export type ResetPasswordInput = z.input<typeof resetPasswordBody>;

export interface MeDto {
  accountId: number;
  username: string;
  email: string;
  emailVerified: boolean;
  shardId: number | null;
  restaurantId: number | null;
}
```

`packages/shared/src/schemas/shard.ts`：
```ts
import { z } from 'zod';

export const selectShardBody = z.object({ shardId: z.number().int().positive() });

export interface ShardDto {
  id: number;
  name: string;
  status: 'open' | 'closed';
  openedAt: string;
  hasRestaurant: boolean;
}

export interface SelectShardResult {
  shardId: number;
  restaurantId: number | null;
}
```

`packages/shared/src/schemas/restaurant.ts`：
```ts
import { z } from 'zod';

export const createRestaurantBody = z.object({ name: z.string().max(32) });

export interface TableDto {
  no: number;
  floor: number;
  /** 顾客类型（规格书 01 §1.4），0 = 空桌 */
  customer: number;
}

export interface EffectDto {
  sourceType: string;
  sourceId: number;
  name: string;
  effects: Record<string, number>;
  expiresAt: string | null;
}

export interface RestaurantDto {
  id: number;
  shardId: number;
  name: string;
  level: number;
  exp: number;
  expToNext: number;
  coin: number;
  diamond: number;
  strength: number;
  strengthMax: number;
  oil: number;
  oilMax: number;
  starLevel: number;
  streetId: number;
  streetName: string;
  renown: number;
  attrLeft: number;
  attrs: { cook: number; cutting: number; fire: number; season: number; creatives: number };
  luck: number;
  tableNum: number;
  cupboardNum: number;
  storeNum: number;
  foodsMaxNum: number;
  foodsLockNum: number;
  tables: TableDto[];
  effects: EffectDto[];
  createdAt: string;
}
```

`packages/shared/src/index.ts`（整体替换）：
```ts
export * from './rng';
export * from './weighted';
export * from './formulas';
export * from './time';
export * from './errors';
export * from './envelope';
export * from './rules/restaurantName';
export * from './schemas/auth';
export * from './schemas/shard';
export * from './schemas/restaurant';
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run --project shared && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat(shared): error codes, response envelope, api schemas, restaurant name rule"
```

---

### Task 3: 配置包（源数据同步、校验、规范化、运行时索引、区服覆盖）

**Files:**
- Create: `packages/config/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/config/scripts/sync-data.ts`
- Create: `packages/config/data/restaurant_defaults.json`（以及同步脚本复制来的 `data/dataset/*.json`、`data/designed/*.json`）
- Create: `packages/config/src/types.ts`, `raw.ts`, `source.ts`, `build.ts`, `runtime.ts`, `shard.ts`, `cli.ts`, `index.ts`
- Test: `packages/config/src/build.test.ts`, `runtime.test.ts`, `shard.test.ts`

**Interfaces:**
- Consumes: 无（只依赖 zod）
- Produces（`@dt/config`）：
  - 类型：`Food`、`Goods`、`GiftItem`、`Cookbook`、`Street`、`MysteriousCookbook`、`Weather`、`Device`、`StarNeed`、`StarAward`、`OilNeed`、`Task`、`ActivationTask`、`ActivationReward`、`Award`、`RestaurantDefaults`、`ConfigBundle`
  - `defaultDataDir(): string`、`readSourceDir(dir: string): SourceData`
  - `buildBundle(src: SourceData): { bundle: ConfigBundle | null; errors: string[] }`
  - `interface GameConfig { version; bundle; foods; goods; cookbooks; streets; weather: ReadonlyMap<number, T>; maxCookbookId: number; requireGoods(id): Goods; requireStreet(id): Street }`
  - `createGameConfig(bundle: ConfigBundle): GameConfig`、`loadGameConfig(path: string): GameConfig`
  - `goodsEffectHours(g: Goods): number | null`
  - `interface ShardSettings { features: Record<string, boolean>; restaurant: RestaurantDefaults }`、`resolveShardSettings(config: GameConfig, override: unknown): ShardSettings`、`isFeatureEnabled(s: ShardSettings, name: string): boolean`

- [ ] **Step 1: 建包并同步源数据**

`packages/config/package.json`：
```json
{
  "name": "@dt/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "sync": "tsx scripts/sync-data.ts",
    "build": "tsx src/cli.ts"
  }
}
```

`packages/config/tsconfig.json`：
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "scripts"] }
```

`packages/config/vitest.config.ts`：
```ts
import { defineProject } from 'vitest/config';

export default defineProject({ test: { name: 'config', include: ['src/**/*.test.ts'], testTimeout: 30000 } });
```

`packages/config/scripts/sync-data.ts`：
```ts
/** 从 ../analysis/dataset 复制配置源数据到 data/。只复制配置表，不复制含玩家信息的快照。 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const analysis = process.env.DT_ANALYSIS_DIR ?? resolve(pkgDir, '../../../analysis/dataset');

const DATASET = [
  'foods', 'goods', 'cookbooks', 'streets', 'mysterious_cookbooks', 'roads', 'devices',
  'activation_tasks', 'activation_rewards', 'tower_floors', 'bar_slot_machine_award', 'hiphop_places',
  'suit_pot', 'suit_painting', 'suit_zodiac', 'suit_pet', 'suit_sculpture',
  'market_guess_foods', 'goods_sources', 'goods_source_legend',
];

mkdirSync(join(pkgDir, 'data/dataset'), { recursive: true });
mkdirSync(join(pkgDir, 'data/designed'), { recursive: true });
for (const name of DATASET) {
  copyFileSync(join(analysis, `${name}.json`), join(pkgDir, 'data/dataset', `${name}.json`));
}
for (const file of readdirSync(join(analysis, 'designed'))) {
  if (file.endsWith('.json')) copyFileSync(join(analysis, 'designed', file), join(pkgDir, 'data/designed', file));
}
console.log(`synced from ${analysis}`);
```

`packages/config/data/restaurant_defaults.json`（手写，不来自 analysis）：
```json
{
  "level": 1,
  "attrLeft": 3,
  "strength": 100,
  "strengthMax": 100,
  "oil": 1000,
  "oilMax": 1000,
  "coin": 100000,
  "diamond": 0,
  "cupboardNum": 100,
  "storeNum": 20,
  "foodsMaxNum": 999,
  "foodsLockNum": 15,
  "renown": 10,
  "streetId": 0,
  "tableNum": 4,
  "giftGoods": [
    { "id": 81, "num": 1 },
    { "id": 100, "num": 1 },
    { "id": 140, "num": 1 }
  ]
}
```

Run:
```bash
pnpm --filter @dt/config add zod@^3.24
pnpm --filter @dt/config add -D tsx@^4
pnpm --filter @dt/config sync
```
Expected: 输出 `synced from ...`，`packages/config/data/dataset/` 下有 20 个文件，`data/designed/` 下有 28 个文件。

- [ ] **Step 2: 写失败的测试**

`packages/config/src/build.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('buildBundle（真实数据）', () => {
  it('没有错误，数量正确', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    expect(bundle!.foods).toHaveLength(313);
    expect(bundle!.goods).toHaveLength(601);
    expect(bundle!.cookbooks).toHaveLength(2363);
    expect(bundle!.streets).toHaveLength(14);
    expect(bundle!.starNeed).toHaveLength(12);
    expect(bundle!.version).toMatch(/^[0-9a-f]{12}$/);
  });

  it('合并了新设计的售价和 awardflag', () => {
    const { bundle } = buildBundle(source());
    const cb = bundle!.cookbooks.find((c) => c.id === 1)!;
    expect(cb.coin).toBeGreaterThan(0);
    expect(Object.keys(cb.needFoods)).toHaveLength(10);
    expect(bundle!.goods.find((g) => g.id === 491)!.awardFlag).toBe(6);
  });

  it('解析道具 value：效果、礼包、纯数字', () => {
    const { bundle } = buildBundle(source());
    const goods = new Map(bundle!.goods.map((g) => [g.id, g]));
    expect(goods.get(81)!.effects).toEqual({ atRate: 0.25, coinRate: 1, expRate: 1 });
    expect(goods.get(115)!.gift!.length).toBeGreaterThan(0);
    expect(goods.get(3)!.value).toBe(1);
  });

  it('同样的输入生成同样的版本号', () => {
    expect(buildBundle(source()).bundle!.version).toBe(buildBundle(source()).bundle!.version);
  });
});

describe('buildBundle（坏数据）', () => {
  it('食谱引用了不存在的食材', () => {
    const src = source();
    const cookbooks = structuredClone(src['dataset/cookbooks']) as Array<{
      needFoodsByLevel: Record<string, Array<{ foodsId: number }>>;
    }>;
    cookbooks[0]!.needFoodsByLevel['1']![0]!.foodsId = 999999;
    const { bundle, errors } = buildBundle({ ...src, 'dataset/cookbooks': cookbooks });
    expect(bundle).toBeNull();
    expect(errors).toContain('cookbook 1 grade 1 references unknown food 999999');
  });

  it('礼包引用了不存在的道具', () => {
    const src = source();
    const goods = structuredClone(src['dataset/goods']) as Array<{ id: number; value: string | null }>;
    goods.find((g) => g.id === 117)!.value = '[{"type":"goods","id":888888,"num":1,"rate":1}]';
    const { errors } = buildBundle({ ...src, 'dataset/goods': goods });
    expect(errors).toContain('goods 117 gift references unknown goods 888888');
  });

  it('开店赠送了不存在的道具', () => {
    const src = source();
    const defaults = { ...(src['restaurant_defaults'] as object), giftGoods: [{ id: 777777, num: 1 }] };
    const { errors } = buildBundle({ ...src, restaurant_defaults: defaults });
    expect(errors).toContain('restaurant_defaults gift references unknown goods 777777');
  });

  it('字段类型错误时指出表名和路径', () => {
    const src = source();
    const foods = structuredClone(src['dataset/foods']) as Array<Record<string, unknown>>;
    foods[0]!.coin = 'abc';
    const { errors } = buildBundle({ ...src, 'dataset/foods': foods });
    expect(errors.some((e) => e.startsWith('dataset/foods: 0.coin'))).toBe(true);
  });
});
```

`packages/config/src/runtime.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { createGameConfig, goodsEffectHours } from './runtime';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('GameConfig', () => {
  it('按 id 索引', () => {
    expect(config.foods.get(101)!.name).toBe('大米');
    expect(config.requireStreet(0).name).toBe('新手街');
    expect(config.maxCookbookId).toBeGreaterThanOrEqual(2363);
  });

  it('require* 找不到时抛错', () => {
    expect(() => config.requireGoods(999999)).toThrow('unknown goods 999999');
  });

  it('道具有效期：invalidhour 优先，其次 value.time', () => {
    expect(goodsEffectHours(config.requireGoods(81))).toBe(360);
    expect(goodsEffectHours(config.requireGoods(140))).toBeNull();
  });
});
```

`packages/config/src/shard.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { createGameConfig } from './runtime';
import { isFeatureEnabled, resolveShardSettings } from './shard';
import { defaultDataDir, readSourceDir } from './source';

const config = createGameConfig(buildBundle(readSourceDir(defaultDataDir())).bundle!);

describe('resolveShardSettings', () => {
  it('没有覆盖时用基础配置', () => {
    const s = resolveShardSettings(config, {});
    expect(s.restaurant.coin).toBe(100000);
    expect(isFeatureEnabled(s, 'pond')).toBe(true);
  });

  it('深合并覆盖值', () => {
    const s = resolveShardSettings(config, { features: { pond: false }, restaurant: { coin: 5 } });
    expect(s.restaurant.coin).toBe(5);
    expect(s.restaurant.tableNum).toBe(4);
    expect(isFeatureEnabled(s, 'pond')).toBe(false);
  });

  it('非法覆盖值抛错', () => {
    expect(() => resolveShardSettings(config, { restaurant: { coin: -1 } })).toThrow();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run --project config`
Expected: FAIL，找不到 `./build`、`./source` 等模块。

- [ ] **Step 4: 实现类型与源数据 schema**

`packages/config/src/types.ts`：
```ts
export interface IdNum {
  id: number;
  num: number;
}

/** 奖励格式（规格书 00 §0.7） */
export interface Award {
  coin?: number;
  exp?: number;
  diamond?: number;
  renown?: number;
  goods?: IdNum[];
  foods?: IdNum[];
}

export interface Food {
  id: number;
  name: string;
  level: number;
  coin: number;
  odds: number;
  /** 0 调料坚果 / 1 肉蛋奶 / 2 蔬果，决定仙贝颜色 */
  type: number | null;
  maxNum: number;
}

export type GiftItem =
  | { type: 'goods'; id: number; num: number; rate: number; level?: number; equip?: number }
  | { type: 'foods'; num: number; rate: number; flag?: string; id?: number }
  | { type: 'coin' | 'exp' | 'diamond'; min: number; max: number; rate: number }
  | { type: 'renown'; num: number; rate: number };

export interface Goods {
  id: number;
  name: string;
  type: number;
  deviceType: number | null;
  invalidHours: number | null;
  maxNum: number;
  stackable: boolean;
  level: number;
  coin: number;
  diamond: number;
  onSale: boolean;
  awardFlag: number | null;
  desc: string;
  /** value 字段解析后的 JSON（对象 / 数组 / 数字 / null） */
  value: unknown;
  /** value 为对象时，其中的数值项 */
  effects: Record<string, number>;
  /** value 为数组时，解析成礼包项 */
  gift: GiftItem[] | null;
}

export interface Cookbook {
  id: number;
  name: string;
  streetId: number;
  taste: number[];
  coin: number;
  level: number;
  desc: string;
  /** 品级 1~10 → 所需食材 */
  needFoods: Record<number, IdNumFood[]>;
}

export interface IdNumFood {
  foodsId: number;
  num: number;
}

export interface Street {
  id: number;
  name: string;
  cookName: string;
  desc: string;
}

export interface MysteriousCookbook {
  id: number;
  name: string;
  level: number;
  road: number;
  nutritive: number;
  coin: number;
  odds: number;
  taste: number[];
  foods: IdNumFood[];
}

export interface Weather {
  id: number;
  name: string;
  daytime: number;
  type: number;
  special: boolean;
  probability: number | null;
  effects: Record<string, number>;
  note: string;
}

export interface Device {
  id: number;
  name: string;
  deviceType: number;
  needStar: number;
  note: string;
}

export interface StarNeed {
  star: number;
  name: string;
  needLevel: number;
  needCookbooks: number;
  cookbooksKind: 'learned' | 'tianzhuan';
  needCerts: number;
  needPurpleShells: number;
}

export interface StarAward {
  star: number;
  award: Award;
}

export interface OilNeed {
  level: number;
  needLevel: number;
  needStar: number;
  needCoin: number;
  needGoods: IdNum[];
  needPurpleShells: number;
  addOil: number;
  oilMax: number;
}

export interface Task {
  id: number;
  main: boolean;
  step: number;
  name: string;
  cond: { kind: 'counter' | 'state'; key: string; target: number };
  award: Award;
  href: string;
}

export interface ActivationTask {
  id: number;
  name: string;
  points: number;
  limitTimes: number;
  needStar: number;
}

export interface ActivationReward {
  points: number;
  award: Award;
}

export interface RestaurantDefaults {
  level: number;
  attrLeft: number;
  strength: number;
  strengthMax: number;
  oil: number;
  oilMax: number;
  coin: number;
  diamond: number;
  cupboardNum: number;
  storeNum: number;
  foodsMaxNum: number;
  foodsLockNum: number;
  renown: number;
  streetId: number;
  tableNum: number;
  giftGoods: IdNum[];
}

export interface ConfigBundle {
  version: string;
  foods: Food[];
  goods: Goods[];
  cookbooks: Cookbook[];
  streets: Street[];
  mysteriousCookbooks: MysteriousCookbook[];
  weather: Weather[];
  devices: Device[];
  starNeed: StarNeed[];
  starAward: StarAward[];
  oilNeed: OilNeed[];
  tasks: Task[];
  activationTasks: ActivationTask[];
  activationRewards: ActivationReward[];
  restaurantDefaults: RestaurantDefaults;
  /** 以后子项目才用到的表：已校验引用，结构暂不规范化 */
  extra: Record<string, unknown[]>;
}
```

`packages/config/src/raw.ts`：
```ts
import { z } from 'zod';

const int = z.number().int();
const idNum = z.object({ id: int, num: int });

export const awardSchema = z.object({
  coin: z.number().optional(),
  exp: z.number().optional(),
  diamond: z.number().optional(),
  renown: z.number().optional(),
  goods: z.array(idNum).optional(),
  foods: z.array(idNum).optional(),
});

export const rawFood = z.object({
  id: int,
  name: z.string(),
  level: int,
  coin: z.number(),
  odds: z.number(),
  maxNum: int.nullish(),
  type: int.nullish(),
});

export const rawGoods = z.object({
  id: int,
  name: z.string(),
  type: int,
  devicetype: int.nullish(),
  invalidhour: z.number().nullish(),
  maxNum: int.nullish(),
  desc: z.string().nullish(),
  value: z.string().nullish(),
  level: int.nullish(),
  coin: z.number().nullish(),
  diamond: z.number().nullish(),
  saleflag: int.nullish(),
  subflag: int.nullish(),
  awardflag: int.nullish(),
});

export const giftItemSchema = z.union([
  z.object({ type: z.literal('goods'), id: int, num: int, rate: z.number(), level: int.optional(), equip: int.optional() }),
  z.object({ type: z.literal('foods'), num: int, rate: z.number(), flag: z.string().optional(), id: int.optional() }),
  z.object({ type: z.enum(['coin', 'exp', 'diamond']), min: z.number(), max: z.number(), rate: z.number() }),
  z.object({ type: z.literal('renown'), num: z.number(), rate: z.number() }),
]);

export const rawCookbook = z.object({
  id: int,
  name: z.string(),
  streetId: int,
  taste: z.array(int).nullish(),
  needFoodsByLevel: z.record(z.string(), z.array(z.object({ foodsId: int, num: int }))),
});
export const rawCookbookPrice = z.object({ id: int, coin: z.number(), level: int, desc: z.string() });
export const rawAwardFlag = z.object({ id: int, awardflag: int });

export const rawStreet = z.object({ id: int, name: z.string(), cookname: z.string().nullish(), desc: z.string().nullish() });

export const rawMysterious = z.object({
  id: int,
  name: z.string(),
  level: int,
  road: int,
  nutritive: z.number().nullish(),
  coin: z.number().nullish(),
  odds: z.number().nullish(),
  taste: z.string().nullish(),
  foods: z.array(z.object({ foodsId: int, num: int })),
});

export const rawWeather = z.object({
  id: int,
  name: z.string(),
  daytime: int,
  type: int,
  specialflag: int,
  probability: z.number().nullish(),
  value: z.record(z.string(), z.unknown()),
  note: z.string().nullish(),
});

export const rawDevice = z.object({
  deviceid: int,
  devicename: z.string(),
  devicetype: int,
  needreststar: int,
  devicenote: z.string().nullish(),
});

export const rawStarNeed = z.object({
  starlevel: int,
  name: z.string(),
  needRestlevel: int,
  needCookbooksnum: int,
  cookbooksKind: z.enum(['learned', 'tianzhuan']),
  needCertnum: int,
  needPurpleshell: int,
});
export const rawStarAward = z.object({ starlevel: int, award: awardSchema });
export const rawOilNeed = z.object({
  oillevel: int,
  needRestlevel: int,
  needStarlevel: int,
  needCoin: z.number(),
  needGoods: z.array(idNum),
  needPurpleshell: int,
  addOilnum: int,
  oilnummax: int,
});

export const rawTask = z.object({
  id: int,
  mainflag: z.union([z.literal(0), z.literal(1)]),
  step: int,
  taskname: z.string(),
  cond: z.object({ kind: z.enum(['counter', 'state']), key: z.string(), target: int }),
  award: awardSchema,
  href: z.string(),
});

export const rawActivationTask = z.object({
  id: int,
  activationname: z.string(),
  activationvalue: int,
  limittimes: int,
  starlevel: int.nullish(),
});
export const rawActivationReward = z.object({ dictval: int, note: z.string() });

export const restaurantDefaultsSchema = z.object({
  level: int.min(1),
  attrLeft: int.min(0),
  strength: int.min(0),
  strengthMax: int.min(1),
  oil: int.min(0),
  oilMax: int.min(1),
  coin: int.min(0),
  diamond: int.min(0),
  cupboardNum: int.min(1),
  storeNum: int.min(1),
  foodsMaxNum: int.min(1),
  foodsLockNum: int.min(0),
  renown: int,
  streetId: int.min(0),
  tableNum: int.min(1),
  giftGoods: z.array(z.object({ id: int, num: int.min(1) })),
});

export const rawSeed = z.object({ id: int, foodsId: int }).passthrough();
export const rawSeedExchange = z.object({ seedId: int }).passthrough();
export const rawFormula = z
  .object({ id: int, mainFoodsId: int, subFoodsId: int, addFoodsId: int, resFoodsId: int })
  .passthrough();
export const rawGoodsExchange = z
  .object({ id: int, goodsId: int, needGoods: z.array(z.object({ type: z.string(), id: int, num: int })) })
  .passthrough();
export const rawRenownShop = z.object({ goodsId: int }).passthrough();
export const rawBless = z
  .object({ id: int, value: z.object({ goodsId: int.optional() }).passthrough().nullable() })
  .passthrough();
```

`packages/config/src/source.ts`：
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  'designed/cookbooks_price',
  'designed/goods_awardflag',
  'designed/weather',
  'designed/star_need',
  'designed/star_award',
  'designed/oil_need',
  'designed/tasks',
  'designed/seeds',
  'designed/seed_exchange',
  'designed/foods_formula',
  'designed/goods_exchange',
  'designed/renown_shop',
  'designed/bless',
  'restaurant_defaults',
] as const;

export function defaultDataDir(): string {
  return fileURLToPath(new URL('../data', import.meta.url));
}

/** 读取数据目录：数据集文件取其中的 data 数组，restaurant_defaults 取整个对象 */
export function readSourceDir(dir: string): SourceData {
  const out: SourceData = {};
  for (const name of SOURCE_FILES) {
    const json = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as { data?: unknown };
    out[name] = name === 'restaurant_defaults' ? json : json.data;
  }
  return out;
}
```

- [ ] **Step 5: 实现 buildBundle**

`packages/config/src/build.ts`：
```ts
import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as raw from './raw';
import type { SourceData } from './source';
import type {
  ActivationReward, Award, ConfigBundle, Cookbook, Food, GiftItem, Goods, IdNum,
} from './types';

export interface BuildResult {
  bundle: ConfigBundle | null;
  errors: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function numericEntries(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isPlainObject(v)) for (const [k, x] of Object.entries(v)) if (typeof x === 'number') out[k] = x;
  return out;
}

function splitTaste(s: string | null | undefined): number[] {
  return (s ?? '').split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
}

export function buildBundle(src: SourceData): BuildResult {
  const errors: string[] = [];

  function parse<T>(key: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | null {
    const r = schema.safeParse(src[key]);
    if (r.success) return r.data;
    for (const issue of r.error.issues.slice(0, 20)) errors.push(`${key}: ${issue.path.join('.')}: ${issue.message}`);
    return null;
  }

  const foodsRaw = parse('dataset/foods', z.array(raw.rawFood));
  const goodsRaw = parse('dataset/goods', z.array(raw.rawGoods));
  const cookbooksRaw = parse('dataset/cookbooks', z.array(raw.rawCookbook));
  const streetsRaw = parse('dataset/streets', z.array(raw.rawStreet));
  const mysteriousRaw = parse('dataset/mysterious_cookbooks', z.array(raw.rawMysterious));
  const devicesRaw = parse('dataset/devices', z.array(raw.rawDevice));
  const actTasksRaw = parse('dataset/activation_tasks', z.array(raw.rawActivationTask));
  const actRewardsRaw = parse('dataset/activation_rewards', z.array(raw.rawActivationReward));
  const pricesRaw = parse('designed/cookbooks_price', z.array(raw.rawCookbookPrice));
  const awardFlagsRaw = parse('designed/goods_awardflag', z.array(raw.rawAwardFlag));
  const weatherRaw = parse('designed/weather', z.array(raw.rawWeather));
  const starNeedRaw = parse('designed/star_need', z.array(raw.rawStarNeed));
  const starAwardRaw = parse('designed/star_award', z.array(raw.rawStarAward));
  const oilRaw = parse('designed/oil_need', z.array(raw.rawOilNeed));
  const tasksRaw = parse('designed/tasks', z.array(raw.rawTask));
  const seedsRaw = parse('designed/seeds', z.array(raw.rawSeed));
  const seedExRaw = parse('designed/seed_exchange', z.array(raw.rawSeedExchange));
  const formulasRaw = parse('designed/foods_formula', z.array(raw.rawFormula));
  const goodsExRaw = parse('designed/goods_exchange', z.array(raw.rawGoodsExchange));
  const renownRaw = parse('designed/renown_shop', z.array(raw.rawRenownShop));
  const blessRaw = parse('designed/bless', z.array(raw.rawBless));
  const defaults = parse('restaurant_defaults', raw.restaurantDefaultsSchema);

  if (
    errors.length > 0 || !foodsRaw || !goodsRaw || !cookbooksRaw || !streetsRaw || !mysteriousRaw ||
    !devicesRaw || !actTasksRaw || !actRewardsRaw || !pricesRaw || !awardFlagsRaw || !weatherRaw ||
    !starNeedRaw || !starAwardRaw || !oilRaw || !tasksRaw || !seedsRaw || !seedExRaw || !formulasRaw ||
    !goodsExRaw || !renownRaw || !blessRaw || !defaults
  ) {
    return { bundle: null, errors };
  }

  const unique = (table: string, ids: number[]) => {
    const seen = new Set<number>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${table}: duplicate id ${id}`);
      seen.add(id);
    }
  };

  // ---------- 食材 ----------
  const foods: Food[] = foodsRaw.map((f) => ({
    id: f.id, name: f.name, level: f.level, coin: f.coin, odds: f.odds, type: f.type ?? null, maxNum: f.maxNum ?? 999,
  }));
  unique('foods', foods.map((f) => f.id));
  const foodIds = new Set(foods.map((f) => f.id));

  // ---------- 道具 ----------
  const awardFlags = new Map(awardFlagsRaw.map((a) => [a.id, a.awardflag]));
  const goods: Goods[] = goodsRaw.map((g) => {
    let value: unknown = null;
    if (g.value !== null && g.value !== undefined && g.value.trim() !== '') {
      try {
        value = JSON.parse(g.value);
      } catch {
        errors.push(`goods ${g.id} value is not valid JSON`);
      }
    }
    let gift: GiftItem[] | null = null;
    if (Array.isArray(value)) {
      const r = z.array(raw.giftItemSchema).safeParse(value);
      if (r.success) gift = r.data;
      else errors.push(`goods ${g.id} gift is malformed: ${r.error.issues[0]?.message ?? ''}`);
    }
    return {
      id: g.id,
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
      awardFlag: awardFlags.get(g.id) ?? g.awardflag ?? null,
      desc: g.desc ?? '',
      value,
      effects: numericEntries(value),
      gift,
    };
  });
  unique('goods', goods.map((g) => g.id));
  const goodsIds = new Set(goods.map((g) => g.id));
  for (const id of awardFlags.keys()) if (!goodsIds.has(id)) errors.push(`goods_awardflag references unknown goods ${id}`);
  for (const g of goods) {
    for (const item of g.gift ?? []) {
      if (item.type === 'goods' && item.id > 0 && !goodsIds.has(item.id)) {
        errors.push(`goods ${g.id} gift references unknown goods ${item.id}`);
      }
    }
  }

  // ---------- 街道 ----------
  const streets = streetsRaw.map((s) => ({ id: s.id, name: s.name, cookName: s.cookname ?? '', desc: s.desc ?? '' }));
  unique('streets', streets.map((s) => s.id));
  const streetIds = new Set(streets.map((s) => s.id));

  // ---------- 食谱 ----------
  const prices = new Map(pricesRaw.map((p) => [p.id, p]));
  const cookbooks: Cookbook[] = cookbooksRaw.map((c) => {
    const price = prices.get(c.id);
    if (!price) errors.push(`cookbook ${c.id} has no price`);
    if (!streetIds.has(c.streetId)) errors.push(`cookbook ${c.id} references unknown street ${c.streetId}`);
    const needFoods: Cookbook['needFoods'] = {};
    for (let grade = 1; grade <= 10; grade++) {
      const list = c.needFoodsByLevel[String(grade)];
      if (!list || list.length === 0) {
        errors.push(`cookbook ${c.id} is missing grade ${grade}`);
        continue;
      }
      for (const f of list) {
        if (!foodIds.has(f.foodsId)) errors.push(`cookbook ${c.id} grade ${grade} references unknown food ${f.foodsId}`);
      }
      needFoods[grade] = list.map((f) => ({ foodsId: f.foodsId, num: f.num }));
    }
    return {
      id: c.id, name: c.name, streetId: c.streetId, taste: c.taste ?? [],
      coin: price?.coin ?? 0, level: price?.level ?? 1, desc: price?.desc ?? '', needFoods,
    };
  });
  unique('cookbooks', cookbooks.map((c) => c.id));

  // ---------- 特色菜 ----------
  const mysteriousCookbooks = mysteriousRaw.map((m) => {
    for (const f of m.foods) {
      if (!foodIds.has(f.foodsId)) errors.push(`mysterious ${m.id} references unknown food ${f.foodsId}`);
    }
    return {
      id: m.id, name: m.name, level: m.level, road: m.road, nutritive: m.nutritive ?? 0, coin: m.coin ?? 0,
      odds: m.odds ?? 0, taste: splitTaste(m.taste), foods: m.foods,
    };
  });
  unique('mysterious_cookbooks', mysteriousCookbooks.map((m) => m.id));

  // ---------- 奖励引用检查 ----------
  const checkAward = (where: string, a: Award) => {
    for (const g of a.goods ?? []) if (!goodsIds.has(g.id)) errors.push(`${where} references unknown goods ${g.id}`);
    for (const f of a.foods ?? []) if (!foodIds.has(f.id)) errors.push(`${where} references unknown food ${f.id}`);
  };
  const checkGoodsList = (where: string, list: IdNum[]) => {
    for (const g of list) if (!goodsIds.has(g.id)) errors.push(`${where} references unknown goods ${g.id}`);
  };
  const contiguous = (table: string, levels: number[]) => {
    const sorted = [...levels].sort((a, b) => a - b);
    if (sorted.some((lv, i) => lv !== i + 1)) errors.push(`${table} must be contiguous from 1`);
  };

  // ---------- 天气、设施、星级、油壶、任务、活跃 ----------
  const weather = weatherRaw.map((w) => ({
    id: w.id, name: w.name, daytime: w.daytime, type: w.type, special: w.specialflag === 1,
    probability: w.probability ?? null, effects: numericEntries(w.value), note: w.note ?? '',
  }));
  unique('weather', weather.map((w) => w.id));

  const devices = devicesRaw.map((d) => ({
    id: d.deviceid, name: d.devicename, deviceType: d.devicetype, needStar: d.needreststar, note: d.devicenote ?? '',
  }));

  const starNeed = starNeedRaw.map((s) => ({
    star: s.starlevel, name: s.name, needLevel: s.needRestlevel, needCookbooks: s.needCookbooksnum,
    cookbooksKind: s.cookbooksKind, needCerts: s.needCertnum, needPurpleShells: s.needPurpleshell,
  }));
  contiguous('star_need', starNeed.map((s) => s.star));
  const starAward = starAwardRaw.map((s) => ({ star: s.starlevel, award: s.award }));
  for (const s of starAward) checkAward(`star_award ${s.star}`, s.award);

  const oilNeed = oilRaw.map((o) => ({
    level: o.oillevel, needLevel: o.needRestlevel, needStar: o.needStarlevel, needCoin: o.needCoin,
    needGoods: o.needGoods, needPurpleShells: o.needPurpleshell, addOil: o.addOilnum, oilMax: o.oilnummax,
  }));
  contiguous('oil_need', oilNeed.map((o) => o.level));
  for (const o of oilNeed) checkGoodsList(`oil_need ${o.level}`, o.needGoods);

  const tasks = tasksRaw.map((t) => ({
    id: t.id, main: t.mainflag === 1, step: t.step, name: t.taskname, cond: t.cond, award: t.award, href: t.href,
  }));
  unique('tasks', tasks.map((t) => t.id));
  for (const t of tasks) checkAward(`task ${t.id}`, t.award);

  const activationTasks = actTasksRaw.map((a) => ({
    id: a.id, name: a.activationname, points: a.activationvalue, limitTimes: a.limittimes, needStar: a.starlevel ?? 0,
  }));
  const activationRewards: ActivationReward[] = [];
  for (const r of actRewardsRaw) {
    try {
      activationRewards.push({ points: r.dictval, award: raw.awardSchema.parse(JSON.parse(r.note)) });
    } catch {
      errors.push(`activation_reward ${r.dictval} note is not a valid award`);
    }
  }

  // ---------- 以后子项目用到的表 ----------
  const seedIds = new Set(seedsRaw.map((s) => s.id));
  for (const s of seedsRaw) if (!foodIds.has(s.foodsId)) errors.push(`seed ${s.id} references unknown food ${s.foodsId}`);
  for (const e of seedExRaw) if (!seedIds.has(e.seedId)) errors.push(`seed_exchange references unknown seed ${e.seedId}`);
  for (const f of formulasRaw) {
    for (const id of [f.mainFoodsId, f.subFoodsId, f.addFoodsId, f.resFoodsId]) {
      if (!foodIds.has(id)) errors.push(`formula ${f.id} references unknown food ${id}`);
    }
  }
  for (const e of goodsExRaw) {
    if (!goodsIds.has(e.goodsId)) errors.push(`goods_exchange ${e.id} references unknown goods ${e.goodsId}`);
    for (const n of e.needGoods) {
      if (n.type === 'goods' && !goodsIds.has(n.id)) errors.push(`goods_exchange ${e.id} references unknown goods ${n.id}`);
    }
  }
  for (const r of renownRaw) if (!goodsIds.has(r.goodsId)) errors.push(`renown_shop references unknown goods ${r.goodsId}`);
  for (const b of blessRaw) {
    const gid = b.value?.goodsId;
    if (gid !== undefined && !goodsIds.has(gid)) errors.push(`bless ${b.id} references unknown goods ${gid}`);
  }

  // ---------- 开店默认值 ----------
  for (const g of defaults.giftGoods) {
    if (!goodsIds.has(g.id)) errors.push(`restaurant_defaults gift references unknown goods ${g.id}`);
  }
  if (!streetIds.has(defaults.streetId)) errors.push(`restaurant_defaults references unknown street ${defaults.streetId}`);

  if (errors.length > 0) return { bundle: null, errors };

  const body: Omit<ConfigBundle, 'version'> = {
    foods, goods, cookbooks, streets, mysteriousCookbooks, weather, devices, starNeed, starAward, oilNeed,
    tasks, activationTasks, activationRewards, restaurantDefaults: defaults,
    extra: {
      seeds: seedsRaw, seedExchange: seedExRaw, formulas: formulasRaw,
      goodsExchange: goodsExRaw, renownShop: renownRaw, bless: blessRaw,
    },
  };
  const version = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 12);
  return { bundle: { version, ...body }, errors: [] };
}
```

- [ ] **Step 6: 实现运行时、区服覆盖、CLI 和入口**

`packages/config/src/runtime.ts`：
```ts
import { readFileSync } from 'node:fs';
import type { ConfigBundle, Cookbook, Food, Goods, Street, Weather } from './types';

export interface GameConfig {
  readonly version: string;
  readonly bundle: ConfigBundle;
  readonly foods: ReadonlyMap<number, Food>;
  readonly goods: ReadonlyMap<number, Goods>;
  readonly cookbooks: ReadonlyMap<number, Cookbook>;
  readonly streets: ReadonlyMap<number, Street>;
  readonly weather: ReadonlyMap<number, Weather>;
  /** 最大食谱 id，用于确定每店已学食谱数组的长度 */
  readonly maxCookbookId: number;
  requireGoods(id: number): Goods;
  requireStreet(id: number): Street;
}

function byId<T extends { id: number }>(list: T[]): Map<number, T> {
  return new Map(list.map((x) => [x.id, x]));
}

export function createGameConfig(bundle: ConfigBundle): GameConfig {
  const goods = byId(bundle.goods);
  const streets = byId(bundle.streets);
  return {
    version: bundle.version,
    bundle,
    foods: byId(bundle.foods),
    goods,
    cookbooks: byId(bundle.cookbooks),
    streets,
    weather: byId(bundle.weather),
    maxCookbookId: Math.max(...bundle.cookbooks.map((c) => c.id)),
    requireGoods(id) {
      const g = goods.get(id);
      if (!g) throw new Error(`unknown goods ${id}`);
      return g;
    },
    requireStreet(id) {
      const s = streets.get(id);
      if (!s) throw new Error(`unknown street ${id}`);
      return s;
    },
  };
}

export function loadGameConfig(path: string): GameConfig {
  return createGameConfig(JSON.parse(readFileSync(path, 'utf8')) as ConfigBundle);
}

/** 道具效果持续小时数：invalidhour 优先，其次 value.time；都没有 = 永久 */
export function goodsEffectHours(g: Goods): number | null {
  if (g.invalidHours !== null) return g.invalidHours;
  const time = typeof g.value === 'object' && g.value !== null ? (g.value as { time?: unknown }).time : undefined;
  return typeof time === 'number' ? time : null;
}
```

`packages/config/src/shard.ts`：
```ts
import { z } from 'zod';
import { restaurantDefaultsSchema } from './raw';
import type { GameConfig } from './runtime';
import type { RestaurantDefaults } from './types';

export interface ShardSettings {
  /** 功能开关：未列出的功能默认开启 */
  features: Record<string, boolean>;
  restaurant: RestaurantDefaults;
}

const shardSettingsSchema = z.object({
  features: z.record(z.string(), z.boolean()),
  restaurant: restaurantDefaultsSchema,
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override === undefined ? base : override;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) out[k] = deepMerge(base[k], v);
  return out;
}

/** 基础配置 + 区服覆盖（深合并，数组整体替换），结果再校验一遍 */
export function resolveShardSettings(config: GameConfig, override: unknown): ShardSettings {
  const base: ShardSettings = { features: {}, restaurant: config.bundle.restaurantDefaults };
  return shardSettingsSchema.parse(deepMerge(base, isPlainObject(override) ? override : {}));
}

export function isFeatureEnabled(settings: ShardSettings, name: string): boolean {
  return settings.features[name] !== false;
}
```

`packages/config/src/cli.ts`：
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle } from './build';
import { defaultDataDir, readSourceDir } from './source';

const dir = process.argv[2] ?? defaultDataDir();
const out = process.argv[3] ?? fileURLToPath(new URL('../generated/bundle.json', import.meta.url));
const { bundle, errors } = buildBundle(readSourceDir(dir));
if (!bundle) {
  console.error(`配置校验失败（${errors.length} 条）：`);
  for (const e of errors.slice(0, 50)) console.error(`  - ${e}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(bundle));
console.log(`config bundle ${bundle.version} -> ${out}`);
```

`packages/config/src/index.ts`：
```ts
export * from './types';
export { buildBundle, type BuildResult } from './build';
export { defaultDataDir, readSourceDir, SOURCE_FILES, type SourceData } from './source';
export { createGameConfig, loadGameConfig, goodsEffectHours, type GameConfig } from './runtime';
export { resolveShardSettings, isFeatureEnabled, type ShardSettings } from './shard';
```

- [ ] **Step 7: 运行测试和构建**

Run: `pnpm vitest run --project config && pnpm --filter @dt/config build && pnpm typecheck && pnpm lint`
Expected: 测试全部通过；构建输出 `config bundle <12位hex> -> .../generated/bundle.json`。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat(config): validated config bundle with reference checks and shard overrides"
```

---
### Task 4: 服务端基础设施与数据库（环境变量、Docker、表结构、迁移、分区、测试环境）

**Files:**
- Create: `infra/compose.test.yml`, `infra/compose.dev.yml`
- Create: `apps/server/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `apps/server/src/env.ts`
- Create: `apps/server/src/db/index.ts`, `schema.ts`, `migrate.ts`, `partitions.ts`, `migrations/index.ts`, `migrations/0001_init.ts`
- Create: `apps/server/src/infra/redis.ts`
- Create: `apps/server/test/testEnv.ts`, `globalSetup.ts`, `db.ts`
- Test: `apps/server/src/env.test.ts`, `apps/server/src/db/migrate.test.ts`, `apps/server/src/db/partitions.test.ts`

**Interfaces:**
- Consumes: `@dt/config` 的 `readSourceDir`、`defaultDataDir`、`buildBundle`
- Produces：
  - `type Env`、`loadEnv(source?: Record<string, string | undefined>): Env`
  - `createDb(url: string, max?: number): Kysely<DB>`；`DB` 及各表类型；`type RestaurantRow = Selectable<RestaurantTable>`；`interface TableState { no: number; floor: number; customer: number }`
  - `migrateToLatest(db: Kysely<DB>): Promise<void>`
  - `partitionName(table, day)`、`ensureDailyPartitions(db, table: 'ledger' | 'news', from: Date, days: number): Promise<string[]>`、`dropPartitionsBefore(db, table, before: Date): Promise<string[]>`
  - `createRedis(url: string): Redis`
  - 测试：`testEnv`、`TEST_BUNDLE_PATH`、`testDb(): Kysely<DB>`

- [ ] **Step 1: 写 Docker Compose 文件并启动测试环境**

`infra/compose.test.yml`：
```yaml
name: dt-test
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dt
      POSTGRES_PASSWORD: dt
      POSTGRES_DB: dt_test
    ports: ['55432:5432']
    tmpfs: [/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dt -d dt_test']
      interval: 2s
      timeout: 3s
      retries: 30
  redis:
    image: redis:7-alpine
    ports: ['56379:6379']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 2s
      timeout: 3s
      retries: 30
```

`infra/compose.dev.yml`：
```yaml
name: dt-dev
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dt
      POSTGRES_PASSWORD: dt
      POSTGRES_DB: dt
    ports: ['5432:5432']
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dt -d dt']
      interval: 2s
      timeout: 3s
      retries: 30
  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 2s
      timeout: 3s
      retries: 30
  mailpit:
    image: axllent/mailpit:latest
    ports: ['1025:1025', '8025:8025']
volumes:
  pgdata:
```

Run: `pnpm infra:test`
Expected: 两个容器都显示 `Healthy`。

- [ ] **Step 2: 建服务端包并安装依赖**

`apps/server/package.json`：
```json
{
  "name": "@dt/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc -p tsconfig.json",
    "dev": "tsx watch --env-file=.env.development src/main.ts",
    "worker:dev": "tsx --env-file=.env.development src/worker.ts",
    "migrate:dev": "tsx --env-file=.env.development src/cli/migrate.ts",
    "shard": "tsx --env-file=.env.development src/cli/shard.ts",
    "build": "tsup"
  }
}
```

`apps/server/tsconfig.json`：
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`apps/server/test/testEnv.ts`：
```ts
import { fileURLToPath } from 'node:url';

export const TEST_BUNDLE_PATH = fileURLToPath(new URL('../.test/bundle.json', import.meta.url));

/** 测试环境变量；CI 可以用 TEST_DATABASE_URL / TEST_REDIS_URL 覆盖 */
export const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://dt:dt@localhost:55432/dt_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:56379/0',
  CONFIG_BUNDLE_PATH: TEST_BUNDLE_PATH,
  WEB_ORIGIN: 'http://localhost:5173',
  TURNSTILE_SECRET: '',
  SMTP_URL: 'smtp://localhost:1025',
};
```

`apps/server/vitest.config.ts`：
```ts
import { defineProject } from 'vitest/config';
import { testEnv } from './test/testEnv';

export default defineProject({
  test: {
    name: 'server',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    env: testEnv,
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
```

Run:
```bash
pnpm --filter @dt/server add "@dt/shared@workspace:*" "@dt/config@workspace:*" zod@^3.24 kysely@^0.27 pg@^8 ioredis@^5
pnpm --filter @dt/server add -D @types/pg@^8 tsx@^4
```

- [ ] **Step 3: 写失败的测试**

`apps/server/src/env.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgres://a:b@localhost:5432/x',
  REDIS_URL: 'redis://localhost:6379/0',
  CONFIG_BUNDLE_PATH: '/tmp/bundle.json',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadEnv', () => {
  it('填充默认值', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.TRUST_CF_HEADER).toBe(false);
    expect(env.SESSION_TTL_DAYS).toBe(30);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('解析布尔值和空字符串', () => {
    const env = loadEnv({ ...base, COOKIE_SECURE: 'true', TRUST_CF_HEADER: 'true', COOKIE_DOMAIN: '' });
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.TRUST_CF_HEADER).toBe(true);
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('缺少必填项时报错', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow();
  });

  it('生产环境必须配置人机验证和安全 Cookie', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'true' })).toThrow('TURNSTILE_SECRET');
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', TURNSTILE_SECRET: 's' })).toThrow('COOKIE_SECURE');
  });
});
```

`apps/server/src/db/migrate.test.ts`：
```ts
import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { migrateToLatest } from './migrate';

const db = testDb();
afterAll(() => db.destroy());

describe('migrations', () => {
  it('创建了全部表', async () => {
    const { rows } = await sql<{ table_name: string }>`
      select table_name from information_schema.tables where table_schema = 'public'`.execute(db);
    const names = rows.map((r) => r.table_name);
    for (const t of [
      'account', 'email_token', 'shard', 'shard_config', 'restaurant', 'restaurant_tables',
      'restaurant_cookbooks', 'effect_source', 'store_item', 'daily_counter', 'ledger', 'news', 'audit_log',
    ]) {
      expect(names).toContain(t);
    }
  });

  it('重复执行不报错', async () => {
    await expect(migrateToLatest(db)).resolves.toBeUndefined();
  });

  it('用户名大小写不敏感唯一', async () => {
    await db.insertInto('account').values({ username: 'CaseTest', password_hash: 'x', email: 'case1@t.local' }).execute();
    await expect(
      db.insertInto('account').values({ username: 'casetest', password_hash: 'x', email: 'case2@t.local' }).execute(),
    ).rejects.toMatchObject({ code: '23505', constraint: 'account_username_lower' });
  });

  it('bigint 读出为 number', async () => {
    const { rows } = await sql<{ n: number }>`select 9007199254740991::bigint as n`.execute(db);
    expect(rows[0]!.n).toBe(9007199254740991);
  });
});
```

`apps/server/src/db/partitions.test.ts`：
```ts
import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { dropPartitionsBefore, ensureDailyPartitions, partitionName } from './partitions';

const db = testDb();
afterAll(() => db.destroy());
const DAY = 86_400_000;

describe('daily partitions', () => {
  it('命名规则', () => {
    expect(partitionName('ledger', '2026-09-29')).toBe('ledger_p20260929');
  });

  it('预建分区后可以写入，并能删除过期分区', async () => {
    const now = new Date();
    const created = await ensureDailyPartitions(db, 'ledger', now, 2);
    expect(created).toHaveLength(2);
    await db.insertInto('ledger').values({ rest_id: 1, kind: 'coin', delta: 5, source: 'test' }).execute();

    const old = new Date(now.getTime() - 40 * DAY);
    const [oldName] = await ensureDailyPartitions(db, 'ledger', old, 1);
    const dropped = await dropPartitionsBefore(db, 'ledger', new Date(now.getTime() - 30 * DAY));
    expect(dropped).toContain(oldName);
    expect(dropped).not.toContain(created[0]);

    const { rows } = await sql<{ n: number }>`select count(*)::int as n from pg_class where relname = ${oldName}`.execute(db);
    expect(rows[0]!.n).toBe(0);
  });

  it('重复预建是幂等的', async () => {
    const now = new Date();
    await ensureDailyPartitions(db, 'news', now, 1);
    await expect(ensureDailyPartitions(db, 'news', now, 1)).resolves.toHaveLength(1);
  });
});
```

- [ ] **Step 4: 实现环境变量、数据库连接、表类型**

`apps/server/src/env.ts`：
```ts
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).default(10),
  REDIS_URL: z.string().url(),
  CONFIG_BUNDLE_PATH: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  COOKIE_SECURE: bool.default('false'),
  TRUST_CF_HEADER: bool.default('false'),
  TURNSTILE_SECRET: z.string().default(''),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('美味小镇 <noreply@localhost>'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  MIGRATE_ON_START: bool.default('false'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const env = envSchema.parse(source);
  if (env.NODE_ENV === 'production') {
    if (!env.TURNSTILE_SECRET) throw new Error('TURNSTILE_SECRET is required in production');
    if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production');
  }
  return env;
}
```

`apps/server/src/db/schema.ts`：
```ts
import type { ColumnType, Generated, Selectable } from 'kysely';

type Default<T> = ColumnType<T, T | undefined, T>;
type Ts = ColumnType<Date, Date | string, Date | string>;
type TsDefault = ColumnType<Date, Date | string | undefined, Date | string>;
type TsNullable = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Nullable<T> = ColumnType<T | null, T | null | undefined, T | null>;
/** jsonb：读出为对象，写入时传 JSON.stringify 后的字符串（避免 pg 把数组当成 PG 数组） */
type Json<T> = ColumnType<T, string, string>;
type JsonDefault<T> = ColumnType<T, string | undefined, string>;

export interface TableState {
  no: number;
  floor: number;
  customer: number;
}

export interface AccountTable {
  id: Generated<number>;
  username: string;
  password_hash: string;
  email: string;
  email_verified_at: TsNullable;
  role: Default<'player' | 'admin'>;
  banned_at: TsNullable;
  invite_code: Nullable<string>;
  invited_by: Nullable<number>;
  created_at: TsDefault;
}

export interface EmailTokenTable {
  token_hash: string;
  account_id: number;
  purpose: 'verify' | 'reset';
  expires_at: Ts;
  used_at: TsNullable;
  created_at: TsDefault;
}

export interface ShardTable {
  id: number;
  name: string;
  status: Default<'open' | 'closed'>;
  opened_at: TsDefault;
}

export interface ShardConfigTable {
  shard_id: number;
  override: JsonDefault<unknown>;
  updated_at: TsDefault;
}

export interface RestaurantTable {
  id: Generated<number>;
  shard_id: number;
  account_id: number;
  name: string;
  level: number;
  exp: Default<number>;
  coin: number;
  diamond: number;
  strength: number;
  strength_max: number;
  oil: number;
  oil_max: number;
  oil_level: Default<number>;
  star_level: Default<number>;
  street_id: number;
  renown: number;
  attr_left: number;
  attr_cook: Default<number>;
  attr_cutting: Default<number>;
  attr_fire: Default<number>;
  attr_season: Default<number>;
  attr_creatives: Default<number>;
  luck: Default<number>;
  table_num: number;
  cupboard_num: number;
  store_num: number;
  foods_max_num: number;
  foods_lock_num: number;
  /** 1 营业，2 停业 */
  state: Default<number>;
  /** 派生：各品级 / 各街道已学食谱数（子项目 2 维护） */
  cookbook_counts: JsonDefault<Record<string, unknown>>;
  effect_agg: JsonDefault<Record<string, number>>;
  effect_next_expire_at: TsNullable;
  effect_dirty: Default<boolean>;
  created_at: TsDefault;
}

export interface RestaurantTablesTable {
  rest_id: number;
  round_no: Default<number>;
  tables: Json<TableState[]>;
}

export interface RestaurantCookbooksTable {
  rest_id: number;
  /** 下标 = 食谱 id，值 = 品级 0~10 */
  levels: Buffer;
}

export interface EffectSourceTable {
  id: Generated<number>;
  rest_id: number;
  source_type: string;
  source_id: number;
  effects: Json<Record<string, number>>;
  expires_at: TsNullable;
  created_at: TsDefault;
}

export interface StoreItemTable {
  rest_id: number;
  goods_id: number;
  num: number;
  acquired_at: TsDefault;
  expires_at: TsNullable;
}

export interface DailyCounterTable {
  rest_id: number;
  /** YYYY-MM-DD（游戏日） */
  day: string;
  key: string;
  count: Default<number>;
}

export interface LedgerTable {
  id: Generated<number>;
  rest_id: number;
  kind: string;
  item_id: Nullable<number>;
  delta: number;
  source: string;
  ref_rest_id: Nullable<number>;
  created_at: TsDefault;
}

export interface NewsTable {
  id: Generated<number>;
  shard_id: number;
  type: string;
  rest_id: Nullable<number>;
  params: JsonDefault<Record<string, unknown>>;
  created_at: TsDefault;
}

export interface AuditLogTable {
  id: Generated<number>;
  actor_account_id: Nullable<number>;
  action: string;
  target: Nullable<string>;
  detail: JsonDefault<Record<string, unknown>>;
  ip: Nullable<string>;
  created_at: TsDefault;
}

export interface DB {
  account: AccountTable;
  email_token: EmailTokenTable;
  shard: ShardTable;
  shard_config: ShardConfigTable;
  restaurant: RestaurantTable;
  restaurant_tables: RestaurantTablesTable;
  restaurant_cookbooks: RestaurantCookbooksTable;
  effect_source: EffectSourceTable;
  store_item: StoreItemTable;
  daily_counter: DailyCounterTable;
  ledger: LedgerTable;
  news: NewsTable;
  audit_log: AuditLogTable;
}

export type RestaurantRow = Selectable<RestaurantTable>;
```

`apps/server/src/db/index.ts`：
```ts
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './schema';

// bigint（int8）读成 number（银币可能超过 2^31，但远小于 2^53）；date 保持 YYYY-MM-DD 字符串
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export function createDb(url: string, max = 10): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max }) }),
  });
}

export type { DB, RestaurantRow, TableState } from './schema';
```

`apps/server/src/infra/redis.ts`：
```ts
import { Redis } from 'ioredis';

export function createRedis(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: 3 });
}
```

- [ ] **Step 5: 实现迁移和分区**

`apps/server/src/db/migrations/0001_init.ts`：
```ts
import { sql, type Kysely } from 'kysely';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: Kysely<any>): Promise<void> {
  const statements = [
    sql`create extension if not exists pg_trgm`,
    sql`create table account (
      id integer generated always as identity primary key,
      username text not null,
      password_hash text not null,
      email text not null,
      email_verified_at timestamptz,
      role text not null default 'player' check (role in ('player', 'admin')),
      banned_at timestamptz,
      invite_code text unique,
      invited_by integer references account(id),
      created_at timestamptz not null default now()
    )`,
    sql`create unique index account_username_lower on account (lower(username))`,
    sql`create unique index account_email on account (email)`,
    sql`create table email_token (
      token_hash text primary key,
      account_id integer not null references account(id) on delete cascade,
      purpose text not null check (purpose in ('verify', 'reset')),
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )`,
    sql`create index email_token_account on email_token (account_id, purpose, created_at desc)`,
    sql`create table shard (
      id integer primary key,
      name text not null,
      status text not null default 'open' check (status in ('open', 'closed')),
      opened_at timestamptz not null default now()
    )`,
    sql`create table shard_config (
      shard_id integer primary key references shard(id),
      override jsonb not null default '{}',
      updated_at timestamptz not null default now()
    )`,
    sql`create table restaurant (
      id integer generated always as identity primary key,
      shard_id integer not null references shard(id),
      account_id integer not null references account(id),
      name text not null,
      level integer not null,
      exp bigint not null default 0,
      coin bigint not null,
      diamond integer not null,
      strength integer not null,
      strength_max integer not null,
      oil integer not null,
      oil_max integer not null,
      oil_level integer not null default 0,
      star_level integer not null default 0,
      street_id integer not null,
      renown integer not null,
      attr_left integer not null,
      attr_cook integer not null default 0,
      attr_cutting integer not null default 0,
      attr_fire integer not null default 0,
      attr_season integer not null default 0,
      attr_creatives integer not null default 0,
      luck integer not null default 0,
      table_num integer not null,
      cupboard_num integer not null,
      store_num integer not null,
      foods_max_num integer not null,
      foods_lock_num integer not null,
      state smallint not null default 1,
      cookbook_counts jsonb not null default '{}',
      effect_agg jsonb not null default '{}',
      effect_next_expire_at timestamptz,
      effect_dirty boolean not null default true,
      created_at timestamptz not null default now(),
      constraint restaurant_shard_account unique (shard_id, account_id)
    )`,
    sql`create unique index restaurant_shard_name on restaurant (shard_id, name)`,
    sql`create index restaurant_name_trgm on restaurant using gin (name gin_trgm_ops)`,
    sql`create table restaurant_tables (
      rest_id integer primary key references restaurant(id) on delete cascade,
      round_no bigint not null default 0,
      tables jsonb not null
    )`,
    sql`create table restaurant_cookbooks (
      rest_id integer primary key references restaurant(id) on delete cascade,
      levels bytea not null
    )`,
    sql`create table effect_source (
      id bigint generated always as identity primary key,
      rest_id integer not null references restaurant(id) on delete cascade,
      source_type text not null,
      source_id integer not null,
      effects jsonb not null,
      expires_at timestamptz,
      created_at timestamptz not null default now(),
      unique (rest_id, source_type, source_id)
    )`,
    sql`create table store_item (
      rest_id integer not null references restaurant(id) on delete cascade,
      goods_id integer not null,
      num integer not null check (num >= 0),
      acquired_at timestamptz not null default now(),
      expires_at timestamptz,
      primary key (rest_id, goods_id)
    )`,
    sql`create table daily_counter (
      rest_id integer not null references restaurant(id) on delete cascade,
      day date not null,
      key text not null,
      count integer not null default 0,
      primary key (rest_id, day, key)
    )`,
    sql`create table ledger (
      id bigint generated always as identity,
      rest_id integer not null,
      kind text not null,
      item_id integer,
      delta bigint not null,
      source text not null,
      ref_rest_id integer,
      created_at timestamptz not null default now(),
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index ledger_rest_time on ledger (rest_id, created_at desc)`,
    sql`create table ledger_default partition of ledger default`,
    sql`create table news (
      id bigint generated always as identity,
      shard_id integer not null,
      type text not null,
      rest_id integer,
      params jsonb not null default '{}',
      created_at timestamptz not null default now(),
      primary key (id, created_at)
    ) partition by range (created_at)`,
    sql`create index news_shard_time on news (shard_id, created_at desc)`,
    sql`create table news_default partition of news default`,
    sql`create table audit_log (
      id bigint generated always as identity primary key,
      actor_account_id integer,
      action text not null,
      target text,
      detail jsonb not null default '{}',
      ip text,
      created_at timestamptz not null default now()
    )`,
  ];
  for (const s of statements) await s.execute(db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: Kysely<any>): Promise<void> {
  for (const t of [
    'audit_log', 'news', 'ledger', 'daily_counter', 'store_item', 'effect_source', 'restaurant_cookbooks',
    'restaurant_tables', 'restaurant', 'shard_config', 'shard', 'email_token', 'account',
  ]) {
    await sql`drop table if exists ${sql.id(t)} cascade`.execute(db);
  }
}
```

`apps/server/src/db/migrations/index.ts`：
```ts
import type { Migration } from 'kysely';
import * as m0001 from './0001_init';

/** 迁移列表写在代码里（而不是按文件扫描），打包后也能用 */
export const migrations: Record<string, Migration> = {
  '0001_init': m0001,
};
```

`apps/server/src/db/migrate.ts`：
```ts
import { Migrator, type Kysely } from 'kysely';
import { migrations } from './migrations';
import type { DB } from './schema';

export async function migrateToLatest(db: Kysely<DB>): Promise<void> {
  const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error instanceof Error ? error : new Error(String(error));
}
```

`apps/server/src/db/partitions.ts`：
```ts
import { sql, type Kysely } from 'kysely';
import type { DB } from './schema';

export type PartitionedTable = 'ledger' | 'news';
const DAY_MS = 86_400_000;

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function partitionName(table: PartitionedTable | string, day: string): string {
  return `${table}_p${day.replaceAll('-', '')}`;
}

/** 从 from 所在的 UTC 日开始，预建 days 个按天分区；已存在的跳过 */
export async function ensureDailyPartitions(
  db: Kysely<DB>,
  table: PartitionedTable,
  from: Date,
  days: number,
): Promise<string[]> {
  const names: string[] = [];
  const first = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let i = 0; i < days; i++) {
    const start = new Date(first + i * DAY_MS);
    const end = new Date(first + (i + 1) * DAY_MS);
    const name = partitionName(table, utcDay(start));
    await sql`create table if not exists ${sql.id(name)} partition of ${sql.id(table)}
      for values from (${sql.lit(start.toISOString())}) to (${sql.lit(end.toISOString())})`.execute(db);
    names.push(name);
  }
  return names;
}

/** 删除 before 所在 UTC 日之前的分区 */
export async function dropPartitionsBefore(db: Kysely<DB>, table: PartitionedTable, before: Date): Promise<string[]> {
  const { rows } = await sql<{ relname: string }>`
    select c.relname from pg_inherits i
    join pg_class c on c.oid = i.inhrelid
    join pg_class p on p.oid = i.inhparent
    where p.relname = ${table}`.execute(db);
  const cutoff = utcDay(before).replaceAll('-', '');
  const pattern = new RegExp(`^${table}_p(\\d{8})$`);
  const dropped: string[] = [];
  for (const { relname } of rows) {
    const m = pattern.exec(relname);
    if (m && m[1]! < cutoff) {
      await sql`drop table ${sql.id(relname)}`.execute(db);
      dropped.push(relname);
    }
  }
  return dropped;
}
```

- [ ] **Step 6: 写测试环境的全局准备和数据库助手**

`apps/server/test/db.ts`：
```ts
import { createDb } from '../src/db';

export function testDb() {
  return createDb(process.env.DATABASE_URL!, 5);
}
```

`apps/server/test/globalSetup.ts`：
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sql } from 'kysely';
import { buildBundle, defaultDataDir, readSourceDir } from '@dt/config';
import { createDb } from '../src/db';
import { migrateToLatest } from '../src/db/migrate';
import { ensureDailyPartitions } from '../src/db/partitions';
import { createRedis } from '../src/infra/redis';
import { TEST_BUNDLE_PATH, testEnv } from './testEnv';

/** 每次测试运行：生成配置包、重建数据库、清空 Redis */
export default async function setup(): Promise<void> {
  const { bundle, errors } = buildBundle(readSourceDir(defaultDataDir()));
  if (!bundle) throw new Error(`config bundle invalid:\n${errors.join('\n')}`);
  mkdirSync(dirname(TEST_BUNDLE_PATH), { recursive: true });
  writeFileSync(TEST_BUNDLE_PATH, JSON.stringify(bundle));

  const db = createDb(testEnv.DATABASE_URL!, 2);
  await sql`drop schema if exists public cascade`.execute(db);
  await sql`create schema public`.execute(db);
  await migrateToLatest(db);
  const yesterday = new Date(Date.now() - 86_400_000);
  await ensureDailyPartitions(db, 'ledger', yesterday, 5);
  await ensureDailyPartitions(db, 'news', yesterday, 5);
  await db.destroy();

  const redis = createRedis(testEnv.REDIS_URL!);
  await redis.flushdb();
  redis.disconnect();
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: env、migrate、partitions 测试全部通过。

- [ ] **Step 8: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(server): env, database schema, migrations, daily partitions, test infra"
```

---

### Task 5: Redis 层与外部服务适配（会话存储、令牌桶、邮件、人机验证）

**Files:**
- Create: `apps/server/src/security/tokens.ts`, `sessionStore.ts`, `rateLimiter.ts`
- Create: `apps/server/src/infra/mailer.ts`, `captcha.ts`
- Test: `apps/server/src/security/sessionStore.test.ts`, `rateLimiter.test.ts`, `apps/server/src/infra/captcha.test.ts`, `apps/server/src/infra/mailer.test.ts`

**Interfaces:**
- Consumes: `createRedis`（Task 4）
- Produces：
  - `newToken(bytes?: number): string`、`sha256(s: string): string`
  - `interface SessionData { accountId: number; shardId: number | null; restaurantId: number | null; createdAt: string }`
  - `interface SessionStore { create(accountId): Promise<string>; get(token): Promise<SessionData | null>; update(token, patch: Partial<Pick<SessionData, 'shardId' | 'restaurantId'>>): Promise<void>; destroy(token): Promise<void>; destroyAll(accountId): Promise<void> }`、`createSessionStore(redis, ttlSeconds): SessionStore`
  - `interface RateRule { capacity: number; refillPerSec: number }`、`type RateRuleName = 'default' | 'auth' | 'email'`、`DEFAULT_RATE_RULES`、`interface RateLimiter { consume(key, rule, cost?, nowMs?): Promise<boolean> }`、`createRateLimiter(redis): RateLimiter`
  - `interface MailMessage { to; subject; text }`、`interface Mailer { send(msg): Promise<void> }`、`interface MemoryMailer extends Mailer { sent: MailMessage[]; lastTo(to): MailMessage | undefined }`、`smtpMailer(url, from): Mailer`、`memoryMailer(): MemoryMailer`
  - `interface Captcha { verify(token: string, ip: string): Promise<boolean> }`、`turnstileCaptcha(secret, fetchImpl?)`、`disabledCaptcha()`、`fixedCaptcha(result: boolean)`

- [ ] **Step 1: 安装依赖**

Run: `pnpm --filter @dt/server add nodemailer@^6 && pnpm --filter @dt/server add -D @types/nodemailer@^6`

- [ ] **Step 2: 写失败的测试**

`apps/server/src/security/sessionStore.test.ts`：
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from '../infra/redis';
import { createSessionStore } from './sessionStore';

const redis = createRedis(process.env.REDIS_URL!);
const store = createSessionStore(redis, 60);
afterAll(() => redis.disconnect());
let accountSeq = 900000 + Math.floor(Math.random() * 10000);

describe('SessionStore', () => {
  it('创建、读取、更新、销毁', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    expect(await store.get(token)).toMatchObject({ accountId: id, shardId: null, restaurantId: null });
    await store.update(token, { shardId: 3, restaurantId: 7 });
    expect(await store.get(token)).toMatchObject({ shardId: 3, restaurantId: 7 });
    expect(await redis.ttl(`sess:${(await import('./tokens')).sha256(token)}`)).toBeGreaterThan(0);
    await store.destroy(token);
    expect(await store.get(token)).toBeNull();
  });

  it('新登录使旧会话失效（单点登录）', async () => {
    const id = ++accountSeq;
    const first = await store.create(id);
    const second = await store.create(id);
    expect(await store.get(first)).toBeNull();
    expect(await store.get(second)).not.toBeNull();
  });

  it('destroyAll 清掉该账号的会话', async () => {
    const id = ++accountSeq;
    const token = await store.create(id);
    await store.destroyAll(id);
    expect(await store.get(token)).toBeNull();
  });

  it('伪造或超长的令牌返回 null', async () => {
    expect(await store.get('not-a-real-token')).toBeNull();
    expect(await store.get('x'.repeat(500))).toBeNull();
    expect(await store.get('')).toBeNull();
  });
});
```

`apps/server/src/security/rateLimiter.test.ts`：
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from '../infra/redis';
import { createRateLimiter } from './rateLimiter';

const redis = createRedis(process.env.REDIS_URL!);
const limiter = createRateLimiter(redis);
afterAll(() => redis.disconnect());
const key = () => `test:${Math.random().toString(36).slice(2)}`;

describe('token bucket', () => {
  it('容量用完后拒绝，按速率回填', async () => {
    const k = key();
    const rule = { capacity: 3, refillPerSec: 1 };
    const t0 = 1_000_000;
    expect(await limiter.consume(k, rule, 1, t0)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0)).toBe(false);
    expect(await limiter.consume(k, rule, 1, t0 + 1000)).toBe(true);
    expect(await limiter.consume(k, rule, 1, t0 + 1000)).toBe(false);
  });

  it('回填不超过容量', async () => {
    const k = key();
    const rule = { capacity: 2, refillPerSec: 10 };
    expect(await limiter.consume(k, rule, 2, 0)).toBe(true);
    expect(await limiter.consume(k, rule, 3, 100_000)).toBe(false);
    expect(await limiter.consume(k, rule, 2, 100_000)).toBe(true);
  });

  it('不同的 key 互不影响', async () => {
    const rule = { capacity: 1, refillPerSec: 0.001 };
    const a = key();
    const b = key();
    expect(await limiter.consume(a, rule, 1, 0)).toBe(true);
    expect(await limiter.consume(a, rule, 1, 0)).toBe(false);
    expect(await limiter.consume(b, rule, 1, 0)).toBe(true);
  });
});
```

`apps/server/src/infra/captcha.test.ts`：
```ts
import { describe, expect, it, vi } from 'vitest';
import { disabledCaptcha, fixedCaptcha, turnstileCaptcha } from './captcha';

describe('turnstileCaptcha', () => {
  it('把 secret、token、ip 发给 Cloudflare，按 success 返回', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    const ok = await turnstileCaptcha('sec', fetchImpl).verify('tok', '1.2.3.4');
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = init.body as URLSearchParams;
    expect(body.get('secret')).toBe('sec');
    expect(body.get('response')).toBe('tok');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('校验失败或网络错误都返回 false', async () => {
    const no = vi.fn(async () => new Response(JSON.stringify({ success: false })));
    expect(await turnstileCaptcha('s', no).verify('t', 'ip')).toBe(false);
    const broken = vi.fn(async () => {
      throw new Error('network down');
    });
    expect(await turnstileCaptcha('s', broken).verify('t', 'ip')).toBe(false);
  });

  it('开发用的实现', async () => {
    expect(await disabledCaptcha().verify('', '')).toBe(true);
    expect(await fixedCaptcha(false).verify('x', 'y')).toBe(false);
  });
});
```

`apps/server/src/infra/mailer.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { memoryMailer } from './mailer';

describe('memoryMailer', () => {
  it('记录发出的邮件，lastTo 取最近一封', async () => {
    const m = memoryMailer();
    await m.send({ to: 'a@x', subject: '1', text: 'first' });
    await m.send({ to: 'a@x', subject: '2', text: 'second' });
    expect(m.sent).toHaveLength(2);
    expect(m.lastTo('a@x')!.text).toBe('second');
    expect(m.lastTo('b@x')).toBeUndefined();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run --project server`
Expected: FAIL，找不到 `./sessionStore`、`./rateLimiter`、`./captcha`、`./mailer`。

- [ ] **Step 4: 实现**

`apps/server/src/security/tokens.ts`：
```ts
import { createHash, randomBytes } from 'node:crypto';

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
```

`apps/server/src/security/sessionStore.ts`：
```ts
import type { Redis } from 'ioredis';
import { newToken, sha256 } from './tokens';

export interface SessionData {
  accountId: number;
  shardId: number | null;
  restaurantId: number | null;
  createdAt: string;
}

export interface SessionStore {
  create(accountId: number): Promise<string>;
  get(token: string): Promise<SessionData | null>;
  update(token: string, patch: Partial<Pick<SessionData, 'shardId' | 'restaurantId'>>): Promise<void>;
  destroy(token: string): Promise<void>;
  destroyAll(accountId: number): Promise<void>;
}

/**
 * Redis 里只存令牌的哈希：sess:<hash> → 会话数据；sess-acct:<账号> → 当前有效的 hash。
 * 同一账号新建会话时删除旧会话，实现"新登录挤掉旧登录"。
 */
export function createSessionStore(redis: Redis, ttlSeconds: number): SessionStore {
  const key = (hash: string) => `sess:${hash}`;
  const accountKey = (accountId: number) => `sess-acct:${accountId}`;

  return {
    async create(accountId) {
      const token = newToken();
      const hash = sha256(token);
      const data: SessionData = { accountId, shardId: null, restaurantId: null, createdAt: new Date().toISOString() };
      const old = await redis.get(accountKey(accountId));
      const tx = redis
        .multi()
        .set(key(hash), JSON.stringify(data), 'EX', ttlSeconds)
        .set(accountKey(accountId), hash, 'EX', ttlSeconds);
      if (old) tx.del(key(old));
      await tx.exec();
      return token;
    },

    async get(token) {
      if (!token || token.length > 128) return null;
      const raw = await redis.get(key(sha256(token)));
      return raw ? (JSON.parse(raw) as SessionData) : null;
    },

    async update(token, patch) {
      const k = key(sha256(token));
      const raw = await redis.get(k);
      if (!raw) return;
      await redis.set(k, JSON.stringify({ ...(JSON.parse(raw) as SessionData), ...patch }), 'KEEPTTL');
    },

    async destroy(token) {
      const hash = sha256(token);
      const raw = await redis.get(key(hash));
      if (!raw) return;
      const { accountId } = JSON.parse(raw) as SessionData;
      await redis.del(key(hash));
      if ((await redis.get(accountKey(accountId))) === hash) await redis.del(accountKey(accountId));
    },

    async destroyAll(accountId) {
      const hash = await redis.get(accountKey(accountId));
      const tx = redis.multi().del(accountKey(accountId));
      if (hash) tx.del(key(hash));
      await tx.exec();
    },
  };
}
```

`apps/server/src/security/rateLimiter.ts`：
```ts
import type { Redis } from 'ioredis';

export interface RateRule {
  capacity: number;
  refillPerSec: number;
}

export type RateRuleName = 'default' | 'auth' | 'email';

export const DEFAULT_RATE_RULES: Record<RateRuleName, RateRule> = {
  default: { capacity: 60, refillPerSec: 10 },
  auth: { capacity: 10, refillPerSec: 0.2 },
  email: { capacity: 3, refillPerSec: 1 / 60 },
};

export interface RateLimiter {
  consume(key: string, rule: RateRule, cost?: number, nowMs?: number): Promise<boolean>;
}

/** 令牌桶：原子地回填并扣减，桶满后自动过期 */
const SCRIPT = `
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1])
local ts = tonumber(b[2])
if tokens == nil then
  tokens = cap
  ts = now
end
tokens = math.min(cap, tokens + math.max(0, now - ts) / 1000 * rate)
local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000) + 1000)
return allowed
`;

export function createRateLimiter(redis: Redis): RateLimiter {
  return {
    async consume(key, rule, cost = 1, nowMs = Date.now()) {
      const r = await redis.eval(SCRIPT, 1, `rl:${key}`, rule.capacity, rule.refillPerSec, nowMs, cost);
      return Number(r) === 1;
    },
  };
}
```

`apps/server/src/infra/mailer.ts`：
```ts
import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export interface MemoryMailer extends Mailer {
  readonly sent: MailMessage[];
  lastTo(to: string): MailMessage | undefined;
}

export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async send(msg) {
      await transport.sendMail({ from, ...msg });
    },
  };
}

/** 测试用：只记录，不发送 */
export function memoryMailer(): MemoryMailer {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(msg) {
      sent.push(msg);
    },
    lastTo(to) {
      return [...sent].reverse().find((m) => m.to === to);
    },
  };
}
```

`apps/server/src/infra/captcha.ts`：
```ts
export interface Captcha {
  verify(token: string, ip: string): Promise<boolean>;
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileCaptcha(secret: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): Captcha {
  return {
    async verify(token, ip) {
      try {
        const body = new URLSearchParams({ secret, response: token, remoteip: ip });
        const res = await fetchImpl(SITEVERIFY, { method: 'POST', body });
        const json = (await res.json()) as { success?: boolean };
        return json.success === true;
      } catch {
        return false;
      }
    },
  };
}

/** 开发环境没配 TURNSTILE_SECRET 时使用：一律通过 */
export function disabledCaptcha(): Captcha {
  return { verify: async () => true };
}

/** 测试用 */
export function fixedCaptcha(result: boolean): Captcha {
  return { verify: async () => result };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(server): redis session store, token bucket, mailer and captcha adapters"
```

---

### Task 6: 事务助手、事件总线、流水、新闻、每日计数

**Files:**
- Create: `apps/server/src/http/errors.ts`
- Create: `apps/server/src/db/tx.ts`, `apps/server/src/db/errors.ts`
- Create: `apps/server/src/events/bus.ts`
- Create: `apps/server/src/modules/ledger/ledger.ts`, `apps/server/src/modules/news/news.ts`, `apps/server/src/modules/counter/dailyCounter.ts`
- Create: `apps/server/test/fixtures.ts`
- Test: `apps/server/src/db/tx.test.ts`, `apps/server/src/events/bus.test.ts`, `apps/server/src/modules/records.test.ts`

**Interfaces:**
- Consumes: `createDb`、`DB`、`RestaurantRow`（Task 4），`ErrorCode`、`gameDay`（`@dt/shared`）
- Produces：
  - `class AppError extends Error { code: ErrorCode; status: number; params?: Record<string, unknown> }`，构造 `new AppError(code, status = 400, params?)`
  - `withRestaurants<T>(db, ids: number[], fn: (tx: Transaction<DB>, rests: Map<number, RestaurantRow>) => Promise<T>): Promise<T>`、`withRestaurant<T>(db, restId, fn: (tx, rest: RestaurantRow) => Promise<T>): Promise<T>`
  - `uniqueViolation(e: unknown): string | null`（返回违反的约束名）
  - `interface DomainEvent { name: string; shardId: number; restId: number; payload?: Record<string, unknown> }`、`type EventHandler = (tx: Kysely<DB>, event: DomainEvent) => Promise<void>`、`class EventBus { on(name, handler); emit(tx, event): Promise<void> }`（`'*'` 订阅全部）
  - `interface LedgerEntry { restId; kind: 'goods' | 'foods' | 'coin' | 'diamond' | 'exp' | 'renown' | 'oil' | 'strength'; itemId?; delta; source; refRestId? }`、`recordLedger(db, entries): Promise<void>`
  - `postNews(db, news: { shardId; type; restId?; params? }): Promise<void>`
  - `incrementDaily(db, restId, key, by?, day?): Promise<number>`、`getDaily(db, restId, key, day?): Promise<number>`
  - 测试 fixtures：`uniqueName(prefix?: string): string`（≤9 字符）、`createShard(db, opts?): Promise<number>`、`createAccountRow(db): Promise<number>`、`createRestaurantRow(db, shardId, accountId, patch?): Promise<number>`

- [ ] **Step 1: 写测试数据助手**

`apps/server/test/fixtures.ts`：
```ts
import type { Insertable, Kysely } from 'kysely';
import type { DB } from '../src/db';
import type { RestaurantTable } from '../src/db/schema';

let seq = Math.floor(Math.random() * 1_000_000);

/** 生成 <= 9 个字符的唯一名称（用户名上限 9） */
export function uniqueName(prefix = 't'): string {
  seq += 1;
  return (prefix + seq.toString(36) + Math.random().toString(36).slice(2)).slice(0, 9);
}

export async function createShard(
  db: Kysely<DB>,
  opts: { status?: 'open' | 'closed'; name?: string } = {},
): Promise<number> {
  const row = await db
    .selectFrom('shard')
    .select((eb) => eb.fn.coalesce(eb.fn.max('id'), eb.val(100000)).as('max'))
    .executeTakeFirstOrThrow();
  const id = Number(row.max) + 1;
  await db
    .insertInto('shard')
    .values({ id, name: opts.name ?? `测试服${id}`, status: opts.status ?? 'open' })
    .execute();
  return id;
}

export async function createAccountRow(db: Kysely<DB>): Promise<number> {
  const name = uniqueName('a');
  const row = await db
    .insertInto('account')
    .values({ username: name, password_hash: 'x', email: `${name}@fixture.local` })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function createRestaurantRow(
  db: Kysely<DB>,
  shardId: number,
  accountId: number,
  patch: Partial<Insertable<RestaurantTable>> = {},
): Promise<number> {
  const row = await db
    .insertInto('restaurant')
    .values({
      shard_id: shardId,
      account_id: accountId,
      name: uniqueName('r'),
      level: 1,
      coin: 0,
      diamond: 0,
      strength: 100,
      strength_max: 100,
      oil: 1000,
      oil_max: 1000,
      street_id: 0,
      renown: 0,
      attr_left: 0,
      table_num: 4,
      cupboard_num: 100,
      store_num: 20,
      foods_max_num: 999,
      foods_lock_num: 15,
      ...patch,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}
```

- [ ] **Step 2: 写失败的测试**

`apps/server/src/db/tx.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../test/fixtures';
import { withRestaurant, withRestaurants } from './tx';

const db = testDb();
let shardId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
});

async function newRest(): Promise<number> {
  return createRestaurantRow(db, shardId, await createAccountRow(db), { coin: 0 });
}
async function coinOf(id: number): Promise<number> {
  return (await db.selectFrom('restaurant').select('coin').where('id', '=', id).executeTakeFirstOrThrow()).coin;
}

describe('withRestaurant', () => {
  it('同一家店的并发"读-改-写"被串行化', async () => {
    const id = await newRest();
    await Promise.all(
      Array.from({ length: 20 }, () =>
        withRestaurant(db, id, async (tx, rest) => {
          await new Promise((r) => setTimeout(r, 5));
          await tx.updateTable('restaurant').set({ coin: rest.coin + 1 }).where('id', '=', id).execute();
        }),
      ),
    );
    expect(await coinOf(id)).toBe(20);
  });

  it('出错时回滚', async () => {
    const id = await newRest();
    await expect(
      withRestaurant(db, id, async (tx) => {
        await tx.updateTable('restaurant').set({ coin: 999 }).where('id', '=', id).execute();
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await coinOf(id)).toBe(0);
  });

  it('餐厅不存在时抛 RESTAURANT_NOT_FOUND', async () => {
    await expect(withRestaurant(db, 2_000_000_000, async () => 1)).rejects.toMatchObject({
      code: 'RESTAURANT_NOT_FOUND',
      status: 404,
    });
  });
});

describe('withRestaurants', () => {
  it('两家店互相操作（a→b 与 b→a 同时进行）不会死锁', async () => {
    const a = await newRest();
    const b = await newRest();
    const move = (from: number, to: number) =>
      withRestaurants(db, [from, to], async (tx, rests) => {
        await new Promise((r) => setTimeout(r, 3));
        await tx.updateTable('restaurant').set({ coin: rests.get(from)!.coin - 1 }).where('id', '=', from).execute();
        await tx.updateTable('restaurant').set({ coin: rests.get(to)!.coin + 1 }).where('id', '=', to).execute();
      });
    await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? move(a, b) : move(b, a))));
    expect((await coinOf(a)) + (await coinOf(b))).toBe(0);
    expect(await coinOf(a)).toBe(0);
  });
});
```

`apps/server/src/events/bus.test.ts`：
```ts
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { EventBus } from './bus';

const db = testDb();
afterAll(() => db.destroy());

describe('EventBus', () => {
  it('按事件名和通配符分发，处理函数拿到同一个事务', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('oil.fill', async (_tx, e) => void seen.push(`named:${e.restId}`));
    bus.on('*', async (_tx, e) => void seen.push(`any:${e.name}`));
    await db.transaction().execute((tx) => bus.emit(tx, { name: 'oil.fill', shardId: 1, restId: 7 }));
    expect(seen).toEqual(['named:7', 'any:oil.fill']);
  });

  it('处理函数抛错会让整个事务回滚', async () => {
    const bus = new EventBus();
    bus.on('x', async (tx) => {
      await tx.insertInto('audit_log').values({ action: 'bus-rollback-test' }).execute();
      throw new Error('handler failed');
    });
    await expect(
      db.transaction().execute((tx) => bus.emit(tx, { name: 'x', shardId: 1, restId: 1 })),
    ).rejects.toThrow('handler failed');
    const row = await db
      .selectFrom('audit_log')
      .select('id')
      .where('action', '=', 'bus-rollback-test')
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });
});
```

`apps/server/src/modules/records.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../test/fixtures';
import { getDaily, incrementDaily } from './counter/dailyCounter';
import { recordLedger } from './ledger/ledger';
import { postNews } from './news/news';

const db = testDb();
let shardId: number;
let restId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
  restId = await createRestaurantRow(db, shardId, await createAccountRow(db));
});

describe('dailyCounter', () => {
  it('按（餐厅, 游戏日, 计数项）累加', async () => {
    expect(await getDaily(db, restId, 'flip', '2026-09-29')).toBe(0);
    expect(await incrementDaily(db, restId, 'flip', 1, '2026-09-29')).toBe(1);
    expect(await incrementDaily(db, restId, 'flip', 2, '2026-09-29')).toBe(3);
    expect(await incrementDaily(db, restId, 'flip', 1, '2026-09-30')).toBe(1);
    expect(await getDaily(db, restId, 'flip', '2026-09-29')).toBe(3);
  });
});

describe('ledger / news', () => {
  it('写入流水', async () => {
    await recordLedger(db, [
      { restId, kind: 'goods', itemId: 1, delta: 3, source: 'test' },
      { restId, kind: 'coin', delta: -50, source: 'test' },
    ]);
    const rows = await db.selectFrom('ledger').selectAll().where('rest_id', '=', restId).execute();
    expect(rows.map((r) => [r.kind, r.delta])).toEqual(
      expect.arrayContaining([
        ['goods', 3],
        ['coin', -50],
      ]),
    );
  });

  it('空列表不报错', async () => {
    await expect(recordLedger(db, [])).resolves.toBeUndefined();
  });

  it('写入新闻（结构化参数）', async () => {
    await postNews(db, { shardId, type: 'test.news', restId, params: { name: '小店' } });
    const row = await db
      .selectFrom('news')
      .selectAll()
      .where('shard_id', '=', shardId)
      .where('type', '=', 'test.news')
      .executeTakeFirstOrThrow();
    expect(row.params).toEqual({ name: '小店' });
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run --project server`
Expected: FAIL，找不到 `./tx`、`./bus` 等模块。

- [ ] **Step 4: 实现**

`apps/server/src/http/errors.ts`：
```ts
import type { ErrorCode } from '@dt/shared';

/** 业务错误：由统一错误处理转成 {ok:false, code, params} */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly params?: Record<string, unknown>;

  constructor(code: ErrorCode, status = 400, params?: Record<string, unknown>) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.params = params;
  }
}
```

`apps/server/src/db/errors.ts`：
```ts
/** PostgreSQL 唯一约束冲突（23505）时返回约束名，否则返回 null */
export function uniqueViolation(e: unknown): string | null {
  const err = e as { code?: unknown; constraint?: unknown } | null;
  if (err && err.code === '23505') return typeof err.constraint === 'string' ? err.constraint : '';
  return null;
}
```

`apps/server/src/db/tx.ts`：
```ts
import type { Kysely, Transaction } from 'kysely';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';
import type { DB, RestaurantRow } from './schema';

/**
 * 在一个事务里按 restId 升序锁住若干家餐厅，再执行 fn。
 * 所有写餐厅数据的操作都必须走这里：同一家店的操作串行，不同店之间并行；固定加锁顺序避免死锁。
 */
export async function withRestaurants<T>(
  db: Kysely<DB>,
  ids: number[],
  fn: (tx: Transaction<DB>, rests: Map<number, RestaurantRow>) => Promise<T>,
): Promise<T> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  return db.transaction().execute(async (tx) => {
    const rests = new Map<number, RestaurantRow>();
    for (const id of sorted) {
      const row = await tx.selectFrom('restaurant').selectAll().where('id', '=', id).forUpdate().executeTakeFirst();
      if (!row) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404, { restId: id });
      rests.set(id, row);
    }
    return fn(tx, rests);
  });
}

export function withRestaurant<T>(
  db: Kysely<DB>,
  restId: number,
  fn: (tx: Transaction<DB>, rest: RestaurantRow) => Promise<T>,
): Promise<T> {
  return withRestaurants(db, [restId], (tx, rests) => fn(tx, rests.get(restId)!));
}
```

`apps/server/src/events/bus.ts`：
```ts
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema';

export interface DomainEvent {
  name: string;
  shardId: number;
  restId: number;
  payload?: Record<string, unknown>;
}

export type EventHandler = (tx: Kysely<DB>, event: DomainEvent) => Promise<void>;

/** 进程内事件总线：在业务所在的同一事务里同步执行处理函数，任何一个失败则整体回滚 */
export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  on(name: string, handler: EventHandler): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
  }

  async emit(tx: Kysely<DB>, event: DomainEvent): Promise<void> {
    const list = [...(this.handlers.get(event.name) ?? []), ...(this.handlers.get('*') ?? [])];
    for (const handler of list) await handler(tx, event);
  }
}
```

`apps/server/src/modules/ledger/ledger.ts`：
```ts
import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export interface LedgerEntry {
  restId: number;
  kind: 'goods' | 'foods' | 'coin' | 'diamond' | 'exp' | 'renown' | 'oil' | 'strength';
  itemId?: number;
  delta: number;
  source: string;
  refRestId?: number;
}

export async function recordLedger(db: Kysely<DB>, entries: LedgerEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db
    .insertInto('ledger')
    .values(
      entries.map((e) => ({
        rest_id: e.restId,
        kind: e.kind,
        item_id: e.itemId ?? null,
        delta: e.delta,
        source: e.source,
        ref_rest_id: e.refRestId ?? null,
      })),
    )
    .execute();
}
```

`apps/server/src/modules/news/news.ts`：
```ts
import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export interface NewsInput {
  shardId: number;
  type: string;
  restId?: number;
  params?: Record<string, unknown>;
}

/** 新闻只存事件类型和参数，文案由前端生成 */
export async function postNews(db: Kysely<DB>, news: NewsInput): Promise<void> {
  await db
    .insertInto('news')
    .values({
      shard_id: news.shardId,
      type: news.type,
      rest_id: news.restId ?? null,
      params: JSON.stringify(news.params ?? {}),
    })
    .execute();
}
```

`apps/server/src/modules/counter/dailyCounter.ts`：
```ts
import { sql, type Kysely } from 'kysely';
import { gameDay } from '@dt/shared';
import type { DB } from '../../db/schema';

/** 每日计数加 by，返回累加后的值（插入或累加一条语句完成） */
export async function incrementDaily(
  db: Kysely<DB>,
  restId: number,
  key: string,
  by = 1,
  day: string = gameDay(),
): Promise<number> {
  const row = await db
    .insertInto('daily_counter')
    .values({ rest_id: restId, day, key, count: by })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'day', 'key']).doUpdateSet({ count: sql<number>`daily_counter.count + ${by}` }),
    )
    .returning('count')
    .executeTakeFirstOrThrow();
  return row.count;
}

export async function getDaily(db: Kysely<DB>, restId: number, key: string, day: string = gameDay()): Promise<number> {
  const row = await db
    .selectFrom('daily_counter')
    .select('count')
    .where('rest_id', '=', restId)
    .where('day', '=', day)
    .where('key', '=', key)
    .executeTakeFirst();
  return row?.count ?? 0;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(server): per-restaurant locking, event bus, ledger, news, daily counters"
```

---

### Task 7: HTTP 应用框架（统一响应、错误处理、真实 IP、健康检查、会话、限流、幂等）

**Files:**
- Create: `apps/server/src/http/reply.ts`, `validate.ts`, `clientIp.ts`, `errorHandling.ts`, `health.ts`
- Create: `apps/server/src/security/session.ts`, `rateLimit.ts`, `idempotency.ts`
- Create: `apps/server/src/types/fastify.d.ts`
- Create: `apps/server/src/modules/index.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/test/helpers.ts`
- Test: `apps/server/src/app.test.ts`, `apps/server/src/security/session.test.ts`, `rateLimit.test.ts`, `idempotency.test.ts`

**Interfaces:**
- Consumes: Task 4~6 的全部产出
- Produces：
  - `ok<T>(data: T, events?: GameEvent[]): OkResponse<T>`、`fail(code, params?): ErrResponse`
  - `parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T`（失败抛 ZodError → 400 `VALIDATION_FAILED`）
  - `SESSION_COOKIE = 'dt_sid'`、`interface LoadedSession { token: string; data: SessionData }`、`setSessionCookie(reply, token, env)`、`clearSessionCookie(reply, env)`、`requireAccount(req): LoadedSession`、`interface RestaurantContext { session; accountId; shardId; restaurantId }`、`requireRestaurant(req): RestaurantContext`
  - `interface AppDeps { env; db; redis; config: GameConfig; mailer: Mailer; captcha: Captcha; bus: EventBus; sessions: SessionStore; now: () => Date; rateRules?: Partial<Record<RateRuleName, RateRule>> }`
  - `buildApp(deps: AppDeps, extend?: (app: FastifyInstance) => void): Promise<FastifyInstance>`（返回的实例还没 ready）
  - `registerModules(app, deps): void`（本任务为空，Task 8/9/11 填充）
  - 路由配置：`{ config: { rateLimit: 'auth' | 'email' | 'default' } }`
  - 测试助手：`GENEROUS_RULES`、`testConfig()`、`testEnvWith(patch)`、`interface TestContext { app; deps; mailer: MemoryMailer; close() }`、`createTestApp(overrides?, extend?)`、`call(app, method, url, opts?: { cookie?; body?; headers?; ip? })` → `{ status, json, res }`、`cookieOf(res): string`

- [ ] **Step 1: 安装依赖**

Run: `pnpm --filter @dt/server add fastify@^5 @fastify/cookie @fastify/cors pino@^9`

- [ ] **Step 2: 实现响应、校验、错误处理、真实 IP、健康检查**

`apps/server/src/http/reply.ts`：
```ts
import type { ErrorCode, ErrResponse, GameEvent, OkResponse } from '@dt/shared';

export function ok<T>(data: T, events: GameEvent[] = []): OkResponse<T> {
  return { ok: true, data, events };
}

export function fail(code: ErrorCode, params?: Record<string, unknown>): ErrResponse {
  return params ? { ok: false, code, params } : { ok: false, code };
}
```

`apps/server/src/http/validate.ts`：
```ts
import type { z } from 'zod';

/** 校验请求参数；失败时抛 ZodError，由统一错误处理转成 400 VALIDATION_FAILED */
export function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  return schema.parse(value);
}
```

`apps/server/src/http/clientIp.ts`：
```ts
import type { FastifyInstance } from 'fastify';

/**
 * 真实 IP：只有在服务器只接受 Cloudflare Tunnel 流量（TRUST_CF_HEADER=true）时才信任 CF-Connecting-IP，
 * 否则这个请求头可以被伪造。
 */
export function registerClientIp(app: FastifyInstance, trustCfHeader: boolean): void {
  app.decorateRequest('clientIp', '');
  app.addHook('onRequest', async (req) => {
    const cf = req.headers['cf-connecting-ip'];
    req.clientIp = trustCfHeader && typeof cf === 'string' && cf.length > 0 ? cf : req.ip;
  });
}
```

`apps/server/src/http/errorHandling.ts`：
```ts
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode } from '@dt/shared';
import { AppError } from './errors';
import { fail } from './reply';

export function registerErrorHandling(app: FastifyInstance): void {
  // 写操作只接受 JSON：挡住跨站表单提交
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'POST') return;
    const length = Number(req.headers['content-length'] ?? '0');
    const hasBody = length > 0 || req.headers['transfer-encoding'] !== undefined;
    const type = req.headers['content-type'] ?? '';
    if (hasBody && !type.startsWith('application/json')) {
      reply.code(415).send(fail(ErrorCode.VALIDATION_FAILED, { reason: 'json_required' }));
      return reply;
    }
  });

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send(fail(err.code, err.params));
    if (err instanceof ZodError) {
      return reply.code(400).send(
        fail(ErrorCode.VALIDATION_FAILED, {
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }),
      );
    }
    const status = (err as FastifyError).statusCode ?? 500;
    if (status < 500) {
      return reply.code(status).send(fail(ErrorCode.VALIDATION_FAILED, { reason: (err as FastifyError).code ?? 'bad_request' }));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send(fail(ErrorCode.INTERNAL));
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(fail(ErrorCode.NOT_FOUND)));
}
```

`apps/server/src/http/health.ts`：
```ts
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import { ErrorCode } from '@dt/shared';
import type { DB } from '../db/schema';
import { fail, ok } from './reply';

export function registerHealth(app: FastifyInstance, deps: { db: Kysely<DB>; redis: Redis }): void {
  app.get('/healthz', async () => ok({ status: 'ok' }));
  app.get('/readyz', async (req, reply) => {
    try {
      await sql`select 1`.execute(deps.db);
      await deps.redis.ping();
      return ok({ status: 'ready' });
    } catch (err) {
      req.log.error({ err }, 'readiness check failed');
      return reply.code(503).send(fail(ErrorCode.INTERNAL));
    }
  });
}
```

- [ ] **Step 3: 实现会话插件、限流钩子、幂等钩子、类型扩展**

`apps/server/src/security/session.ts`：
```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode } from '@dt/shared';
import type { Env } from '../env';
import { AppError } from '../http/errors';
import type { SessionData, SessionStore } from './sessionStore';

export const SESSION_COOKIE = 'dt_sid';

export interface LoadedSession {
  token: string;
  data: SessionData;
}

export interface RestaurantContext {
  session: LoadedSession;
  accountId: number;
  shardId: number;
  restaurantId: number;
}

export function registerSession(app: FastifyInstance, store: SessionStore): void {
  app.decorateRequest('session', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const data = await store.get(token);
    req.session = data ? { token, data } : null;
  });
}

export function setSessionCookie(reply: FastifyReply, token: string, env: Env): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * 86400,
  });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', domain: env.COOKIE_DOMAIN });
}

export function requireAccount(req: FastifyRequest): LoadedSession {
  if (!req.session) throw new AppError(ErrorCode.UNAUTHORIZED, 401);
  return req.session;
}

/** 当前选中的区服和餐厅，一律来自会话 */
export function requireRestaurant(req: FastifyRequest): RestaurantContext {
  const session = requireAccount(req);
  const { accountId, shardId, restaurantId } = session.data;
  if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
  if (restaurantId === null) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
  return { session, accountId, shardId, restaurantId };
}
```

`apps/server/src/security/rateLimit.ts`：
```ts
import type { FastifyInstance } from 'fastify';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';
import type { RateLimiter, RateRule, RateRuleName } from './rateLimiter';

/** 按 IP 和（已登录时）按账号各扣一次令牌；规则名来自路由 config.rateLimit，默认 default */
export function registerRateLimit(
  app: FastifyInstance,
  limiter: RateLimiter,
  rules: Record<RateRuleName, RateRule>,
): void {
  app.addHook('preHandler', async (req) => {
    const name: RateRuleName = req.routeOptions.config?.rateLimit ?? 'default';
    const rule = rules[name];
    const keys = [`ip:${req.clientIp}:${name}`];
    if (req.session) keys.push(`acct:${req.session.data.accountId}:${name}`);
    for (const key of keys) {
      if (!(await limiter.consume(key, rule))) throw new AppError(ErrorCode.RATE_LIMITED, 429);
    }
  });
}
```

`apps/server/src/security/idempotency.ts`：
```ts
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { ErrorCode } from '@dt/shared';
import { AppError } from '../http/errors';

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * 写请求带 Idempotency-Key 时：第一次执行并缓存响应 ttl 秒；重复请求直接返回缓存；
 * 还在执行中返回 409。缓存按"账号（未登录按 IP）+ 路由 + key"隔离，不同用户互不可见。
 */
export function registerIdempotency(app: FastifyInstance, redis: Redis, ttlSeconds = 600): void {
  app.decorateRequest('idempotency', null);

  app.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'POST') return;
    const header = req.headers['idempotency-key'];
    if (typeof header !== 'string' || !KEY_RE.test(header)) return;
    const owner = req.session ? `acct:${req.session.data.accountId}` : `ip:${req.clientIp}`;
    const key = `idem:${owner}:${req.routeOptions.url}:${header}`;
    if ((await redis.set(key, 'pending', 'EX', ttlSeconds, 'NX')) === 'OK') {
      req.idempotency = { key };
      return;
    }
    const stored = await redis.get(key);
    if (!stored || stored === 'pending') throw new AppError(ErrorCode.IDEMPOTENCY_IN_PROGRESS, 409);
    const { status, body } = JSON.parse(stored) as { status: number; body: string };
    reply.code(status).header('content-type', 'application/json; charset=utf-8').header('idempotent-replay', 'true');
    return reply.send(body);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    if (!req.idempotency) return payload;
    const { key } = req.idempotency;
    if (reply.statusCode >= 500 || typeof payload !== 'string') await redis.del(key);
    else await redis.set(key, JSON.stringify({ status: reply.statusCode, body: payload }), 'EX', ttlSeconds);
    return payload;
  });
}
```

`apps/server/src/types/fastify.d.ts`：
```ts
import 'fastify';
import type { LoadedSession } from '../security/session';
import type { RateRuleName } from '../security/rateLimiter';

declare module 'fastify' {
  interface FastifyRequest {
    clientIp: string;
    session: LoadedSession | null;
    idempotency: { key: string } | null;
  }
  interface FastifyContextConfig {
    rateLimit?: RateRuleName;
  }
}
```

- [ ] **Step 4: 组装应用和测试助手**

`apps/server/src/modules/index.ts`：
```ts
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

/** 注册所有业务模块的路由（后续任务逐个加入） */
export function registerModules(_app: FastifyInstance, _deps: AppDeps): void {}
```

`apps/server/src/app.ts`：
```ts
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { DB } from './db/schema';
import type { Env } from './env';
import type { EventBus } from './events/bus';
import { registerClientIp } from './http/clientIp';
import { registerErrorHandling } from './http/errorHandling';
import { registerHealth } from './http/health';
import type { Captcha } from './infra/captcha';
import type { Mailer } from './infra/mailer';
import { registerModules } from './modules';
import { registerIdempotency } from './security/idempotency';
import { registerRateLimit } from './security/rateLimit';
import { createRateLimiter, DEFAULT_RATE_RULES, type RateRule, type RateRuleName } from './security/rateLimiter';
import { registerSession } from './security/session';
import type { SessionStore } from './security/sessionStore';

export interface AppDeps {
  env: Env;
  db: Kysely<DB>;
  redis: Redis;
  config: GameConfig;
  mailer: Mailer;
  captcha: Captcha;
  bus: EventBus;
  sessions: SessionStore;
  now: () => Date;
  rateRules?: Partial<Record<RateRuleName, RateRule>>;
}

/** 组装应用。钩子顺序：Cookie → 真实 IP → 会话 → 限流 → 幂等 → 业务路由 */
export async function buildApp(deps: AppDeps, extend?: (app: FastifyInstance) => void): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.env.NODE_ENV === 'test' ? false : { level: deps.env.LOG_LEVEL },
    bodyLimit: 64 * 1024,
  });
  await app.register(cookie);
  await app.register(cors, { origin: deps.env.WEB_ORIGIN, credentials: true, methods: ['GET', 'POST'] });
  registerClientIp(app, deps.env.TRUST_CF_HEADER);
  registerErrorHandling(app);
  registerSession(app, deps.sessions);
  registerRateLimit(app, createRateLimiter(deps.redis), { ...DEFAULT_RATE_RULES, ...deps.rateRules });
  registerIdempotency(app, deps.redis);
  registerHealth(app, deps);
  registerModules(app, deps);
  extend?.(app);
  return app;
}
```

`apps/server/test/helpers.ts`：
```ts
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadGameConfig, type GameConfig } from '@dt/config';
import { buildApp, type AppDeps } from '../src/app';
import { createDb } from '../src/db';
import { loadEnv, type Env } from '../src/env';
import { EventBus } from '../src/events/bus';
import { fixedCaptcha } from '../src/infra/captcha';
import { memoryMailer, type MemoryMailer } from '../src/infra/mailer';
import { createRedis } from '../src/infra/redis';
import type { RateRule, RateRuleName } from '../src/security/rateLimiter';
import { createSessionStore } from '../src/security/sessionStore';

/** 测试默认放宽限流，只有限流测试自己收紧 */
export const GENEROUS_RULES: Record<RateRuleName, RateRule> = {
  default: { capacity: 100_000, refillPerSec: 100_000 },
  auth: { capacity: 100_000, refillPerSec: 100_000 },
  email: { capacity: 100_000, refillPerSec: 100_000 },
};

let config: GameConfig | null = null;
export function testConfig(): GameConfig {
  config ??= loadGameConfig(process.env.CONFIG_BUNDLE_PATH!);
  return config;
}

export function testEnvWith(patch: Partial<Env> = {}): Env {
  return { ...loadEnv(process.env), ...patch };
}

export interface TestContext {
  app: FastifyInstance;
  deps: AppDeps;
  mailer: MemoryMailer;
  close(): Promise<void>;
}

export async function createTestApp(
  overrides: Partial<AppDeps> = {},
  extend?: (app: FastifyInstance) => void,
): Promise<TestContext> {
  const env = overrides.env ?? testEnvWith();
  const db = createDb(env.DATABASE_URL, 5);
  const redis = createRedis(env.REDIS_URL);
  const mailer = memoryMailer();
  const deps: AppDeps = {
    env,
    db,
    redis,
    config: testConfig(),
    mailer,
    captcha: fixedCaptcha(true),
    bus: new EventBus(),
    sessions: createSessionStore(redis, 3600),
    now: () => new Date(),
    rateRules: GENEROUS_RULES,
    ...overrides,
  };
  const app = await buildApp(deps, extend);
  await app.ready();
  return {
    app,
    deps,
    mailer: (overrides.mailer as MemoryMailer | undefined) ?? mailer,
    close: async () => {
      await app.close();
      await db.destroy();
      redis.disconnect();
    },
  };
}

export interface CallOptions {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}

export async function call(
  app: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  opts: CallOptions = {},
): Promise<{ status: number; json: any; res: LightMyRequestResponse }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  let payload: string | undefined;
  if (method === 'POST') {
    headers['content-type'] ??= 'application/json';
    payload = JSON.stringify(opts.body ?? {});
  }
  const res = await app.inject({ method, url, headers, payload, remoteAddress: opts.ip ?? '127.0.0.1' });
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null, res };
}

/** 从响应里取出 "dt_sid=..."，可直接作为 cookie 请求头 */
export function cookieOf(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = list.find((c) => c.startsWith('dt_sid='));
  if (!found) throw new Error('no dt_sid cookie in response');
  return found.split(';')[0]!;
}
```

- [ ] **Step 5: 写测试**

`apps/server/src/app.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorCode } from '@dt/shared';
import { call, createTestApp, testEnvWith, type TestContext } from '../test/helpers';
import { AppError } from './http/errors';
import { ok } from './http/reply';
import { parse } from './http/validate';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.get('/t/boom', async () => {
      throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'x' });
    });
    app.get('/t/crash', async () => {
      throw new Error('secret detail');
    });
    app.post('/t/echo', async (req) => ok(parse(z.object({ n: z.number().int() }), req.body)));
    app.get('/t/ip', async (req) => ok({ ip: req.clientIp }));
  });
});
afterAll(() => ctx.close());

describe('框架', () => {
  it('healthz / readyz', async () => {
    expect((await call(ctx.app, 'GET', '/healthz')).json).toEqual({ ok: true, data: { status: 'ok' }, events: [] });
    expect((await call(ctx.app, 'GET', '/readyz')).status).toBe(200);
  });

  it('业务错误转成统一格式', async () => {
    const r = await call(ctx.app, 'GET', '/t/boom');
    expect(r.status).toBe(404);
    expect(r.json).toEqual({ ok: false, code: 'NOT_FOUND', params: { what: 'x' } });
  });

  it('未预期的错误返回 500 INTERNAL，不泄露细节', async () => {
    const r = await call(ctx.app, 'GET', '/t/crash');
    expect(r.status).toBe(500);
    expect(r.json).toEqual({ ok: false, code: 'INTERNAL' });
    expect(r.res.body).not.toContain('secret detail');
  });

  it('参数校验失败返回 400 VALIDATION_FAILED', async () => {
    const r = await call(ctx.app, 'POST', '/t/echo', { body: { n: 'x' } });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION_FAILED');
    expect((await call(ctx.app, 'POST', '/t/echo', { body: { n: 3 } })).json.data).toEqual({ n: 3 });
  });

  it('未知路由返回 404 NOT_FOUND', async () => {
    const r = await call(ctx.app, 'GET', '/nope');
    expect(r.status).toBe(404);
    expect(r.json.code).toBe('NOT_FOUND');
  });

  it('非 JSON 的写请求被拒绝', async () => {
    const r = await ctx.app.inject({
      method: 'POST',
      url: '/t/echo',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'n=1',
    });
    expect(r.statusCode).toBe(415);
    expect(JSON.parse(r.body).code).toBe('VALIDATION_FAILED');
  });

  it('默认不信任 CF-Connecting-IP', async () => {
    const r = await call(ctx.app, 'GET', '/t/ip', { headers: { 'cf-connecting-ip': '9.9.9.9' }, ip: '10.0.0.1' });
    expect(r.json.data.ip).toBe('10.0.0.1');
  });

  it('开启 TRUST_CF_HEADER 后使用 CF-Connecting-IP', async () => {
    const trusted = await createTestApp({ env: testEnvWith({ TRUST_CF_HEADER: true }) }, (app) => {
      app.get('/t/ip', async (req) => ok({ ip: req.clientIp }));
    });
    const r = await call(trusted.app, 'GET', '/t/ip', { headers: { 'cf-connecting-ip': '9.9.9.9' }, ip: '10.0.0.1' });
    expect(r.json.data.ip).toBe('9.9.9.9');
    await trusted.close();
  });
});
```

`apps/server/src/security/session.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, type TestContext } from '../../test/helpers';
import { ok } from '../http/reply';
import { requireAccount, requireRestaurant } from './session';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.get('/t/whoami', async (req) => ok({ accountId: requireAccount(req).data.accountId }));
    app.get('/t/rest', async (req) => ok(requireRestaurant(req)));
  });
});
afterAll(() => ctx.close());

describe('会话插件', () => {
  it('有效 Cookie 识别出账号', async () => {
    const token = await ctx.deps.sessions.create(4242);
    const r = await call(ctx.app, 'GET', '/t/whoami', { cookie: `dt_sid=${token}` });
    expect(r.json.data.accountId).toBe(4242);
  });

  it('没有 Cookie、伪造 Cookie、超长 Cookie 都是 401 UNAUTHORIZED，不是 500', async () => {
    for (const cookie of [undefined, 'dt_sid=garbage', `dt_sid=${'x'.repeat(300)}`]) {
      const r = await call(ctx.app, 'GET', '/t/whoami', { cookie });
      expect(r.status).toBe(401);
      expect(r.json.code).toBe('UNAUTHORIZED');
    }
  });

  it('被挤掉的旧会话变成未登录', async () => {
    const old = await ctx.deps.sessions.create(4343);
    await ctx.deps.sessions.create(4343);
    expect((await call(ctx.app, 'GET', '/t/whoami', { cookie: `dt_sid=${old}` })).status).toBe(401);
  });

  it('requireRestaurant：未选区服 / 未开店', async () => {
    const token = await ctx.deps.sessions.create(4444);
    const cookie = `dt_sid=${token}`;
    expect((await call(ctx.app, 'GET', '/t/rest', { cookie })).json.code).toBe('NO_SHARD_SELECTED');
    await ctx.deps.sessions.update(token, { shardId: 1 });
    expect((await call(ctx.app, 'GET', '/t/rest', { cookie })).json.code).toBe('RESTAURANT_NOT_FOUND');
    await ctx.deps.sessions.update(token, { restaurantId: 9 });
    expect((await call(ctx.app, 'GET', '/t/rest', { cookie })).json.data).toMatchObject({
      accountId: 4444,
      shardId: 1,
      restaurantId: 9,
    });
  });
});
```

`apps/server/src/security/rateLimit.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, GENEROUS_RULES, type TestContext } from '../../test/helpers';
import { ok } from '../http/reply';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp({ rateRules: { ...GENEROUS_RULES, auth: { capacity: 2, refillPerSec: 0.001 } } }, (app) => {
    app.post('/t/login-like', { config: { rateLimit: 'auth' } }, async () => ok({}));
    app.post('/t/normal', async () => ok({}));
  });
});
afterAll(() => ctx.close());

describe('限流', () => {
  it('同一 IP 超过 auth 桶容量后返回 429 RATE_LIMITED', async () => {
    const ip = '203.0.113.7';
    expect((await call(ctx.app, 'POST', '/t/login-like', { ip })).status).toBe(200);
    expect((await call(ctx.app, 'POST', '/t/login-like', { ip })).status).toBe(200);
    const third = await call(ctx.app, 'POST', '/t/login-like', { ip });
    expect(third.status).toBe(429);
    expect(third.json.code).toBe('RATE_LIMITED');
  });

  it('其他 IP 和其他规则不受影响', async () => {
    expect((await call(ctx.app, 'POST', '/t/login-like', { ip: '203.0.113.8' })).status).toBe(200);
    expect((await call(ctx.app, 'POST', '/t/normal', { ip: '203.0.113.7' })).status).toBe(200);
  });
});
```

`apps/server/src/security/idempotency.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createTestApp, type TestContext } from '../../test/helpers';
import { ok } from '../http/reply';
import { requireAccount } from './session';

let ctx: TestContext;
let counter = 0;
beforeAll(async () => {
  ctx = await createTestApp({}, (app) => {
    app.post('/t/count', async () => ok({ n: ++counter }));
    app.post('/t/slow', async () => {
      await new Promise((r) => setTimeout(r, 200));
      return ok({ n: ++counter });
    });
    app.post('/t/mine', async (req) => ok({ accountId: requireAccount(req).data.accountId }));
  });
});
afterAll(() => ctx.close());
const newKey = () => `k${Math.random().toString(36).slice(2, 12)}`;

describe('幂等', () => {
  it('同一个 key 重复提交只执行一次，返回相同结果', async () => {
    const key = newKey();
    const before = counter;
    const a = await call(ctx.app, 'POST', '/t/count', { headers: { 'idempotency-key': key } });
    const b = await call(ctx.app, 'POST', '/t/count', { headers: { 'idempotency-key': key } });
    expect(counter).toBe(before + 1);
    expect(b.json).toEqual(a.json);
    expect(b.res.headers['idempotent-replay']).toBe('true');
  });

  it('执行中的重复请求返回 409', async () => {
    const key = newKey();
    const [x, y] = await Promise.all([
      call(ctx.app, 'POST', '/t/slow', { headers: { 'idempotency-key': key } }),
      call(ctx.app, 'POST', '/t/slow', { headers: { 'idempotency-key': key } }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it('不同用户使用相同 key 互不影响，不会拿到别人的响应', async () => {
    const key = newKey();
    const a = await ctx.deps.sessions.create(5001);
    const b = await ctx.deps.sessions.create(5002);
    const ra = await call(ctx.app, 'POST', '/t/mine', { cookie: `dt_sid=${a}`, headers: { 'idempotency-key': key } });
    const rb = await call(ctx.app, 'POST', '/t/mine', { cookie: `dt_sid=${b}`, headers: { 'idempotency-key': key } });
    expect(ra.json.data.accountId).toBe(5001);
    expect(rb.json.data.accountId).toBe(5002);
  });

  it('没带 key 或 key 格式不对时不做幂等', async () => {
    const before = counter;
    await call(ctx.app, 'POST', '/t/count');
    await call(ctx.app, 'POST', '/t/count', { headers: { 'idempotency-key': 'bad key!' } });
    expect(counter).toBe(before + 2);
  });
});
```

- [ ] **Step 6: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(server): fastify app with envelope, errors, client ip, sessions, rate limit, idempotency"
```

---
### Task 8: 账号模块（注册、登录、单点登录、邮箱验证、找回密码、邀请码）

**Files:**
- Create: `apps/server/src/modules/account/password.ts`, `service.ts`, `routes.ts`
- Modify: `apps/server/src/modules/index.ts`（整体替换）
- Modify: `apps/server/test/helpers.ts`（末尾追加 `registerUser`、`tokenFromMail`）
- Test: `apps/server/src/modules/account/password.test.ts`, `account.test.ts`

**Interfaces:**
- Consumes: `AppDeps`、`AppError`、`uniqueViolation`、`SessionStore`/`SessionData`、`setSessionCookie`/`clearSessionCookie`/`requireAccount`、`ok`、`parse`、`newToken`/`sha256`；`@dt/shared` 的 `registerBody` 等 schema 和 `MeDto`
- Produces：
  - `hashPassword(pw: string): Promise<string>`、`verifyPassword(stored: string | null, pw: string): Promise<boolean>`
  - `createAccountService(deps: AccountDeps)`，返回 `{ register(input, ip): Promise<{ token; accountId }>; login(input): Promise<{ token; accountId }>; me(accountId, sel: { shardId; restaurantId }): Promise<MeDto>; sendVerifyEmail(accountId): Promise<void>; verifyEmail(token): Promise<void>; forgotPassword(input, ip): Promise<void>; resetPassword(input): Promise<void>; createInviteCode(accountId): Promise<string> }`；`type AccountService`
  - 路由（前缀 `/api/v1/account`）：`POST /register`、`POST /login`、`POST /logout`、`GET /me`、`POST /send-verify-email`、`POST /verify-email`、`POST /forgot-password`、`POST /reset-password`、`POST /invite-code`
  - 验证邮件链接：`${WEB_ORIGIN}/verify-email?token=...`（24 小时有效）；重置链接：`${WEB_ORIGIN}/reset-password?token=...`（1 小时有效）；同一账号同类邮件 60 秒冷却
  - 测试助手：`registerUser(app, opts?: { username?; password?; ip? }): Promise<{ username; email; cookie; accountId }>`、`tokenFromMail(text: string): string`

- [ ] **Step 1: 安装依赖**

Run: `pnpm --filter @dt/server add @node-rs/argon2@^2`

- [ ] **Step 2: 写失败的测试**

`apps/server/src/modules/account/password.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('argon2id 哈希与校验', async () => {
    const h = await hashPassword('secret123');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'secret123')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });

  it('账号不存在（null）或哈希损坏时返回 false', async () => {
    expect(await verifyPassword(null, 'secret123')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'secret123')).toBe(false);
  });
});
```

在 `apps/server/test/helpers.ts` 末尾追加：
```ts
import { uniqueName } from './fixtures';

export async function registerUser(
  app: FastifyInstance,
  opts: { username?: string; password?: string; ip?: string } = {},
): Promise<{ username: string; email: string; cookie: string; accountId: number }> {
  const username = opts.username ?? uniqueName('u');
  const email = `${uniqueName('m')}@test.local`;
  const r = await call(app, 'POST', '/api/v1/account/register', {
    body: { username, password: opts.password ?? 'secret123', email, captchaToken: 't' },
    ip: opts.ip,
  });
  if (r.status !== 200) throw new Error(`register failed: ${r.res.body}`);
  return { username, email, cookie: cookieOf(r.res), accountId: r.json.data.accountId as number };
}

/** 从邮件正文里取出链接中的 token */
export function tokenFromMail(text: string): string {
  const m = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!m) throw new Error('no token in mail');
  return m[1]!;
}
```
（把这段里的 `import` 移到文件顶部和其他 import 放在一起。）

`apps/server/src/modules/account/account.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixedCaptcha } from '../../infra/captcha';
import { uniqueName } from '../../../test/fixtures';
import { call, cookieOf, createTestApp, registerUser, tokenFromMail, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const A = '/api/v1/account';

describe('注册', () => {
  it('成功：返回 me、写入 Cookie、发出验证邮件', async () => {
    const username = uniqueName('r');
    const email = `${uniqueName('e')}@test.local`;
    const r = await call(ctx.app, 'POST', `${A}/register`, {
      body: { username, password: 'secret123', email: email.toUpperCase(), captchaToken: 't' },
    });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ username, email, emailVerified: false, shardId: null, restaurantId: null });
    const cookie = cookieOf(r.res);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie })).json.data.username).toBe(username);
    const mail = ctx.mailer.lastTo(email)!;
    expect(mail.text).toContain('http://localhost:5173/verify-email?token=');
  });

  it('中文用户名可以注册和登录', async () => {
    const username = `厨神${uniqueName('').slice(0, 4)}`;
    await registerUser(ctx.app, { username });
    const r = await call(ctx.app, 'POST', `${A}/login`, { body: { username, password: 'secret123' } });
    expect(r.status).toBe(200);
  });

  it('用户名查重不区分大小写；邮箱不能重复', async () => {
    const base = uniqueName('C').slice(0, 7);
    const first = await registerUser(ctx.app, { username: `${base}Ab` });
    const dupName = await call(ctx.app, 'POST', `${A}/register`, {
      body: { username: `${base}aB`, password: 'secret123', email: `${uniqueName('x')}@test.local`, captchaToken: 't' },
    });
    expect(dupName.status).toBe(409);
    expect(dupName.json.code).toBe('USERNAME_TAKEN');
    const dupEmail = await call(ctx.app, 'POST', `${A}/register`, {
      body: { username: uniqueName('y'), password: 'secret123', email: first.email, captchaToken: 't' },
    });
    expect(dupEmail.json.code).toBe('EMAIL_TAKEN');
  });

  it('人机验证失败', async () => {
    const strict = await createTestApp({ captcha: fixedCaptcha(false) });
    const r = await call(strict.app, 'POST', `${A}/register`, {
      body: { username: uniqueName('z'), password: 'secret123', email: `${uniqueName('z')}@t.local`, captchaToken: 't' },
    });
    expect(r.json.code).toBe('CAPTCHA_FAILED');
    await strict.close();
  });

  it('参数不合法', async () => {
    const r = await call(ctx.app, 'POST', `${A}/register`, {
      body: { username: 'a', password: '1', email: 'bad', captchaToken: 't' },
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VALIDATION_FAILED');
  });
});

describe('登录与会话', () => {
  it('密码错误或用户不存在都返回 INVALID_CREDENTIALS', async () => {
    const u = await registerUser(ctx.app);
    const wrong = await call(ctx.app, 'POST', `${A}/login`, { body: { username: u.username, password: 'nope-nope' } });
    expect(wrong.status).toBe(401);
    expect(wrong.json.code).toBe('INVALID_CREDENTIALS');
    const ghost = await call(ctx.app, 'POST', `${A}/login`, { body: { username: 'ghost_x', password: 'secret123' } });
    expect(ghost.json.code).toBe('INVALID_CREDENTIALS');
  });

  it('用户名大小写不同也能登录；新登录使旧会话失效', async () => {
    const u = await registerUser(ctx.app, { username: `Up${uniqueName('').slice(0, 6)}` });
    const r = await call(ctx.app, 'POST', `${A}/login`, {
      body: { username: u.username.toLowerCase(), password: 'secret123' },
    });
    expect(r.status).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).status).toBe(401);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: cookieOf(r.res) })).status).toBe(200);
  });

  it('封禁账号不能登录', async () => {
    const u = await registerUser(ctx.app);
    await ctx.deps.db.updateTable('account').set({ banned_at: new Date() }).where('id', '=', u.accountId).execute();
    const r = await call(ctx.app, 'POST', `${A}/login`, { body: { username: u.username, password: 'secret123' } });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('ACCOUNT_BANNED');
  });

  it('登出后会话失效', async () => {
    const u = await registerUser(ctx.app);
    expect((await call(ctx.app, 'POST', `${A}/logout`, { cookie: u.cookie })).status).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).status).toBe(401);
  });
});

describe('邮箱验证', () => {
  it('打开链接后 emailVerified=true，链接不能重复使用', async () => {
    const u = await registerUser(ctx.app);
    const token = tokenFromMail(ctx.mailer.lastTo(u.email)!.text);
    expect((await call(ctx.app, 'POST', `${A}/verify-email`, { body: { token } })).status).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).json.data.emailVerified).toBe(true);
    const again = await call(ctx.app, 'POST', `${A}/verify-email`, { body: { token } });
    expect(again.json.code).toBe('TOKEN_INVALID');
  });

  it('过期的链接无效', async () => {
    const u = await registerUser(ctx.app);
    const token = tokenFromMail(ctx.mailer.lastTo(u.email)!.text);
    const future = await createTestApp({ now: () => new Date(Date.now() + 25 * 3600_000) });
    const r = await call(future.app, 'POST', `${A}/verify-email`, { body: { token } });
    expect(r.json.code).toBe('TOKEN_INVALID');
    await future.close();
  });

  it('60 秒内不能重发', async () => {
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `${A}/send-verify-email`, { cookie: u.cookie });
    expect(r.status).toBe(429);
    expect(r.json.code).toBe('EMAIL_COOLDOWN');
  });
});

describe('找回密码', () => {
  it('不存在的邮箱也返回成功，但不发信', async () => {
    const before = ctx.mailer.sent.length;
    const r = await call(ctx.app, 'POST', `${A}/forgot-password`, {
      body: { email: 'nobody@nowhere.local', captchaToken: 't' },
    });
    expect(r.status).toBe(200);
    expect(ctx.mailer.sent.length).toBe(before);
  });

  it('重置后旧会话失效，新密码可登录，旧密码不行', async () => {
    const u = await registerUser(ctx.app);
    await call(ctx.app, 'POST', `${A}/forgot-password`, { body: { email: u.email, captchaToken: 't' } });
    const mail = ctx.mailer.lastTo(u.email)!;
    expect(mail.text).toContain('/reset-password?token=');
    const token = tokenFromMail(mail.text);
    expect((await call(ctx.app, 'POST', `${A}/reset-password`, { body: { token, password: 'newpass456' } })).status).toBe(200);
    expect((await call(ctx.app, 'GET', `${A}/me`, { cookie: u.cookie })).status).toBe(401);
    const oldPw = await call(ctx.app, 'POST', `${A}/login`, { body: { username: u.username, password: 'secret123' } });
    expect(oldPw.json.code).toBe('INVALID_CREDENTIALS');
    const newPw = await call(ctx.app, 'POST', `${A}/login`, { body: { username: u.username, password: 'newpass456' } });
    expect(newPw.status).toBe(200);
  });
});

describe('邀请码', () => {
  it('生成 8 位邀请码，被邀请人注册时记录邀请关系；无效邀请码被忽略', async () => {
    const inviter = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `${A}/invite-code`, { cookie: inviter.cookie });
    const code = r.json.data.inviteCode as string;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const invitee = await call(ctx.app, 'POST', `${A}/register`, {
      body: {
        username: uniqueName('i'), password: 'secret123', email: `${uniqueName('i')}@t.local`,
        inviteCode: code.toLowerCase(), captchaToken: 't',
      },
    });
    const row = await ctx.deps.db
      .selectFrom('account').select('invited_by').where('id', '=', invitee.json.data.accountId).executeTakeFirstOrThrow();
    expect(row.invited_by).toBe(inviter.accountId);

    const bogus = await call(ctx.app, 'POST', `${A}/register`, {
      body: {
        username: uniqueName('j'), password: 'secret123', email: `${uniqueName('j')}@t.local`,
        inviteCode: 'ZZZZZZZZ', captchaToken: 't',
      },
    });
    expect(bogus.status).toBe(200);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run --project server`
Expected: FAIL，找不到 `./password`；账号接口返回 404。

- [ ] **Step 4: 实现**

`apps/server/src/modules/account/password.ts`：
```ts
import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

let dummyHash: Promise<string> | null = null;

/** 账号不存在时也跑一次校验，避免通过响应时间判断用户名是否存在 */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  const target = stored ?? (await (dummyHash ??= hash('dummy-password-for-timing')));
  try {
    return (await verify(target, password)) && stored !== null;
  } catch {
    return false;
  }
}
```

`apps/server/src/modules/account/service.ts`：
```ts
import { randomInt } from 'node:crypto';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import {
  ErrorCode,
  type ForgotPasswordInput,
  type LoginInput,
  type MeDto,
  type RegisterInput,
  type ResetPasswordInput,
} from '@dt/shared';
import { uniqueViolation } from '../../db/errors';
import type { DB } from '../../db/schema';
import type { Env } from '../../env';
import { AppError } from '../../http/errors';
import type { Captcha } from '../../infra/captcha';
import type { Mailer } from '../../infra/mailer';
import type { SessionData, SessionStore } from '../../security/sessionStore';
import { newToken, sha256 } from '../../security/tokens';
import { hashPassword, verifyPassword } from './password';

export interface AccountDeps {
  db: Kysely<DB>;
  redis: Redis;
  sessions: SessionStore;
  mailer: Mailer;
  captcha: Captcha;
  env: Env;
  now: () => Date;
}

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VERIFY_TTL_MS = 24 * 3600_000;
const RESET_TTL_MS = 3600_000;
const MAIL_COOLDOWN_SECONDS = 60;

type Purpose = 'verify' | 'reset';

export function createAccountService(d: AccountDeps) {
  async function sendTokenMail(accountId: number, email: string, purpose: Purpose, silentCooldown: boolean) {
    const cooldown = await d.redis.set(`mailcd:${purpose}:${accountId}`, '1', 'EX', MAIL_COOLDOWN_SECONDS, 'NX');
    if (cooldown !== 'OK') {
      if (silentCooldown) return;
      throw new AppError(ErrorCode.EMAIL_COOLDOWN, 429);
    }
    const token = newToken();
    const ttl = purpose === 'verify' ? VERIFY_TTL_MS : RESET_TTL_MS;
    await d.db
      .insertInto('email_token')
      .values({ token_hash: sha256(token), account_id: accountId, purpose, expires_at: new Date(d.now().getTime() + ttl) })
      .execute();
    const link = `${d.env.WEB_ORIGIN}/${purpose === 'verify' ? 'verify-email' : 'reset-password'}?token=${token}`;
    await d.mailer.send(
      purpose === 'verify'
        ? { to: email, subject: '美味小镇：验证你的邮箱', text: `欢迎来到美味小镇！请在 24 小时内打开下面的链接完成邮箱验证：\n${link}` }
        : { to: email, subject: '美味小镇：重置密码', text: `请在 1 小时内打开下面的链接重置密码（如果不是你本人操作，请忽略这封邮件）：\n${link}` },
    );
  }

  /** 一次性令牌：未使用、未过期才有效，使用后立即作废 */
  async function consumeToken(token: string, purpose: Purpose): Promise<number> {
    const now = d.now();
    const row = await d.db
      .updateTable('email_token')
      .set({ used_at: now })
      .where('token_hash', '=', sha256(token))
      .where('purpose', '=', purpose)
      .where('used_at', 'is', null)
      .where('expires_at', '>', now)
      .returning('account_id')
      .executeTakeFirst();
    if (!row) throw new AppError(ErrorCode.TOKEN_INVALID, 400);
    return row.account_id;
  }

  return {
    async register(input: RegisterInput, ip: string): Promise<{ token: string; accountId: number }> {
      if (!(await d.captcha.verify(input.captchaToken, ip))) throw new AppError(ErrorCode.CAPTCHA_FAILED, 400);
      let invitedBy: number | null = null;
      if (input.inviteCode) {
        const inviter = await d.db
          .selectFrom('account')
          .select('id')
          .where('invite_code', '=', input.inviteCode.toUpperCase())
          .executeTakeFirst();
        invitedBy = inviter?.id ?? null;
      }
      const passwordHash = await hashPassword(input.password);
      let accountId: number;
      try {
        const row = await d.db
          .insertInto('account')
          .values({ username: input.username, password_hash: passwordHash, email: input.email, invited_by: invitedBy })
          .returning('id')
          .executeTakeFirstOrThrow();
        accountId = row.id;
      } catch (e) {
        const constraint = uniqueViolation(e);
        if (constraint === 'account_username_lower') throw new AppError(ErrorCode.USERNAME_TAKEN, 409);
        if (constraint === 'account_email') throw new AppError(ErrorCode.EMAIL_TAKEN, 409);
        throw e;
      }
      return { token: await d.sessions.create(accountId), accountId };
    },

    async login(input: LoginInput): Promise<{ token: string; accountId: number }> {
      const account = await d.db
        .selectFrom('account')
        .select(['id', 'password_hash', 'banned_at'])
        .where(sql<string>`lower(username)`, '=', input.username.toLowerCase())
        .executeTakeFirst();
      const valid = await verifyPassword(account?.password_hash ?? null, input.password);
      if (!account || !valid) throw new AppError(ErrorCode.INVALID_CREDENTIALS, 401);
      if (account.banned_at) throw new AppError(ErrorCode.ACCOUNT_BANNED, 403);
      return { token: await d.sessions.create(account.id), accountId: account.id };
    },

    async me(accountId: number, sel: Pick<SessionData, 'shardId' | 'restaurantId'>): Promise<MeDto> {
      const a = await d.db
        .selectFrom('account')
        .select(['id', 'username', 'email', 'email_verified_at'])
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (!a) throw new AppError(ErrorCode.UNAUTHORIZED, 401);
      return {
        accountId: a.id,
        username: a.username,
        email: a.email,
        emailVerified: a.email_verified_at !== null,
        shardId: sel.shardId,
        restaurantId: sel.restaurantId,
      };
    },

    async sendVerifyEmail(accountId: number): Promise<void> {
      const a = await d.db
        .selectFrom('account')
        .select(['email', 'email_verified_at'])
        .where('id', '=', accountId)
        .executeTakeFirst();
      if (!a || a.email_verified_at) return;
      await sendTokenMail(accountId, a.email, 'verify', false);
    },

    async verifyEmail(token: string): Promise<void> {
      const accountId = await consumeToken(token, 'verify');
      await d.db
        .updateTable('account')
        .set({ email_verified_at: d.now() })
        .where('id', '=', accountId)
        .where('email_verified_at', 'is', null)
        .execute();
    },

    /** 无论邮箱是否存在都返回成功，避免被用来探测注册邮箱 */
    async forgotPassword(input: ForgotPasswordInput, ip: string): Promise<void> {
      if (!(await d.captcha.verify(input.captchaToken, ip))) throw new AppError(ErrorCode.CAPTCHA_FAILED, 400);
      const a = await d.db.selectFrom('account').select(['id', 'email']).where('email', '=', input.email).executeTakeFirst();
      if (a) await sendTokenMail(a.id, a.email, 'reset', true);
    },

    async resetPassword(input: ResetPasswordInput): Promise<void> {
      const accountId = await consumeToken(input.token, 'reset');
      await d.db
        .updateTable('account')
        .set({ password_hash: await hashPassword(input.password) })
        .where('id', '=', accountId)
        .execute();
      await d.sessions.destroyAll(accountId);
    },

    async createInviteCode(accountId: number): Promise<string> {
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = Array.from({ length: 8 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('');
        try {
          await d.db.updateTable('account').set({ invite_code: code }).where('id', '=', accountId).execute();
          return code;
        } catch (e) {
          if (uniqueViolation(e) === null) throw e;
        }
      }
      throw new Error('failed to generate a unique invite code');
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
```

`apps/server/src/modules/account/routes.ts`：
```ts
import type { FastifyPluginAsync } from 'fastify';
import {
  forgotPasswordBody,
  loginBody,
  registerBody,
  resetPasswordBody,
  verifyEmailBody,
} from '@dt/shared';
import type { AppDeps } from '../../app';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { clearSessionCookie, requireAccount, setSessionCookie } from '../../security/session';
import type { AccountService } from './service';

export function accountRoutes(svc: AccountService, deps: AppDeps): FastifyPluginAsync {
  const noSelection = { shardId: null, restaurantId: null };
  return async (r) => {
    r.post('/register', { config: { rateLimit: 'auth' } }, async (req, reply) => {
      const { token, accountId } = await svc.register(parse(registerBody, req.body), req.clientIp);
      setSessionCookie(reply, token, deps.env);
      try {
        await svc.sendVerifyEmail(accountId);
      } catch (err) {
        req.log.warn({ err }, 'failed to send verify mail');
      }
      return ok(await svc.me(accountId, noSelection));
    });

    r.post('/login', { config: { rateLimit: 'auth' } }, async (req, reply) => {
      const { token, accountId } = await svc.login(parse(loginBody, req.body));
      setSessionCookie(reply, token, deps.env);
      return ok(await svc.me(accountId, noSelection));
    });

    r.post('/logout', async (req, reply) => {
      if (req.session) await deps.sessions.destroy(req.session.token);
      clearSessionCookie(reply, deps.env);
      return ok({});
    });

    r.get('/me', async (req) => {
      const s = requireAccount(req);
      return ok(await svc.me(s.data.accountId, s.data));
    });

    r.post('/send-verify-email', { config: { rateLimit: 'email' } }, async (req) => {
      await svc.sendVerifyEmail(requireAccount(req).data.accountId);
      return ok({});
    });

    r.post('/verify-email', { config: { rateLimit: 'auth' } }, async (req) => {
      await svc.verifyEmail(parse(verifyEmailBody, req.body).token);
      return ok({});
    });

    r.post('/forgot-password', { config: { rateLimit: 'email' } }, async (req) => {
      await svc.forgotPassword(parse(forgotPasswordBody, req.body), req.clientIp);
      return ok({});
    });

    r.post('/reset-password', { config: { rateLimit: 'auth' } }, async (req) => {
      await svc.resetPassword(parse(resetPasswordBody, req.body));
      return ok({});
    });

    r.post('/invite-code', async (req) => {
      return ok({ inviteCode: await svc.createInviteCode(requireAccount(req).data.accountId) });
    });
  };
}
```

`apps/server/src/modules/index.ts`（整体替换）：
```ts
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { accountRoutes } from './account/routes';
import { createAccountService } from './account/service';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  app.register(accountRoutes(createAccountService(deps), deps), { prefix: '/api/v1/account' });
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(account): register, login, single session, email verification, password reset, invites"
```

---

### Task 9: 区服模块（列表、选择、区服配置与功能开关、运维命令）

**Files:**
- Create: `apps/server/src/modules/shard/service.ts`, `routes.ts`
- Modify: `apps/server/src/modules/index.ts`（整体替换）
- Test: `apps/server/src/modules/shard/shard.test.ts`

**Interfaces:**
- Consumes: `resolveShardSettings`、`isFeatureEnabled`、`ShardSettings`（`@dt/config`）；`LoadedSession`、`requireAccount`；`selectShardBody`、`ShardDto`、`SelectShardResult`（`@dt/shared`）
- Produces：
  - `createShardService(d: { db; sessions; config })`，返回 `{ list(accountId): Promise<ShardDto[]>; select(session, shardId): Promise<SelectShardResult>; settings(shardId): Promise<ShardSettings>; ensureFeature(shardId, feature): Promise<ShardSettings>; assertOpen(shardId): Promise<void> }`；`type ShardService`
  - 路由（前缀 `/api/v1/shard`）：`GET /list`、`POST /select`
  - 说明：一个进程同时服务所有区服，所以功能开关按请求检查（`FEATURE_DISABLED`），而不是按区服卸载路由

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/shard/shard.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';
import { createShardService } from './service';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const S = '/api/v1/shard';

describe('区服', () => {
  it('未登录不能查看', async () => {
    expect((await call(ctx.app, 'GET', `${S}/list`)).json.code).toBe('UNAUTHORIZED');
  });

  it('列表包含开放的区服和"是否已开店"', async () => {
    const shardId = await createShard(ctx.deps.db, { name: '列表服' });
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'GET', `${S}/list`, { cookie: u.cookie });
    const item = (r.json.data as Array<{ id: number }>).find((s) => s.id === shardId);
    expect(item).toMatchObject({ id: shardId, name: '列表服', status: 'open', hasRestaurant: false });
  });

  it('选择区服写入会话，me 能看到', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await registerUser(ctx.app);
    const r = await call(ctx.app, 'POST', `${S}/select`, { cookie: u.cookie, body: { shardId } });
    expect(r.json.data).toEqual({ shardId, restaurantId: null });
    const me = await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    expect(me.json.data.shardId).toBe(shardId);
  });

  it('不存在的区服 / 已关闭的区服', async () => {
    const u = await registerUser(ctx.app);
    const missing = await call(ctx.app, 'POST', `${S}/select`, { cookie: u.cookie, body: { shardId: 1_999_999 } });
    expect(missing.status).toBe(404);
    expect(missing.json.code).toBe('SHARD_NOT_FOUND');
    const closed = await createShard(ctx.deps.db, { status: 'closed' });
    const r = await call(ctx.app, 'POST', `${S}/select`, { cookie: u.cookie, body: { shardId: closed } });
    expect(r.status).toBe(403);
    expect(r.json.code).toBe('SHARD_CLOSED');
  });

  it('区服覆盖配置：功能开关和数值', async () => {
    const shardId = await createShard(ctx.deps.db);
    await ctx.deps.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { pond: false }, restaurant: { coin: 777 } }) })
      .execute();
    const svc = createShardService(ctx.deps);
    const s = await svc.settings(shardId);
    expect(s.restaurant.coin).toBe(777);
    await expect(svc.ensureFeature(shardId, 'pond')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(svc.ensureFeature(shardId, 'restaurant')).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run --project server`
Expected: FAIL，找不到 `./service`；区服接口返回 404。

- [ ] **Step 3: 实现**

`apps/server/src/modules/shard/service.ts`：
```ts
import type { Kysely } from 'kysely';
import { isFeatureEnabled, resolveShardSettings, type GameConfig, type ShardSettings } from '@dt/config';
import { ErrorCode, type SelectShardResult, type ShardDto } from '@dt/shared';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import type { LoadedSession } from '../../security/session';
import type { SessionStore } from '../../security/sessionStore';

const SETTINGS_CACHE_MS = 30_000;

export function createShardService(d: { db: Kysely<DB>; sessions: SessionStore; config: GameConfig }) {
  const cache = new Map<number, { expires: number; settings: ShardSettings }>();

  async function settings(shardId: number): Promise<ShardSettings> {
    const hit = cache.get(shardId);
    const nowMs = Date.now();
    if (hit && hit.expires > nowMs) return hit.settings;
    const row = await d.db.selectFrom('shard_config').select('override').where('shard_id', '=', shardId).executeTakeFirst();
    const resolved = resolveShardSettings(d.config, row?.override ?? {});
    cache.set(shardId, { expires: nowMs + SETTINGS_CACHE_MS, settings: resolved });
    return resolved;
  }

  async function assertOpen(shardId: number): Promise<void> {
    const shard = await d.db.selectFrom('shard').select('status').where('id', '=', shardId).executeTakeFirst();
    if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
    if (shard.status !== 'open') throw new AppError(ErrorCode.SHARD_CLOSED, 403);
  }

  return {
    settings,
    assertOpen,

    async list(accountId: number): Promise<ShardDto[]> {
      const rows = await d.db
        .selectFrom('shard')
        .leftJoin('restaurant', (join) =>
          join.onRef('restaurant.shard_id', '=', 'shard.id').on('restaurant.account_id', '=', accountId),
        )
        .select(['shard.id', 'shard.name', 'shard.status', 'shard.opened_at', 'restaurant.id as rest_id'])
        .orderBy('shard.id')
        .execute();
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        openedAt: r.opened_at.toISOString(),
        hasRestaurant: r.rest_id !== null,
      }));
    },

    async select(session: LoadedSession, shardId: number): Promise<SelectShardResult> {
      await assertOpen(shardId);
      const rest = await d.db
        .selectFrom('restaurant')
        .select('id')
        .where('shard_id', '=', shardId)
        .where('account_id', '=', session.data.accountId)
        .executeTakeFirst();
      const restaurantId = rest?.id ?? null;
      await d.sessions.update(session.token, { shardId, restaurantId });
      return { shardId, restaurantId };
    },

    async ensureFeature(shardId: number, feature: string): Promise<ShardSettings> {
      const s = await settings(shardId);
      if (!isFeatureEnabled(s, feature)) throw new AppError(ErrorCode.FEATURE_DISABLED, 403, { feature });
      return s;
    },
  };
}

export type ShardService = ReturnType<typeof createShardService>;
```

`apps/server/src/modules/shard/routes.ts`：
```ts
import type { FastifyPluginAsync } from 'fastify';
import { selectShardBody } from '@dt/shared';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { requireAccount } from '../../security/session';
import type { ShardService } from './service';

export function shardRoutes(svc: ShardService): FastifyPluginAsync {
  return async (r) => {
    r.get('/list', async (req) => ok(await svc.list(requireAccount(req).data.accountId)));
    r.post('/select', async (req) => {
      const session = requireAccount(req);
      const { shardId } = parse(selectShardBody, req.body);
      return ok(await svc.select(session, shardId));
    });
  };
}
```

`apps/server/src/modules/index.ts`（整体替换）：
```ts
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { accountRoutes } from './account/routes';
import { createAccountService } from './account/service';
import { shardRoutes } from './shard/routes';
import { createShardService } from './shard/service';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  const shards = createShardService(deps);
  app.register(accountRoutes(createAccountService(deps), deps), { prefix: '/api/v1/account' });
  app.register(shardRoutes(shards), { prefix: '/api/v1/shard' });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(shard): shard list/select, per-shard settings and feature flags"
```

---

### Task 10: 加成模块与道具发放

**Files:**
- Create: `apps/server/src/modules/effects/aggregate.ts`, `service.ts`
- Create: `apps/server/src/modules/store/grant.ts`
- Test: `apps/server/src/modules/effects/aggregate.test.ts`, `effects.test.ts`, `apps/server/src/modules/store/grant.test.ts`

**Interfaces:**
- Consumes: `goodsEffectHours`、`GameConfig`、`Goods`（`@dt/config`）；`DB`
- Produces：
  - `interface EffectLike { effects: Record<string, number>; expiresAt: Date | null }`、`aggregateEffects(sources: EffectLike[], now: Date): { agg: Record<string, number>; nextExpireAt: Date | null }`
  - `interface EffectSourceInput { sourceType: string; sourceId: number; effects: Record<string, number>; expiresAt: Date | null }`、`interface ActiveEffect`（同字段）
  - `upsertEffectSource(db, restId, s): Promise<void>`、`removeEffectSource(db, restId, sourceType, sourceId): Promise<void>`、`listActiveEffects(db, restId, now): Promise<ActiveEffect[]>`、`getEffectAgg(db, restId, now): Promise<Record<string, number>>`（调用方应持有该店行锁）
  - `sourceTypeForGoods(g: Goods): 'street' | 'honor'`、`grantGoods(db, config, restId, goodsId, num, now): Promise<void>`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/effects/aggregate.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { aggregateEffects } from './aggregate';

const now = new Date('2026-09-29T00:00:00Z');
const later = (h: number) => new Date(now.getTime() + h * 3600_000);

describe('aggregateEffects', () => {
  it('按键求和，忽略已过期的来源', () => {
    const { agg } = aggregateEffects(
      [
        { effects: { atRate: 0.1, coinRate: 0.2 }, expiresAt: null },
        { effects: { atRate: 0.2 }, expiresAt: later(1) },
        { effects: { atRate: 5 }, expiresAt: later(-1) },
      ],
      now,
    );
    expect(agg).toEqual({ atRate: 0.3, coinRate: 0.2 });
  });

  it('nextExpireAt 是最早的未来到期时间；都永久时为 null', () => {
    expect(aggregateEffects([{ effects: {}, expiresAt: later(5) }, { effects: {}, expiresAt: later(2) }], now).nextExpireAt)
      .toEqual(later(2));
    expect(aggregateEffects([{ effects: { a: 1 }, expiresAt: null }], now).nextExpireAt).toBeNull();
  });
});
```

`apps/server/src/modules/effects/effects.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { getEffectAgg, listActiveEffects, removeEffectSource, upsertEffectSource } from './service';

const db = testDb();
let shardId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
});
const newRest = async () => createRestaurantRow(db, shardId, await createAccountRow(db));

describe('effects service', () => {
  it('汇总并缓存；来源变动后重新汇总', async () => {
    const restId = await newRest();
    const now = new Date();
    await upsertEffectSource(db, restId, { sourceType: 'honor', sourceId: 1, effects: { atRate: 0.1 }, expiresAt: null });
    await upsertEffectSource(db, restId, { sourceType: 'street', sourceId: 140, effects: { atRate: 0.35, luckValue: 36 }, expiresAt: null });
    expect(await getEffectAgg(db, restId, now)).toEqual({ atRate: 0.45, luckValue: 36 });

    // 绕过服务直接改数据：缓存没失效，仍返回旧值（证明走了缓存）
    await db.updateTable('effect_source').set({ effects: JSON.stringify({ atRate: 9 }) }).where('rest_id', '=', restId).where('source_id', '=', 1).execute();
    expect(await getEffectAgg(db, restId, now)).toEqual({ atRate: 0.45, luckValue: 36 });

    await removeEffectSource(db, restId, 'honor', 1);
    expect(await getEffectAgg(db, restId, now)).toEqual({ atRate: 0.35, luckValue: 36 });
  });

  it('有来源到期时自动重新汇总', async () => {
    const restId = await newRest();
    const now = new Date();
    await upsertEffectSource(db, restId, {
      sourceType: 'honor', sourceId: 81, effects: { expRate: 1 }, expiresAt: new Date(now.getTime() + 3600_000),
    });
    expect(await getEffectAgg(db, restId, now)).toEqual({ expRate: 1 });
    const twoHoursLater = new Date(now.getTime() + 2 * 3600_000);
    expect(await getEffectAgg(db, restId, twoHoursLater)).toEqual({});
    expect(await listActiveEffects(db, restId, twoHoursLater)).toEqual([]);
  });

  it('同一来源再次写入是更新而不是新增', async () => {
    const restId = await newRest();
    await upsertEffectSource(db, restId, { sourceType: 'honor', sourceId: 5, effects: { a: 1 }, expiresAt: null });
    await upsertEffectSource(db, restId, { sourceType: 'honor', sourceId: 5, effects: { a: 2 }, expiresAt: null });
    const list = await listActiveEffects(db, restId, new Date());
    expect(list).toHaveLength(1);
    expect(list[0]!.effects).toEqual({ a: 2 });
  });
});
```

`apps/server/src/modules/store/grant.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantRow, createShard } from '../../../test/fixtures';
import { testConfig } from '../../../test/helpers';
import { listActiveEffects } from '../effects/service';
import { grantGoods, sourceTypeForGoods } from './grant';

const db = testDb();
const config = testConfig();
let shardId: number;
afterAll(() => db.destroy());
beforeAll(async () => {
  shardId = await createShard(db);
});
const newRest = async () => createRestaurantRow(db, shardId, await createAccountRow(db));
const item = (restId: number, goodsId: number) =>
  db.selectFrom('store_item').selectAll().where('rest_id', '=', restId).where('goods_id', '=', goodsId).executeTakeFirst();

describe('grantGoods', () => {
  it('勋章：数量恒为 1，写入加成来源，有效期按 invalidhour', async () => {
    const restId = await newRest();
    const now = new Date('2026-09-29T00:00:00Z');
    await grantGoods(db, config, restId, 81, 1, now);
    await grantGoods(db, config, restId, 81, 1, now);
    expect((await item(restId, 81))!.num).toBe(1);
    const [effect] = await listActiveEffects(db, restId, now);
    expect(effect).toMatchObject({ sourceType: 'honor', sourceId: 81, effects: { atRate: 0.25, coinRate: 1, expRate: 1 } });
    expect(effect!.expiresAt).toEqual(new Date(now.getTime() + 360 * 3600_000));
  });

  it('街道勋章的来源类型是 street，永久有效', async () => {
    expect(sourceTypeForGoods(config.requireGoods(140))).toBe('street');
    expect(sourceTypeForGoods(config.requireGoods(100))).toBe('honor');
    const restId = await newRest();
    await grantGoods(db, config, restId, 140, 1, new Date());
    const [effect] = await listActiveEffects(db, restId, new Date());
    expect(effect).toMatchObject({ sourceType: 'street', sourceId: 140, expiresAt: null });
  });

  it('可叠加道具累加，但不超过持有上限', async () => {
    const restId = await newRest();
    const max = config.requireGoods(1).maxNum;
    await grantGoods(db, config, restId, 1, max - 1, new Date());
    await grantGoods(db, config, restId, 1, 5, new Date());
    expect((await item(restId, 1))!.num).toBe(max);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run --project server`
Expected: FAIL，找不到 `./aggregate`、`./service`、`./grant`。

- [ ] **Step 3: 实现**

`apps/server/src/modules/effects/aggregate.ts`：
```ts
export interface EffectLike {
  effects: Record<string, number>;
  expiresAt: Date | null;
}

export interface EffectAggregate {
  agg: Record<string, number>;
  /** 最早一个仍有效来源的到期时间，届时需要重新汇总 */
  nextExpireAt: Date | null;
}

export function aggregateEffects(sources: EffectLike[], now: Date): EffectAggregate {
  const agg: Record<string, number> = {};
  let nextExpireAt: Date | null = null;
  for (const s of sources) {
    if (s.expiresAt && s.expiresAt <= now) continue;
    for (const [k, v] of Object.entries(s.effects)) agg[k] = (agg[k] ?? 0) + v;
    if (s.expiresAt && (!nextExpireAt || s.expiresAt < nextExpireAt)) nextExpireAt = s.expiresAt;
  }
  for (const k of Object.keys(agg)) agg[k] = Math.round(agg[k]! * 1e9) / 1e9;
  return { agg, nextExpireAt };
}
```

`apps/server/src/modules/effects/service.ts`：
```ts
import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';
import { aggregateEffects } from './aggregate';

export interface EffectSourceInput {
  sourceType: string;
  sourceId: number;
  effects: Record<string, number>;
  expiresAt: Date | null;
}

export type ActiveEffect = EffectSourceInput;

async function markDirty(db: Kysely<DB>, restId: number): Promise<void> {
  await db.updateTable('restaurant').set({ effect_dirty: true }).where('id', '=', restId).execute();
}

export async function upsertEffectSource(db: Kysely<DB>, restId: number, s: EffectSourceInput): Promise<void> {
  const effects = JSON.stringify(s.effects);
  await db
    .insertInto('effect_source')
    .values({ rest_id: restId, source_type: s.sourceType, source_id: s.sourceId, effects, expires_at: s.expiresAt })
    .onConflict((oc) => oc.columns(['rest_id', 'source_type', 'source_id']).doUpdateSet({ effects, expires_at: s.expiresAt }))
    .execute();
  await markDirty(db, restId);
}

export async function removeEffectSource(
  db: Kysely<DB>,
  restId: number,
  sourceType: string,
  sourceId: number,
): Promise<void> {
  await db
    .deleteFrom('effect_source')
    .where('rest_id', '=', restId)
    .where('source_type', '=', sourceType)
    .where('source_id', '=', sourceId)
    .execute();
  await markDirty(db, restId);
}

export async function listActiveEffects(db: Kysely<DB>, restId: number, now: Date): Promise<ActiveEffect[]> {
  const rows = await db
    .selectFrom('effect_source')
    .select(['source_type', 'source_id', 'effects', 'expires_at'])
    .where('rest_id', '=', restId)
    .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', now)]))
    .orderBy('id')
    .execute();
  return rows.map((r) => ({ sourceType: r.source_type, sourceId: r.source_id, effects: r.effects, expiresAt: r.expires_at }));
}

/** 取加成汇总：缓存有效直接返回；来源有变动或有来源到期时重算并写回。调用方应已持有该店的行锁 */
export async function getEffectAgg(db: Kysely<DB>, restId: number, now: Date): Promise<Record<string, number>> {
  const r = await db
    .selectFrom('restaurant')
    .select(['effect_agg', 'effect_dirty', 'effect_next_expire_at'])
    .where('id', '=', restId)
    .executeTakeFirstOrThrow();
  const stale = r.effect_dirty || (r.effect_next_expire_at !== null && r.effect_next_expire_at <= now);
  if (!stale) return r.effect_agg;
  const { agg, nextExpireAt } = aggregateEffects(await listActiveEffects(db, restId, now), now);
  await db
    .updateTable('restaurant')
    .set({ effect_agg: JSON.stringify(agg), effect_next_expire_at: nextExpireAt, effect_dirty: false })
    .where('id', '=', restId)
    .execute();
  return agg;
}
```

`apps/server/src/modules/store/grant.ts`：
```ts
import { sql, type Kysely } from 'kysely';
import { goodsEffectHours, type GameConfig, type Goods } from '@dt/config';
import type { DB } from '../../db/schema';
import { upsertEffectSource } from '../effects/service';

const HONOR_TYPE = 9;
const STREET_MEDAL_BASE = 140;

/** 街道勋章：id = 140 + 街道号，devicetype = 街道号（规格书 00 §0.6） */
export function sourceTypeForGoods(g: Goods): 'street' | 'honor' {
  const isStreetMedal = g.type === HONOR_TYPE && g.deviceType !== null && g.id === STREET_MEDAL_BASE + g.deviceType;
  return isStreetMedal ? 'street' : 'honor';
}

/**
 * 给餐厅发道具（规格书 00 §0.9）：勋章数量恒为 1、再次获得刷新有效期，并写入加成来源；
 * 可叠加道具累加到持有上限。不可叠加的厨具实例在子项目 2 实现。
 */
export async function grantGoods(
  db: Kysely<DB>,
  config: GameConfig,
  restId: number,
  goodsId: number,
  num: number,
  now: Date,
): Promise<void> {
  const g = config.requireGoods(goodsId);
  const hours = goodsEffectHours(g);
  const expiresAt = hours !== null ? new Date(now.getTime() + hours * 3600_000) : null;
  const isHonor = g.type === HONOR_TYPE;
  const qty = isHonor ? 1 : Math.min(num, g.maxNum);
  await db
    .insertInto('store_item')
    .values({ rest_id: restId, goods_id: goodsId, num: qty, acquired_at: now, expires_at: expiresAt })
    .onConflict((oc) =>
      oc.columns(['rest_id', 'goods_id']).doUpdateSet({
        num: isHonor ? 1 : sql<number>`least(store_item.num + ${qty}, ${g.maxNum})`,
        acquired_at: now,
        expires_at: expiresAt,
      }),
    )
    .execute();
  if (isHonor) {
    await upsertEffectSource(db, restId, { sourceType: sourceTypeForGoods(g), sourceId: g.id, effects: g.effects, expiresAt });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(effects): effect sources with cached aggregation; goods granting"
```

---

### Task 11: 餐厅模块（开店、概况）

**Files:**
- Create: `apps/server/src/modules/restaurant/rules.ts`, `service.ts`, `routes.ts`
- Modify: `apps/server/src/modules/index.ts`（整体替换）
- Test: `apps/server/src/modules/restaurant/rules.test.ts`, `restaurant.test.ts`

**Interfaces:**
- Consumes: `ShardService`、`grantGoods`、`listActiveEffects`、`recordLedger`、`postNews`、`EventBus`、`uniqueViolation`、`requireAccount`/`requireRestaurant`；`checkRestaurantName`、`levelUpExp`、`createRestaurantBody`、`RestaurantDto`（`@dt/shared`）
- Produces：
  - `TABLES_PER_FLOOR = 16`、`initialTables(tableNum): TableState[]`、`emptyCookbookLevels(maxCookbookId): Buffer`、`newRestaurantValues(shardId, accountId, name, defaults)`、`toRestaurantDto(row, tables, effects, config): RestaurantDto`
  - `createRestaurantService(d: { db; config; bus; sessions; now }, shards: ShardService)`，返回 `{ create(session, rawName): Promise<RestaurantDto>; overview(restId): Promise<RestaurantDto> }`
  - 路由（前缀 `/api/v1/restaurant`）：`POST /create`、`GET /overview`
  - 事件：开店成功后发出 `restaurant.created`；新闻类型 `restaurant.open`，参数 `{ name }`；流水来源 `restaurant.create`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/modules/restaurant/rules.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { testConfig } from '../../../test/helpers';
import { emptyCookbookLevels, initialTables, newRestaurantValues } from './rules';

describe('restaurant rules', () => {
  it('初始餐桌都在 1 楼、空桌；每层 16 桌', () => {
    expect(initialTables(4)).toEqual([
      { no: 1, floor: 1, customer: 0 },
      { no: 2, floor: 1, customer: 0 },
      { no: 3, floor: 1, customer: 0 },
      { no: 4, floor: 1, customer: 0 },
    ]);
    expect(initialTables(17)[16]).toEqual({ no: 17, floor: 2, customer: 0 });
  });

  it('已学食谱数组：长度 = 最大食谱 id + 1，全部未学', () => {
    const buf = emptyCookbookLevels(2363);
    expect(buf.length).toBe(2364);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('新店数值来自配置；幸运 = 等级 - 1', () => {
    const d = testConfig().bundle.restaurantDefaults;
    const v = newRestaurantValues(1, 2, '小店', d);
    expect(v).toMatchObject({
      shard_id: 1, account_id: 2, name: '小店', level: 1, coin: 100000, attr_left: 3, luck: 0, table_num: 4, street_id: 0,
    });
  });
});
```

`apps/server/src/modules/restaurant/restaurant.test.ts`：
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { call, createTestApp, registerUser, type TestContext } from '../../../test/helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());

const R = '/api/v1/restaurant';

async function playerIn(shardId: number) {
  const u = await registerUser(ctx.app);
  await call(ctx.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
  return u;
}
const create = (cookie: string, name: string, headers?: Record<string, string>) =>
  call(ctx.app, 'POST', `${R}/create`, { cookie, body: { name }, headers });

describe('开店', () => {
  it('新店初始值与规格一致（规格书 02 §2.1）', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await playerIn(shardId);
    const before = Date.now();
    const r = await create(u.cookie, '  开张大吉店  ');
    expect(r.status).toBe(200);
    const d = r.json.data;
    expect(d).toMatchObject({
      shardId, name: '开张大吉店', level: 1, exp: 0, expToNext: 500, coin: 100000, diamond: 0,
      strength: 100, strengthMax: 100, oil: 1000, oilMax: 1000, starLevel: 0, streetId: 0, streetName: '新手街',
      renown: 10, attrLeft: 3, luck: 0, tableNum: 4, cupboardNum: 100, storeNum: 20, foodsMaxNum: 999, foodsLockNum: 15,
      attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 },
    });
    expect(d.tables).toHaveLength(4);
    expect(d.effects.map((e: { sourceId: number }) => e.sourceId).sort()).toEqual([81, 100, 140]);
    const opening = d.effects.find((e: { sourceId: number }) => e.sourceId === 81);
    expect(opening.name).toBe('开张大吉');
    const expires = new Date(opening.expiresAt).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 360 * 3600_000 - 5000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 360 * 3600_000 + 5000);
    expect(d.effects.find((e: { sourceId: number }) => e.sourceId === 140)).toMatchObject({ sourceType: 'street', expiresAt: null });

    const me = await call(ctx.app, 'GET', '/api/v1/account/me', { cookie: u.cookie });
    expect(me.json.data.restaurantId).toBe(d.id);
    const overview = await call(ctx.app, 'GET', `${R}/overview`, { cookie: u.cookie });
    expect(overview.json.data).toEqual(d);
  });

  it('写入仓库、流水、新闻', async () => {
    const shardId = await createShard(ctx.deps.db);
    const u = await playerIn(shardId);
    const { json } = await create(u.cookie, '记录测试店');
    const restId = json.data.id as number;
    const db = ctx.deps.db;
    const items = await db.selectFrom('store_item').select(['goods_id', 'num']).where('rest_id', '=', restId).execute();
    expect(items.map((i) => i.goods_id).sort()).toEqual([81, 100, 140]);
    const ledger = await db.selectFrom('ledger').selectAll().where('rest_id', '=', restId).execute();
    expect(ledger).toHaveLength(3);
    expect(ledger.every((l) => l.source === 'restaurant.create')).toBe(true);
    const news = await db.selectFrom('news').selectAll().where('shard_id', '=', shardId).where('type', '=', 'restaurant.open').execute();
    expect(news[0]!.params).toEqual({ name: '记录测试店' });
  });

  it('名称校验', async () => {
    const u = await playerIn(await createShard(ctx.deps.db));
    const reserved = await create(u.cookie, '镇长小馆');
    expect(reserved.status).toBe(400);
    expect(reserved.json).toMatchObject({ code: 'RESTAURANT_NAME_INVALID', params: { reason: 'reserved' } });
    expect((await create(u.cookie, '好吃😋')).json.params.reason).toBe('bad_chars');
    expect((await create(u.cookie, '好吃！')).json.params.reason).toBe('bad_chars');
    expect((await create(u.cookie, '   ')).json.params.reason).toBe('empty');
  });

  it('同区服重名（去掉首尾空格后）不行，不同区服可以', async () => {
    const s1 = await createShard(ctx.deps.db);
    const s2 = await createShard(ctx.deps.db);
    await create((await playerIn(s1)).cookie, '同名小店');
    const dup = await create((await playerIn(s1)).cookie, ' 同名小店 ');
    expect(dup.status).toBe(409);
    expect(dup.json.code).toBe('RESTAURANT_NAME_TAKEN');
    expect((await create((await playerIn(s2)).cookie, '同名小店')).status).toBe(200);
  });

  it('同一区服只能开一家店，连点也只开一家', async () => {
    const u = await playerIn(await createShard(ctx.deps.db));
    const [a, b] = await Promise.all([create(u.cookie, '连点店甲'), create(u.cookie, '连点店乙')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a, b].find((x) => x.status === 409)!.json.code).toBe('RESTAURANT_EXISTS');
    const again = await create(u.cookie, '再开一家');
    expect(again.json.code).toBe('RESTAURANT_EXISTS');
  });

  it('相同幂等键重复提交只开一家，返回相同结果', async () => {
    const u = await playerIn(await createShard(ctx.deps.db));
    const headers = { 'idempotency-key': `idem${Math.random().toString(36).slice(2, 12)}` };
    const a = await create(u.cookie, '幂等小店', headers);
    const b = await create(u.cookie, '幂等小店', headers);
    expect(a.status).toBe(200);
    expect(b.json).toEqual(a.json);
  });

  it('没选区服 / 没开店', async () => {
    const u = await registerUser(ctx.app);
    expect((await create(u.cookie, '无区服店')).json.code).toBe('NO_SHARD_SELECTED');
    const v = await playerIn(await createShard(ctx.deps.db));
    expect((await call(ctx.app, 'GET', `${R}/overview`, { cookie: v.cookie })).json.code).toBe('RESTAURANT_NOT_FOUND');
  });

  it('区服关闭或关闭了开店功能时不能开店', async () => {
    const closedLater = await createShard(ctx.deps.db);
    const u = await playerIn(closedLater);
    await ctx.deps.db.updateTable('shard').set({ status: 'closed' }).where('id', '=', closedLater).execute();
    expect((await create(u.cookie, '关服店')).json.code).toBe('SHARD_CLOSED');

    const noRest = await createShard(ctx.deps.db);
    await ctx.deps.db
      .insertInto('shard_config')
      .values({ shard_id: noRest, override: JSON.stringify({ features: { restaurant: false } }) })
      .execute();
    const v = await playerIn(noRest);
    expect((await create(v.cookie, '禁开店')).json.code).toBe('FEATURE_DISABLED');
  });

  it('同一账号在两个区服各开一家，数据互不影响', async () => {
    const s1 = await createShard(ctx.deps.db);
    const s2 = await createShard(ctx.deps.db);
    const u = await registerUser(ctx.app);
    const select = (shardId: number) => call(ctx.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
    await select(s1);
    const first = (await create(u.cookie, '一服小店')).json.data;
    await select(s2);
    const second = (await create(u.cookie, '二服小店')).json.data;
    expect(second.id).not.toBe(first.id);

    await ctx.deps.db.updateTable('restaurant').set({ coin: 1 }).where('id', '=', first.id).execute();
    expect((await call(ctx.app, 'GET', `${R}/overview`, { cookie: u.cookie })).json.data).toMatchObject({
      name: '二服小店', coin: 100000,
    });
    expect((await select(s1)).json.data.restaurantId).toBe(first.id);
    expect((await call(ctx.app, 'GET', `${R}/overview`, { cookie: u.cookie })).json.data).toMatchObject({
      name: '一服小店', coin: 1,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run --project server`
Expected: FAIL，找不到 `./rules`；餐厅接口返回 404。

- [ ] **Step 3: 实现**

`apps/server/src/modules/restaurant/rules.ts`：
```ts
import type { Insertable } from 'kysely';
import type { GameConfig, RestaurantDefaults } from '@dt/config';
import { levelUpExp, type RestaurantDto } from '@dt/shared';
import type { RestaurantRow, RestaurantTable, TableState } from '../../db/schema';
import type { ActiveEffect } from '../effects/service';

export const TABLES_PER_FLOOR = 16;

export function initialTables(tableNum: number): TableState[] {
  return Array.from({ length: tableNum }, (_, i) => ({
    no: i + 1,
    floor: Math.floor(i / TABLES_PER_FLOOR) + 1,
    customer: 0,
  }));
}

/** 已学食谱：下标 = 食谱 id，值 = 品级（0 未学） */
export function emptyCookbookLevels(maxCookbookId: number): Buffer {
  return Buffer.alloc(maxCookbookId + 1);
}

export function newRestaurantValues(
  shardId: number,
  accountId: number,
  name: string,
  d: RestaurantDefaults,
): Insertable<RestaurantTable> {
  return {
    shard_id: shardId,
    account_id: accountId,
    name,
    level: d.level,
    coin: d.coin,
    diamond: d.diamond,
    strength: d.strength,
    strength_max: d.strengthMax,
    oil: d.oil,
    oil_max: d.oilMax,
    street_id: d.streetId,
    renown: d.renown,
    attr_left: d.attrLeft,
    luck: d.level - 1,
    table_num: d.tableNum,
    cupboard_num: d.cupboardNum,
    store_num: d.storeNum,
    foods_max_num: d.foodsMaxNum,
    foods_lock_num: d.foodsLockNum,
  };
}

export function toRestaurantDto(
  r: RestaurantRow,
  tables: TableState[],
  effects: ActiveEffect[],
  config: GameConfig,
): RestaurantDto {
  return {
    id: r.id,
    shardId: r.shard_id,
    name: r.name,
    level: r.level,
    exp: r.exp,
    expToNext: levelUpExp(r.level),
    coin: r.coin,
    diamond: r.diamond,
    strength: r.strength,
    strengthMax: r.strength_max,
    oil: r.oil,
    oilMax: r.oil_max,
    starLevel: r.star_level,
    streetId: r.street_id,
    streetName: config.streets.get(r.street_id)?.name ?? '',
    renown: r.renown,
    attrLeft: r.attr_left,
    attrs: {
      cook: r.attr_cook,
      cutting: r.attr_cutting,
      fire: r.attr_fire,
      season: r.attr_season,
      creatives: r.attr_creatives,
    },
    luck: r.luck,
    tableNum: r.table_num,
    cupboardNum: r.cupboard_num,
    storeNum: r.store_num,
    foodsMaxNum: r.foods_max_num,
    foodsLockNum: r.foods_lock_num,
    tables: tables.map((t) => ({ no: t.no, floor: t.floor, customer: t.customer })),
    effects: effects.map((e) => ({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      name: config.goods.get(e.sourceId)?.name ?? e.sourceType,
      effects: e.effects,
      expiresAt: e.expiresAt ? e.expiresAt.toISOString() : null,
    })),
    createdAt: r.created_at.toISOString(),
  };
}
```

`apps/server/src/modules/restaurant/service.ts`：
```ts
import type { Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import { checkRestaurantName, ErrorCode, type RestaurantDto } from '@dt/shared';
import { uniqueViolation } from '../../db/errors';
import type { DB } from '../../db/schema';
import type { EventBus } from '../../events/bus';
import { AppError } from '../../http/errors';
import type { LoadedSession } from '../../security/session';
import type { SessionStore } from '../../security/sessionStore';
import { listActiveEffects } from '../effects/service';
import { recordLedger } from '../ledger/ledger';
import { postNews } from '../news/news';
import type { ShardService } from '../shard/service';
import { grantGoods } from '../store/grant';
import { emptyCookbookLevels, initialTables, newRestaurantValues, toRestaurantDto } from './rules';

export interface RestaurantDeps {
  db: Kysely<DB>;
  config: GameConfig;
  bus: EventBus;
  sessions: SessionStore;
  now: () => Date;
}

export function createRestaurantService(d: RestaurantDeps, shards: ShardService) {
  async function overview(restId: number): Promise<RestaurantDto> {
    const row = await d.db.selectFrom('restaurant').selectAll().where('id', '=', restId).executeTakeFirst();
    if (!row) throw new AppError(ErrorCode.RESTAURANT_NOT_FOUND, 404);
    const tables = await d.db.selectFrom('restaurant_tables').select('tables').where('rest_id', '=', restId).executeTakeFirstOrThrow();
    const effects = await listActiveEffects(d.db, restId, d.now());
    return toRestaurantDto(row, tables.tables, effects, d.config);
  }

  return {
    overview,

    async create(session: LoadedSession, rawName: string): Promise<RestaurantDto> {
      const { accountId, shardId } = session.data;
      if (shardId === null) throw new AppError(ErrorCode.NO_SHARD_SELECTED, 400);
      await shards.assertOpen(shardId);
      const settings = await shards.ensureFeature(shardId, 'restaurant');

      const existing = await d.db
        .selectFrom('restaurant').select('id').where('shard_id', '=', shardId).where('account_id', '=', accountId)
        .executeTakeFirst();
      if (existing) throw new AppError(ErrorCode.RESTAURANT_EXISTS, 409);

      const name = rawName.trim();
      const check = checkRestaurantName(name);
      if (check !== 'ok') throw new AppError(ErrorCode.RESTAURANT_NAME_INVALID, 400, { reason: check });

      const defaults = settings.restaurant;
      const now = d.now();
      const restId = await d.db.transaction().execute(async (tx) => {
        let id: number;
        try {
          const row = await tx
            .insertInto('restaurant').values(newRestaurantValues(shardId, accountId, name, defaults)).returning('id')
            .executeTakeFirstOrThrow();
          id = row.id;
        } catch (e) {
          const constraint = uniqueViolation(e);
          if (constraint === 'restaurant_shard_account') throw new AppError(ErrorCode.RESTAURANT_EXISTS, 409);
          if (constraint === 'restaurant_shard_name') throw new AppError(ErrorCode.RESTAURANT_NAME_TAKEN, 409);
          throw e;
        }
        await tx.insertInto('restaurant_tables').values({ rest_id: id, tables: JSON.stringify(initialTables(defaults.tableNum)) }).execute();
        await tx.insertInto('restaurant_cookbooks').values({ rest_id: id, levels: emptyCookbookLevels(d.config.maxCookbookId) }).execute();
        for (const gift of defaults.giftGoods) await grantGoods(tx, d.config, id, gift.id, gift.num, now);
        await recordLedger(
          tx,
          defaults.giftGoods.map((g) => ({ restId: id, kind: 'goods' as const, itemId: g.id, delta: g.num, source: 'restaurant.create' })),
        );
        await postNews(tx, { shardId, type: 'restaurant.open', restId: id, params: { name } });
        await d.bus.emit(tx, { name: 'restaurant.created', shardId, restId: id });
        return id;
      });

      await d.sessions.update(session.token, { restaurantId: restId });
      return overview(restId);
    },
  };
}

export type RestaurantService = ReturnType<typeof createRestaurantService>;
```

`apps/server/src/modules/restaurant/routes.ts`：
```ts
import type { FastifyPluginAsync } from 'fastify';
import { createRestaurantBody } from '@dt/shared';
import { ok } from '../../http/reply';
import { parse } from '../../http/validate';
import { requireAccount, requireRestaurant } from '../../security/session';
import type { RestaurantService } from './service';

export function restaurantRoutes(svc: RestaurantService): FastifyPluginAsync {
  return async (r) => {
    r.post('/create', async (req) => {
      const session = requireAccount(req);
      const { name } = parse(createRestaurantBody, req.body);
      return ok(await svc.create(session, name));
    });
    r.get('/overview', async (req) => ok(await svc.overview(requireRestaurant(req).restaurantId)));
  };
}
```

`apps/server/src/modules/index.ts`（整体替换）：
```ts
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';
import { accountRoutes } from './account/routes';
import { createAccountService } from './account/service';
import { restaurantRoutes } from './restaurant/routes';
import { createRestaurantService } from './restaurant/service';
import { shardRoutes } from './shard/routes';
import { createShardService } from './shard/service';

/** 注册所有业务模块的路由 */
export function registerModules(app: FastifyInstance, deps: AppDeps): void {
  const shards = createShardService(deps);
  app.register(accountRoutes(createAccountService(deps), deps), { prefix: '/api/v1/account' });
  app.register(shardRoutes(shards), { prefix: '/api/v1/shard' });
  app.register(restaurantRoutes(createRestaurantService(deps, shards)), { prefix: '/api/v1/restaurant' });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(restaurant): open a restaurant with configured defaults and gifts; overview"
```

---

### Task 12: 进程入口、worker（选主、定时任务、分区维护）与运维命令

**Files:**
- Create: `apps/server/src/deps.ts`, `main.ts`, `worker.ts`
- Create: `apps/server/src/worker/leader.ts`, `scheduler.ts`, `jobs.ts`
- Create: `apps/server/src/cli/shard.ts`, `apps/server/src/cli/migrate.ts`
- Create: `apps/server/.env.development`, `apps/server/tsup.config.ts`
- Test: `apps/server/src/worker/leader.test.ts`, `scheduler.test.ts`, `jobs.test.ts`

**Interfaces:**
- Consumes: 前面所有任务的产出
- Produces：
  - `createDeps(env: Env): AppDeps`
  - `LEADER_LOCK_KEY`、`tryLead(client: pg.Client, key?): Promise<boolean>`、`waitForLeadership(url, opts?: { key?; intervalMs?; signal?; onWait? }): Promise<pg.Client | null>`
  - `interface Job { name: string; intervalMs: number; run: () => Promise<void> }`、`interface JobLogger { error(obj: object, msg: string): void }`、`startScheduler(jobs, log): { stop(): void }`
  - `RETENTION_DAYS = { ledger: 30, news: 30 }`、`maintainPartitions(db, now): Promise<{ created: string[]; dropped: string[] }>`、`workerJobs(deps: { db; redis }, now?): Job[]`
  - 命令：`pnpm --filter @dt/server shard ensure --id <n> --name <名称>`、`shard close --id <n>`、`shard open --id <n>`、`shard list`；`pnpm --filter @dt/server migrate:dev`

- [ ] **Step 1: 写失败的测试**

`apps/server/src/worker/leader.test.ts`：
```ts
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { tryLead, waitForLeadership } from './leader';

const url = () => process.env.DATABASE_URL!;
const newKey = () => 400_000 + Math.floor(Math.random() * 100_000);
async function client() {
  const c = new pg.Client({ connectionString: url() });
  await c.connect();
  return c;
}

describe('leader election', () => {
  it('同一时刻只有一个主节点，主节点断开后另一个接管', async () => {
    const key = newKey();
    const a = await client();
    const b = await client();
    expect(await tryLead(a, key)).toBe(true);
    expect(await tryLead(b, key)).toBe(false);
    await a.end();
    expect(await tryLead(b, key)).toBe(true);
    await b.end();
  });

  it('waitForLeadership 在锁释放后返回；被取消时返回 null', async () => {
    const key = newKey();
    const holder = await client();
    await tryLead(holder, key);
    const waiting = waitForLeadership(url(), { key, intervalMs: 50 });
    setTimeout(() => void holder.end(), 200);
    const leader = await waiting;
    expect(leader).not.toBeNull();

    const ac = new AbortController();
    const blocked = waitForLeadership(url(), { key, intervalMs: 50, signal: ac.signal });
    setTimeout(() => ac.abort(), 150);
    expect(await blocked).toBeNull();
    await leader!.end();
  });
});
```

`apps/server/src/worker/scheduler.test.ts`：
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startScheduler } from './scheduler';

afterEach(() => vi.useRealTimers());

describe('scheduler', () => {
  it('启动时先跑一次，之后按间隔运行；上一次没结束时跳过', async () => {
    vi.useFakeTimers();
    let runs = 0;
    let release: () => void = () => {};
    const job = {
      name: 'slow',
      intervalMs: 1000,
      run: () => {
        runs += 1;
        return new Promise<void>((r) => {
          release = r;
        });
      },
    };
    const s = startScheduler([job], { error: vi.fn() });
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runs).toBe(2);
    s.stop();
  });

  it('任务出错只记日志，下一轮照常运行', async () => {
    vi.useFakeTimers();
    const log = { error: vi.fn() };
    let runs = 0;
    const s = startScheduler(
      [{ name: 'bad', intervalMs: 1000, run: async () => { runs += 1; throw new Error('x'); } }],
      log,
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toBe(3);
    expect(log.error).toHaveBeenCalledTimes(3);
    s.stop();
  });
});
```

`apps/server/src/worker/jobs.test.ts`：
```ts
import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../test/db';
import { ensureDailyPartitions, partitionName } from '../db/partitions';
import { maintainPartitions } from './jobs';

const db = testDb();
afterAll(() => db.destroy());
const DAY = 86_400_000;

describe('maintainPartitions', () => {
  it('预建未来分区并删除超过保留期的分区', async () => {
    const now = new Date();
    const [old] = await ensureDailyPartitions(db, 'news', new Date(now.getTime() - 45 * DAY), 1);
    const { created, dropped } = await maintainPartitions(db, now);
    const in3Days = new Date(now.getTime() + 3 * DAY).toISOString().slice(0, 10);
    expect(created).toContain(partitionName('ledger', in3Days));
    expect(created).toContain(partitionName('news', in3Days));
    expect(dropped).toContain(old);
    const { rows } = await sql<{ n: number }>`select count(*)::int as n from pg_class where relname = ${old}`.execute(db);
    expect(rows[0]!.n).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run --project server`
Expected: FAIL，找不到 `./leader`、`./scheduler`、`./jobs`。

- [ ] **Step 3: 实现 worker**

`apps/server/src/worker/leader.ts`：
```ts
import pg from 'pg';

export const LEADER_LOCK_KEY = 7_020_001;

/** PostgreSQL 会话级咨询锁：连接断开时自动释放，另一个 worker 就能接管 */
export async function tryLead(client: pg.Client, key = LEADER_LOCK_KEY): Promise<boolean> {
  const r = await client.query<{ ok: boolean }>('select pg_try_advisory_lock($1) as ok', [key]);
  return r.rows[0]?.ok === true;
}

export async function waitForLeadership(
  url: string,
  opts: { key?: number; intervalMs?: number; signal?: AbortSignal; onWait?: () => void } = {},
): Promise<pg.Client | null> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  while (!opts.signal?.aborted) {
    if (await tryLead(client, opts.key)) return client;
    opts.onWait?.();
    await new Promise((resolve) => setTimeout(resolve, opts.intervalMs ?? 5000));
  }
  await client.end();
  return null;
}
```

`apps/server/src/worker/scheduler.ts`：
```ts
export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export interface JobLogger {
  error(obj: object, msg: string): void;
}

/** 启动时每个任务先跑一次，然后按间隔运行；同一任务不会重叠执行 */
export function startScheduler(jobs: Job[], log: JobLogger): { stop: () => void } {
  const timers: ReturnType<typeof setInterval>[] = [];
  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        log.error({ err, job: job.name }, 'job failed');
      } finally {
        running = false;
      }
    };
    void tick();
    timers.push(setInterval(() => void tick(), job.intervalMs));
  }
  return { stop: () => timers.forEach((t) => clearInterval(t)) };
}
```

`apps/server/src/worker/jobs.ts`：
```ts
import type { Redis } from 'ioredis';
import type { Kysely } from 'kysely';
import { dropPartitionsBefore, ensureDailyPartitions } from '../db/partitions';
import type { DB } from '../db/schema';
import type { Job } from './scheduler';

export const RETENTION_DAYS = { ledger: 30, news: 30 } as const;
const DAY_MS = 86_400_000;

/** 预建昨天起 5 天的分区，删除超过保留期的分区 */
export async function maintainPartitions(db: Kysely<DB>, now: Date): Promise<{ created: string[]; dropped: string[] }> {
  const created: string[] = [];
  const dropped: string[] = [];
  for (const table of ['ledger', 'news'] as const) {
    created.push(...(await ensureDailyPartitions(db, table, new Date(now.getTime() - DAY_MS), 5)));
    dropped.push(...(await dropPartitionsBefore(db, table, new Date(now.getTime() - RETENTION_DAYS[table] * DAY_MS))));
  }
  return { created, dropped };
}

export function workerJobs(deps: { db: Kysely<DB>; redis: Redis }, now: () => Date = () => new Date()): Job[] {
  return [
    { name: 'partitions', intervalMs: 3_600_000, run: async () => void (await maintainPartitions(deps.db, now())) },
    {
      name: 'heartbeat',
      intervalMs: 60_000,
      run: async () => void (await deps.redis.set('worker:heartbeat', now().toISOString(), 'EX', 180)),
    },
  ];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run --project server && pnpm typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 5: 实现进程入口、运维命令、打包配置**

`apps/server/src/deps.ts`：
```ts
import { loadGameConfig } from '@dt/config';
import type { AppDeps } from './app';
import { createDb } from './db';
import type { Env } from './env';
import { EventBus } from './events/bus';
import { disabledCaptcha, turnstileCaptcha } from './infra/captcha';
import { smtpMailer } from './infra/mailer';
import { createRedis } from './infra/redis';
import { createSessionStore } from './security/sessionStore';

export function createDeps(env: Env): AppDeps {
  const redis = createRedis(env.REDIS_URL);
  return {
    env,
    db: createDb(env.DATABASE_URL, env.DB_POOL_SIZE),
    redis,
    config: loadGameConfig(env.CONFIG_BUNDLE_PATH),
    mailer: smtpMailer(env.SMTP_URL, env.MAIL_FROM),
    captcha: env.TURNSTILE_SECRET ? turnstileCaptcha(env.TURNSTILE_SECRET) : disabledCaptcha(),
    bus: new EventBus(),
    sessions: createSessionStore(redis, env.SESSION_TTL_DAYS * 86400),
    now: () => new Date(),
  };
}
```

`apps/server/src/main.ts`：
```ts
import { buildApp } from './app';
import { migrateToLatest } from './db/migrate';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { maintainPartitions } from './worker/jobs';

const env = loadEnv();
const deps = createDeps(env);
if (env.MIGRATE_ON_START) {
  await migrateToLatest(deps.db);
  await maintainPartitions(deps.db, new Date());
}
const app = await buildApp(deps);
await app.listen({ port: env.PORT, host: '0.0.0.0' });

const shutdown = async () => {
  await app.close();
  await deps.db.destroy();
  deps.redis.disconnect();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
```

`apps/server/src/worker.ts`：
```ts
import pino from 'pino';
import { createDeps } from './deps';
import { loadEnv } from './env';
import { waitForLeadership } from './worker/leader';
import { startScheduler } from './worker/scheduler';
import { workerJobs } from './worker/jobs';

const env = loadEnv();
const log = pino({ level: env.LOG_LEVEL });
const deps = createDeps(env);
const ac = new AbortController();
process.once('SIGTERM', () => ac.abort());
process.once('SIGINT', () => ac.abort());

const leader = await waitForLeadership(env.DATABASE_URL, {
  signal: ac.signal,
  onWait: () => log.info('standby: another worker is the leader'),
});
if (leader) {
  leader.on('error', (err) => {
    log.error({ err }, 'leader connection lost, exiting so the container restarts');
    process.exit(1);
  });
  log.info('became leader, starting jobs');
  const scheduler = startScheduler(workerJobs(deps), log);
  await new Promise<void>((resolve) => ac.signal.addEventListener('abort', () => resolve()));
  scheduler.stop();
  await leader.end();
}
await deps.db.destroy();
deps.redis.disconnect();
```

`apps/server/src/cli/migrate.ts`：
```ts
import { createDb } from '../db';
import { migrateToLatest } from '../db/migrate';
import { loadEnv } from '../env';
import { maintainPartitions } from '../worker/jobs';

const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
try {
  await migrateToLatest(db);
  await maintainPartitions(db, new Date());
  console.log('migrations applied');
} finally {
  await db.destroy();
}
```

`apps/server/src/cli/shard.ts`：
```ts
import { parseArgs } from 'node:util';
import { createDb } from '../db';
import { loadEnv } from '../env';

const USAGE = '用法：shard ensure --id <n> --name <名称> | shard open --id <n> | shard close --id <n> | shard list';
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { id: { type: 'string' }, name: { type: 'string' } },
});
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
const id = Number(values.id);

try {
  switch (positionals[0]) {
    case 'ensure': {
      if (!Number.isInteger(id) || id <= 0 || !values.name) throw new Error(USAGE);
      await db.insertInto('shard').values({ id, name: values.name }).onConflict((oc) => oc.column('id').doNothing()).execute();
      console.log(`shard ${id} ready`);
      break;
    }
    case 'open':
    case 'close': {
      if (!Number.isInteger(id) || id <= 0) throw new Error(USAGE);
      const status = positionals[0] === 'open' ? 'open' : 'closed';
      await db.updateTable('shard').set({ status }).where('id', '=', id).execute();
      console.log(`shard ${id} ${status}`);
      break;
    }
    case 'list': {
      const rows = await db.selectFrom('shard').selectAll().orderBy('id').execute();
      for (const r of rows) console.log(`${r.id}\t${r.status}\t${r.name}`);
      break;
    }
    default:
      throw new Error(USAGE);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
```

`apps/server/.env.development`（本地开发用，不含任何秘密，提交进仓库）：
```
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgres://dt:dt@localhost:5432/dt
REDIS_URL=redis://localhost:6379/0
CONFIG_BUNDLE_PATH=../../packages/config/generated/bundle.json
WEB_ORIGIN=http://localhost:5173
TURNSTILE_SECRET=
SMTP_URL=smtp://localhost:1025
MIGRATE_ON_START=true
```

`apps/server/tsup.config.ts`：
```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    worker: 'src/worker.ts',
    'cli/shard': 'src/cli/shard.ts',
    'cli/migrate': 'src/cli/migrate.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // 工作区包以 TS 源码形式存在，必须打进产物
  noExternal: [/^@dt\//],
});
```

Run: `pnpm --filter @dt/server add -D tsup@^8`

- [ ] **Step 6: 本地手动验证**

Run：
```bash
pnpm infra:dev
pnpm --filter @dt/config build
pnpm --filter @dt/server migrate:dev
pnpm --filter @dt/server shard ensure --id 1 --name 一服
pnpm --filter @dt/server shard ensure --id 2 --name 二服
pnpm --filter @dt/server dev
```
另开终端：`curl http://localhost:3000/readyz`
Expected: `{"ok":true,"data":{"status":"ready"},"events":[]}`

再运行 `pnpm --filter @dt/server worker:dev`，Expected: 日志出现 `became leader, starting jobs`；再开一个 worker，Expected: 日志出现 `standby: another worker is the leader`。

Run: `pnpm --filter @dt/server build`
Expected: 生成 `apps/server/dist/main.js`、`worker.js`、`cli/shard.js`、`cli/migrate.js`。

- [ ] **Step 7: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(server): api and worker entrypoints, leader election, partition jobs, ops cli"
```

---
### Task 13: 前端基础库（接口客户端、错误文案、资源包、路由守卫、会话状态、组件）

**Files:**
- Create: `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- Create: `apps/web/src/env.d.ts`
- Create: `apps/web/src/api/client.ts`, `device.ts`, `endpoints.ts`
- Create: `apps/web/src/i18n/zh-CN.ts`
- Create: `apps/web/src/assets/asset.ts`
- Create: `apps/web/src/guard.ts`
- Create: `apps/web/src/stores/session.ts`
- Create: `apps/web/src/utils/format.ts`, `apps/web/src/utils/effects.ts`
- Create: `apps/web/src/components/GameImg.vue`, `TurnstileBox.vue`
- Test: `apps/web/src/api/client.test.ts`, `apps/web/src/i18n/zh-CN.test.ts`, `apps/web/src/assets/asset.test.ts`, `apps/web/src/guard.test.ts`, `apps/web/src/utils/utils.test.ts`, `apps/web/src/components/GameImg.test.ts`

**Interfaces:**
- Consumes: `@dt/shared` 的 `ApiResponse`、`ErrorCode`、`MeDto`、`ShardDto`、`SelectShardResult`、`RestaurantDto`、各 `*Input` 类型
- Produces：
  - `class ApiError extends Error { code: string; params: Record<string, unknown> }`、`createApiClient(fetchImpl?, base?)` → `{ get<T>(path): Promise<T>; post<T>(path, body?): Promise<T> }`、`api`
  - `deviceId(): string`
  - `endpoints`：`me`、`register`、`login`、`logout`、`sendVerifyEmail`、`verifyEmail`、`forgotPassword`、`resetPassword`、`listShards`、`selectShard`、`createRestaurant`、`overview`
  - `errorText(code: string, params?: Record<string, unknown>): string`、`errorMessage(e: unknown, fallback: string): string`
  - `asset(path: string, base?: string): string`
  - `interface RouteFlags { public?; guestOnly?; needRestaurant? }`、`resolveGuard(flags, me, fullPath): true | { name: string; query?: Record<string, string> }`
  - `useSessionStore()`：state `{ me: MeDto | null; loaded: boolean }`，actions `load()`、`logout()`
  - `formatNum(n: number): string`（`100000 → "100,000"`）、`describeEffects(effects: Record<string, number>): string`
  - 组件 `GameImg`（props `path`、`alt`、`fallbackIcon?`），`TurnstileBox`（emit `token`；没配置 site key 时立即给出 `dev-token`）

- [ ] **Step 1: 建前端包**

`apps/web/package.json`：
```json
{
  "name": "@dt/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc --noEmit",
    "e2e": "playwright test"
  }
}
```

`apps/web/tsconfig.json`：
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "jsx": "preserve"
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "e2e/**/*.ts", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`apps/web/vite.config.ts`：
```ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  // 开发时把 /api 代理到本地服务端，前后端同源，不用处理 CORS
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
```

`apps/web/vitest.config.ts`：
```ts
import vue from '@vitejs/plugin-vue';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [vue()],
  test: { name: 'web', environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
```

`apps/web/src/env.d.ts`：
```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 生产环境接口地址，例如 https://api.example.com；开发环境留空走代理 */
  readonly VITE_API_BASE?: string;
  /** 资源包地址，默认 /pack */
  readonly VITE_ASSET_BASE?: string;
  /** Cloudflare Turnstile site key；留空时跳过人机验证（仅开发环境） */
  readonly VITE_TURNSTILE_SITEKEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    render(el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }): string;
  };
}
```

Run:
```bash
pnpm --filter @dt/web add vue@^3.5 vue-router@^4.5 pinia@^3 bootstrap@^5.3 bootstrap-icons@^1.11 "@dt/shared@workspace:*"
pnpm --filter @dt/web add -D vite@^6 @vitejs/plugin-vue@^5 vue-tsc@^2 @vue/test-utils@^2 jsdom@^26
```

- [ ] **Step 2: 写失败的测试**

`apps/web/src/api/client.test.ts`：
```ts
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  it('成功时返回 data，带上 Cookie', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true, data: { a: 1 }, events: [] }));
    const api = createApiClient(f, 'http://api');
    expect(await api.get('/x')).toEqual({ a: 1 });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('http://api/x');
    expect(init!.method).toBe('GET');
    expect(init!.credentials).toBe('include');
  });

  it('POST 发送 JSON、幂等键和设备标识', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => json({ ok: true, data: null, events: [] }));
    await createApiClient(f, '').post('/y', { n: 1 });
    const init = f.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-device-id']).toBeTruthy();
    expect(init.body).toBe('{"n":1}');
  });

  it('业务失败抛 ApiError(code, params)', async () => {
    const f = vi.fn(async () => json({ ok: false, code: 'RESTAURANT_NAME_INVALID', params: { reason: 'reserved' } }, 400));
    await expect(createApiClient(f, '').post('/z')).rejects.toMatchObject({
      code: 'RESTAURANT_NAME_INVALID',
      params: { reason: 'reserved' },
    });
  });

  it('网络错误或响应不是 JSON 都抛 NETWORK', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('failed to fetch');
    });
    await expect(createApiClient(down, '').get('/a')).rejects.toBeInstanceOf(ApiError);
    await expect(createApiClient(down, '').get('/a')).rejects.toMatchObject({ code: 'NETWORK' });
    const html = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    await expect(createApiClient(html, '').get('/a')).rejects.toMatchObject({ code: 'NETWORK', params: { status: 502 } });
  });
});
```

`apps/web/src/i18n/zh-CN.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '@dt/shared';
import { errorText } from './zh-CN';

describe('errorText', () => {
  it('每个错误码都有中文文案', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(errorText(code)).not.toContain(code);
    }
    expect(errorText('NETWORK')).toBe('网络连接失败，请稍后再试');
  });

  it('餐厅名错误按原因给出具体提示', () => {
    expect(errorText('RESTAURANT_NAME_INVALID', { reason: 'reserved' })).toContain('官方');
    expect(errorText('RESTAURANT_NAME_INVALID', { reason: 'too_long' })).toContain('8 个汉字');
  });

  it('未知错误码有兜底', () => {
    expect(errorText('SOMETHING_NEW')).toBe('出错了（SOMETHING_NEW）');
  });
});
```

`apps/web/src/assets/asset.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { asset } from './asset';

describe('asset', () => {
  it('按路径拼出资源包地址，中文逐段编码', () => {
    expect(asset('goods/开张大吉', '/pack')).toBe('/pack/goods/%E5%BC%80%E5%BC%A0%E5%A4%A7%E5%90%89.png');
    expect(asset('town/bar', 'https://cdn.example.com/pack/')).toBe('https://cdn.example.com/pack/town/bar.png');
  });
});
```

`apps/web/src/guard.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import type { MeDto } from '@dt/shared';
import { resolveGuard } from './guard';

const me = (patch: Partial<MeDto> = {}): MeDto => ({
  accountId: 1, username: 'u', email: 'u@x', emailVerified: true, shardId: null, restaurantId: null, ...patch,
});

describe('resolveGuard', () => {
  it('公开页面：未登录可访问；已登录访问登录/注册页时跳走', () => {
    expect(resolveGuard({ public: true, guestOnly: true }, null, '/login')).toBe(true);
    expect(resolveGuard({ public: true, guestOnly: true }, me(), '/login')).toEqual({ name: 'shards' });
    expect(resolveGuard({ public: true, guestOnly: true }, me({ shardId: 1, restaurantId: 2 }), '/login')).toEqual({ name: 'home' });
    expect(resolveGuard({ public: true }, me(), '/verify-email')).toBe(true);
  });

  it('需要登录的页面：未登录跳登录页并记住来源', () => {
    expect(resolveGuard({}, null, '/shards')).toEqual({ name: 'login', query: { redirect: '/shards' } });
  });

  it('需要餐厅的页面：没选区服去选区服，没开店去开店', () => {
    expect(resolveGuard({ needRestaurant: true }, me(), '/')).toEqual({ name: 'shards' });
    expect(resolveGuard({ needRestaurant: true }, me({ shardId: 1 }), '/')).toEqual({ name: 'create-restaurant' });
    expect(resolveGuard({ needRestaurant: true }, me({ shardId: 1, restaurantId: 3 }), '/')).toBe(true);
  });
});
```

`apps/web/src/utils/utils.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { describeEffects } from './effects';
import { formatNum } from './format';

describe('formatNum', () => {
  it('千分位', () => {
    expect(formatNum(100000)).toBe('100,000');
    expect(formatNum(0)).toBe('0');
  });
});

describe('describeEffects', () => {
  it('比率显示为百分比，数值显示为加减，按固定顺序', () => {
    expect(describeEffects({ expRate: 1, atRate: 0.25, coinRate: 1 })).toBe('上座率+25% 最终银币+100% 最终经验+100%');
    expect(describeEffects({ luckValue: 36, coinValue: 1, spRate: -0.35, atRate: 0.35 })).toBe(
      '上座率+35% 挑剔率-35% 每桌银币+1 幸运+36',
    );
  });

  it('不认识的键不显示', () => {
    expect(describeEffects({ redPants: 1, luckValue: 20 })).toBe('幸运+20');
  });
});
```

`apps/web/src/components/GameImg.test.ts`：
```ts
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GameImg from './GameImg.vue';

describe('GameImg', () => {
  it('图片加载失败时显示图标兜底', async () => {
    const w = mount(GameImg, { props: { path: 'goods/开张大吉', alt: '开张大吉' } });
    expect(w.find('img').attributes('src')).toContain('/pack/goods/');
    await w.find('img').trigger('error');
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('i.bi').classes()).toContain('bi-image');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm vitest run --project web`
Expected: FAIL，找不到 `./client`、`./zh-CN` 等模块。

- [ ] **Step 4: 实现**

`apps/web/src/api/device.ts`：
```ts
const KEY = 'dt_device_id';
let cached: string | null = null;

/** 设备标识：本地保存，只作为防小号的辅助信号；浏览器禁用存储时每次会话新生成 */
export function deviceId(): string {
  if (cached) return cached;
  try {
    cached = localStorage.getItem(KEY);
    if (!cached) {
      cached = crypto.randomUUID();
      localStorage.setItem(KEY, cached);
    }
  } catch {
    cached = crypto.randomUUID();
  }
  return cached;
}
```

`apps/web/src/api/client.ts`：
```ts
import type { ApiResponse } from '@dt/shared';
import { deviceId } from './device';

export class ApiError extends Error {
  readonly code: string;
  readonly params: Record<string, unknown>;

  constructor(code: string, params: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.params = params;
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createApiClient(
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  base: string = import.meta.env.VITE_API_BASE ?? '',
) {
  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'x-device-id': deviceId() };
    if (method === 'POST') {
      headers['content-type'] = 'application/json';
      headers['idempotency-key'] = crypto.randomUUID();
    }
    let res: Response;
    try {
      res = await fetchImpl(base + path, {
        method,
        credentials: 'include',
        headers,
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });
    } catch {
      throw new ApiError('NETWORK');
    }
    let payload: ApiResponse<T>;
    try {
      payload = (await res.json()) as ApiResponse<T>;
    } catch {
      throw new ApiError('NETWORK', { status: res.status });
    }
    if (!payload.ok) throw new ApiError(payload.code, payload.params ?? {});
    return payload.data;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  };
}

export const api = createApiClient();
```

`apps/web/src/api/endpoints.ts`：
```ts
import type {
  ForgotPasswordInput,
  LoginInput,
  MeDto,
  RegisterInput,
  ResetPasswordInput,
  RestaurantDto,
  SelectShardResult,
  ShardDto,
} from '@dt/shared';
import { api } from './client';

type Empty = Record<string, never>;

export const endpoints = {
  me: () => api.get<MeDto>('/api/v1/account/me'),
  register: (body: RegisterInput) => api.post<MeDto>('/api/v1/account/register', body),
  login: (body: LoginInput) => api.post<MeDto>('/api/v1/account/login', body),
  logout: () => api.post<Empty>('/api/v1/account/logout'),
  sendVerifyEmail: () => api.post<Empty>('/api/v1/account/send-verify-email'),
  verifyEmail: (token: string) => api.post<Empty>('/api/v1/account/verify-email', { token }),
  forgotPassword: (body: ForgotPasswordInput) => api.post<Empty>('/api/v1/account/forgot-password', body),
  resetPassword: (body: ResetPasswordInput) => api.post<Empty>('/api/v1/account/reset-password', body),
  listShards: () => api.get<ShardDto[]>('/api/v1/shard/list'),
  selectShard: (shardId: number) => api.post<SelectShardResult>('/api/v1/shard/select', { shardId }),
  createRestaurant: (name: string) => api.post<RestaurantDto>('/api/v1/restaurant/create', { name }),
  overview: () => api.get<RestaurantDto>('/api/v1/restaurant/overview'),
};
```

`apps/web/src/i18n/zh-CN.ts`：
```ts
import type { ErrorCode } from '@dt/shared';
import { ApiError } from '../api/client';

const TEXT: Record<ErrorCode | 'NETWORK', string> = {
  VALIDATION_FAILED: '填写的内容不正确，请检查后再试',
  UNAUTHORIZED: '请先登录',
  FORBIDDEN: '没有权限进行这个操作',
  NOT_FOUND: '要找的内容不存在',
  RATE_LIMITED: '操作太频繁了，歇一会儿再试吧',
  IDEMPOTENCY_IN_PROGRESS: '正在处理上一次的请求，请稍候',
  CAPTCHA_FAILED: '人机验证没有通过，请刷新页面重试',
  USERNAME_TAKEN: '这个用户名已经被注册了',
  EMAIL_TAKEN: '这个邮箱已经被注册了',
  INVALID_CREDENTIALS: '用户名或密码错误',
  ACCOUNT_BANNED: '账号已被封禁，如有疑问请联系管理员',
  EMAIL_NOT_VERIFIED: '请先验证邮箱',
  TOKEN_INVALID: '链接无效或已过期，请重新获取',
  EMAIL_COOLDOWN: '邮件发送太频繁，请 1 分钟后再试',
  SHARD_NOT_FOUND: '区服不存在',
  SHARD_CLOSED: '这个区服已关闭',
  NO_SHARD_SELECTED: '请先选择区服',
  RESTAURANT_EXISTS: '你在这个区服已经有一家餐厅了',
  RESTAURANT_NOT_FOUND: '你在这个区服还没有餐厅',
  RESTAURANT_NAME_INVALID: '餐厅名称不合适',
  RESTAURANT_NAME_TAKEN: '这个名字已经被别的餐厅用了',
  FEATURE_DISABLED: '这个区服暂未开放该功能',
  INTERNAL: '服务器开小差了，请稍后再试',
  NETWORK: '网络连接失败，请稍后再试',
};

const NAME_REASON: Record<string, string> = {
  empty: '请输入餐厅名称',
  bad_chars: '只能使用中文、字母、数字、下划线和减号',
  too_long: '名称太长了，最多 8 个汉字或 12 个字母数字',
  reserved: '名称里不能包含小镇人物或官方字样',
};

export function errorText(code: string, params: Record<string, unknown> = {}): string {
  if (code === 'RESTAURANT_NAME_INVALID' && typeof params.reason === 'string' && NAME_REASON[params.reason]) {
    return NAME_REASON[params.reason]!;
  }
  return (TEXT as Record<string, string>)[code] ?? `出错了（${code}）`;
}

/** 把任意异常转成给玩家看的文案 */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? errorText(e.code, e.params) : fallback;
}
```

`apps/web/src/assets/asset.ts`：
```ts
const DEFAULT_BASE = import.meta.env.VITE_ASSET_BASE ?? '/pack';

/**
 * 资源包里的图片地址，例如 asset('goods/开张大吉')。
 * 所有图片都走这里，换一套美术只需要替换资源包目录或修改 VITE_ASSET_BASE。
 */
export function asset(path: string, base: string = DEFAULT_BASE): string {
  const root = base.replace(/\/+$/, '');
  return `${root}/${path.split('/').map(encodeURIComponent).join('/')}.png`;
}
```

`apps/web/src/guard.ts`：
```ts
import type { MeDto } from '@dt/shared';

export interface RouteFlags {
  /** 不需要登录 */
  public?: boolean;
  /** 只给未登录用户看（登录、注册、忘记密码） */
  guestOnly?: boolean;
  /** 需要当前区服已有餐厅 */
  needRestaurant?: boolean;
}

export type GuardResult = true | { name: string; query?: Record<string, string> };

export function resolveGuard(flags: RouteFlags, me: MeDto | null, fullPath: string): GuardResult {
  if (flags.public) return me && flags.guestOnly ? { name: me.restaurantId ? 'home' : 'shards' } : true;
  if (!me) return { name: 'login', query: { redirect: fullPath } };
  if (flags.needRestaurant && !me.restaurantId) return { name: me.shardId ? 'create-restaurant' : 'shards' };
  return true;
}
```

`apps/web/src/stores/session.ts`：
```ts
import { defineStore } from 'pinia';
import type { MeDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

export const useSessionStore = defineStore('session', {
  state: () => ({ me: null as MeDto | null, loaded: false }),
  actions: {
    async load() {
      try {
        this.me = await endpoints.me();
      } catch {
        this.me = null;
      } finally {
        this.loaded = true;
      }
    },
    async logout() {
      try {
        await endpoints.logout();
      } finally {
        this.me = null;
      }
    },
  },
});
```

`apps/web/src/utils/format.ts`：
```ts
export function formatNum(n: number): string {
  return n.toLocaleString('en-US');
}
```

`apps/web/src/utils/effects.ts`：
```ts
/** 加成键的显示顺序和名称（规格书 00 §0.6） */
const LABELS: Array<[key: string, label: string, kind: 'rate' | 'value']> = [
  ['atRate', '上座率', 'rate'],
  ['spRate', '挑剔率', 'rate'],
  ['coinRate', '最终银币', 'rate'],
  ['expRate', '最终经验', 'rate'],
  ['oilRate', '耗油', 'rate'],
  ['coinValue', '每桌银币', 'value'],
  ['expValue', '每桌经验', 'value'],
  ['oilValue', '每桌耗油', 'value'],
  ['luckValue', '幸运', 'value'],
];

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function describeEffects(effects: Record<string, number>): string {
  const parts: string[] = [];
  for (const [key, label, kind] of LABELS) {
    const v = effects[key];
    if (v === undefined) continue;
    parts.push(kind === 'rate' ? `${label}${signed(Math.round(v * 1000) / 10)}%` : `${label}${signed(v)}`);
  }
  return parts.join(' ');
}
```

`apps/web/src/components/GameImg.vue`：
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { asset } from '../assets/asset';

const props = withDefaults(defineProps<{ path: string; alt: string; fallbackIcon?: string }>(), {
  fallbackIcon: 'bi-image',
});
const failed = ref(false);
</script>

<template>
  <img v-if="!failed" class="game-img" :src="asset(props.path)" :alt="props.alt" @error="failed = true" />
  <i v-else :class="['bi', props.fallbackIcon]" :title="props.alt"></i>
</template>
```

`apps/web/src/components/TurnstileBox.vue`：
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';

const emit = defineEmits<{ token: [value: string] }>();
const siteKey = import.meta.env.VITE_TURNSTILE_SITEKEY ?? '';
const el = ref<HTMLDivElement | null>(null);

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile script failed to load'));
    document.head.appendChild(s);
  });
}

onMounted(async () => {
  // 开发环境没配置 site key：服务端同样关闭了校验，直接给一个占位令牌
  if (!siteKey) {
    emit('token', 'dev-token');
    return;
  }
  await loadScript();
  window.turnstile!.render(el.value!, { sitekey: siteKey, callback: (t) => emit('token', t) });
});
</script>

<template>
  <div ref="el" class="my-2"></div>
</template>
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm vitest run --project web && pnpm --filter @dt/web typecheck && pnpm lint`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(web): api client, error texts, asset pack, route guard, session store, components"
```

---

### Task 14: 前端页面与路由

**Files:**
- Create: `apps/web/index.html`, `apps/web/public/_redirects`
- Create: `apps/web/src/main.ts`, `App.vue`, `router.ts`, `styles/main.css`
- Create: `apps/web/src/views/LoginView.vue`, `RegisterView.vue`, `VerifyEmailView.vue`, `ForgotPasswordView.vue`, `ResetPasswordView.vue`, `ShardSelectView.vue`, `CreateRestaurantView.vue`, `RestaurantHomeView.vue`
- Test: `apps/web/src/views/CreateRestaurantView.test.ts`, `RestaurantHomeView.test.ts`

**Interfaces:**
- Consumes: Task 13 的全部产出；`@dt/shared` 的 `checkRestaurantName`、`USERNAME_RE`
- Produces：
  - 路由名：`login`、`register`、`verify-email`、`forgot-password`、`reset-password`、`shards`、`create-restaurant`、`home`
  - `createAppRouter(pinia: Pinia): Router`、`routes: RouteRecordRaw[]`
  - 端到端测试依赖的页面元素：输入框占位符"用户名""密码""确认密码""邮箱""餐厅名称"；按钮"注册""登录""开张"；区服按钮文字包含区服名；首页 `data-testid="rest-name" / "rest-level" / "rest-coin"`；首页链接"切换区服"；验证成功文案"邮箱验证成功"

- [ ] **Step 1: 写失败的测试**

`apps/web/src/views/CreateRestaurantView.test.ts`：
```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import CreateRestaurantView from './CreateRestaurantView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { createRestaurant: vi.fn() } }));

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { render: () => null } },
      { path: '/create', name: 'create-restaurant', component: CreateRestaurantView },
    ],
  });
  return { pinia, router };
}

describe('CreateRestaurantView', () => {
  beforeEach(() => vi.mocked(endpoints.createRestaurant).mockReset());

  it('名称不合规时直接提示，不请求服务端', async () => {
    const { pinia, router } = setup();
    await router.push('/create');
    const w = mount(CreateRestaurantView, { global: { plugins: [pinia, router] } });
    await w.find('input').setValue('镇长的店');
    expect(w.find('[data-testid="name-error"]').text()).toContain('官方');
    await w.find('form').trigger('submit');
    expect(endpoints.createRestaurant).not.toHaveBeenCalled();
  });

  it('提交时去掉首尾空格，成功后进入餐厅首页', async () => {
    const { pinia, router } = setup();
    await router.push('/create');
    vi.mocked(endpoints.createRestaurant).mockResolvedValue({ id: 5 } as never);
    const w = mount(CreateRestaurantView, { global: { plugins: [pinia, router] } });
    await w.find('input').setValue('  好吃小馆 ');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(endpoints.createRestaurant).toHaveBeenCalledWith('好吃小馆');
    expect(router.currentRoute.value.name).toBe('home');
  });
});
```

`apps/web/src/views/RestaurantHomeView.test.ts`：
```ts
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import RestaurantHomeView from './RestaurantHomeView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { overview: vi.fn() } }));

const dto: RestaurantDto = {
  id: 1, shardId: 1, name: '开张大吉店', level: 1, exp: 0, expToNext: 500, coin: 100000, diamond: 0,
  strength: 100, strengthMax: 100, oil: 1000, oilMax: 1000, starLevel: 0, streetId: 0, streetName: '新手街',
  renown: 10, attrLeft: 3, attrs: { cook: 0, cutting: 0, fire: 0, season: 0, creatives: 0 }, luck: 0,
  tableNum: 4, cupboardNum: 100, storeNum: 20, foodsMaxNum: 999, foodsLockNum: 15,
  tables: [1, 2, 3, 4].map((no) => ({ no, floor: 1, customer: 0 })),
  effects: [
    { sourceType: 'street', sourceId: 140, name: '新手街', effects: { atRate: 0.35, luckValue: 36 }, expiresAt: null },
  ],
  createdAt: '2026-09-29T00:00:00.000Z',
};

describe('RestaurantHomeView', () => {
  it('显示餐厅概况、餐桌和加成', async () => {
    vi.mocked(endpoints.overview).mockResolvedValue(dto);
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: RestaurantHomeView }] });
    const w = mount(RestaurantHomeView, { global: { plugins: [createPinia(), router] } });
    await flushPromises();
    expect(w.find('[data-testid="rest-name"]').text()).toBe('开张大吉店');
    expect(w.find('[data-testid="rest-level"]').text()).toBe('1');
    expect(w.find('[data-testid="rest-coin"]').text()).toBe('100,000');
    expect(w.findAll('[data-testid^="table-"]')).toHaveLength(4);
    expect(w.text()).toContain('上座率+35% 幸运+36');
    expect(w.text()).toContain('永久');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run --project web`
Expected: FAIL，找不到 `./CreateRestaurantView.vue`、`./RestaurantHomeView.vue`。

- [ ] **Step 3: 实现入口、路由、样式**

`apps/web/index.html`：
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>美味小镇</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`apps/web/public/_redirects`（Cloudflare Pages 的单页应用回退）：
```
/* /index.html 200
```

`apps/web/src/styles/main.css`：
```css
:root {
  --dt-primary: #d9480f;
  --dt-bg: #fff4e6;
  --dt-header-bg: #ffe8cc;
}
body {
  background: var(--dt-bg);
  min-width: 360px;
}
.dt-app {
  max-width: 720px;
  margin: 0 auto;
  min-height: 100vh;
  background: #fff;
}
.dt-header {
  height: 44px;
  background: var(--dt-header-bg);
  color: var(--dt-primary);
}
.dt-main {
  padding: 8px;
}
.game-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
```

`apps/web/src/App.vue`：
```vue
<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="dt-app">
    <header class="dt-header d-flex align-items-center px-2">
      <i class="bi bi-shop me-1"></i>
      <span class="fw-bold">美味小镇</span>
    </header>
    <main class="dt-main">
      <RouterView />
    </main>
  </div>
</template>
```

`apps/web/src/router.ts`：
```ts
import type { Pinia } from 'pinia';
import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from 'vue-router';
import { resolveGuard, type RouteFlags } from './guard';
import { useSessionStore } from './stores/session';

export const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true, guestOnly: true } },
  { path: '/register', name: 'register', component: () => import('./views/RegisterView.vue'), meta: { public: true, guestOnly: true } },
  { path: '/verify-email', name: 'verify-email', component: () => import('./views/VerifyEmailView.vue'), meta: { public: true } },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('./views/ForgotPasswordView.vue'),
    meta: { public: true, guestOnly: true },
  },
  { path: '/reset-password', name: 'reset-password', component: () => import('./views/ResetPasswordView.vue'), meta: { public: true } },
  { path: '/shards', name: 'shards', component: () => import('./views/ShardSelectView.vue') },
  { path: '/create-restaurant', name: 'create-restaurant', component: () => import('./views/CreateRestaurantView.vue') },
  { path: '/', name: 'home', component: () => import('./views/RestaurantHomeView.vue'), meta: { needRestaurant: true } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export function createAppRouter(pinia: Pinia): Router {
  const router = createRouter({ history: createWebHistory(), routes });
  router.beforeEach(async (to) => {
    const session = useSessionStore(pinia);
    if (!session.loaded) await session.load();
    return resolveGuard(to.meta as RouteFlags, session.me, to.fullPath);
  });
  return router;
}
```

`apps/web/src/main.ts`：
```ts
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';

const pinia = createPinia();
createApp(App).use(pinia).use(createAppRouter(pinia)).mount('#app');
```

- [ ] **Step 4: 实现账号相关页面**

`apps/web/src/views/LoginView.vue`：
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const username = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const route = useRoute();
const session = useSessionStore();

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    session.me = await endpoints.login({ username: username.value, password: password.value });
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/shards';
    await router.replace(redirect);
  } catch (e) {
    error.value = errorMessage(e, '登录失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">登录美味小镇</h5>
      <form @submit.prevent="submit">
        <input v-model.trim="username" class="form-control mb-2" placeholder="用户名" autocomplete="username" required />
        <input v-model="password" type="password" class="form-control mb-2" placeholder="密码" autocomplete="current-password" required />
        <div v-if="error" class="alert alert-danger py-1">{{ error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy">登录</button>
      </form>
      <div class="d-flex justify-content-between mt-2 small">
        <RouterLink to="/register">注册新账号</RouterLink>
        <RouterLink to="/forgot-password">忘记密码</RouterLink>
      </div>
    </div>
  </div>
</template>
```

`apps/web/src/views/RegisterView.vue`：
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { USERNAME_RE } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import TurnstileBox from '../components/TurnstileBox.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const form = ref({ username: '', password: '', password2: '', email: '', inviteCode: '' });
const captchaToken = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const session = useSessionStore();

const localError = computed(() => {
  const f = form.value;
  if (f.username && !USERNAME_RE.test(f.username)) return '用户名为 2~9 个字，只能用中文、字母、数字、下划线和减号';
  if (f.password && f.password.length < 6) return '密码至少 6 位';
  if (f.password2 && f.password !== f.password2) return '两次输入的密码不一致';
  return '';
});

async function submit() {
  if (localError.value) return;
  busy.value = true;
  error.value = '';
  try {
    session.me = await endpoints.register({
      username: form.value.username,
      password: form.value.password,
      email: form.value.email,
      inviteCode: form.value.inviteCode || undefined,
      captchaToken: captchaToken.value,
    });
    await router.replace({ name: 'shards' });
  } catch (e) {
    error.value = errorMessage(e, '注册失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">注册美味小镇</h5>
      <form @submit.prevent="submit">
        <input v-model.trim="form.username" class="form-control mb-2" placeholder="用户名" autocomplete="username" required />
        <input v-model="form.password" type="password" class="form-control mb-2" placeholder="密码" autocomplete="new-password" required />
        <input v-model="form.password2" type="password" class="form-control mb-2" placeholder="确认密码" autocomplete="new-password" required />
        <input v-model.trim="form.email" type="email" class="form-control mb-2" placeholder="邮箱" autocomplete="email" required />
        <input v-model.trim="form.inviteCode" class="form-control mb-2" placeholder="邀请码（可不填）" />
        <TurnstileBox @token="captchaToken = $event" />
        <div v-if="localError || error" class="alert alert-danger py-1 my-2">{{ localError || error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy || !captchaToken">注册</button>
      </form>
      <div class="mt-2 small"><RouterLink to="/login">已有账号？去登录</RouterLink></div>
    </div>
  </div>
</template>
```

`apps/web/src/views/VerifyEmailView.vue`：
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const session = useSessionStore();
const state = ref<'pending' | 'ok' | 'error'>('pending');
const error = ref('');

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  try {
    await endpoints.verifyEmail(token);
    state.value = 'ok';
    if (session.me) session.me = { ...session.me, emailVerified: true };
  } catch (e) {
    state.value = 'error';
    error.value = errorMessage(e, '验证失败');
  }
});
</script>

<template>
  <div class="card">
    <div class="card-body text-center">
      <p v-if="state === 'pending'">正在验证……</p>
      <p v-else-if="state === 'ok'" class="text-success">邮箱验证成功！</p>
      <p v-else class="text-danger">{{ error }}</p>
      <RouterLink to="/shards">进入小镇</RouterLink>
    </div>
  </div>
</template>
```

`apps/web/src/views/ForgotPasswordView.vue`：
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { endpoints } from '../api/endpoints';
import TurnstileBox from '../components/TurnstileBox.vue';
import { errorMessage } from '../i18n/zh-CN';

const email = ref('');
const captchaToken = ref('');
const sent = ref(false);
const error = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await endpoints.forgotPassword({ email: email.value, captchaToken: captchaToken.value });
    sent.value = true;
  } catch (e) {
    error.value = errorMessage(e, '发送失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">找回密码</h5>
      <p v-if="sent" class="text-success">如果这个邮箱注册过，重置邮件已经发出，请在 1 小时内完成重置。</p>
      <form v-else @submit.prevent="submit">
        <input v-model.trim="email" type="email" class="form-control mb-2" placeholder="注册时填写的邮箱" required />
        <TurnstileBox @token="captchaToken = $event" />
        <div v-if="error" class="alert alert-danger py-1 my-2">{{ error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy || !captchaToken">发送重置邮件</button>
      </form>
      <div class="mt-2 small"><RouterLink to="/login">返回登录</RouterLink></div>
    </div>
  </div>
</template>
```

`apps/web/src/views/ResetPasswordView.vue`：
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';

const route = useRoute();
const password = ref('');
const password2 = ref('');
const done = ref(false);
const error = ref('');
const busy = ref(false);
const localError = computed(() => {
  if (password.value && password.value.length < 6) return '密码至少 6 位';
  if (password2.value && password.value !== password2.value) return '两次输入的密码不一致';
  return '';
});

async function submit() {
  if (localError.value) return;
  busy.value = true;
  error.value = '';
  try {
    const token = typeof route.query.token === 'string' ? route.query.token : '';
    await endpoints.resetPassword({ token, password: password.value });
    done.value = true;
  } catch (e) {
    error.value = errorMessage(e, '重置失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">设置新密码</h5>
      <p v-if="done" class="text-success">密码已重置，所有设备都已退出登录。</p>
      <form v-else @submit.prevent="submit">
        <input v-model="password" type="password" class="form-control mb-2" placeholder="新密码" autocomplete="new-password" required />
        <input v-model="password2" type="password" class="form-control mb-2" placeholder="确认新密码" autocomplete="new-password" required />
        <div v-if="localError || error" class="alert alert-danger py-1">{{ localError || error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy">确定</button>
      </form>
      <div class="mt-2 small"><RouterLink to="/login">去登录</RouterLink></div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: 实现区服、开店、餐厅首页**

`apps/web/src/views/ShardSelectView.vue`：
```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ShardDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const shards = ref<ShardDto[]>([]);
const loaded = ref(false);
const error = ref('');
const notice = ref('');
const session = useSessionStore();
const router = useRouter();

onMounted(async () => {
  try {
    shards.value = await endpoints.listShards();
  } catch (e) {
    error.value = errorMessage(e, '获取区服失败');
  } finally {
    loaded.value = true;
  }
});

async function choose(s: ShardDto) {
  error.value = '';
  try {
    const r = await endpoints.selectShard(s.id);
    if (session.me) session.me = { ...session.me, shardId: r.shardId, restaurantId: r.restaurantId };
    await router.push({ name: r.restaurantId ? 'home' : 'create-restaurant' });
  } catch (e) {
    error.value = errorMessage(e, '进入区服失败');
  }
}

async function resend() {
  try {
    await endpoints.sendVerifyEmail();
    notice.value = '验证邮件已发送，请查收';
  } catch (e) {
    error.value = errorMessage(e, '发送失败');
  }
}

async function logout() {
  await session.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div>
    <div v-if="session.me && !session.me.emailVerified" class="alert alert-warning py-1 small">
      邮箱还没有验证，验证后才能和好友互动。
      <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="resend">重发验证邮件</button>
    </div>
    <div v-if="notice" class="alert alert-success py-1 small">{{ notice }}</div>
    <div v-if="error" class="alert alert-danger py-1 small">{{ error }}</div>
    <h6 class="my-2">选择区服</h6>
    <div class="list-group">
      <button
        v-for="s in shards"
        :key="s.id"
        type="button"
        class="list-group-item list-group-item-action d-flex justify-content-between"
        :disabled="s.status !== 'open'"
        @click="choose(s)"
      >
        <span>{{ s.name }}</span>
        <small class="text-muted">{{ s.status !== 'open' ? '已关闭' : s.hasRestaurant ? '已开店' : '新开' }}</small>
      </button>
    </div>
    <p v-if="loaded && shards.length === 0 && !error" class="text-muted small mt-2">暂时没有开放的区服</p>
    <button type="button" class="btn btn-outline-secondary btn-sm mt-3" @click="logout">退出登录</button>
  </div>
</template>
```

`apps/web/src/views/CreateRestaurantView.vue`：
```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { checkRestaurantName } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage, errorText } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';

const name = ref('');
const error = ref('');
const busy = ref(false);
const router = useRouter();
const session = useSessionStore();

const localError = computed(() => {
  if (!name.value) return '';
  const check = checkRestaurantName(name.value);
  return check === 'ok' ? '' : errorText('RESTAURANT_NAME_INVALID', { reason: check });
});

async function submit() {
  const check = checkRestaurantName(name.value);
  if (check !== 'ok') {
    error.value = errorText('RESTAURANT_NAME_INVALID', { reason: check });
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const r = await endpoints.createRestaurant(name.value.trim());
    if (session.me) session.me = { ...session.me, restaurantId: r.id };
    await router.replace({ name: 'home' });
  } catch (e) {
    error.value = errorMessage(e, '开店失败');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body">
      <h5 class="card-title">开一家餐厅</h5>
      <p class="small text-muted">名称最多 8 个汉字或 12 个字母数字，开张后在新手街营业。</p>
      <form @submit.prevent="submit">
        <input v-model="name" class="form-control mb-2" placeholder="餐厅名称" maxlength="32" />
        <div v-if="localError || error" class="alert alert-danger py-1" data-testid="name-error">{{ localError || error }}</div>
        <button class="btn btn-primary w-100" :disabled="busy">开张</button>
      </form>
    </div>
  </div>
</template>
```

`apps/web/src/views/RestaurantHomeView.vue`：
```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { EffectDto, RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { describeEffects } from '../utils/effects';
import { formatNum } from '../utils/format';

const rest = ref<RestaurantDto | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    rest.value = await endpoints.overview();
  } catch (e) {
    error.value = errorMessage(e, '获取餐厅信息失败');
  }
});

const expPercent = computed(() =>
  rest.value ? Math.min(100, Math.floor((rest.value.exp / rest.value.expToNext) * 100)) : 0,
);

function expiresText(e: EffectDto): string {
  if (!e.expiresAt) return '永久';
  const hours = Math.max(0, Math.ceil((new Date(e.expiresAt).getTime() - Date.now()) / 3_600_000));
  return `剩余 ${hours} 小时`;
}
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-else-if="!rest" class="text-muted">加载中……</div>
  <div v-else>
    <div class="d-flex justify-content-between align-items-center">
      <h5 class="mb-0" data-testid="rest-name">{{ rest.name }}</h5>
      <RouterLink to="/shards" class="small">切换区服</RouterLink>
    </div>
    <div class="small text-muted mb-2">{{ rest.streetName }} · {{ rest.starLevel }} 星</div>

    <div class="row g-1 small">
      <div class="col-6">等级 <b data-testid="rest-level">{{ rest.level }}</b></div>
      <div class="col-6">声望 <b>{{ rest.renown }}</b></div>
      <div class="col-6"><i class="bi bi-coin"></i> <b data-testid="rest-coin">{{ formatNum(rest.coin) }}</b></div>
      <div class="col-6"><i class="bi bi-gem"></i> <b>{{ formatNum(rest.diamond) }}</b></div>
      <div class="col-6"><i class="bi bi-lightning"></i> {{ rest.strength }}/{{ rest.strengthMax }}</div>
      <div class="col-6"><i class="bi bi-droplet"></i> {{ rest.oil }}/{{ rest.oilMax }}</div>
    </div>
    <div class="progress my-2" role="progressbar" :aria-valuenow="expPercent" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-bar bg-warning text-dark" :style="{ width: `${expPercent}%` }">
        {{ formatNum(rest.exp) }}/{{ formatNum(rest.expToNext) }}
      </div>
    </div>

    <h6 class="mt-3">属性 <small class="text-muted">（剩余点数 {{ rest.attrLeft }}）</small></h6>
    <div class="row g-1 small">
      <div class="col-4">厨艺 {{ rest.attrs.cook }}</div>
      <div class="col-4">刀工 {{ rest.attrs.cutting }}</div>
      <div class="col-4">火候 {{ rest.attrs.fire }}</div>
      <div class="col-4">调味 {{ rest.attrs.season }}</div>
      <div class="col-4">创意 {{ rest.attrs.creatives }}</div>
      <div class="col-4">幸运 {{ rest.luck }}</div>
    </div>

    <h6 class="mt-3">餐桌（{{ rest.tables.length }}/{{ rest.tableNum }}）</h6>
    <div class="d-flex flex-wrap gap-1">
      <div v-for="t in rest.tables" :key="t.no" class="border rounded px-2 py-1 small" :data-testid="`table-${t.no}`">
        <i class="bi bi-square"></i> {{ t.no }}
      </div>
    </div>

    <h6 class="mt-3">生效的加成</h6>
    <ul class="list-unstyled small">
      <li v-for="e in rest.effects" :key="`${e.sourceType}-${e.sourceId}`" class="mb-1">
        <GameImg :path="`goods/${e.name}`" :alt="e.name" fallback-icon="bi-award" />
        <b>{{ e.name }}</b> {{ describeEffects(e.effects) }}
        <span class="text-muted">（{{ expiresText(e) }}）</span>
      </li>
    </ul>
  </div>
</template>
```

- [ ] **Step 6: 运行测试、类型检查和构建**

Run: `pnpm vitest run --project web && pnpm --filter @dt/web typecheck && pnpm lint && pnpm --filter @dt/web build`
Expected: 测试通过，`apps/web/dist/` 生成成功。

- [ ] **Step 7: 本地走一遍**

Run（在 Task 12 Step 6 的环境基础上）：`pnpm --filter @dt/server dev` 和 `pnpm --filter @dt/web dev`，浏览器打开 http://localhost:5173，用手机尺寸（390×844）走一遍：注册 → 在 http://localhost:8025 的 Mailpit 里打开验证链接 → 选一服 → 开店 → 看到餐厅首页。
Expected: 各页面在 360px 宽度下不出现横向滚动条；宽屏时内容居中、最大 720px。

- [ ] **Step 8: 提交**

```bash
pnpm format
git add -A
git commit -m "feat(web): auth pages, shard select, create restaurant, restaurant home"
```

---

### Task 15: 部署、CI 与端到端验收

**Files:**
- Create: `.dockerignore`, `apps/server/Dockerfile`
- Create: `infra/compose.prod.yml`, `infra/.env.example`, `infra/backup.sh`
- Create: `.github/workflows/ci.yml`
- Create: `docs/deploy.md`
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/acceptance.spec.ts`
- Modify: `README.md`（整体替换）

**Interfaces:**
- Consumes: 全部任务的产出
- Produces：服务端镜像（入口 `dist/main.js`、`dist/worker.js`、`dist/cli/migrate.js`、`dist/cli/shard.js`）；生产 Compose；CI；验收测试 `pnpm --filter @dt/web e2e`

- [ ] **Step 1: 写端到端验收测试**

Run：
```bash
pnpm --filter @dt/web add -D @playwright/test@^1
pnpm --filter @dt/web exec playwright install chromium
```

`apps/web/playwright.config.ts`：
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5173', viewport: { width: 390, height: 844 } },
  webServer: [
    { command: 'pnpm --filter @dt/server dev', url: 'http://localhost:3000/readyz', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @dt/web dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
```

`apps/web/e2e/global-setup.ts`：
```ts
import { execSync } from 'node:child_process';

/** 需要先 `pnpm infra:dev`。迁移和建区服都是幂等的，可以反复运行 */
export default function globalSetup(): void {
  const run = (cmd: string) => execSync(cmd, { stdio: 'inherit' });
  run('pnpm --filter @dt/config build');
  run('pnpm --filter @dt/server migrate:dev');
  run('pnpm --filter @dt/server shard ensure --id 1 --name 一服');
  run('pnpm --filter @dt/server shard ensure --id 2 --name 二服');
}
```

`apps/web/e2e/acceptance.spec.ts`：
```ts
import { expect, test, type APIRequestContext } from '@playwright/test';

const MAILPIT = 'http://localhost:8025';

/** 轮询 Mailpit，取出发给 to 的最新邮件里的链接 */
async function mailLink(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await search.json()) as { messages: Array<{ ID: string }> };
    if (messages.length > 0) {
      const msg = (await (await request.get(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json()) as { Text: string };
      const m = /https?:\/\/\S+token=[A-Za-z0-9_-]+/.exec(msg.Text);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no mail for ${to}`);
}

test('注册 → 验证邮箱 → 选区服 → 开店；同一账号在二服再开一家，互不影响', async ({ page, request }) => {
  const id = Date.now().toString(36).slice(-7);
  const username = `e${id}`;
  const email = `${username}@e2e.local`;

  await page.goto('/register');
  await page.getByPlaceholder('用户名').fill(username);
  await page.getByPlaceholder('密码', { exact: true }).fill('secret123');
  await page.getByPlaceholder('确认密码').fill('secret123');
  await page.getByPlaceholder('邮箱').fill(email);
  await page.getByRole('button', { name: '注册' }).click();
  await expect(page).toHaveURL(/\/shards/);

  await page.goto(await mailLink(request, email));
  await expect(page.getByText('邮箱验证成功')).toBeVisible();

  await page.goto('/shards');
  await page.getByRole('button', { name: /一服/ }).click();
  await expect(page).toHaveURL(/\/create-restaurant/);
  await page.getByPlaceholder('餐厅名称').fill(`一店${id.slice(-4)}`);
  await page.getByRole('button', { name: '开张' }).click();
  await expect(page.getByTestId('rest-name')).toHaveText(`一店${id.slice(-4)}`);
  await expect(page.getByTestId('rest-level')).toHaveText('1');
  await expect(page.getByTestId('rest-coin')).toHaveText('100,000');

  await page.getByRole('link', { name: '切换区服' }).click();
  await page.getByRole('button', { name: /二服/ }).click();
  await page.getByPlaceholder('餐厅名称').fill(`二店${id.slice(-4)}`);
  await page.getByRole('button', { name: '开张' }).click();
  await expect(page.getByTestId('rest-name')).toHaveText(`二店${id.slice(-4)}`);
  await expect(page.getByTestId('rest-coin')).toHaveText('100,000');

  await page.getByRole('link', { name: '切换区服' }).click();
  await page.getByRole('button', { name: /一服/ }).click();
  await expect(page.getByTestId('rest-name')).toHaveText(`一店${id.slice(-4)}`);

  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalScroll).toBe(false);
});
```

- [ ] **Step 2: 运行验收测试**

Run: `pnpm infra:dev && pnpm --filter @dt/web e2e`
Expected: 1 passed。

- [ ] **Step 3: 写镜像和生产 Compose**

`.dockerignore`：
```
**/node_modules
**/dist
**/generated
**/.test
.git
apps/web
docs
infra
```

`apps/server/Dockerfile`：
```dockerfile
FROM node:22-alpine AS build
RUN npm i -g pnpm@10
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm install --frozen-lockfile --filter "@dt/server..."
RUN pnpm --filter @dt/config build && pnpm --filter @dt/server build
RUN pnpm deploy --filter @dt/server --prod --legacy /out

FROM node:22-alpine
ENV NODE_ENV=production CONFIG_BUNDLE_PATH=/app/config/bundle.json
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/packages/config/generated/bundle.json ./config/bundle.json
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

`infra/compose.prod.yml`：
```yaml
name: dt
x-server: &server
  image: dt-server:latest
  env_file: .env
  restart: unless-stopped

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dt
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: dt
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dt -d dt']
      interval: 5s
      timeout: 3s
      retries: 30
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ['redis-server', '--appendonly', 'yes']
    volumes: [redisdata:/data]
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 30
    restart: unless-stopped

  migrate:
    <<: *server
    build: { context: .., dockerfile: apps/server/Dockerfile }
    command: ['node', 'dist/cli/migrate.js']
    restart: 'no'
    depends_on:
      postgres: { condition: service_healthy }

  api:
    <<: *server
    deploy: { replicas: 2 }
    depends_on:
      migrate: { condition: service_completed_successfully }
      redis: { condition: service_healthy }
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3000/readyz']
      interval: 10s
      timeout: 3s
      retries: 3

  worker:
    <<: *server
    command: ['node', 'dist/worker.js']
    deploy: { replicas: 2 }
    depends_on:
      migrate: { condition: service_completed_successfully }
      redis: { condition: service_healthy }

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: ['tunnel', '--no-autoupdate', 'run']
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN}
    depends_on: [api]
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

`infra/.env.example`：
```
# 复制为 infra/.env 后填写；这个文件不要提交
POSTGRES_PASSWORD=change-me
DATABASE_URL=postgres://dt:change-me@postgres:5432/dt
REDIS_URL=redis://redis:6379/0
WEB_ORIGIN=https://game.example.com
COOKIE_SECURE=true
TRUST_CF_HEADER=true
TURNSTILE_SECRET=
SMTP_URL=smtps://user:password@smtp-relay.brevo.com:465
MAIL_FROM=美味小镇 <noreply@example.com>
LOG_LEVEL=info
TUNNEL_TOKEN=
# 以下给 backup.sh 用
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=dt-backup
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

`infra/backup.sh`：
```sh
#!/bin/sh
# 每晚由宿主机 cron 调用：0 4 * * * /opt/dt/infra/backup.sh
# 保留期（14 天）用 R2 存储桶的生命周期规则控制，见 docs/deploy.md
set -eu
cd "$(dirname "$0")"
set -a
. ./.env
set +a
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/dt-$STAMP.dump"
docker compose -f compose.prod.yml exec -T postgres pg_dump -U dt -d dt -Fc > "$FILE"
docker run --rm -v /tmp:/tmp -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli s3 cp "$FILE" "s3://$R2_BUCKET/db/dt-$STAMP.dump" --endpoint-url "$R2_ENDPOINT"
rm -f "$FILE"
echo "backup uploaded: dt-$STAMP.dump"
```

Run: `docker build -f apps/server/Dockerfile -t dt-server:local .`
Expected: 构建成功。

- [ ] **Step 4: 写 CI**

`.github/workflows/ci.yml`：
```yaml
name: ci
on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: dt
          POSTGRES_PASSWORD: dt
          POSTGRES_DB: dt_test
        ports: ['55432:5432']
        options: >-
          --health-cmd "pg_isready -U dt -d dt_test"
          --health-interval 2s --health-timeout 3s --health-retries 30
      redis:
        image: redis:7-alpine
        ports: ['56379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 2s --health-timeout 3s --health-retries 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @dt/config build
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm test

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -f apps/server/Dockerfile -t dt-server:ci .
```

- [ ] **Step 5: 写部署文档和 README**

`docs/deploy.md`：
```markdown
# 部署说明

## 一、准备
1. 一台海外 VPS（香港 / 日本 / 新加坡，2 核 4G 起），安装 Docker 和 Docker Compose 插件
2. 一个域名，托管到 Cloudflare（免费账户即可）
3. Cloudflare Turnstile：创建一个站点，记下 site key 和 secret key
4. 发信服务：Brevo 或 Resend，拿到 SMTP 地址和账号
5. Cloudflare R2：创建存储桶 `dt-backup`，生成 API 令牌；在存储桶的生命周期规则里设置"14 天后删除"

## 二、服务端（VPS）
1. 把仓库放到 `/opt/dt`
2. `cp infra/.env.example infra/.env`，按注释填写（`COOKIE_SECURE=true`、`TRUST_CF_HEADER=true` 必须开启）
3. Cloudflare 控制台 → Zero Trust → Networks → Tunnels：创建隧道，把 token 填进 `TUNNEL_TOKEN`；
   在隧道的 Public Hostname 里添加 `api.<域名>` → `http://api:3000`
4. 构建并启动：
   ```bash
   cd /opt/dt/infra
   docker compose -f compose.prod.yml build migrate
   docker compose -f compose.prod.yml up -d
   ```
5. 建区服：`docker compose -f compose.prod.yml run --rm api node dist/cli/shard.js ensure --id 1 --name 一服`
6. 检查：`curl https://api.<域名>/readyz` 返回 `{"ok":true,...}`
7. 备份：`chmod +x backup.sh`，`crontab -e` 加入 `0 4 * * * /opt/dt/infra/backup.sh`

VPS 防火墙只需开放 SSH，80/443 都不用开（流量全部经 Tunnel 进来）。

## 三、前端（Cloudflare Pages）
1. Pages → 连接 Git 仓库
2. 构建命令：`npm i -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @dt/web build`
3. 输出目录：`apps/web/dist`
4. 环境变量：`VITE_API_BASE=https://api.<域名>`、`VITE_TURNSTILE_SITEKEY=<site key>`、`NODE_VERSION=22`
5. 自定义域名：`game.<域名>`；`infra/.env` 里的 `WEB_ORIGIN` 要与之一致

## 四、升级
```bash
cd /opt/dt && git pull
cd infra && docker compose -f compose.prod.yml build migrate && docker compose -f compose.prod.yml up -d
```
迁移由 `migrate` 服务在 api 和 worker 启动前自动执行。

## 五、资源包
图片放在 `apps/web/public/pack/`（按 `goods/<道具名>.png` 这样的路径），不提交进仓库。
原版美术素材有版权风险，正式运营前应替换为自制或授权的素材；图片缺失时页面会显示图标兜底。
```

`README.md`（整体替换）：
```markdown
# 美味小镇（重写版）

TypeScript 全栈：`packages/shared`（公共公式与接口）、`packages/config`（游戏配置）、`apps/server`（Fastify）、`apps/web`（Vue 3）。

## 开发
需要 Node 22+、pnpm 10、Docker Desktop。

```bash
pnpm install
pnpm infra:dev                                   # 本地 PostgreSQL、Redis、Mailpit
pnpm --filter @dt/config build                   # 生成配置包
pnpm --filter @dt/server migrate:dev
pnpm --filter @dt/server shard ensure --id 1 --name 一服
pnpm --filter @dt/server dev                     # http://localhost:3000
pnpm --filter @dt/web dev                        # http://localhost:5173
```
开发环境的邮件在 http://localhost:8025 查看。

## 测试
```bash
pnpm infra:test && pnpm test                     # 单元 + 集成测试
pnpm infra:dev && pnpm --filter @dt/web e2e      # 端到端验收
```

## 文档
- 设计：`docs/superpowers/specs/`
- 部署：`docs/deploy.md`
- 游戏规则：`../analysis/spec/`
```

- [ ] **Step 6: 全量检查**

Run: `pnpm typecheck && pnpm lint && pnpm format && pnpm format:check && pnpm test`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: docker image, production compose, ci, backups, e2e acceptance, deploy docs"
```

---

## 验收对照（设计文档 11.3）

| # | 验收标准 | 覆盖 |
|---|---|---|
| 1 | `pnpm test` 全部通过：公式、配置校验、注册登录、并发锁 | Task 1、3、6、8 |
| 2 | `docker compose` 起全套服务，浏览器注册 → Mailpit 验证 → 选区服 → 开店 → 初始值正确 | Task 14 Step 7、Task 15 端到端测试 |
| 3 | 同一账号在第二个区服开第二家店，数据互不影响 | Task 11 测试、Task 15 端到端测试 |
| 4 | 新登录使旧会话失效；未登录访问返回 `UNAUTHORIZED` | Task 5、7、8 测试 |
| 5 | 相同 Idempotency-Key 重复开店只生效一次 | Task 7、11 测试 |
| 6 | 配置数据有错误引用时构建失败并指出是哪一条 | Task 3 测试 |

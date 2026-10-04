# 更多宣传海报和奖杯 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 宣传海报、小镇食神奖杯各加 4 档（4、6、8、10 星解锁），商店按星级限购，摆放设施时也检查星级（问题记录 146）。

**Architecture：**
- 新数据文件 `devices_extra.json` 构建成设施道具，带可选字段 `Goods.needStar`。
- 商店的 `buyCap` / `assertBuyable` 和设施的 `placeDevice` 都检查 `needStar`。
- 前端商店多一种“x 星可用”的原因。

**Tech Stack：** TypeScript、zod、Kysely、Vue 3、Vitest。

**Spec：** `docs/superpowers/specs/2026-10-05-posters-trophies-design.md`

## Global Constraints

- **提交和 PR**：
  - 中文提交和 PR；
  - 提交末尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`；
  - PR 末尾 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。
- **新道具**（id、名字、设施位、效果、价格、需要星级），都是 24 小时：

  | id | 名字 | 设施位 | 效果 | 价格 | 星级 |
  |---|---|---|---|---|---|
  | 93201 | 13 哥宣传海报 | 1 | coinValue 8 | 30000 | 4 |
  | 93202 | 镇长宣传海报 | 1 | coinValue 15 | 50000 | 6 |
  | 93203 | 蟹老板宣传海报 | 1 | coinValue 30 | 80000 | 8 |
  | 93204 | 食神宣传海报 | 1 | coinValue 50 | 150000 | 10 |
  | 93205 | 小镇食神奖杯（铂金） | 2 | expValue 4 | 30000 | 4 |
  | 93206 | 小镇食神奖杯（钻石） | 2 | expValue 5 | 50000 | 6 |
  | 93207 | 小镇食神奖杯（星耀） | 2 | expValue 6 | 80000 | 8 |
  | 93208 | 小镇食神奖杯（传说） | 2 | expValue 7 | 150000 | 10 |

- **说明格式**：
  - 海报：“13 哥宣传海报，24 小时内每桌银币+8（4 星可用）”；
  - 奖杯：“美味小镇制作的铂金奖杯，24 小时内每桌经验+4（4 星可用）”。
- **门槛规则**：
  - `needStar` 缺省就是 0，现有道具都不写；
  - 新道具不写 awardFlag，所以不进随机奖励池。
- **星级不够时**：
  - 商店：`blocked = 'star'`、`maxBuy = 0`，DTO 带 `needStar`；
  - 购买接口：报 `requirement('star', { need })`；
  - 摆放：同样报 `requirement('star', { need })`，道具不消耗。
- **其他**：
  - 改了 `packages/config` 先 `pnpm -F @dt/config build`；
  - 新道具英、法、西名字写进 `i18n/{en,fr,es}/goods.json`；
  - 前端文案五种语言（繁中 `pnpm i18n:tw`）；
  - 更新记录加一条；
  - 不碰菜园，不碰 `问题记录.md`。

## Review Focus

1. 星级刚好等于 `needStar` 时能买、能摆（边界用 `>=`）。
2. 从别处拿到高档海报（后台发放）、星级不够时摆放：报错且道具还在仓库。
3. 摆上高档海报后，加成汇总里每桌银币确实 +N，替换旧海报时旧效果消失（沿用现有替换逻辑）。
4. 商店列表的 `needStar` 只给有门槛的道具；钻石商店、每日特价也走同一个检查。
5. 构建检查：`needStar` 越界（> 12 或 < 0）、设施位不是 1/2、id 重复时报错。

---

### Task 1: 配置——新道具和需要星级

**Files:**
- Create: `packages/config/data/game/devices_extra.json`、`packages/config/src/devicesExtra.test.ts`
- Modify: `packages/config/src/{raw,source,types,build}.ts`、`packages/config/data/i18n/{en,fr,es}/goods.json`、`packages/config/src/build.test.ts`（道具总数 715 → 723）、`apps/server/src/modules/world/world.test.ts`（同样 +8）

**Interfaces:**
- Produces：`Goods.needStar?: number`（新道具才有）；道具 93201~93208。

- [ ] **Step 1: 写失败测试** `devicesExtra.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { buildBundle } from './build';
import { DEVICE_TYPE, GOODS_TYPE } from './ids';
import { defaultDataDir, readSourceDir } from './source';

const source = () => readSourceDir(defaultDataDir());

describe('更多宣传海报和奖杯（问题记录 146）', () => {
  it('8 个新道具：设施、设施位、效果、24 小时、价格、需要星级；不进随机奖励池', () => {
    const { bundle, errors } = buildBundle(source());
    expect(errors).toEqual([]);
    const rows = [93201, 93202, 93203, 93204, 93205, 93206, 93207, 93208].map((id) => {
      const g = bundle!.goods.find((x) => x.id === id)!;
      return [g.type, g.deviceType, g.effects, (g.value as { time: number }).time, g.coin, g.onSale, g.needStar, g.awardFlag];
    });
    expect(rows).toEqual([
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 8 }, 24, 30000, true, 4, null],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 15 }, 24, 50000, true, 6, null],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 30 }, 24, 80000, true, 8, null],
      [GOODS_TYPE.device, 1, { time: 24, coinValue: 50 }, 24, 150000, true, 10, null],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 4 }, 24, 30000, true, 4, null],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 5 }, 24, 50000, true, 6, null],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 6 }, 24, 80000, true, 8, null],
      [GOODS_TYPE.device, 2, { time: 24, expValue: 7 }, 24, 150000, true, 10, null],
    ]);
    expect(bundle!.goods.filter((g) => g.id < 93201 || g.id > 93208).every((g) => g.needStar === undefined)).toBe(true);
  });

  it('检查：星级越界、设施位不对、id 重复', () => {
    const src = source();
    const d = JSON.parse(JSON.stringify(src['game/devices_extra']));
    d.items[0].needStar = 13;
    d.items[1].deviceType = 6;
    d.items[2].id = 13;
    const errs = buildBundle({ ...src, 'game/devices_extra': d }).errors.join('\n');
    expect(errs).toContain('needStar 13');
    expect(errs).toContain('deviceType 6');
    expect(errs).toContain('duplicate id 13');
  });
});
```

（`effects` 若不含 `time`，按实际构建结果改断言：`effects` 来自 `value` 的数值项，所以会带 `time`。`DEVICE_TYPE` 不需要的话去掉导入。）

- [ ] **Step 2: 跑测试确认失败**（Run: `npx vitest run --project config packages/config/src/devicesExtra.test.ts`）

- [ ] **Step 3: 实现**
  - **`devices_extra.json`**：`{ "items": [ { "id": 93201, "name": "13 哥宣传海报", "desc": "…", "deviceType": 1, "time": 24, "effect": "coinValue", "value": 8, "coin": 30000, "needStar": 4 }, … ] }`，8 条照 Global Constraints 的表。
  - **`raw.ts`**：

    ```ts
    /** data/game/devices_extra.json：后期的宣传海报、奖杯（问题记录 146） */
    export const devicesExtraFile = z
      .object({
        items: z.array(
          z
            .object({
              id: int.min(1),
              name: z.string().min(1),
              desc: z.string().min(1),
              deviceType: int,
              time: int.min(1),
              effect: z.enum(['coinValue', 'expValue']),
              value: z.number().positive(),
              coin: int.min(1),
              needStar: int,
            })
            .strict(),
        ),
      })
      .strict();
    ```

  - **`source.ts`**：在 `'game/food_supply',` 后登记 `'game/devices_extra',`。
  - **`types.ts`** 的 `Goods` 加 `/** 摆放、购买要求的最低星级（问题记录 146）；不写是 0 */ needStar?: number;`。
  - **`build.ts`**：
    - 解析 `devicesExtra`，加进“缺文件就停”；
    - 生成：

      ```ts
      const extraDevices: Goods[] = devicesExtra.items.map((x) => ({
        ...souvenirLike(x.id, x.name, x.desc),
        type: GOODS_TYPE.device,
        deviceType: x.deviceType,
        maxNum: 99,
        coin: x.coin,
        onSale: true,
        value: { time: x.time, [x.effect]: x.value },
        effects: { time: x.time, [x.effect]: x.value },
        needStar: x.needStar,
      }));
      ```

    - 并入 `goods`；检查：

      ```ts
      for (const x of devicesExtra.items) {
        if (x.deviceType !== 1 && x.deviceType !== 2) errors.push(`devices_extra ${x.id} deviceType ${x.deviceType}`);
        if (x.needStar < 0 || x.needStar > maxStar) errors.push(`devices_extra ${x.id} needStar ${x.needStar}`);
      }
      ```

      `maxStar` 取 `starNeed` 的最大星级；id 重复由现有的 `unique('goods', …)` 报 `duplicate id`。
    - 现有道具的效果怎么从 `value` 生成，照实际代码；如果 `effects` 不该含 `time`，就和 `numericEntries` 保持一致。
  - **英、法、西 `goods.json`**：加 8 条名字和说明。
    - en：“Brother 13 Poster”、“Mayor Poster”、“Mr. Krab Poster”、“Food God Poster”、“Town Chef Trophy (Platinum/Diamond/Star/Legend)”；
    - fr、es 照这个意思，名字和游戏里已有的 NPC 译名保持一致（`town.ts` 的 npcs）。
  - **道具总数**：`build.test.ts`、`world.test.ts` 的总数 +8，注释补“+ 后期海报奖杯 8 个（146）”。

- [ ] **Step 4: 构建并跑测试**（Run: `pnpm -F @dt/config build && npx vitest run --project config`）Expected: PASS
- [ ] **Step 5: 提交**：`feat(config): 宣传海报、小镇食神奖杯各加 4 档，按星级可用（问题记录 146）`

---

### Task 2: 服务端——商店限购、摆放检查

**Files:**
- Modify: `packages/shared/src/schemas/shop.ts`（`BuyBlock` 加 `'star'`，`ShopItemDto.needStar?`）、`apps/server/src/modules/shop/{rules,service}.ts`、`apps/server/src/modules/growth/devices.ts`
- Test: `apps/server/src/modules/shop/rules.test.ts`（或现有 shop 测试）、`apps/server/src/modules/shop/shop.test.ts`、`apps/server/src/modules/growth/devices.test.ts`（没有就新建，照 growth 现有测试头部）

**Interfaces:**
- Consumes：`Goods.needStar`（Task 1）
- Produces：
  - `BuyState.star: number`；
  - `buyCap` 在 `(g.needStar ?? 0) > s.star` 时返回 `{ max: 0, blocked: 'star' }`，这一检查最先做；
  - `ShopItemDto.needStar?: number`（只在有门槛时给）。

- [ ] **Step 1: 写失败测试**
  - **`buyCap`**（纯函数）：
    - 星级 3 买 `needStar` 4 → `{ max: 0, blocked: 'star' }`；
    - 星级 4 → 正常（Review Focus 1）。
  - **商店集成**（`shop.test.ts`）：
    - 3 星店的列表里 93201 是 `maxBuy 0`、`blocked 'star'`、`needStar 4`；
    - 买 93201 报 `REQUIREMENT_NOT_MET`，`reason: 'star'`，银币不变；
    - 4 星店能买，扣 30000。
  - **摆放**：
    - 3 星店仓库里有 93201，摆到设施位 1 → 报 `reason: 'star'`，仓库里仍有 1 个（Review Focus 2）；
    - 4 星店摆上后 `listActiveEffects` 里设施位 1 的效果是 `coinValue: 8`（Review Focus 3）。
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**
  - **`rules.ts`**：`BuyState` 加 `star: number`；`buyCap` 开头：

    ```ts
    if ((g.needStar ?? 0) > s.star) return { max: 0, blocked: 'star' };
    ```

  - **`service.ts`**：
    - `items` 读 `star_level`，传进 `buyCap`；
    - 行里 `...(g.needStar ? { needStar: g.needStar } : {})`；
    - `assertBuyable` 开头：

      ```ts
      if ((g.needStar ?? 0) > o.rest.star_level) throw requirement('star', { need: g.needStar });
      ```

      `requirement` 从 `core/errors` 导入；三种购买都经过它。
  - **`devices.ts`** `placeDevice`：在设施位、种类检查之后、消耗之前：

    ```ts
    if ((g.needStar ?? 0) > op.rest.star_level) throw requirement('star', { need: g.needStar });
    ```

- [ ] **Step 4: 跑测试**（Run: `cd apps/server && npx tsc --noEmit -p . && npx vitest run src/modules/shop src/modules/growth`）
- [ ] **Step 5: 提交**：`feat(server): 高档海报奖杯按星级限购、限摆（问题记录 146）`

---

### Task 3: 前端、更新记录、收尾

**Files:**
- Modify: `apps/web/src/views/ShopView.vue`、`ShopView.test.ts`、`apps/web/src/i18n/locales/{zh-CN,en,fr,es}/store.ts`、`apps/web/src/data/changelog.ts`、各语言 `site.ts`、`docs/roadmap.md`

- [ ] **Step 1: 写失败测试**（`ShopView.test.ts`）：
  - 列表里一件 `blocked: 'star'`、`needStar: 4`、`maxBuy: 0` 的道具；
  - 断言它的 `cap-<id>` 写“4 星可用”，购买按钮禁用。
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现**
  - **`store.shop.why`** 加 `star: (n: number) => \`${n} 星可用\``：
    - en “Unlocks at ${n}★”；
    - fr “Disponible à ${n}★”；
    - es “Disponible con ${n}★”。
  - **`ShopView.vue`** 的 `capText`：

    ```ts
    if (it.blocked === 'star') return s.why.star(it.needStar ?? 0)
    ```

    `why` 的 Record 类型把 `'star'` 排除掉，单独处理。
  - **更新记录**：
    - `changelog.ts` 最前面加 `{ id: 'posters', date: <合并当天北京时间> }`；
    - `site.changelog.posters`：“商店新增 4 档宣传海报和奖杯，4、6、8、10 星可用，后期的银币和经验加成跟得上了”（英、法、西照意思写）。
  - **`cd apps/web && pnpm i18n:tw`**。
  - **`roadmap.md`**：
    - 50 一行写“已完成（#132）”；
    - 146 写“本 PR”；
    - 顶部“接下来”改成 146（本 PR）→ 158 → 72。
- [ ] **Step 4: 全量检查**

```bash
pnpm -F @dt/config build
pnpm lint && pnpm -r typecheck && npx prettier --check apps packages docs
npx vitest run --project web --project config --project shared
pnpm -F @dt/server test
```

- [ ] **Step 5: 提交、推送、终审（opus）、PR**
  - 重要问题先写失败测试再修；
  - 小问题记 `docs/backlog.md`；
  - PR 标题：“更多宣传海报和奖杯（问题记录 146）”。

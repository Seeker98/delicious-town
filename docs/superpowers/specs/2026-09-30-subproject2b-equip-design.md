# 子项目 2B「厨具」设计

- 日期：2026-09-30
- 状态：待审阅
- 上位文档：`2026-09-29-rewrite-architecture-design.md`（架构文档）、`2026-09-29-subproject2a-business-loop-design.md`（2A 设计）
- 游戏规则依据：`../analysis/spec/` 的 00 §0.5~0.6、02 §2.3、07 §7.6~7.7、20 §20.15/§20.18（下文简称"规格书 xx"），以及 `backend_src` 原版源码（`StoreTranServiceImpl`、`RestServiceImpl`、`RestTranServiceImpl`、`Tools.createEquipForStore` / `stressUpEquip`、实体 `DtRestEquip`）
- 分支：`feat/equip`，基于 `main`

## 1. 目标与范围

**完成标志**：玩家能获得、穿戴、强化、回退、分解、打孔、镶嵌厨具，宝石能升阶，能存 5 套预设、批量处理厨具；穿戴厨具的幸运和套装加成进入结算；主线第 30、31 步和厨具支线不再跳过。子项目 2 至此完整。

### 1.1 包含

| 模块 | 内容 |
|---|---|
| 厨具实例 | 获得时按道具 value 生成属性（固定或按 total 随机分配）；旧数据迁移 |
| 穿戴 | 5 个部位各一件，等级门槛 min_level，卸下，全部卸下 |
| 强化 | +0→+10，精华 + 银币，强化石必成，连续失败保底，+8 起发新闻，强化记录 |
| 强化回退 | 归元石（回退 1 级）、神秘水晶（回退 10 级 = 回到 +0） |
| 分解 / 出售 | 分解得精华；出售走现有商店出售 |
| 打孔 / 镶嵌 / 摘除 | 打孔石、宝石镶嵌（耗体力）、摘除（2 星起收银币） |
| 宝石升阶 | 两颗同阶合成下一阶，1~99 组，失败给经验，幸运补救 |
| 套装 | 7 套（HAR 6 套 + 真爱套装），按穿戴件数激活档位 |
| 预设 | 最多 5 套，保存 / 套用 / 删除 |
| 一键处理（新版功能提前做） | 批量分解或出售"干净"的厨具 |
| 展示 | 厨具页、厨具详情、宝石页；餐厅属性和厨力；好友餐厅页显示对方穿戴 |

### 1.2 不包含

| 内容 | 归属 |
|---|---|
| 厨力和五项属性的实际用途（厨塔、切磋、特色菜份数 cookNumRate） | 4 |
| 套装的进攻 / 防守 / 探险键（attackX、defendX、exploreSuccessRate）的实际用途 | 4（本次只存储和展示） |
| 守塔人厨具 `getListWatchmanEquips` | 4 |
| 赞助者专属帽子的获得途径（玉•、铉•） | 6 |

## 2. 规则裁定

| # | 问题 | 裁定 |
|---|---|---|
| 1 | min_level：原版代码穿戴时不检查 | 穿戴（含套用预设）时检查：餐厅等级 < min_level 不能穿。已经穿着的不受影响（等级不会下降） |
| 2 | 套装里按百分比放大属性的键 `cook/cutting/fire/season` 和厨具的固定属性同名 | 配置加载时改名为 `cookPct/cuttingPct/firePct/seasonPct`，只参与属性展示，不进加成汇总；`attack*`、`defend*`、`exploreSuccessRate` 同样不进汇总，原样存着留给子项目 4。`atRate/spRate/coinRate/luckValue/operFoodsAddRate` 进汇总，当前生效 |
| 3 | 强化回退：原版只处理"回退 1 级"和"回退到 0" | 统一为"撤销最近 N 次成功强化，逐条扣回当时加的属性"，N = 道具 value.backStress，超过当前等级按当前等级算。结果与原版两种情况一致 |
| 4 | 保底计数：原版每次数"上次成功后的失败记录" | 存为 `equip.fail_streak`：失败 +1，成功清零，回退不变 |
| 5 | 原版分解 / 出售不检查"正在穿戴" | 锁定、有宝石、在预设中、**正在穿戴** 的厨具都不能分解或出售 |
| 6 | 原版摘除宝石不检查银币够不够 | 银币不足时拒绝 |
| 7 | 仓库容量（2A 裁定 6：容量 = 持有的不同非勋章道具种数） | 未穿戴的厨具每件占 1 格，穿戴中的不占；奖励照发不丢的规则不变 |
| 8 | 同一件厨具多次强化成功记录要能逐条回退 | 强化记录表 `equip_stress_log` 记录每次尝试；回退时删除被撤销的成功记录（失败记录保留作历史） |
| 9 | 宝石能镶到哪 | 任何宝石能镶到任何有空孔的厨具（原版如此） |
| 10 | 厨具被关（区服 `equip` 功能关闭） | 所有厨具接口返回功能关闭；已穿戴的幸运和套装加成照常生效；厨具任务跳过 |
| 11 | 预设引用的厨具 | 在预设中的厨具不能分解 / 出售，所以预设里的 id 始终有效；套用时逐件重新检查等级门槛，不满足的部位留空并在结果里列出 |
| 12 | 主线跳过规则（2A 裁定 7）已经越过第 30、31 步的玩家 | 不回溯，与 2A 一致 |

## 3. 规则明细

### 3.1 生成（规格书 07 §7.7）

道具 value：`{part, essence, hole, max_hole, min_level, suitid, total?, cook, cutting, fire, season, creatives, luck}`。

- 部位属性顺序（主属性在第一位）：
  - 1 铲：cook cutting fire season luck creatives
  - 2 刀：cutting fire season cook luck creatives
  - 3 锅：fire season cook cutting luck creatives
  - 4 瓶：season cook cutting fire luck creatives
  - 5 帽：creatives cook cutting fire season luck
- 有 `total`：按顺序处理前 5 项。剩余 total 为 0 或该项不是 "min,max" 范围时取 0；否则取 rand[min, max]，不超过剩余 total，并从 total 扣除。第 6 项直接取剩余 total。
- 没有 `total`：各项取 value 里的固定值。
- `cur_hole` = value.hole，`max_hole` = value.max_hole。
- 随机数走注入的 rng。

### 3.2 属性和厨力（规格书 20 §20.18）

- 单件属性 = 基础 + 强化增量 + 镶嵌宝石之和。
- 餐厅属性（五项 + 幸运）= 加点 + 穿戴厨具属性之和；厨艺 / 刀工 / 火候 / 调味再 ×(1 + 套装对应 Pct)，结果取整（四舍五入）。
- 厨力 = 五项之和 + 幸运 / 2（向下取整）。这里的幸运是餐厅基础幸运 + 厨具幸运，不含勋章和天气。

### 3.3 加成接入

穿戴变化（穿、卸、套用预设、全部卸下、强化或回退穿戴中的厨具、给穿戴中的厨具镶嵌或摘除宝石）后调用 `syncEquipEffects(op)`：

- 写 `effect_source(source_type='equip', source_id=0)`：`{luckValue: 穿戴厨具幸运之和}`；为 0 时删除该行。
- 删掉该店所有 `source_type='suit'` 的行，再为每个激活的套装档位写一行 `effect_source('suit', suitid*10 + 档位序号)`，effects 只含进汇总的键（裁定 2）。
- `invalidateAgg(op)`。

结算不需要改：它已经从加成汇总里读 `luckValue`、`atRate`、`spRate`、`coinRate`。

### 3.4 套装（规格书 07 §7.7、20 §20.15）

- 数据：`designed/equip_suits.json`（7 套），配置里建 `suits: Map<suitid, {name, maxnum, tiers[{neednum, desc, value}]}>`。
- 件数 = 穿戴中 `suit_id` 相同的件数；suit_id 为 0、90、99 或不在配置里的不算套装。
- 所有 neednum ≤ 件数的档位都激活，效果叠加。

### 3.5 强化 `POST /equip/stress {id, stone}`

- 前置：厨具属于我、stress < 10；精华（52）≥ value.essence；银币 ≥ value.essence × 10000；stone 时强化石（40）≥ 1。
- 扣精华、银币、（强化石）。
- 不用强化石：成功率 = (0.8 − 0.08 × stress) + 幸运率 / (stress+1) / 4 + 天气 `equipRate` + fail_streak × 0.01。掷 r；`r < 成功率` 成功。
  - 幸运标记：成功且 `r ≥ 基础率 + 天气`。保底标记：成功且 `r ≥ 基础率 + 幸运 + 天气`（即只有加上 fail_streak 才成功）。
- 用强化石：必成，没有幸运 / 保底标记。
- 成功时选属性：按部位顺序，每项 50% 概率选中，都没选中取最后一项；增量 = rand[1, 基础主属性]（主属性 = 部位顺序第一项的基础值，最少 1）；用强化石且增量 < 主属性时再 +1。
- 成功：stress+1、对应强化增量列加上增量、fail_streak = 0；失败：fail_streak+1。
- 写 `equip_stress_log`；成功到 +8/+9/+10 发新闻 `equip.stress`；计数器 `equip.stress` +1（成功失败都算，原版任务文案"强化一次"）。
- 厨具正在穿戴时同步加成（§3.3）。

### 3.6 强化回退 `POST /equip/rollback {id, goodsId}`

- goodsId 必须是 value 带 `backStress` 的道具（归元石 225：1；神秘水晶 224：10），持有 ≥ 1；厨具 stress > 0。
- N = min(backStress, stress)。取最近 N 条成功记录（stress 降序），逐条从对应强化增量列扣掉 val，删除这些记录；stress −= N；消耗道具 1 个。

### 3.7 分解 `POST /equip/salvage {id}`、出售

- 检查（裁定 5）：未锁定、无宝石、不在预设、未穿戴。
- 分解：删除厨具，得精华 value.essence × (stress + 1)。
- 出售：现有 `/shop/sell` 的 body 加可选 `equipId`；价格 = 道具 coin × 0.7（`sellPrice`），与强化等级无关。

### 3.8 打孔、镶嵌、摘除

- 打孔 `POST /equip/drill {id}`：max_hole > 0 且 cur_hole < max_hole；消耗打孔石（46）1 个；cur_hole+1；计数器 `equip.drill`。
- 镶嵌 `POST /equip/inlay {id, gemId}`：已镶宝石数 < cur_hole；宝石 ≥ 1；体力 ≥ 宝石阶数；扣宝石 1、体力；写 `equip_gem`（属性取宝石 value）；计数器 `equip.gemIn`。
- 摘除 `POST /equip/ungem {gemRowId}`：星级 ≥ 2 且天气没有 `removeGemFree` 时花费 阶数 × 10000 银币（不足拒绝，裁定 6）；删除 `equip_gem`，宝石退回仓库。

### 3.9 宝石升阶 `POST /gem/levelup {goodsId, num}`

- goodsId 是宝石（type 5）且 nextid ≠ −1；1 ≤ num ≤ 99；持有 ≥ 2 × num；体力 ≥ num × 阶数。
- 扣 2 × num 颗、扣体力。每组独立：r < 0.95 − 0.18 × 阶数 + 天气 `gemLevelUpRate` 成功；否则再以幸运率补救（成功，计入 lucky）；否则失败。
- 成功数个下一阶宝石进仓库；下一阶 > 3 发新闻 `gem.levelUp`。失败 fail 组得经验 fail × 阶数 × 1000；下一阶 ≥ 5 且有失败时发新闻 `gem.broken`。

### 3.10 穿戴、预设

- 穿 `POST /equip/wear {id}`：等级 ≥ min_level（裁定 1）；同部位已有的自动卸下；计数器 `equip.wear`。
- 卸 `POST /equip/unwear {id}`；全部卸下 `POST /equip/unwearAll`。
- 预设 `POST /equip/preset/save {name}`：名称 1~12 字、同店不重复、最多 5 套；保存当前穿戴（空部位存 null）。`apply {id}`：先全部卸下，再逐件穿（裁定 11）。`delete {id}`。
- 以上涉及穿戴的都同步加成（§3.3）。

### 3.11 锁定、一键处理

- 锁定 `POST /equip/lock {id, locked}`。
- 一键处理 `POST /equip/batch {ids, way}`：ids 1~200 个；每件都必须满足"未锁定、未穿戴、stress = 0、无宝石、不在预设"，有任何一件不满足整批拒绝并返回不满足的 id；way = salvage 得精华合计，sell 得银币合计。

## 4. 数据模型

### 4.1 新表（迁移 0005）

| 表 | 列 |
|---|---|
| `equip` | id, rest_id, goods_id, part, suit_id, min_level, cur_hole, max_hole, stress (0~10), fail_streak, locked, worn, base_cook … base_luck（6 列）, st_cook … st_luck（6 列强化增量）, acquired_at。索引：(rest_id)；唯一部分索引 (rest_id, part) where worn |
| `equip_gem` | id, equip_id（外键，级联删除）, rest_id, gem_goods_id, level, cook … luck（6 列）, created_at |
| `equip_stress_log` | id, equip_id（外键，级联删除）, rest_id, stress（尝试的目标等级）, success, attr, val, lucky, floor, stone, created_at。索引 (equip_id, id) |
| `equip_preset` | id, rest_id, name, part1 … part5（equip id，可空）, created_at。唯一 (rest_id, name) |

### 4.2 现有表 / 代码的变化

- `store_item` 不再保存 type 4 的道具。`grantGoods` 遇到厨具时创建 num 件实例（§3.1），返回 granted = num。
- 迁移：现有 `store_item` 里 type 4 的每行按 num 生成实例（种子 rng），再删掉这些行。迁移用 SQL + 一个 TS 函数（读配置生成属性）。
- `storeKinds`（仓库容量）加上未穿戴厨具件数（裁定 7）。
- 商店购买厨具：已有"不可叠加一次只能买 1 个"的限制，购买后走 `grantGoods` 生成实例。
- 仓库列表不再出现厨具（它们不在 store_item 里）。
- 功能：`IMPLEMENTED_FEATURES` 加 `equip`；`action_map` 已有 `equip.` → `equip`。任务状态键 `equip.maxStress` = 我所有厨具的最高 stress，通过 `stateValue` 的 extra 传入。
- 好友餐厅页 `FriendRestDto` 加 `equips`：对方穿戴的 5 个部位（名称、部位、stress、套装名）。

### 4.3 配置

- `tuning.equip`：`maxStress 10, baseRate 0.8, ratePerStress 0.08, floorPerFail 0.01, coinPerEssence 10000, newsFromStress 8, gemBaseRate 0.95, gemRatePerLevel 0.18, gemExpPerLevel 1000, gemNewsLevel 3, gemBrokenNewsLevel 5, ungemCoinPerLevel 10000, ungemFreeStar 2, maxPresets 5, presetNameMax 12, batchMax 200`。
- `GOODS` 常量：essence 52、stressStone 40、drillStone 46、backStressOne 225、backStressAll 224。
- 配置加载：厨具 value 解析成 `EquipDef {part, essence, hole, maxHole, minLevel, suitId, total?, ranges: 6 项（固定值或 [min,max]）}`；宝石解析成 `GemDef {level, nextId, attrs}`；套装数据加载并改名 Pct 键（裁定 2）。

## 5. 服务端

模块 `modules/equip/`：

| 文件 | 职责 |
|---|---|
| `rules.ts` | 纯函数：属性顺序、生成、强化成功率、强化选属性、宝石升阶判定、套装档位、属性和厨力汇总 |
| `instances.ts` | 创建实例（给 `grantGoods` 和迁移用）、读取厨具（含宝石）、DTO |
| `effects.ts` | `syncEquipEffects(op)` |
| `service.ts` | 各接口的业务（都在 `runOp` / `withRestaurant` 里，锁自己的店） |
| `routes.ts` | 路由 |

### 5.1 接口一览（`/api/v1`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/equip/overview` | 5 部位穿戴、激活套装档位、属性（加点 / 厨具 / 合计）和厨力、预设列表 |
| GET | `/equip/list?part=` | 我的厨具（可按部位筛），每件带宝石 |
| GET | `/equip/:id` | 单件详情、强化记录（最近 50 条）、下一级成功率分项 |
| POST | `/equip/wear` `/equip/unwear` `/equip/unwearAll` | 穿戴 |
| POST | `/equip/stress` | 强化 |
| POST | `/equip/rollback` | 强化回退 |
| POST | `/equip/lock` | 锁定 |
| POST | `/equip/salvage` | 分解 |
| POST | `/equip/drill` `/equip/inlay` `/equip/ungem` | 打孔、镶嵌、摘除 |
| POST | `/equip/batch` | 一键处理 |
| POST | `/equip/preset/save` `/equip/preset/apply` `/equip/preset/delete` | 预设 |
| GET | `/gem/list` | 我的宝石（带下一阶、成功率） |
| POST | `/gem/levelup` | 宝石升阶 |
| POST | `/shop/sell` | 现有接口，body 加可选 `equipId` |

写操作返回 `okOp`（资源变化 + 日志）。读接口也检查 `equip` 功能。

### 5.2 错误码

不加新错误码，沿用：
- `NOT_ENOUGH`，`what`：essence / coin / strength / gem / stone / drill / backStress
- `INVALID_STATE`，`reason`：locked / hasGems / inPreset / worn / notWorn / maxStress / noStress / noHole / holeFull / cannotDrill / gemMaxLevel / notGem / notBackStress / presetName / batchDirty
- `REQUIREMENT_NOT_MET`，`reason`：level（餐厅等级不够 min_level，带 `need`）
- `LIMIT_REACHED`：presets
- `NOT_FOUND`：厨具、宝石行、预设不存在或不是我的
- `FEATURE_DISABLED`：功能关闭

## 6. 前端

| 页面 | 内容 |
|---|---|
| `EquipView`（`/rest/equip`） | 顶部属性（加点 + 厨具 = 合计）和厨力；5 个部位卡片（名称、+N、宝石孔）；激活套装档位；按钮：宝石、预设、一键处理、全部卸下。点部位 → 该部位厨具列表（等级不够的灰显并提示），可穿戴 |
| `EquipDetailView`（`/rest/equip/:id`） | 属性表（基础 / 强化 / 宝石 / 合计）；强化（显示成功率分项和保底，强化石勾选，费用）；回退（选归元石 / 神秘水晶）；宝石孔（镶嵌选宝石、摘除显示费用）；打孔；锁定；分解；出售；强化记录 |
| `GemView`（`/rest/gem`） | 宝石列表；升阶（组数输入，显示成功率、体力、最大可升组数） |
| 预设弹窗 | 列表、保存当前、套用、删除 |
| 一键处理弹窗 | 列出符合条件的厨具，勾选（默认全选），选分解或出售，确认前显示合计 |
| 餐厅首页 | 加"厨具"入口 |
| 好友餐厅页 | 加一行对方穿戴的厨具 |
| 仓库页 | 顶部提示"厨具在厨具页"并链接 |
| 任务 | href `/rest/store` 的厨具任务映射到 `/rest/equip` |

## 7. 测试

- 单元（`rules.ts`，固定种子）：六种部位的生成（有 total / 无 total / total 用完）；强化成功率各分项和幸运 / 保底标记；强化选属性和强化石 +1 上限；宝石升阶成功 / 补救 / 失败；套装档位叠加和非套装 suitid；属性 ×Pct 和厨力取整。
- 集成（每个接口）：正常路径 + 每个拒绝原因；穿脱后加成汇总里 `luckValue` 和套装键正确、下一轮结算用上；回退撤销正确的增量；预设套用时等级不够的部位留空；一键处理有一件不干净整批拒绝；功能关闭时接口拒绝、加成保留；任务、礼包、商店发厨具生成实例；迁移把旧行转成实例；仓库容量计入未穿戴厨具；同一店并发强化不丢更新（行锁）。
- 端到端：买见习之铲 → 穿戴 → 强化 → 打孔 → 镶嵌宝石 → 保存预设 → 全部卸下 → 套用预设 → 看到属性恢复。

## 8. 验收

- `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm format:check` 全绿，端到端通过。
- 开发库：迁移后老号的厨具以实例出现；新号跟主线能完成第 30、31 步。
- `docs/deploy.md` 加"厨具"一节（迁移说明、功能开关）。

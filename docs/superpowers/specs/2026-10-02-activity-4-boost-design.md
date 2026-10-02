# 限时活动 148-4：限时全服加成 设计

日期：2026-10-02
状态：待用户审阅

## 1. 范围

问题记录 148 的第二个子项目（顺序 1 → 4 → 2 → 3）。一个 PR，分支 `feat/activity-boost`。

在 148-1 的活动框架里加第四种类型 **全服加成**（`boost`）：活动期间，把白名单里的区服数值乘一个倍数，比如"周末经营经验 ×2""菜场价格 ×0.8"。

## 2. 用户已确认的裁定

1. 加成作用在**区服数值层**：所有系统和定时任务本来就读区服数值，覆盖面最广。不做"加成层"（效果键）。
2. 不开放任意数值，只开放 §3 的**白名单**，每项有中文名和倍数范围。
3. 多个加成同时生效时**连乘**，最后夹在范围内。
4. 开始和结束允许有最多 30 秒的误差（区服数值缓存 30 秒）。

## 3. 白名单

放在 `packages/shared/src/boost.ts`，服务端和前端共用：

```ts
export interface BoostDef {
  label: string;            // 中文名
  paths: string[];          // tuning 里的路径，倍数同时乘到这几项上
  min: number; max: number; // 单个活动可填的倍数范围，也是叠加后的夹取范围
  cap?: number;             // 结果的绝对上限（概率类为 1）
  int?: boolean;            // 结果取整（四舍五入，至少 1）
}
export const BOOSTS: Record<string, BoostDef>
```

| 键 | 名称 | 路径 | 倍数 | 备注 |
|---|---|---|---|---|
| `exp` | 经营经验 | `settlement.expMultiplier` | 1~5 | |
| `coin` | 经营银币 | `settlement.coinMultiplier` | 1~3 | 新增数值，见 §4 |
| `marketPrice` | 菜场价格 | `market.priceFactor` | 0.5~1 | 新增数值，见 §4；日常、特价、高级三个货架都乘 |
| `strength` | 体力恢复 | `strength.regen`、`strength.luckyRegen` | 1~3 | 恢复量本来就按四舍五入取整 |
| `dtTicket` | 德拓券掉率 | `settlement.dtTicketBaseRate` | 1~5 | 结算、翻厨、帮好友添油、打蟑螂都用它 |
| `equipStress` | 强化成功率 | `equip.baseRate` | 1~1.25 | cap 1 |
| `gemLevel` | 宝石升级成功率 | `equip.gemBaseRate` | 1~1.05 | cap 1 |
| `yardYield` | 菜园土地等级加产 | `yard.yieldPerLevel` | 1~3 | int；1 级土地本来就没有加产 |
| `guardianRare` | 守护兽稀有掉落 | `temple.guardianRareRate` | 1~2 | cap 1 |
| `sellRate` | 商店卖出价 | `shop.sellRate` | 1~1.3 | cap 1 |

写计划前已核对：`settlement.renownRate`、`settlement.krabCoinBaseRate` 只用在"挑剔消耗食材"一步，叫"声望""蟹币掉率"会误导，所以不放进白名单。

## 4. 新增的两个区服数值

都在 `tuning.json` 和 tuning 的 zod 定义里加上，默认 1，所以不改变现有数值：

- `settlement.coinMultiplier`：每桌付费顾客的银币乘它。位置在 `tables.ts` 算 `coinT` 的地方：`coinT = (coin + coinValue + mcCoin) × coinMultiplier`。挑剔满足的额外银币是按 `coinT` 算的，所以会一起变。
- `market.priceFactor`：`market/rules.ts` 的 `unitPrice` 在天气系数之后再乘它，三个货架都乘。

快速数值模拟器用的是同一个 `settleRestaurant` 和 `unitPrice`，不用另外改。新数值会出现在后台"区服数值"页，`setting_docs.json` 的分组说明不变（按分组写说明，不是逐项写）。

## 5. 活动类型 `boost`

- 定义：`{ items: Array<{ key: BoostKey; factor: number }> }`，1~10 项。
  - 同一个键只能出现一次。
  - `factor` 必须在该项的 `[min, max]` 内，最多两位小数。
  - 至少有一项的 `factor` 不等于 1。
- 没有奖励、没有计数：`rewardsOf` 返回空数组，计数处理器跳过，补发任务也跳过（没有可领的奖励，补发结果自然为空）。
- 其他规则和 148-1 相同：开始后只能改标题、说明、延长结束时间、提前结束。
- 迁移 0022：`activity.kind` 的检查约束加上 `'boost'`；shared 的 `ACTIVITY_KINDS` 和 `ActivitySpec` 联合类型同步加上。

## 6. 生效方式

### 6.1 纯函数 `applyBoosts`（`packages/config/src/boost.ts`）

```ts
applyBoosts(settings: ShardSettings, active: Array<Array<{ key; factor }>>): ShardSettings
```

- 对每个键，把所有生效活动里的 `factor` 连乘，得到总倍数，再把总倍数夹到 `[min, max]`。
- 对这个键的每条路径：`值 = 基础值 × 总倍数`；有 `cap` 时取 `min(值, cap)`；`int` 时取 `max(1, round(值))`。
- 返回新对象，不改传入的 settings。
- "基础值"是基础配置加区服覆盖之后的值，所以运营在"区服数值"里调过的数也会被加成。

### 6.2 区服服务

`shards.settings(shardId)` 在原来的解析结果上，再套用当前游戏时间正在生效的加成：

- 生效条件：`kind='boost'`、没删、`starts_at ≤ 现在 < ends_at`、`shard_id = 本区服 或 空`。
- 结果和原来一样缓存 30 秒。
- 区服服务需要游戏时钟：`createShardService` 的依赖里加上 `now`。dev 的可拨动测试时钟也要生效。
- 后台创建、修改、提前结束、删除全服加成活动时：
  - 本进程：清掉相关区服的缓存（全服活动清全部区服）；
  - 其他进程（worker）：最多晚 30 秒生效。

后台"区服数值"页显示的是不含加成的数值：它直接用 `resolveShardSettings`，不走这里。在页面上方加一行提示"当前有全服加成生效：经营经验 ×2（至 10-08 00:00）"。

### 6.3 读到区服数值的地方

结算、菜场、体力恢复定时任务、强化、宝石、菜园、神殿、商店出售，全都通过 `shards.settings`（或 `runOp` / `runSystemOp` 的 `o.settings` / `o.tuning`）读数值，所以会自动生效。实现时逐个确认白名单这 10 项的读取点确实来自区服设置，不是直接读 `config.tuning`；有直接读的，改成读区服设置。

## 7. 前端

- 后台：类型下拉加"全服加成"。编辑器每行是"项目下拉 + 倍数输入"，旁边提示范围（例如"1~5"）；可以增删行，最多 10 行。
- 玩家活动页：全服加成的卡片列出"经营经验 ×2、菜场价格 ×0.8"和剩余时间，没有领取按钮，也没有"全部领取"。
- 首页横幅的"进行中的活动 N 个"也算上全服加成。

## 8. 测试

- `applyBoosts`（纯函数）：
  - 单项相乘；
  - 多个活动连乘后夹到范围内；
  - `cap` 和 `int` 生效；
  - 体力恢复同时乘到两条路径上；
  - 不改动传入的对象。
- 定义校验：倍数超出范围、键重复、未知键、全部倍数为 1，都要报错并带路径。
- 集成：
  - 窗口内 `shards.settings` 返回加成后的数值，窗口外不加成；
  - 别的区服的加成不生效，全服加成生效；
  - 后台创建或提前结束后，本进程立即生效或失效；
  - `boost` 活动不计数、不补发。
- 新数值：
  - `coinMultiplier = 2` 时同一局结算的银币翻倍（用固定种子比较）；
  - `priceFactor = 0.5` 时三个货架的单价都减半。
- 前端：编辑器的增删行、范围提示、提交内容；玩家卡片的显示；首页横幅计数。

## 9. 不做的事

- 加成层（效果键）的全服加成。
- 白名单以外的数值。
- 加成开始和结束时的推送或公告。

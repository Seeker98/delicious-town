# 界面改版 P4 厨房 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 食材有了自己的图形（336 种按 27 个类别配图，类别写进配置），厨房区域的页面——食谱（列表、特色菜、进度一览、食谱详情）、橱柜（含冰箱）、菜场、仓库——套用 P3 定下的页面模式；原版图包接口 `GameImg`/`/pack` 删掉。

**Architecture:** `packages/config/data/master/foods.json` 每种食材加 `art`（类别键），`packages/config/src/foodArt.ts` 定义 27 个类别；构建校验每种食材都有合法的 `art`。服务端目录接口把 `art` 带给网页（`CatalogFoodDto.art`），网页用 `catalog.foodArt(id)` 取图形名、`<FoodArt :id>` 画图；不写死任何食材编号。图形放 `apps/web/src/art/content/food-*.svg`（B 风格平涂，48×48）。页面改动只换结构写法和控件（行、卡片、步进器、底部面板、确认面板、空状态、骨架），Bootstrap 类名照旧保留（P3 定的做法）。

**Tech Stack:** Vue 3.5、Pinia、Vitest、zod（配置校验）、Kysely 不涉及（服务端只改目录接口的一个字段）。

**Spec:** `docs/superpowers/specs/2026-10-10-ui-redesign-design.md` §3.2（食材类别约 25 个，P4 首次用到）、§3.3（食材 `art` 写进配置、构建校验、目录下发、不写死编号）、§3.4（`GameImg`、`/pack` 在 P4 删掉）、§5（页面模式；橱柜 4 列网格）、§6.1 P4 行。视觉规范 §6.1 通用件（P3）。

## Global Constraints

- 不写裸色值：样式只用 `tokens.css` 的令牌；内容图形是固定色，写在 SVG 里。
- 网页不写死食材、道具编号（`itemLiterals.test` 照常）；食材配图只从目录的 `art` 来。
- 文案：简中半角括号、“: ”“, ”（带空格）；法文窄空格写 `\u202f` 转义（脚本里用 `String.fromCharCode(92)` 拼）；繁中最后跑 `pnpm -F @dt/web i18n:tw`，不格式化。
- 改了 `packages/config` 先 `pnpm -F @dt/config build`；改了图形跑 `pnpm -F @dt/web art`。
- 体积：两张雪碧图压缩后合计 ≤ 25KB（`art.test.ts`）。
- 菜园（`YardView.vue`、`components/yard/*`）不改；菜园里出现的食材名照旧是文字。
- 提交前顺序：prettier → 测试 → 提交（P3 两次因为先提交后跑测试带进失败的测试）。
- 一条五种语言的更新记录（`kitchen1011`）。

## Review Focus

1. 配置里新加的食材（新街道导入）没写 `art` 或写了不认识的类别：配置构建报错，错误信息写明是哪种食材；网页测试检查 27 个类别都有图形。——测试在 Task 1、Task 2。
2. 旧目录缓存（网页已更新、目录还是旧的，没有 `art`）或目录里查不到这个编号：食材照样显示，图形退回“其他”类别的通用图，不空着、不报错。——测试在 Task 2。
3. 橱柜 4 列在 360px 的法文、西文下：名字最多两行，数量不被挤掉，横向不溢出。——截图在 Task 9，样式测试在 Task 4。
4. 菜场、仓库、橱柜的步进器：上限随库存、单种上限、剩余限购变化，买、用、卖都不会发出超过上限的数。——测试在 Task 5、Task 7。
5. 去掉 `GameImg` 后，原来用它的地方（好友列表、好友餐厅、首页加成、装扮头像、吉祥物卡片）照常显示替代图标，不出现破图。——测试在 Task 3。

---

## 食材类别（27 个，写进 `packages/config/src/foodArt.ts`）

| 键 | 名字 | 例子 |
|---|---|---|
| pork | 猪肉 | 猪肉、五花肉、排骨、里脊肉、火腿、腊肉、香肠、猪蹄、猪肘 |
| poultry | 禽肉 | 鸡肉、鸭肉、鹅肉、鸽肉、鹌鹑、鸡翅、乌鸡、三黄鸡肉 |
| beef | 牛羊肉 | 牛肉、羊肉、雪花牛肉、牛小排、驼峰 |
| game | 野味 | 兔肉、鹿肉、蛇肉、熊掌、牛蛙、甲鱼、龟肉、榛鸡、天山雪鸡 |
| offal | 下水 | 猪肚、肥肠、猪肝、猪腰、鸭血、鸭舌、鸡爪、蹄筋、毛肚、牛鞭 |
| fish | 鱼 | 草鱼、黄鱼、鲈鱼、鳗鱼、三文鱼、鲫鱼、咸鱼、金枪鱼 |
| shrimp | 虾蟹 | 对虾、河虾、小龙虾、青蟹、螃蟹、帝王蟹、皮皮虾、虾米 |
| shellfish | 贝螺 | 扇贝、牡蛎、海螺、田螺、螺肉、竹蛏、海蚌、淡菜 |
| seafood | 海味 | 海参、鱼翅、鱼肚、鱼唇、鲍鱼、干贝、瑶柱、海蜇、鱿鱼、墨鱼 |
| egg | 蛋 | 鸡蛋、鸭蛋、皮蛋、鹌鹑蛋、鸽蛋 |
| leafy | 叶菜 | 白菜、菠菜、生菜、韭菜、芹菜、茼蒿、羽衣甘蓝 |
| root | 根茎 | 土豆、萝卜、莲藕、山药、芋头、红薯、春笋、马蹄 |
| veg | 瓜果蔬菜 | 番茄、茄子、黄瓜、辣椒、南瓜、冬瓜、苦瓜、西兰花、玉米 |
| allium | 葱姜蒜 | 大葱、香葱、生姜、大蒜、洋葱、蒜苗 |
| bean | 豆和豆制品 | 黄豆、红豆、绿豆、豌豆、豆腐、腐竹、千张、豆芽 |
| mushroom | 菌菇 | 香菇、蘑菇、金针菇、木耳、银耳、松茸、竹荪 |
| fruit | 水果 | 梨、葡萄、香蕉、菠萝、樱桃、牛油果、柠檬 |
| grain | 米面 | 大米、糯米、面粉、粉丝、年糕、意大利面、藜麦 |
| spice | 香料 | 花椒、胡椒、八角、孜然、桂花、薄荷、紫苏、迷迭香、番红花 |
| sauce | 调味酱料 | 醋、酱油类、番茄酱、豆瓣酱、鱼露、高汤、橄榄油 |
| sweet | 甜味 | 白糖、冰糖、蜂蜜、可可豆、豆沙、戚风蛋糕、手指饼干 |
| dairy | 奶制品 | 牛奶、奶油、奶酪、酸奶、马斯卡彭芝士 |
| drink | 酒和茶 | 米酒、黄酒、白酒、啤酒、葡萄酒、茶叶、西湖龙井 |
| nut | 坚果 | 花生、核桃、杏仁、腰果、板栗、芝麻、碧根果 |
| delicacy | 名贵食材 | 燕窝、人参、虫草、鹿茸、黑松露、鱼子酱 |
| mystery | 神秘食材 | 名字以“神秘”开头的 13 种 |
| master | 万能食材 | 一级~五级万能食材 |

另有一个不对应食材的 `misc`（通用图，目录查不到时用），所以图形一共 28 张（27 类 + 通用）。

---

### Task 1: 食材类别写进配置

**Files:** Create `packages/config/src/foodArt.ts`（`FOOD_ARTS` 数组 + `FoodArt` 类型）；Modify `packages/config/data/master/foods.json`（336 种各加 `art`，用一次性脚本按上表标注，规则 + 逐个复核）、`src/raw.ts`（`masterFood` 加 `art: z.enum(FOOD_ARTS)`）、`src/build.ts`（`Food` 带 `art`）、`src/types.ts`、`src/index.ts`（导出 `FOOD_ARTS`）、`src/build.test.ts`；`packages/shared/src/schemas/world.ts`（`CatalogFoodDto.art: string`）；`apps/server/src/modules/world/service.ts:181`（目录带 `art`）+ 目录测试。

- [ ] Step 1：测试（先失败）：
  - config：真实数据每种食材都有 `art`、都在 `FOOD_ARTS` 里；名字以“神秘”开头的都是 `mystery`、万能食材都是 `master`；去掉一种的 `art`、写成 `xyz` 时构建报错，错误里有这种食材的编号。
  - server：目录接口的食材带 `art`。
- [ ] Step 2：实现。标注脚本放 scratchpad（不提交），先按关键字规则归类，再把规则没覆盖的逐个手标，最后输出每类的名单人工过一遍。
- [ ] Step 3：`pnpm -F @dt/config build`；跑 config、shared、server 目录测试；提交 `feat: 食材按 27 个类别配图，类别写进配置（界面改版 P4）`。

---

### Task 2: 食材图形和 `FoodArt` 组件

**Files:** Create `apps/web/src/art/content/food-<类别>.svg`（28 张：27 类 + `food-misc`）、`components/FoodArt.vue` + test；Modify `stores/catalog.ts`（`foodArt(id): ArtName`）、`art/art.test.ts`（每个 `FOOD_ARTS` 类别都有 `food-<类别>`）、`views/dev/ArtGalleryView.vue`（不用改，内容图形自动列出）；跑 `pnpm -F @dt/web art`。

**Interfaces — Produces:** `catalog.foodArt(id: number): ArtName`（目录里有 `art` 且图形存在就用，否则 `food-misc`）；`<FoodArt :id="foodsId" :size="24" />`（装饰性，`aria-hidden`）。

- [ ] Step 1：测试（先失败）：`foodArt` 正常、目录没有 `art`（旧缓存）、编号查不到、`art` 在网页里没有图形（新目录旧网页）都退回 `food-misc`；`FoodArt` 渲染对应 `<use>`；`art.test` 每个类别都有图形，雪碧图仍 ≤ 25KB。
- [ ] Step 2：画图（B 风格平涂、48×48、细节用半透明深线或白线；先放进 `/dev/art` 图库，截一张给用户过目）。实现。
- [ ] Step 3：跑测试，提交 `feat(web): 食材图形（界面改版 P4）`。

---

### Task 3: 去掉原版图包接口 `GameImg`

**Files:** Delete `components/GameImg.vue` + test、`assets/asset.ts`（+ test 如有）；Modify `env.d.ts`（去掉 `VITE_ASSET_BASE`）、`MascotCard.vue`、`FriendsView.vue`、`FriendRestView.vue`、`RestaurantHomeView.vue`、`RestLookView.vue`、`StoreView.vue` 及其测试。

- 线上本来就没有图包，`GameImg` 一直显示替代图标：换成直接写替代图标（`bi-*`，加 `aria-hidden` 和读屏文字）；好友餐厅的门换成 `door-<art>` 图形（P3 的门图形）。
- [ ] Step 1：测试（先失败）：这几处不再请求 `/pack/...` 图片（找不到 `img[src*="/pack/"]`）；好友餐厅的门是 `door-*` 图形；替代图标都在。
- [ ] Step 2：实现，`grep -rn "GameImg\|/pack\|VITE_ASSET_BASE" apps/web/src` 为空。
- [ ] Step 3：跑这些页面的测试，提交 `refactor(web): 去掉原版图包接口，改用图形和图标（界面改版 P4）`。

---

### Task 4: 橱柜和冰箱

**Files:** Modify `views/CupboardView.vue` + test、`main.css`；Create `art/content/empty-cupboard.svg`。

- [ ] Step 1：测试（先失败）：
  - 格子 4 列（`.dt-tile-grid`），每格上面是 `FoodArt`、下面名字（最多两行）和 `×数量`、再下面“本街还需”；冰箱格子一样。
  - 处理（合成、分解）的数量用 `DtStepper`（原来的 testid 不变），上限随持有和体力。
  - 解冻走确认面板。
  - 橱柜空时 `DtEmpty art="empty-cupboard"`，写去菜场买，链接 `/market`；加载时 `DtSkeleton`。
- [ ] Step 2：实现。格子最小高 72px，名字 `dt-clamp2`，数量不换行。
- [ ] Step 3：跑测试，提交 `feat(web): 橱柜 4 列格子配食材图、步进器、确认面板（界面改版 P4）`。

---

### Task 5: 菜场

**Files:** Modify `views/MarketView.vue` + test（及菜场的子组件，如竞猜卡）。

- [ ] Step 1：测试（先失败）：每行左边 `FoodArt`；购买数量用 `DtStepper`（上限 = 剩余、限购、单种上限、银币够买的最小值，原来的提示文字照旧）；手动进货走确认面板；日常、特价两段各一张 `.dt-card`；加载时骨架。
- [ ] Step 2：实现。
- [ ] Step 3：跑测试，提交 `feat(web): 菜场每行配食材图、步进器、确认面板（界面改版 P4）`。

---

### Task 6: 食谱列表、进度一览、食谱详情

**Files:** Modify `components/cookbook/CookbookListPanel.vue` + test、`components/cookbook/ProgressPanel.vue` + test、`views/CookbookInfoView.vue` + test、`main.css`（`.dt-cb`）。

- [ ] Step 1：测试（先失败）：
  - 食谱列表：每道菜是一张卡片里的一行（`.dt-item`，细线分隔），不再一行一个带边框的格子；食材那一行照旧是文字（够 / 不够红绿），不加图，保住密度；翻页按钮在卡片底部。
  - 进度一览：表格 `.dt-num-table`。
  - 食谱详情：每个品级一行，食材前面 `FoodArt`；当前品级以下的行标出（替代 `table-success`）。
- [ ] Step 2：实现。
- [ ] Step 3：跑测试，提交 `feat(web): 食谱列表改成卡片里的行，食谱详情配食材图（界面改版 P4）`。

---

### Task 7: 特色菜

**Files:** Modify `components/cookbook/McPanel.vue` + test。

- [ ] Step 1：测试（先失败）：两处数量框换成 `DtStepper`（testid 不变）；丢弃残卷走确认面板，`danger: true`；没学会特色菜、没有残卷时用 `DtEmpty`（文字照旧）；已学、残卷两块各一张卡片。
- [ ] Step 2：实现。
- [ ] Step 3：跑测试，提交 `feat(web): 特色菜套用卡片、步进器、确认面板（界面改版 P4）`。

---

### Task 8: 仓库

**Files:** Modify `views/StoreView.vue` + test。

- 道具的图形在 P5 画；这批只换结构。
- [ ] Step 1：测试（先失败）：每种道具一行 `.dt-item`（分组标题照旧）；使用、卖出的数量用 `DtStepper`；卖出、丢弃走确认面板（丢弃 `danger: true`）；纪念品、道具流水为空时 `DtEmpty`；道具流水每条一行 `.dt-feed`；加载时骨架。
- [ ] Step 2：实现。
- [ ] Step 3：跑测试，提交 `feat(web): 仓库套用行、步进器、确认面板（界面改版 P4）`。

---

### Task 9: 规范、更新记录、截图、审查、PR

- [ ] `docs/design/视觉规范.md` §8 图形：食材图形的类别表、`catalog.foodArt` 和 `FoodArt` 的用法、新食材要写 `art`。
- [ ] 更新记录（五种语言）：食材有了小图（按类别）；橱柜改成四列格子；菜场、仓库、特色菜加减数量用 − + 按钮，确认改成从下面弹出的面板；食谱列表更紧凑。
- [ ] 全量检查（lint、format、typecheck、四个包的测试）+ 干净副本重跑。
- [ ] 截图（同 P3）：食谱、特色菜、进度一览、食谱详情、橱柜、冰箱、菜场、仓库、道具流水；简中 390px 浅色深色、法文英文 360px；溢出 0；首屏行数不少于改前；放 `docs/design/改版-P4/`。
- [ ] 整体审查（新的审查员）→ 修 Critical/Important（先写失败的测试）→ 小问题记 backlog。
- [ ] 推送开 PR：`feat: 界面改版 P4 厨房——食材图形、橱柜四列、菜场仓库特色菜套用新控件`。

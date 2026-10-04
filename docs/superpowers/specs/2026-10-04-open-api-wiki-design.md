# 开放接口和 Wiki（问题记录 142）设计

- 日期：2026-10-04
- 来源：问题记录 142——"开放接口给想二次开发或者研究游戏的玩家：全部道具、全部食材等 Wiki 页面"。
- 用户已定（2026-10-04 一轮问答）：
  - Wiki 首版收 5 类：道具、食材、菜谱、厨具、街道和奖章；每类有列表、搜索、筛选、详情。
  - 不用登录，公开访问；入口放在登录页底部、"更多"菜单、指引页。
  - 只写静态属性和配置里能直接推出来的来源（商店或菜场售价、兑换关系等），掉落概率、活动奖励不写。
  - 后台专用、游戏里拿不到的道具不显示；一番赏奖品、神秘食材、菜谱配方照常显示（游戏里本来就看得到）。
  - 开放接口只给只读的静态游戏数据，和 Wiki 同一套，JSON，带配置版本号；不用登录，允许跨域，按 IP 限流；配一个说明页。不开放玩家、区服的实时数据。
  - Wiki 页面和数据都支持五种语言。
- 实现方式：方案和计划照写，不等审，直接实现，合并前一起看。

## 1. 范围

**做**
- 服务端新模块 `open`：`/api/v1/open/*` 只读接口，数据全部来自配置包（`GameConfig`），按语言返回名字。
- 前端 Wiki：`/wiki` 首页、`/wiki/:kind` 列表、`/wiki/:kind/:id` 详情、`/wiki/api` 接口说明。
- 三个入口：登录页底部、"更多"的"其他"组、指引页顶部。

**不做**
- 玩家、区服的实时数据（天气、交易所价格、排行榜等）。
- 掉落概率、礼包开出概率、活动奖励。
- 特色菜（神秘食谱）、NPC、天气等其他类目，以后按需加。
- 搜索引擎优化（站点是单页应用，不做服务端渲染）。

## 2. 接口

前缀 `/api/v1/open`，全部是 `GET`，参数 `lang` 可选（`zh-CN` 默认、`zh-TW`、`en`、`fr`、`es`），不合法报 `VALIDATION_FAILED`。

| 路径 | 内容 |
|---|---|
| `/open` | 索引：配置版本、支持的语言、各接口路径 |
| `/open/goods` | 道具列表（摘要） |
| `/open/goods/:id` | 道具详情 |
| `/open/foods` | 食材列表 |
| `/open/foods/:id` | 食材详情 |
| `/open/cookbooks` | 菜谱列表（摘要，不含配方） |
| `/open/cookbooks/:id` | 菜谱详情（含 1~10 品级配方） |
| `/open/equips` | 厨具列表和套装 |
| `/open/streets` | 街道和街道勋章 |

返回格式和其他接口一样：`{ ok: true, data }`，`data` 里都带 `version`（配置版本）和 `lang`。不存在或被隐藏的 id 报 `NOT_FOUND`（404）。

### 2.1 字段

**道具摘要** `OpenGoodsBrief`：`id`、`name`、`type`（道具类型号）、`level`、`coin`、`diamond`（商店售价，没有为 0）、`onSale`（商店常驻在售）。

**道具详情** `OpenGoods`：摘要 +
- `desc`
- `stackable`、`maxNum`、`invalidHours`（限时道具的小时数，永久为 null）
- `equip`：部位、等级门槛、套装 id、强化一次的精华、初始孔数和最大孔数、基础属性范围（`ranges`）、+0~+10 的属性总和（`stressTable`）
- `gem`：阶数、下一阶 id、属性
- `gift`：礼包能开出的东西，**只列种类和数量范围，不给概率**：`{ kind: 'goods', id, num }`、`{ kind: 'foods', num, level? }`、`{ kind: 'coin' | 'exp' | 'diamond', min, max }`、`{ kind: 'renown', num }`
- `sources`：从配置推出来的获得途径
  - `shop`：商店常驻在售时的价格（银币或钻石）
  - `renownShop`：声望商店价格，以及是否轮换上架
  - `exchange`：兑换得到它的规则（用什么换、几个）
- `usedIn`：它作为兑换材料能换什么（兑换规则列表）

**食材摘要** `OpenFoodBrief`：`id`、`name`、`level`、`coin`（系统定价）、`rare`（稀有，配置里 `odds < 100`）、`type`（调料坚果 / 肉蛋奶 / 蔬果）。

**食材详情** `OpenFood`：摘要 + `maxNum`；`seed`（能种出它的种子：id、名字、收获数量）；`cookbooks`（用到它的菜谱：id、名字、街道、最低用到的品级；按 id 排序，全部列出）；`mysterious`（用到它的特色菜：id、名字）。

**菜谱摘要** `OpenCookbookBrief`：`id`、`name`、`streetId`、`level`（推荐等级）、`coin`（售价）。

**菜谱详情** `OpenCookbook`：摘要 + `taste`（口味 id 列表）、`desc`（只有简中，其他语言为 null，原数据没有翻译）、`grades`：1~10 品级各自的食材（`foodsId`、`num`）。

**厨具** `/open/equips`：`equips`（厨具道具：id、名字、部位、等级门槛、套装、`stressTable` 末项即 +10 属性总和）和 `suits`（id、名字、件数上限、各档件数和效果说明）。详情走 `/open/goods/:id`。

**街道** `/open/streets`：id、名字、菜系名、加成说明、勋章（道具 id、名字、说明）、菜谱数量。

### 2.2 隐藏的道具

配置里写死一份隐藏清单 `WIKI_HIDDEN_GOODS`（`packages/config/src/ids.ts`）：开发测试礼包（51）、测试勋章（83）、升星促销勋章礼包（测试）（124）。列表不出，详情报 404，礼包内容和兑换关系里引用到时也不出。以后再有后台专用道具加进这份清单。

### 2.3 跨域、缓存、限流

- **跨域**：`/api/v1/open/*` 的响应写 `Access-Control-Allow-Origin: *`，去掉 `Access-Control-Allow-Credentials`（全局的 CORS 只允许本站、带 cookie）。只有 GET、不需要自定义头，浏览器不发预检。
- **缓存**：`Cache-Control: public, max-age=3600`，`ETag` = `"<配置版本>:<语言>:<路径>"`；带 `If-None-Match` 且相同时回 304。服务端按"语言 + 接口"在进程里缓存算好的结果（配置不变，结果不变）。
- **限流**：新规则 `open`，每个 IP 容量 120、每秒补 2 个（约每分钟 120 次）。超了照常报 `RATE_LIMITED`（429）。登录的玩家也按 IP 算（开放接口不需要账号）。

## 3. Wiki 页面

### 3.1 路由

| 路径 | 页面 |
|---|---|
| `/wiki` | 首页：5 个类目卡片（带数量）、全局搜索框（在 5 类的名字里搜）、"开放接口"链接 |
| `/wiki/goods`、`/wiki/foods`、`/wiki/cookbooks`、`/wiki/equips`、`/wiki/streets` | 列表 |
| `/wiki/goods/:id`、`/wiki/foods/:id`、`/wiki/cookbooks/:id`、`/wiki/equips/:id`（同道具详情）、`/wiki/streets/:id` | 详情 |
| `/wiki/api` | 开放接口说明 |

路由 `meta: { public: true, gameChrome: true }`：没登录也能看；已开店时显示底部导航（和指引页一样）。

### 3.2 列表

- 顶部搜索框：不区分大小写、忽略重音（复用问题记录 316 的 `matchText`）。
- 筛选用 `.dt-pills`：
  - 道具：类型（全部、消耗品、道具、礼包、设施、厨具、宝石、勋章、纪念品）
  - 食材：等级 1~7、只看稀有
  - 菜谱：街道（下拉框，30 条街）、等级段
  - 厨具：部位
  - 街道：无（30 条，直接列）
- 列表行用 `.dt-item` 写法：名称 + 信息行（等级、价格、街道等）；点整行进详情。
- 菜谱 3,800 多道：一次显示 50 条，底部"再显示 50 条"。其他类目数量不大，一次列完。
- 空结果用 `.dt-empty`。

### 3.3 详情

都用卡片：标题（名字 + 类型标签），下面分区块（`.dt-section`）写属性、来源、用途。互相引用的地方都是链接（菜谱里的食材、食材里的菜谱、礼包里的道具、街道里的勋章等）。顶部有返回列表的链接。

### 3.4 数据加载

- 新 store `wiki`：按"语言 + 接口"在内存里缓存列表和详情；切换语言时重新读（页面整页重新挂载，已有机制）。
- 读失败用 toast 提示并在页面上写"读取失败"。
- 名字一律用接口按语言给的，不再查道具目录。

### 3.5 入口

- 登录页：表单下方一行链接"游戏资料（Wiki）"。
- "更多"的"其他"组：新入口"游戏资料"（图标 `bi-book`），不受区服功能开关影响。
- 指引页：页首一行"想查道具、食材、菜谱？看游戏资料"。

### 3.6 接口说明页 `/wiki/api`

写明：用途（只读的静态游戏数据，给想研究、做工具的玩家）、基础地址、`lang` 参数、各接口和示例、返回格式、版本号和缓存、跨域、限流、不包含实时数据。代码示例用 `fetch`。全部五种语言。

## 4. 模块划分

**服务端** `apps/server/src/modules/open/`
- `data.ts`：纯函数，从 `GameConfig` 和语言表算出各接口的数据（`openIndex`、`goodsList`、`goodsDetail`、`foodsList`、`foodDetail`、`cookbooksList`、`cookbookDetail`、`equipsList`、`streetsList`），带反向索引（食材 → 菜谱、食材 → 特色菜、道具 → 兑换），在 `createOpenService` 里第一次用到时建好。
- `service.ts`：按"语言 + 键"缓存结果。
- `routes.ts`：参数校验、ETag、Cache-Control、跨域头、限流规则名。

**共享类型** `packages/shared/src/schemas/open.ts`：上面的 DTO。

**前端**
- `api/endpoints.ts` 加 `open*` 方法。
- `stores/wiki.ts`。
- `views/wiki/`：`WikiHomeView.vue`、`WikiListView.vue`（按 kind 切换筛选和行内容）、`WikiGoodsView.vue`、`WikiFoodView.vue`、`WikiCookbookView.vue`、`WikiStreetView.vue`、`WikiApiView.vue`。
- `i18n/locales/*/wiki.ts`：五种语言（繁中脚本生成）。
- 样式写在 `styles/main.css`（视觉规范：组件里不写 `<style>`）。

## 5. 测试

- **服务端**：`data.ts` 纯函数测试（隐藏道具不出、礼包内容不带概率、反向索引、语言切换、菜谱描述只在简中）；接口测试（不登录能访问、ETag 和 304、跨域头是 `*` 且没有 credentials、限流规则、404、参数校验）。
- **前端**：各页面的单元测试（列表搜索和筛选、分页、详情里的链接、入口链接、语言）。
- **e2e**：不登录打开 `/wiki`，搜一道菜进详情，点食材进食材详情。

## 6. 风险

- **单页应用不利于搜索引擎收录**：首版不管，以后需要再做预渲染。
- **配方全公开**：游戏里学菜页本来就显示配方，用户确认公开。
- **数据量**：菜谱列表约 3,800 条摘要，压缩后几十 KB；配方只在详情里给。

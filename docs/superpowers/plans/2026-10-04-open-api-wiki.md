# 开放接口和 Wiki 实现计划

> 按 superpowers:executing-plans 在本会话里逐个任务做（用户离开期间全自动推进，计划不等审）。每个任务先写失败的测试，再实现。

**目标：** 公开只读的游戏数据接口 `/api/v1/open/*`，加上用它的 Wiki 页面 `/wiki`。

**设计：** [docs/superpowers/specs/2026-10-04-open-api-wiki-design.md](../specs/2026-10-04-open-api-wiki-design.md)

**分支：** `feat/wiki`（从 main 拉，单独一个 PR）

## 全局约束

- 接口数据只来自配置包，不读数据库。
- 隐藏道具清单 `WIKI_HIDDEN_GOODS = [51, 83, 124]` 在列表、详情、礼包内容、兑换关系里都不出现。
- 礼包内容不带概率。
- 菜谱描述只在 `zh-CN` 返回，其他语言为 `null`。
- 开放接口响应：`Access-Control-Allow-Origin: *`，没有 `Access-Control-Allow-Credentials`；`Cache-Control: public, max-age=3600`；ETag `"<版本>:<语言>:<路径>"`。
- 限流规则 `open`：容量 120、每秒补 2。
- 前端样式写在 `styles/main.css`，组件里不写 `<style>` 和 `style="..."`。
- 新文案写简中、英、法、西；繁中用 `pnpm -F @dt/web i18n:tw` 生成。

## 任务

### 任务 1：共享类型和隐藏清单
- 新建 `packages/shared/src/schemas/open.ts`（设计 §2.1 的 DTO），从 `schemas/index` 导出；`openQuery = z.object({ lang: localeSchema.optional() })`。
- `packages/config/src/ids.ts` 加 `WIKI_HIDDEN_GOODS`；配置测试：清单里的 id 都存在。

### 任务 2：服务端纯函数 `modules/open/data.ts`
测试先行（`data.test.ts`，用真实配置）：
- 道具列表不含隐藏道具；名字按语言（`en` 的 1 号道具名和 `i18n` 表一致）。
- 道具详情：厨具带 `stressTable`；礼包 `gift` 不含 `rate`，隐藏道具不出现；`sources.shop` 只在 `onSale` 时有；兑换得到、兑换用途各至少一条（取一个已知的兑换规则）。
- 食材详情：`cookbooks` 反向索引正确（拿一道菜的 1 品级食材验证）；`seed` 对得上种子表。
- 菜谱详情：10 个品级；`desc` 在 `en` 下为 `null`。
- 街道列表：30 条，勋章 id 和 `street_medal_map` 一致，菜谱数量合计等于菜谱总数。
- 隐藏道具、不存在的 id 返回 `null`。

### 任务 3：服务和接口 `modules/open/service.ts`、`routes.ts`
测试先行（`routes.test.ts`，`app.inject`）：
- 不登录访问 `/api/v1/open`、`/open/goods?lang=en` 都是 200，带 `version`、`lang`。
- 响应头：`access-control-allow-origin: *`，没有 `access-control-allow-credentials`；`cache-control` 和 `etag`；带同样的 `if-none-match` 回 304。
- 不存在的 id 404、`lang=xx` 400。
- 限流：把 `open` 规则调成容量 2 后第 3 次 429。
- 实现：`rateLimit.ts` 加规则名 `open`；路由插件里用 `onSend` 钩子改跨域头；服务按 `lang + key` 缓存。

### 任务 4：前端数据层和文案
- `api/endpoints.ts` 加 `openIndex`、`openList(kind)`、`openDetail(kind, id)`（带当前语言）。
- `stores/wiki.ts`：按语言和键缓存；测试缓存命中只请求一次、换语言重新请求。
- `i18n/locales/*/wiki.ts` 五种语言；`Messages` 类型加 `wiki`。

### 任务 5：首页和列表
- 路由 7 条（设计 §3.1），`meta: { public: true, gameChrome: true }`；路由测试：未登录能进 `/wiki`。
- `WikiHomeView`：5 个卡片带数量；全局搜索在 5 类名字里搜，结果最多 20 条。
- `WikiListView`：按 kind 的筛选、搜索、菜谱分页 50 条；测试各类目筛选和搜索、分页按钮。

### 任务 6：详情页
- `WikiGoodsView`（道具、厨具共用）、`WikiFoodView`、`WikiCookbookView`、`WikiStreetView`。
- 测试：各详情的关键字段、互相链接的 `to`、404 时的提示。

### 任务 7：接口说明页和入口
- `WikiApiView`：接口表、示例、跨域、限流、缓存说明。
- 入口：登录页底部链接、`MoreLinks` 的"其他"组、指引页顶部一行；测试各入口存在。

### 任务 8：e2e、截图和收尾
- `apps/web/e2e/wiki.spec.ts`：不登录打开 `/wiki` → 搜菜名 → 详情 → 点食材 → 食材详情列出这道菜。
- 手机宽度（393px）截图各页面，简中、英、法；看溢出和层级。
- 全量测试、类型检查、lint、prettier；推送、PR。

## 终审重点

- 隐藏道具有没有从别的地方漏出来（礼包内容、兑换、勋章、厨具列表）。
- 跨域头在错误响应（404、429）上也是 `*`。
- 菜谱列表在 360px 宽下不横向溢出，长英文、法文名截断。
- 切换语言后 Wiki 页面的名字全部换成新语言（没有残留简中）。
- 开放接口不读数据库，不暴露任何玩家数据。

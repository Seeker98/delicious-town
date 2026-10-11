# 界面改版 P2b 改前改后截图

- 日期：2026-10-11
- 改前：main（#261 合并后）；改后：feat/ui-p2b。首屏（不是整页），底部导航以上。
- 简中 390px 浅色、深色；法文、英文 360px 浅色（测试号的语言临时切过去，截完切回简中）。
- 合并掉的页面，“改前”用的是旧地址：签到和今日活跃 `/rest/activation`、特色菜 `/mc`、进度一览 `/cookbooks/progress`、宝石 `/rest/gem`、基金 `/society/fund`、理财 `/society/wealth`。
- 首屏行数：列表行、紧凑行、待办行、表格行、导航行、地方卡片、活跃格子、任务卡，底部导航以上完整露出的才算。
- 所有页面横向溢出都是 0。
- 行数变少的几页：
  - 任务（主线）8 → 6、食谱 9 → 8：内容一样多，差的是计数方式（改前把旧标签行的 `task-tabs` 也算成了行；食谱多了一条标签栏）。
  - 今日 12 → 10、进度一览 14 → 13：原来是单独一页，现在上面多一条标签栏（约 40px），卡片标题和签到按钮并成一行抵掉一部分。这是把页面合进标签的代价。
  - 小镇 13 → 11：买卖里多了“银行”，后面的卡片往下挪了一格。

## 简中 390px

| 页面 | 首屏行数 改前 → 改后 | 浅色 改前 | 浅色 改后 | 深色 改后 |
|---|---|---|---|---|
| 任务 · 今日 | 12 → 10 | ![](./tasks-today-zh-CN-390-light-before.jpg) | ![](./tasks-today-zh-CN-390-light-after.jpg) | ![](./tasks-today-zh-CN-390-dark-after.jpg) |
| 任务 · 主线 | 8 → 6 | ![](./tasks-main-zh-CN-390-light-before.jpg) | ![](./tasks-main-zh-CN-390-light-after.jpg) | ![](./tasks-main-zh-CN-390-dark-after.jpg) |
| 食谱 | 9 → 8 | ![](./cookbooks-zh-CN-390-light-before.jpg) | ![](./cookbooks-zh-CN-390-light-after.jpg) | ![](./cookbooks-zh-CN-390-dark-after.jpg) |
| 食谱 · 特色菜 | 0 → 0 | ![](./mc-zh-CN-390-light-before.jpg) | ![](./mc-zh-CN-390-light-after.jpg) | ![](./mc-zh-CN-390-dark-after.jpg) |
| 食谱 · 进度一览 | 14 → 13 | ![](./progress-zh-CN-390-light-before.jpg) | ![](./progress-zh-CN-390-light-after.jpg) | ![](./progress-zh-CN-390-dark-after.jpg) |
| 厨具 · 宝石 | 0 → 0 | ![](./gem-zh-CN-390-light-before.jpg) | ![](./gem-zh-CN-390-light-after.jpg) | ![](./gem-zh-CN-390-dark-after.jpg) |
| 银行 · 基金 | 3 → 3 | ![](./bank-fund-zh-CN-390-light-before.jpg) | ![](./bank-fund-zh-CN-390-light-after.jpg) | ![](./bank-fund-zh-CN-390-dark-after.jpg) |
| 银行 · 理财 | 0 → 0 | ![](./bank-wealth-zh-CN-390-light-before.jpg) | ![](./bank-wealth-zh-CN-390-light-after.jpg) | ![](./bank-wealth-zh-CN-390-dark-after.jpg) |
| 小镇 | 13 → 11 | ![](./map-zh-CN-390-light-before.jpg) | ![](./map-zh-CN-390-light-after.jpg) | ![](./map-zh-CN-390-dark-after.jpg) |
| 协会 | 0 → 0 | ![](./society-zh-CN-390-light-before.jpg) | ![](./society-zh-CN-390-light-after.jpg) | ![](./society-zh-CN-390-dark-after.jpg) |
| 兑换码 | 0 → 5 | ![](./redeem-zh-CN-390-light-before.jpg) | ![](./redeem-zh-CN-390-light-after.jpg) | ![](./redeem-zh-CN-390-dark-after.jpg) |
| 邮箱 | 0 → 0 | ![](./mail-zh-CN-390-light-before.jpg) | ![](./mail-zh-CN-390-light-after.jpg) | ![](./mail-zh-CN-390-dark-after.jpg) |
| 广场 · 排行 | 9 → 9 | ![](./rank-zh-CN-390-light-before.jpg) | ![](./rank-zh-CN-390-light-after.jpg) | ![](./rank-zh-CN-390-dark-after.jpg) |
| 交易所 | 0 → 0 | ![](./exchange-zh-CN-390-light-before.jpg) | ![](./exchange-zh-CN-390-light-after.jpg) | ![](./exchange-zh-CN-390-dark-after.jpg) |
| 酒吧 | 1 → 1 | ![](./bar-zh-CN-390-light-before.jpg) | ![](./bar-zh-CN-390-light-after.jpg) | ![](./bar-zh-CN-390-dark-after.jpg) |
| 一番赏 | 7 → 7 | ![](./kuji-zh-CN-390-light-before.jpg) | ![](./kuji-zh-CN-390-light-after.jpg) | ![](./kuji-zh-CN-390-dark-after.jpg) |

## 法文、英文 360px

| 页面 | 法文 行数 | 法文 改前 | 法文 改后 | 英文 行数 | 英文 改前 | 英文 改后 |
|---|---|---|---|---|---|---|
| 任务 · 今日 | 6 → 4 | ![](./tasks-today-fr-360-light-before.jpg) | ![](./tasks-today-fr-360-light-after.jpg) | 6 → 6 | ![](./tasks-today-en-360-light-before.jpg) | ![](./tasks-today-en-360-light-after.jpg) |
| 食谱 | 6 → 5 | ![](./cookbooks-fr-360-light-before.jpg) | ![](./cookbooks-fr-360-light-after.jpg) | 6 → 6 | ![](./cookbooks-en-360-light-before.jpg) | ![](./cookbooks-en-360-light-after.jpg) |
| 银行 · 基金 | 2 → 2 | ![](./bank-fund-fr-360-light-before.jpg) | ![](./bank-fund-fr-360-light-after.jpg) | 2 → 2 | ![](./bank-fund-en-360-light-before.jpg) | ![](./bank-fund-en-360-light-after.jpg) |
| 兑换码 | 0 → 5 | ![](./redeem-fr-360-light-before.jpg) | ![](./redeem-fr-360-light-after.jpg) | 0 → 5 | ![](./redeem-en-360-light-before.jpg) | ![](./redeem-en-360-light-after.jpg) |
| 广场 · 排行 | 5 → 6 | ![](./rank-fr-360-light-before.jpg) | ![](./rank-fr-360-light-after.jpg) | 6 → 7 | ![](./rank-en-360-light-before.jpg) | ![](./rank-en-360-light-after.jpg) |
| 酒吧 | 1 → 1 | ![](./bar-fr-360-light-before.jpg) | ![](./bar-fr-360-light-after.jpg) | 1 → 1 | ![](./bar-en-360-light-before.jpg) | ![](./bar-en-360-light-after.jpg) |

# 界面改版 P4 改前改后截图

- 日期：2026-10-11
- 改前：main（#263 合并后）；改后：feat/ui-p4。首屏（不是整页），底部导航以上。
- 简中 390px 浅色、深色；法文、英文 360px 浅色（测试号的语言临时切过去，截完切回简中）。
- 首屏行数：列表行、紧凑行、表格行、橱柜格子、品级行、特色菜行，底部导航以上完整露出的才算。
- 所有页面横向溢出都是 0。
- 开发环境的 API 用的还是旧配置（目录里没有食材类别），截图时按 foods.json 把类别补进目录接口的返回，才看得到食材图；正式环境由新配置直接带上。
- 菜场改前是“0”：原来的行不是 .dt-item，不算；改后日常 6 行 + 特价 2 行，和改前首屏露出的一样多。
- 食谱详情改前是表格行（8），改后是品级行（7），首屏多了一行学习按钮的高度。
- 特色菜、冰箱、道具流水这个测试号是空的，改后显示空状态。
- 橱柜选中一格后的卡片：[浅色](./picked-zh-CN-390-light-after.jpg)、[深色](./picked-zh-CN-390-dark-after.jpg)。

## 简中 390px

| 页面 | 首屏行数 改前 → 改后 | 浅色 改前 | 浅色 改后 | 深色 改后 |
|---|---|---|---|---|
| 食谱 | 8 → 9 | ![](./cb-zh-CN-390-light-before.jpg) | ![](./cb-zh-CN-390-light-after.jpg) | ![](./cb-zh-CN-390-dark-after.jpg) |
| 特色菜 | 0 → 0 | ![](./mc-zh-CN-390-light-before.jpg) | ![](./mc-zh-CN-390-light-after.jpg) | ![](./mc-zh-CN-390-dark-after.jpg) |
| 进度一览 | 13 → 13 | ![](./progress-zh-CN-390-light-before.jpg) | ![](./progress-zh-CN-390-light-after.jpg) | ![](./progress-zh-CN-390-dark-after.jpg) |
| 食谱详情 | 8 → 7 | ![](./cbinfo-zh-CN-390-light-before.jpg) | ![](./cbinfo-zh-CN-390-light-after.jpg) | ![](./cbinfo-zh-CN-390-dark-after.jpg) |
| 橱柜 · 常温 | 11 → 11 | ![](./cupboard-zh-CN-390-light-before.jpg) | ![](./cupboard-zh-CN-390-light-after.jpg) | ![](./cupboard-zh-CN-390-dark-after.jpg) |
| 橱柜 · 冰箱 | 0 → 0 | ![](./fridge-zh-CN-390-light-before.jpg) | ![](./fridge-zh-CN-390-light-after.jpg) | ![](./fridge-zh-CN-390-dark-after.jpg) |
| 菜场 | 0 → 8 | ![](./market-zh-CN-390-light-before.jpg) | ![](./market-zh-CN-390-light-after.jpg) | ![](./market-zh-CN-390-dark-after.jpg) |
| 仓库 · 道具 | 4 → 4 | ![](./store-zh-CN-390-light-before.jpg) | ![](./store-zh-CN-390-light-after.jpg) | ![](./store-zh-CN-390-dark-after.jpg) |
| 仓库 · 道具流水 | 0 → 0 | ![](./records-zh-CN-390-light-before.jpg) | ![](./records-zh-CN-390-light-after.jpg) | ![](./records-zh-CN-390-dark-after.jpg) |

## 法文、英文 360px

| 页面 | 法文 行数 | 法文 改前 | 法文 改后 | 英文 行数 | 英文 改前 | 英文 改后 |
|---|---|---|---|---|---|---|
| 食谱 | 5 → 6 | ![](./cb-fr-360-light-before.jpg) | ![](./cb-fr-360-light-after.jpg) | 6 → 6 | ![](./cb-en-360-light-before.jpg) | ![](./cb-en-360-light-after.jpg) |
| 特色菜 | 0 → 0 | ![](./mc-fr-360-light-before.jpg) | ![](./mc-fr-360-light-after.jpg) | 0 → 0 | ![](./mc-en-360-light-before.jpg) | ![](./mc-en-360-light-after.jpg) |
| 食谱详情 | 8 → 7 | ![](./cbinfo-fr-360-light-before.jpg) | ![](./cbinfo-fr-360-light-after.jpg) | 8 → 7 | ![](./cbinfo-en-360-light-before.jpg) | ![](./cbinfo-en-360-light-after.jpg) |
| 橱柜 · 常温 | 11 → 11 | ![](./cupboard-fr-360-light-before.jpg) | ![](./cupboard-fr-360-light-after.jpg) | 11 → 11 | ![](./cupboard-en-360-light-before.jpg) | ![](./cupboard-en-360-light-after.jpg) |
| 菜场 | 0 → 5 | ![](./market-fr-360-light-before.jpg) | ![](./market-fr-360-light-after.jpg) | 0 → 6 | ![](./market-en-360-light-before.jpg) | ![](./market-en-360-light-after.jpg) |
| 仓库 · 道具 | 4 → 4 | ![](./store-fr-360-light-before.jpg) | ![](./store-fr-360-light-after.jpg) | 4 → 4 | ![](./store-en-360-light-before.jpg) | ![](./store-en-360-light-after.jpg) |

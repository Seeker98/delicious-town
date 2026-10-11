# 界面改版 P3 改前改后截图

- 日期：2026-10-11
- 改前：main（#262 合并后）；改后：feat/ui-p3。首屏（不是整页），底部导航以上。
- 简中 390px 浅色、深色；法文、英文 360px 浅色（测试号的语言临时切过去，截完切回简中）。
- 首屏行数：列表行、紧凑行、待办行、表格行、导航行、键值行、活跃格子、餐桌格子、任务行，底部导航以上完整露出的才算。
- 所有页面横向溢出都是 0（第一轮截图时法文餐厅信息溢出 4px，改成成对排后修好）。
- 首页的计数没变（3 → 3），但头图比原来的第一行高，首屏大约少 57px，略多于一行；这是定好的 72px 头图带来的，记在 backlog。
- 餐厅信息改前是“0”：原来属性、容量是普通的格子，不算行；改后是键值行，按规则计入。
- 确认面板打开时的样子：[浅色](./confirm-zh-CN-390-light-after.jpg)、[深色](./confirm-zh-CN-390-dark-after.jpg)（装扮页点“购买”，没有真的买）。
- 门的图形：开发环境的 API 用的还是旧配置（目录里没有门的图形名），截图里的头图都是木门。

## 简中 390px

| 页面 | 首屏行数 改前 → 改后 | 浅色 改前 | 浅色 改后 | 深色 改后 |
|---|---|---|---|---|
| 首页 | 3 → 3 | ![](./home-zh-CN-390-light-before.jpg) | ![](./home-zh-CN-390-light-after.jpg) | ![](./home-zh-CN-390-dark-after.jpg) |
| 楼层 | 12 → 12 | ![](./floor-zh-CN-390-light-before.jpg) | ![](./floor-zh-CN-390-light-after.jpg) | ![](./floor-zh-CN-390-dark-after.jpg) |
| 收益记录 | 18 → 18 | ![](./income-zh-CN-390-light-before.jpg) | ![](./income-zh-CN-390-light-after.jpg) | ![](./income-zh-CN-390-dark-after.jpg) |
| 餐厅信息 | 0 → 8 | ![](./info-zh-CN-390-light-before.jpg) | ![](./info-zh-CN-390-light-after.jpg) | ![](./info-zh-CN-390-dark-after.jpg) |
| 装扮和称号 | 1 → 1 | ![](./look-zh-CN-390-light-before.jpg) | ![](./look-zh-CN-390-light-after.jpg) | ![](./look-zh-CN-390-dark-after.jpg) |
| 厨具 | 7 → 7 | ![](./equip-zh-CN-390-light-before.jpg) | ![](./equip-zh-CN-390-light-after.jpg) | ![](./equip-zh-CN-390-dark-after.jpg) |
| 厨具 · 宝石 | 0 → 0 | ![](./gem-zh-CN-390-light-before.jpg) | ![](./gem-zh-CN-390-light-after.jpg) | ![](./gem-zh-CN-390-dark-after.jpg) |
| 任务 · 今日 | 10 → 10 | ![](./tasks-today-zh-CN-390-light-before.jpg) | ![](./tasks-today-zh-CN-390-light-after.jpg) | ![](./tasks-today-zh-CN-390-dark-after.jpg) |
| 任务 · 主线 | 6 → 6 | ![](./tasks-main-zh-CN-390-light-before.jpg) | ![](./tasks-main-zh-CN-390-light-after.jpg) | ![](./tasks-main-zh-CN-390-dark-after.jpg) |
| 活动 | 0 → 0 | ![](./activities-zh-CN-390-light-before.jpg) | ![](./activities-zh-CN-390-light-after.jpg) | ![](./activities-zh-CN-390-dark-after.jpg) |

## 法文、英文 360px

| 页面 | 法文 行数 | 法文 改前 | 法文 改后 | 英文 行数 | 英文 改前 | 英文 改后 |
|---|---|---|---|---|---|---|
| 首页 | 3 → 3 | ![](./home-fr-360-light-before.jpg) | ![](./home-fr-360-light-after.jpg) | 3 → 3 | ![](./home-en-360-light-before.jpg) | ![](./home-en-360-light-after.jpg) |
| 餐厅信息 | 0 → 8 | ![](./info-fr-360-light-before.jpg) | ![](./info-fr-360-light-after.jpg) | 0 → 8 | ![](./info-en-360-light-before.jpg) | ![](./info-en-360-light-after.jpg) |
| 装扮和称号 | 0 → 0 | ![](./look-fr-360-light-before.jpg) | ![](./look-fr-360-light-after.jpg) | 0 → 0 | ![](./look-en-360-light-before.jpg) | ![](./look-en-360-light-after.jpg) |
| 厨具 | 7 → 7 | ![](./equip-fr-360-light-before.jpg) | ![](./equip-fr-360-light-after.jpg) | 7 → 7 | ![](./equip-en-360-light-before.jpg) | ![](./equip-en-360-light-after.jpg) |
| 任务 · 主线 | 6 → 6 | ![](./tasks-main-fr-360-light-before.jpg) | ![](./tasks-main-fr-360-light-after.jpg) | 6 → 6 | ![](./tasks-main-en-360-light-before.jpg) | ![](./tasks-main-en-360-light-after.jpg) |
| 活动 | 0 → 0 | ![](./activities-fr-360-light-before.jpg) | ![](./activities-fr-360-light-after.jpg) | 0 → 0 | ![](./activities-en-360-light-before.jpg) | ![](./activities-en-360-light-after.jpg) |

# 界面改版 P5 首页（新方向）改前改后截图

- 日期：2026-10-11
- 改前：main（#264 合并后）；改后：feat/ui-p5。首屏（不是整页），底部导航以上。
- 按新方向（设计 §1.1）验收：不再比首屏行数，看主角在不在首屏。首页的主角是营业状态和加油按钮，所有截图里加油按钮都完整在首屏。
- 两种状态：停业（测试号现状：油用光了）；营业（截图时拦截概况接口，改成营业、油 64%）。
- 简中 390px 浅色、深色；法文、英文、西文 360px 浅色（测试号的语言临时切过去，每张截完切回简中）。
- 所有截图横向溢出都是 0。第一轮西文 360px 头图左上的“街道 · 星级 · 天气”压在右上的“切换区服”上，改成同一个弹性行、左边截断后修好。
- 开发环境的 API 用的还是旧配置（目录里没有门的图形名），截图里的门都是木门。

## 简中 390px

| 状态 | 浅色 改前 | 浅色 改后 | 深色 改后 |
|---|---|---|---|
| 停业 | ![](./home-closed-zh-CN-390-light-before.jpg) | ![](./home-closed-zh-CN-390-light-after.jpg) | ![](./home-closed-zh-CN-390-dark-after.jpg) |
| 营业 | ![](./home-open-zh-CN-390-light-before.jpg) | ![](./home-open-zh-CN-390-light-after.jpg) | ![](./home-open-zh-CN-390-dark-after.jpg) |

## 外文 360px（停业）

| 语言 | 改前 | 改后 |
|---|---|---|
| 法文 | ![](./home-closed-fr-360-light-before.jpg) | ![](./home-closed-fr-360-light-after.jpg) |
| 英文 | ![](./home-closed-en-360-light-before.jpg) | ![](./home-closed-en-360-light-after.jpg) |
| 西文 | ![](./home-closed-es-360-light-before.jpg) | ![](./home-closed-es-360-light-after.jpg) |

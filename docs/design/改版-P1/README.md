# 界面改版 P1 改前改后截图

- 日期：2026-10-11
- 改前：main（#259 合并后）；改后：feat/ui-redesign。宽度 390px，简中，首屏（不是整页）。改前的“深色”是同一个页面在系统深色下的样子（改前不支持深色，仍是浅色）。
- 自动检查：所有页面没有横向滚动；首屏能看到的列表行数（列表行、紧凑行、待办行、表格行）改前改后完全相同（首页 3、食谱 10、酒吧 1、账号 1，其余页面的内容不是这几种行）。P1 不动布局，符合预期。
- 法文 360px 没有截成：语言跟着账号走，本地存储改不了，截出来仍是简中。P1 没有改文字排版，法文溢出留到 P2 改布局时一起截。

| 页面 | 模式 | 改前 | 改后 |
|---|---|---|---|
| 首页 | 浅色 | ![](./home-zh-CN-390-light-before.jpg) | ![](./home-zh-CN-390-light-after.jpg) |
| 首页 | 深色 | ![](./home-zh-CN-390-dark-before.jpg) | ![](./home-zh-CN-390-dark-after.jpg) |
| 食谱 | 浅色 | ![](./cookbooks-zh-CN-390-light-before.jpg) | ![](./cookbooks-zh-CN-390-light-after.jpg) |
| 食谱 | 深色 | ![](./cookbooks-zh-CN-390-dark-before.jpg) | ![](./cookbooks-zh-CN-390-dark-after.jpg) |
| 橱柜 | 浅色 | ![](./cupboard-zh-CN-390-light-before.jpg) | ![](./cupboard-zh-CN-390-light-after.jpg) |
| 橱柜 | 深色 | ![](./cupboard-zh-CN-390-dark-before.jpg) | ![](./cupboard-zh-CN-390-dark-after.jpg) |
| 交易所·现货 | 浅色 | ![](./exchange-zh-CN-390-light-before.jpg) | ![](./exchange-zh-CN-390-light-after.jpg) |
| 交易所·现货 | 深色 | ![](./exchange-zh-CN-390-dark-before.jpg) | ![](./exchange-zh-CN-390-dark-after.jpg) |
| 交易所·期货 | 浅色 | ![](./futures-zh-CN-390-light-before.jpg) | ![](./futures-zh-CN-390-light-after.jpg) |
| 交易所·期货 | 深色 | ![](./futures-zh-CN-390-dark-before.jpg) | ![](./futures-zh-CN-390-dark-after.jpg) |
| 酒吧 | 浅色 | ![](./bar-zh-CN-390-light-before.jpg) | ![](./bar-zh-CN-390-light-after.jpg) |
| 酒吧 | 深色 | ![](./bar-zh-CN-390-dark-before.jpg) | ![](./bar-zh-CN-390-dark-after.jpg) |
| 神殿 | 浅色 | ![](./temple-zh-CN-390-light-before.jpg) | ![](./temple-zh-CN-390-light-after.jpg) |
| 神殿 | 深色 | ![](./temple-zh-CN-390-dark-before.jpg) | ![](./temple-zh-CN-390-dark-after.jpg) |
| 我的账号 | 浅色 | ![](./account-zh-CN-390-light-before.jpg) | ![](./account-zh-CN-390-light-after.jpg) |
| 我的账号 | 深色 | ![](./account-zh-CN-390-dark-before.jpg) | ![](./account-zh-CN-390-dark-after.jpg) |
| 游戏资料 | 浅色 | ![](./wiki-zh-CN-390-light-before.jpg) | ![](./wiki-zh-CN-390-light-after.jpg) |
| 游戏资料 | 深色 | ![](./wiki-zh-CN-390-dark-before.jpg) | ![](./wiki-zh-CN-390-dark-after.jpg) |

## 看到的问题（留给后面的批次）

- 食谱页的街道筛选还是按钮组（实心紫 + 浅紫），P4 改成胶囊。
- 橱柜方块是按钮，现在跟着按钮变成 16px 圆角；“一级万能食材 ×3”这种名字和数量挤在一起，P4 改。
- 首页的“签到”等本页操作还是紫色文字，P2/P3 改成胶囊按钮。

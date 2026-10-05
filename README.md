# 美味小镇：重生

> 感谢原作者提供了部分核心功能的代码。原作者正在运营的在线美食小镇：<http://antchensw.cn/town>

完整重写的 QQ 家园美味小镇。翻、添、合，打蟑螂，升星，特色菜，神殿……原版玩法一个不少。

**开始游玩：<https://game.delicious.trade/>**

## 游戏简介

本版新加的系统：

- **一番赏**：分档抽奖，有最后赏和月度主题
- **事件竞猜**：给“会不会发生”下注，赔率实时浮动
- **食材交易所**：玩家之间挂单买卖食材，带防作弊风控
- **小镇发展基金**：存银币，到期领回本金，另得经验勋章和专属个性图标

更大的小镇：

- 15 条外国街（日本、法国、意大利、美国、泰国……），外加隐藏的杂碎街
- 酒吧 7 种小游戏：划拳、猜酒杯、转数字、老虎机、魔鬼辣杯、记忆调酒、飞镖
- 稀缺食材更容易凑齐，还原了卡菜
- 邀请好友有奖，好友升级你也有奖励

另外：

- 游戏资料库不登录也能查，静态数据有开放接口
- 支持简体中文、繁体中文、English、Español、Français
- 代码开源，欢迎 star

## 技术栈

TypeScript 全栈：`packages/shared`（公共公式与接口）、`packages/config`（游戏配置）、`apps/server`（Fastify）、`apps/web`（Vue 3）。

## 开发

需要 Node 22+、pnpm 10、Docker Desktop。

```bash
pnpm install
pnpm infra:dev                                   # 本地 PostgreSQL、Redis、Mailpit
pnpm --filter @dt/config build                   # 生成配置包
pnpm --filter @dt/server migrate:dev
pnpm --filter @dt/server shard ensure --id 1 --name 一服
pnpm dev                                         # 一起启动 API(:3000)、worker、网页(:5173)
pnpm --filter @dt/server account role <用户名> admin   # 把自己设为管理员，后台在 http://localhost:5173/admin
```

打开 http://localhost:5173 注册、验证邮箱、开店。开发环境的邮件在 http://localhost:8025 查看。

worker 负责每 4 分钟的结算和体力、老鼠、天气、菜场等周期任务，**不启动 worker 餐厅不会有收益**。单独启动：`pnpm --filter @dt/server dev`（API）、`pnpm --filter @dt/server worker:dev`（worker）、`pnpm --filter @dt/web dev`（网页）。开发环境开启了测试接口，`POST /api/v1/test/tick`（需要登录，body `{"minutes": 4}`）可以把游戏时间往前推进，API 和 worker 共用这个偏移（存在 Redis 里，重启不回退）。

## 数值模拟器

需要先 `pnpm infra:dev` 和 `pnpm --filter @dt/config build`。模拟器在开发库里新建一次性的 `dt_sim` / `dt_sim_bench` 库，用 Redis 的 15 号库，不影响开发数据。

```bash
pnpm sim --days 30 --bots 3                  # 成长与经济，报告在 sim-out/<时间>/report.html
pnpm sim --days 30 --tuning my.json --compare sim-out/<上次的目录>   # 改参数后对比
pnpm sim:explain --state apps/server/src/sim/examples/star3.json --rounds 3   # 单店收益分解
pnpm sim:bench --restaurants 5000            # 结算压测（要求一轮 ≤ 30 秒）
```

`--tuning` 文件的格式与区服覆盖配置里的 `tuning` 一节相同，只写要改的字段。

## 测试

```bash
pnpm infra:test && pnpm test                     # 单元 + 集成测试
pnpm infra:dev && pnpm --filter @dt/web e2e      # 端到端验收
```

## 文档

- 设计：`docs/superpowers/specs/`
- 部署：`docs/deploy.md`
- 游戏规则：`../analysis/spec/`

## 致谢

本项目参考了原作者的美味小镇，部分核心功能（结算、菜场、厨具等玩法的规则与数值）来自原作者提供的代码。原作者正在运营的在线版本：<http://antchensw.cn/town>，欢迎去玩。

## 许可

本项目以 [GNU Affero 通用公共许可证第 3 版或更新版本](LICENSE)（`AGPL-3.0-or-later`）发布。

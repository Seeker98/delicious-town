# 美味小镇（重写版）

TypeScript 全栈：`packages/shared`（公共公式与接口）、`packages/config`（游戏配置）、`apps/server`（Fastify）、`apps/web`（Vue 3）。

## 开发

需要 Node 22+、pnpm 10、Docker Desktop。

```bash
pnpm install
pnpm infra:dev                                   # 本地 PostgreSQL、Redis、Mailpit
pnpm --filter @dt/config build                   # 生成配置包
pnpm --filter @dt/server migrate:dev
pnpm --filter @dt/server shard ensure --id 1 --name 一服
pnpm --filter @dt/server dev                     # http://localhost:3000
pnpm --filter @dt/web dev                        # http://localhost:5173
```

开发环境的邮件在 http://localhost:8025 查看。

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

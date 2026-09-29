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

## 测试

```bash
pnpm infra:test && pnpm test                     # 单元 + 集成测试
pnpm infra:dev && pnpm --filter @dt/web e2e      # 端到端验收
```

## 文档

- 设计：`docs/superpowers/specs/`
- 部署：`docs/deploy.md`
- 游戏规则：`../analysis/spec/`

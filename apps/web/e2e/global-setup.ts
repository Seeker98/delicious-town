import { execSync } from 'node:child_process';

/** 需要先 `pnpm infra:dev`。迁移和建区服都是幂等的，可以反复运行 */
export default function globalSetup(): void {
  const run = (cmd: string) => execSync(cmd, { stdio: 'inherit' });
  run('pnpm --filter @dt/config build');
  run('pnpm --filter @dt/server migrate:dev');
  run('pnpm --filter @dt/server shard ensure --id 1 --name 一服');
  run('pnpm --filter @dt/server shard ensure --id 2 --name 二服');
}

import { resolve } from 'node:path';

/**
 * 命令行传入的相对路径按用户执行 pnpm 的目录解析：pnpm --filter 会把工作目录切到 apps/server，
 * 原来的目录保存在 INIT_CWD
 */
export function fromInvocation(p: string, env: Record<string, string | undefined> = process.env): string {
  return resolve(env.INIT_CWD ?? process.cwd(), p);
}

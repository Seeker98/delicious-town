import type { AccountRole } from '@dt/shared';
import { registerUser, type TestContext } from './helpers';

/** 注册一个用户并直接在库里设好角色 */
export async function userWithRole(
  ctx: TestContext,
  role: AccountRole,
): Promise<{ cookie: string; accountId: number; username: string }> {
  const u = await registerUser(ctx.app);
  await ctx.deps.db.updateTable('account').set({ role }).where('id', '=', u.accountId).execute();
  return { cookie: u.cookie, accountId: u.accountId, username: u.username };
}

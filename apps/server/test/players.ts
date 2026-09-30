import { uniqueName } from './fixtures';
import { call, registerUser, type TestContext } from './helpers';

/** 注册 → （可选）验证邮箱 → 选区服 → 开店，走真实接口 */
export async function playerIn(
  ctx: TestContext,
  shardId: number,
  opts: { verified?: boolean } = {},
): Promise<{ cookie: string; accountId: number; restId: number }> {
  const u = await registerUser(ctx.app);
  if (opts.verified !== false) {
    await ctx.deps.db
      .updateTable('account')
      .set({ email_verified_at: new Date() })
      .where('id', '=', u.accountId)
      .execute();
  }
  await call(ctx.app, 'POST', '/api/v1/shard/select', { cookie: u.cookie, body: { shardId } });
  const r = await call(ctx.app, 'POST', '/api/v1/restaurant/create', {
    cookie: u.cookie,
    body: { name: uniqueName('r') },
  });
  if (r.status !== 200) throw new Error(`open restaurant failed: ${r.res.body}`);
  return { cookie: u.cookie, accountId: u.accountId, restId: r.json.data.id as number };
}

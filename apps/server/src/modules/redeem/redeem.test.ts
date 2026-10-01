import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAccountRow, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { randomCode } from './code';

let t: TestGame;
let actor: number;
beforeAll(async () => {
  t = await createTestGame();
  actor = await createAccountRow(t.db);
});
afterAll(() => t.close());

const H = 3_600_000;
async function code(patch: Record<string, unknown> = {}): Promise<string> {
  const c = randomCode();
  await t.db
    .insertInto('redeem_code')
    .values({
      code: c,
      kind: 'shared',
      items: JSON.stringify({ coin: 100 }),
      note: '',
      actor_account_id: actor,
      ...patch,
    })
    .execute();
  return c;
}
const redeem = (ctx: Parameters<TestGame['game']['redeem']['redeem']>[0], c: string) =>
  t.game.redeem.redeem(ctx, c);

describe('兑换（设计 裁定 13~17）', () => {
  it('随机码 10 位，不含 0/O/1/I', () => {
    for (let i = 0; i < 50; i++) expect(randomCode()).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
  });

  it('通用码：当场到账，记流水和日志；同一家店第二次报已用过；别的店能用', async () => {
    const c = await code();
    const a = await newRestaurant(t, { patch: { coin: 0 } });
    const b = await newRestaurant(t, { patch: { coin: 0 } });
    expect((await redeem(a, c.toLowerCase())).data).toEqual({ code: c, items: { coin: 100 } });
    expect((await restRow(t, a.restaurantId)).coin).toBe(100);
    await expect(redeem(a, c)).rejects.toMatchObject({ params: { reason: 'code_used' } });
    await redeem(b, c);
    const log = await t.db
      .selectFrom('rest_log')
      .select('params')
      .where('rest_id', '=', a.restaurantId)
      .where('type', '=', 'redeem')
      .executeTakeFirstOrThrow();
    expect(log.params).toMatchObject({ code: c });
  });

  it('各种失败原因', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { level: 5 } });
    const now = t.clock.now.getTime();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ disabled_at: new Date() }, 'code_disabled'],
      [{ starts_at: new Date(now + H) }, 'code_not_started'],
      [{ ends_at: new Date(now - H) }, 'code_expired'],
      [{ shard_id: await createShard(t.db) }, 'code_wrong_shard'],
      [{ min_level: 10 }, 'code_level'],
    ];
    for (const [patch, reason] of cases)
      await expect(redeem(r, await code(patch))).rejects.toMatchObject({ params: { reason } });
    await expect(redeem(r, 'NOSUCHCODE')).rejects.toMatchObject({ params: { reason: 'code_not_found' } });
  });

  it('总次数用完报 code_used_up；一次性码只能用一次；并发不超发（Review Focus 1）', async () => {
    const c = await code({ max_uses: 1 });
    const rs = await Promise.all([1, 2, 3].map(() => newRestaurant(t)));
    const results = await Promise.allSettled(rs.map((r) => redeem(r, c)));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const row = await t.db
      .selectFrom('redeem_code')
      .select('used_count')
      .where('code', '=', c)
      .executeTakeFirstOrThrow();
    expect(row.used_count).toBe(1);
    const same = await newRestaurant(t);
    const c2 = await code();
    const twice = await Promise.allSettled([redeem(same, c2), redeem(same, c2)]);
    expect(twice.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  });

  it('同一账号连续输错 10 次后锁定，输对也先报 too_many_tries；有效码的失败不计数（Review Focus 2）', async () => {
    const r = await newRestaurant(t);
    const expired = await code({ ends_at: new Date(t.clock.now.getTime() - H) });
    for (let i = 0; i < 12; i++)
      await expect(redeem(r, expired)).rejects.toMatchObject({ params: { reason: 'code_expired' } });
    for (let i = 0; i < 10; i++)
      await expect(redeem(r, `WRONG${i}XX`)).rejects.toMatchObject({ params: { reason: 'code_not_found' } });
    await expect(redeem(r, await code())).rejects.toMatchObject({ params: { reason: 'too_many_tries' } });
  });

  it('关掉 redeem 开关时返回 FEATURE_DISABLED', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { redeem: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = await newRestaurant(t, { shardId });
    await expect(redeem(r, await code())).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });
});

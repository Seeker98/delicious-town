import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { gameDay } from '@dt/shared';
import { createRestaurantFull, createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { setTuning } from '../../../test/town';
import { scanInvites } from './scan';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = { error: vi.fn() };
const invite = (invitee: number, inviter: number) =>
  t.db.updateTable('account').set({ invited_by: inviter }).where('id', '=', invitee).execute();
const verify = (accountId: number) =>
  t.db.updateTable('account').set({ email_verified_at: new Date() }).where('id', '=', accountId).execute();
const mails = (restId: number) =>
  t.db
    .selectFrom('mail')
    .select(['title', 'items', 'tpl', 'tpl_params'])
    .where('rest_id', '=', restId)
    .where('source', '=', 'invite')
    .execute();
const reward = (invitee: number, stage: string) =>
  t.db
    .selectFrom('invite_reward')
    .selectAll()
    .where('invitee_account_id', '=', invitee)
    .where('stage', '=', stage as 'lv10')
    .executeTakeFirst();

describe('邀请扫描（设计 §7）', () => {
  it('新手礼包只发一次，发到被邀请人最先开的店', async () => {
    const shardId = await createShard(t.db);
    const inviter = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    await invite(b.accountId, inviter.accountId);
    expect((await scanInvites(t.game, log, shardId)).newbie).toBe(1);
    expect((await scanInvites(t.game, log, shardId)).newbie).toBe(0);
    expect((await mails(b.restaurantId)).map((m) => m.title)).toEqual(['欢迎来到小镇']);
    // 系统邮件存模板键，前端按语言显示（问题记录 272）
    expect((await mails(b.restaurantId))[0]).toMatchObject({ tpl: 'invite.welcome' });
  });

  it('10 级、30 级：要验证邮箱；先升级后验证时补发；奖励发到邀请人同区服的店', async () => {
    const shardId = await createShard(t.db);
    const inviter = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId, patch: { level: 30 } });
    await invite(b.accountId, inviter.accountId);
    await scanInvites(t.game, log, shardId);
    expect(await reward(b.accountId, 'lv10')).toBeUndefined();
    await verify(b.accountId);
    const r = await scanInvites(t.game, log, shardId);
    expect(r.sent).toBe(2);
    expect((await mails(inviter.restaurantId)).map((m) => m.title)).toEqual(['邀请奖励', '邀请奖励']);
    expect((await mails(inviter.restaurantId)).map((m) => [m.tpl, m.tpl_params])).toEqual([
      ['invite.reward', { rest: expect.any(String), level: 10 }],
      ['invite.reward', { rest: expect.any(String), level: 30 }],
    ]);
    expect(await reward(b.accountId, 'lv30')).toMatchObject({
      status: 'sent',
      month: gameDay(t.clock.now).slice(0, 7),
    });
  });

  it('邀请人在该区服没店：记待发；开店后的下一次扫描补发（Review Focus 4）', async () => {
    const shardId = await createShard(t.db);
    const inviterHome = await newRestaurant(t);
    const b = await newRestaurant(t, { shardId, patch: { level: 10 } });
    await invite(b.accountId, inviterHome.accountId);
    await verify(b.accountId);
    expect((await scanInvites(t.game, log, shardId)).pending).toBe(1);
    expect(await reward(b.accountId, 'lv10')).toMatchObject({ status: 'pending' });
    const thereId = await createRestaurantFull(t.db, shardId, inviterHome.accountId);
    expect((await scanInvites(t.game, log, shardId)).sent).toBe(1);
    expect(await mails(thereId)).toHaveLength(1);
  });

  it('每月上限：同一被邀请人两档只计 1 人，第 21 人记 capped（Review Focus 3）', async () => {
    const shardId = await createShard(t.db);
    const inviter = await newRestaurant(t, { shardId });
    const friends = [];
    for (let i = 0; i < 21; i++) {
      const f = await newRestaurant(t, { shardId, patch: { level: 30 }, verified: true });
      await invite(f.accountId, inviter.accountId);
      friends.push(f);
    }
    await scanInvites(t.game, log, shardId);
    const statuses = await t.db
      .selectFrom('invite_reward')
      .select(['invitee_account_id', 'stage', 'status'])
      .where('inviter_account_id', '=', inviter.accountId)
      .execute();
    expect(statuses.filter((s) => s.status === 'sent')).toHaveLength(40);
    expect(statuses.filter((s) => s.status === 'capped')).toHaveLength(2);
    expect(new Set(statuses.filter((s) => s.status === 'capped').map((s) => s.invitee_account_id)).size).toBe(
      1,
    );
  });
});

describe('backlog 邀请：跨月重新计数', () => {
  it('上个月已经计满，下个月的新被邀请人照常发奖', async () => {
    const shardId = await createShard(t.db);
    await setTuning(t, shardId, { invite: { monthlyCap: 1 } });
    const inviter = await newRestaurant(t, { shardId });
    const friend = async () => {
      const f = await newRestaurant(t, { shardId, patch: { level: 10 }, verified: true });
      await invite(f.accountId, inviter.accountId);
      return f;
    };
    const back = t.clock.now;
    try {
      const a = await friend();
      const b = await friend();
      await scanInvites(t.game, log, shardId);
      const statusOf = async (f: { accountId: number }) => (await reward(f.accountId, 'lv10'))?.status;
      // 本月上限 1：先扫到的发，另一个记 capped（哪一个先扫到不固定）
      expect([await statusOf(a), await statusOf(b)].sort()).toEqual(['capped', 'sent']);
      const month = gameDay(t.clock.now).slice(0, 7);
      t.clock.set(new Date(t.clock.now.getTime() + 32 * 86_400_000));
      expect(gameDay(t.clock.now).slice(0, 7)).not.toBe(month);
      const c = await friend();
      await scanInvites(t.game, log, shardId);
      expect(await reward(c.accountId, 'lv10')).toMatchObject({
        status: 'sent',
        month: gameDay(t.clock.now).slice(0, 7),
      });
    } finally {
      t.clock.set(back);
    }
  });
});

describe('邀请好友页', () => {
  it('邀请码生成一次后不变；列出被邀请人和各档状态、本月已计人数', async () => {
    const shardId = await createShard(t.db);
    const me = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId, patch: { level: 12 }, verified: true });
    await invite(b.accountId, me.accountId);
    await scanInvites(t.game, log, shardId);
    const first = await t.game.invite.overview(me);
    expect(first.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect((await t.game.invite.overview(me)).code).toBe(first.code);
    expect(first.monthCount).toBe(1);
    expect(first.monthlyCap).toBe(20);
    expect(first.invitees).toEqual([
      expect.objectContaining({ level: 12, verified: true, lv10: 'sent', lv30: null }),
    ]);
  });
});

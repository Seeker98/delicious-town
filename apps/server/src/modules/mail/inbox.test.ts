import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { SPONSOR_HATS } from '@dt/config';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { sendMail } from './send';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const mailSvc = () => t.game.mail;
const shardMail = (shardId: number, patch: Record<string, unknown> = {}) =>
  sendMail(t.db, {
    scope: 'shard',
    shardId,
    restId: null,
    minLevel: null,
    title: '开服礼',
    body: '欢迎',
    items: { coin: 100 },
    source: 'admin',
    actorAccountId: null,
    ...patch,
  });

describe('邮箱（设计 §2 裁定 1~9）', () => {
  it('区服邮件：发送时已有的店能看到并领取；后开的店看不到也领不了', async () => {
    const shardId = await createShard(t.db);
    const old = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await shardMail(shardId);
    const late = await newRestaurant(t, { shardId });
    const list = await mailSvc().list(old);
    expect(list.items.map((m) => m.id)).toContain(id);
    expect(list.unread).toBeGreaterThanOrEqual(1);
    expect((await mailSvc().list(late)).items.map((m) => m.id)).not.toContain(id);
    await expect(mailSvc().claim(late, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await mailSvc().claim(old, id);
    expect((await restRow(t, old.restaurantId)).coin).toBe(100);
  });

  it('重复领取只到账一次；并发领取也只到账一次', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    const id = await shardMail(shardId);
    const results = await Promise.allSettled([mailSvc().claim(r, id), mailSvc().claim(r, id)]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    await expect(mailSvc().claim(r, id)).rejects.toMatchObject({ params: { reason: 'mail_claimed' } });
    expect((await restRow(t, r.restaurantId)).coin).toBe(100);
  });

  it('等级门槛按领取时等级：看得到，不够级领不了，升级后能领', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { level: 5 } });
    const id = await shardMail(shardId, { minLevel: 10 });
    expect((await mailSvc().list(r)).items.find((m) => m.id === id)!.minLevel).toBe(10);
    // 列表带上当前等级，前端不用另外读餐厅（终审 I1）
    expect((await mailSvc().list(r)).level).toBe(5);
    await expect(mailSvc().claim(r, id)).rejects.toMatchObject({
      params: { reason: 'mail_level', level: 10 },
    });
    await t.db.updateTable('restaurant').set({ level: 10 }).where('id', '=', r.restaurantId).execute();
    await mailSvc().claim(r, id);
  });

  it('撤回后看不到、领不了；过期的同样', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const revoked = await shardMail(shardId);
    const expired = await shardMail(shardId);
    await t.db.updateTable('mail').set({ revoked_at: new Date() }).where('id', '=', revoked).execute();
    await t.db
      .updateTable('mail')
      .set({ expires_at: new Date(Date.now() - 1000) })
      .where('id', '=', expired)
      .execute();
    const ids = (await mailSvc().list(r)).items.map((m) => m.id);
    expect(ids).not.toContain(revoked);
    expect(ids).not.toContain(expired);
    await expect(mailSvc().claim(r, revoked)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(mailSvc().claim(r, expired)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('一键全领：一封出错不影响其他，出错的保持未领', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { coin: 0 } });
    await shardMail(shardId);
    const bad = await shardMail(shardId, { items: { goods: [{ id: 999999, num: 1 }] } });
    const res = await mailSvc().claimAll(r);
    expect(res.data).toMatchObject({ claimed: 1, failed: 1 });
    expect((await restRow(t, r.restaurantId)).coin).toBe(100);
    expect((await mailSvc().list(r)).items.find((m) => m.id === bad)!.claimed).toBe(false);
  });

  it('删除：有附件没领不能删；领完能删，删后看不到；只影响自己', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const id = await shardMail(shardId);
    await expect(mailSvc().remove(a, id)).rejects.toMatchObject({ params: { reason: 'mail_unclaimed' } });
    await mailSvc().claim(a, id);
    await mailSvc().remove(a, id);
    expect((await mailSvc().list(a)).items.map((m) => m.id)).not.toContain(id);
    expect((await mailSvc().list(b)).items.map((m) => m.id)).toContain(id);
  });

  it('已读：未读数减 1；单店邮件只有那家店看得到；全部区服的邮件各区都能看到', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const other = await newRestaurant(t);
    const own = await sendMail(t.db, {
      scope: 'rest',
      shardId,
      restId: r.restaurantId,
      minLevel: null,
      title: '给你',
      body: '',
      items: null,
      source: 'admin',
      actorAccountId: null,
    });
    const all = await sendMail(t.db, {
      scope: 'all',
      shardId: null,
      restId: null,
      minLevel: null,
      title: '全服',
      body: '',
      items: null,
      source: 'admin',
      actorAccountId: null,
    });
    const before = (await mailSvc().list(r)).unread;
    await mailSvc().read(r, own);
    expect((await mailSvc().list(r)).unread).toBe(before - 1);
    expect((await mailSvc().unread(r)).count).toBe(before - 1);
    const otherIds = (await mailSvc().list(other)).items.map((m) => m.id);
    expect(otherIds).not.toContain(own);
    expect(otherIds).toContain(all);
    await expect(mailSvc().claim(r, own)).rejects.toMatchObject({ params: { reason: 'mail_no_items' } });
  });

  it('关掉 mail 开关时邮箱接口返回 FEATURE_DISABLED，邮件照样能发（设计 裁定 26）', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({ shard_id: shardId, override: JSON.stringify({ features: { mail: false } }) })
      .execute();
    t.game.shards.invalidate(shardId);
    const r = await newRestaurant(t, { shardId });
    const id = await shardMail(shardId);
    await expect(mailSvc().list(r)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    await expect(mailSvc().claim(r, id)).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
  });

  it('附件里的帽子领取后生成命名厨具', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId });
    const id = await shardMail(shardId, { items: { hats: [{ tier: 'jade', name: '大橘' }] } });
    const res = await mailSvc().claim(r, id);
    expect(res.data.items.hats).toEqual([{ tier: 'jade', name: '大橘' }]);
    const hat = await t.db
      .selectFrom('equip')
      .select('custom_name')
      .where('rest_id', '=', r.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.jade)
      .executeTakeFirstOrThrow();
    expect(hat.custom_name).toBe('大橘');
  });
});

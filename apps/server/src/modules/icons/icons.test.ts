import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { MAX_SHOWN_ICONS } from '../friend/looks';
import { customId, customKey, iconDefs } from './defs';
import { expiryOf, grantIcon } from './grant';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const DAY = 86_400_000;
const at = (ms: number) => new Date(t.clock.now.getTime() + ms);
async function rest() {
  return (await newRestaurant(t, { shardId: await createShard(t.db) })).restaurantId;
}
const row = (restId: number, key: string) =>
  t.db
    .selectFrom('rest_icon')
    .select(['shown', 'expires_at', 'granted_at'])
    .where('rest_id', '=', restId)
    .where('icon_key', '=', key)
    .executeTakeFirstOrThrow();
const grant = (restId: number, key: string, expiresAt: Date | null, now = t.clock.now) =>
  grantIcon(t.db, { restId, key, expiresAt, now });

describe('有效期（定制称号设计 三）', () => {
  it('领取后 N 天、到某个时间、永久；到某个时间已过是 expired', () => {
    const now = new Date('2026-10-09T00:00:00Z');
    expect(expiryOf({}, now)).toBeNull();
    expect(expiryOf({ days: 7 }, now)).toEqual(new Date('2026-10-16T00:00:00Z'));
    expect(expiryOf({ until: '2026-11-01T00:00:00+08:00' }, now)).toEqual(new Date('2026-10-31T16:00:00Z'));
    expect(expiryOf({ until: '2026-10-09T00:00:00Z' }, now)).toBe('expired');
  });
});

describe('发称号的合并规则', () => {
  it('没有：按这次写；不满 5 个展示中就展示', async () => {
    const r = await rest();
    await grant(r, 'chef', at(7 * DAY));
    expect(await row(r, 'chef')).toMatchObject({ shown: true, expires_at: at(7 * DAY) });
  });

  it('已经永久：再发限时也不变', async () => {
    const r = await rest();
    await grant(r, 'chef', null);
    await grant(r, 'chef', at(3 * DAY));
    expect((await row(r, 'chef')).expires_at).toBeNull();
  });

  it('限时再发永久：变永久；限时再发限时：取晚的，展示状态不变', async () => {
    const r = await rest();
    await grant(r, 'chef', at(7 * DAY));
    await t.db.updateTable('rest_icon').set({ shown: false }).where('rest_id', '=', r).execute();
    await grant(r, 'chef', at(3 * DAY));
    expect(await row(r, 'chef')).toMatchObject({ shown: false, expires_at: at(7 * DAY) });
    await grant(r, 'chef', at(9 * DAY));
    expect((await row(r, 'chef')).expires_at).toEqual(at(9 * DAY));
    await grant(r, 'chef', null);
    expect(await row(r, 'chef')).toMatchObject({ shown: false, expires_at: null });
  });

  it('已经过期：当新的发，重新算展示和发放时间', async () => {
    const r = await rest();
    await grant(r, 'chef', at(DAY));
    await t.db.updateTable('rest_icon').set({ shown: false }).where('rest_id', '=', r).execute();
    const later = at(2 * DAY);
    await grant(r, 'chef', at(5 * DAY), later);
    expect(await row(r, 'chef')).toMatchObject({ shown: true, expires_at: at(5 * DAY), granted_at: later });
  });

  it('已经有 5 个展示中：新拿到的不展示', async () => {
    const r = await rest();
    const keys = ['founder', 'helper', 'tester', 'champion', 'artist'];
    for (const k of keys) await grant(r, k, null);
    expect(keys.length).toBe(MAX_SHOWN_ICONS);
    await grant(r, 'chef', null);
    expect((await row(r, 'chef')).shown).toBe(false);
  });
});

describe('称号定义：配置和定制一起解析', () => {
  it('配置的取配置，c<id> 查表，查不到的不在结果里', async () => {
    const c = await t.db
      .insertInto('custom_icon')
      .values({ title: '🍜面霸', descr: '吃了一百碗面' })
      .returning('id')
      .executeTakeFirstOrThrow();
    expect(customId(customKey(c.id))).toBe(c.id);
    expect(customId('chef')).toBeNull();
    const defs = await iconDefs(t.db, t.deps.config, ['founder', customKey(c.id), 'c999999999', 'nope']);
    expect(defs.get('founder')).toMatchObject({ title: '开服元老', custom: false, retired: false });
    expect(defs.get(customKey(c.id))).toEqual({
      key: customKey(c.id),
      title: '🍜面霸',
      desc: '吃了一百碗面',
      custom: true,
      retired: false,
    });
    expect(defs.has('c999999999')).toBe(false);
    expect(defs.has('nope')).toBe(false);
  });
});

describe('定制称号在首页、访问页、装扮页显示（定制称号设计 四）', () => {
  it('名字、说明来自定制称号表', async () => {
    const shardId = await createShard(t.db);
    const a = await newRestaurant(t, { shardId });
    const b = await newRestaurant(t, { shardId });
    const c = await t.db
      .insertInto('custom_icon')
      .values({ title: '👨‍🍳主厨', descr: '定制' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const key = customKey(c.id);
    await grantIcon(t.db, { restId: b.restaurantId, key, expiresAt: null, now: t.clock.now });
    expect((await t.game.restaurant.overview(b.restaurantId)).icons).toEqual([{ key, title: '👨‍🍳主厨' }]);
    expect((await t.game.social.reads.detail(a, b.restaurantId)).icons).toEqual([{ key, title: '👨‍🍳主厨' }]);
    expect((await t.game.social.looks.mine(b)).icons).toEqual([
      expect.objectContaining({ key, title: '👨‍🍳主厨', desc: '定制', shown: true, expiresAt: null }),
    ]);
  });
});

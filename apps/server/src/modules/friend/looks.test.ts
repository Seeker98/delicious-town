import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gameTime } from '@dt/shared';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, restRow, type TestGame } from '../../../test/game';
import { call, createTestApp, type TestContext } from '../../../test/helpers';
import { playerIn } from '../../../test/players';
import { cleanNotice } from './looks';

let t: TestGame;
let ctx: TestContext;
beforeAll(async () => {
  t = await createTestGame();
  ctx = await createTestApp();
});
afterAll(async () => {
  await t.close();
  await ctx.close();
});
const looks = () => t.game.social.looks;

describe('装扮（规格书 02 §2.8）', () => {
  it('换门 20000 银币，换回默认门免费；门不存在、和现在一样时报错', async () => {
    const a = await newRestaurant(t, { patch: { coin: 30_000 } });
    await looks().door(a, 2);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ door: 2, coin: 10_000 });
    await expect(looks().door(a, 2)).rejects.toMatchObject({ params: { reason: 'same_door' } });
    await expect(looks().door(a, 99)).rejects.toMatchObject({ params: { reason: 'bad_look' } });
    await expect(looks().door(a, 3)).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    await looks().door(a, 0);
    expect(await restRow(t, a.restaurantId)).toMatchObject({ door: 0, coin: 10_000 });
  });

  it('头像只能选列表里的', async () => {
    const a = await newRestaurant(t);
    await looks().avatar(a, 5);
    expect((await restRow(t, a.restaurantId)).avatar).toBe(5);
    await expect(looks().avatar(a, 999)).rejects.toMatchObject({ params: { reason: 'bad_look' } });
  });

  it('公告栏：去掉换行以外的控制字符和首尾空白（Review Focus 5）', async () => {
    expect(cleanNotice('  你好\u0007\n明天见\u0000  ')).toBe('你好\n明天见');
    expect(cleanNotice('   ')).toBe('');
    const a = await newRestaurant(t);
    await looks().notice(a, ' 欢迎\u0001光临 ');
    expect((await restRow(t, a.restaurantId)).notice).toBe('欢迎光临');
  });

  it('个性图标最多展示 5 个；不是自己的图标不能动', async () => {
    const a = await newRestaurant(t);
    const keys = ['founder', 'helper', 'tester', 'champion', 'artist', 'chef'];
    const ids = (
      await t.db
        .insertInto('rest_icon')
        .values(keys.map((k) => ({ rest_id: a.restaurantId, icon_key: k })))
        .returning('id')
        .execute()
    ).map((r) => r.id);
    for (const id of ids.slice(0, 5)) await looks().iconShow(a, id, true);
    await expect(looks().iconShow(a, ids[5]!, true)).rejects.toMatchObject({
      params: { what: 'icons', max: 5 },
    });
    await looks().iconShow(a, ids[0]!, false);
    await looks().iconShow(a, ids[5]!, true);
    const mine = await looks().mine(a);
    expect(mine.icons.filter((i) => i.shown)).toHaveLength(5);
    expect(mine.icons.find((i) => i.key === 'founder')).toMatchObject({ title: '开服元老', shown: false });
    const b = await newRestaurant(t);
    await expect(looks().iconShow(b, ids[1]!, false)).rejects.toMatchObject({
      params: { reason: 'not_owned' },
    });
  });

  it('接口：公告超过 200 字返回 VALIDATION_FAILED', async () => {
    const shardId = await createShard(ctx.deps.db);
    const p = await playerIn(ctx, shardId);
    const r = await call(ctx.app, 'POST', '/api/v1/rest/notice', {
      cookie: p.cookie,
      body: { text: 'x'.repeat(201) },
    });
    expect(r.json.code).toBe('VALIDATION_FAILED');
    const ok = await call(ctx.app, 'POST', '/api/v1/rest/notice', {
      cookie: p.cookie,
      body: { text: '你好' },
    });
    expect(ok.json.data).toEqual({ notice: '你好' });
  });
});

describe('称号商店（240-2）', () => {
  const at = (day: string) => t.clock.set(gameTime(day, 12));
  const icons = async (restId: number) =>
    (await t.db.selectFrom('rest_icon').select('icon_key').where('rest_id', '=', restId).execute()).map(
      (r) => r.icon_key,
    );

  it('上架期间能买：扣银币、进我的称号（默认不展示）、记流水、发新闻；装扮页列出正在上架的', async () => {
    at('2026-10-15');
    const a = await newRestaurant(t, { patch: { coin: 10_000_000 } });
    const before = await looks().mine(a);
    expect(before.shop!.map((x) => [x.key, x.coin, x.owned])).toEqual([
      ['oct26_s', 1_000_000, false],
      ['oct26_m', 3_000_000, false],
      ['oct26_l', 8_000_000, false],
    ]);
    expect(before.shop![0]!.endsAt).toBe(gameTime('2026-11-01', 0).toISOString());
    await looks().buyIcon(a, 'oct26_l');
    expect((await restRow(t, a.restaurantId)).coin).toBe(2_000_000);
    const after = await looks().mine(a);
    expect(after.icons.find((x) => x.key === 'oct26_l')).toMatchObject({ title: '金秋食神', shown: false });
    expect(after.shop!.find((x) => x.key === 'oct26_l')!.owned).toBe(true);
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['delta', 'source'])
      .where('rest_id', '=', a.restaurantId)
      .where('kind', '=', 'coin')
      .execute();
    expect(ledger).toContainEqual({ delta: -8_000_000, source: 'icon.buy' });
    const news = await t.db
      .selectFrom('news')
      .select(['type', 'params'])
      .where('rest_id', '=', a.restaurantId)
      .where('type', '=', 'icon.buy')
      .execute();
    expect(news.map((n) => n.params)).toEqual([{ key: 'oct26_l', title: '金秋食神' }]);
  });

  it('没上架、已下架、不是商店称号都不能买；已有的不能再买', async () => {
    at('2026-10-15');
    const a = await newRestaurant(t, { patch: { coin: 50_000_000 } });
    await expect(looks().buyIcon(a, 'nov26_s')).rejects.toMatchObject({
      params: { reason: 'icon_not_on_sale' },
    });
    await expect(looks().buyIcon(a, 'founder')).rejects.toMatchObject({
      params: { reason: 'icon_not_on_sale' },
    });
    await expect(looks().buyIcon(a, 'nope')).rejects.toMatchObject({
      params: { reason: 'icon_not_on_sale' },
    });
    await looks().buyIcon(a, 'oct26_s');
    await expect(looks().buyIcon(a, 'oct26_s')).rejects.toMatchObject({ params: { reason: 'icon_owned' } });
    at('2026-11-01');
    await expect(looks().buyIcon(a, 'oct26_m')).rejects.toMatchObject({
      params: { reason: 'icon_not_on_sale' },
    });
    expect((await looks().mine(a)).shop!.map((x) => x.key)).toEqual(['nov26_s', 'nov26_m', 'nov26_l']);
  });

  it('银币不够：报 NOT_ENOUGH，什么都不扣、不给', async () => {
    at('2026-10-15');
    const a = await newRestaurant(t, { patch: { coin: 999_999 } });
    await expect(looks().buyIcon(a, 'oct26_s')).rejects.toMatchObject({ code: 'NOT_ENOUGH' });
    expect((await restRow(t, a.restaurantId)).coin).toBe(999_999);
    expect(await icons(a.restaurantId)).toEqual([]);
  });
});

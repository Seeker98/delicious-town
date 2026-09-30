import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

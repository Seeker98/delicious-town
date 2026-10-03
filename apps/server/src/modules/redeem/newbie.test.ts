import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NewbieCode } from '@dt/config';
import { RawNode, type KyselyPlugin } from 'kysely';
import { createAccountRow } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { randomCode } from './code';
import { npcAccountId } from '../npc/npc';
import { guideCodes, syncNewbieCodes } from './newbie';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = () => ({ warn: vi.fn() });
const row = (code: string) =>
  t.db.selectFrom('redeem_code').selectAll().where('code', '=', code).executeTakeFirstOrThrow();
const nc = (code: string, patch: Partial<NewbieCode> = {}): NewbieCode => ({
  code,
  minLevel: 5,
  items: { coin: 100 },
  note: '新手码测试',
  ...patch,
});

describe('新手码同步（设计 §4.2）', () => {
  it('第一次插入：通用码、所有区服、不限次数；第二次不重复插入', async () => {
    const c = randomCode();
    expect((await syncNewbieCodes(t.db, [nc(c)], log())).inserted).toBe(1);
    const r = await row(c);
    expect(r).toMatchObject({
      kind: 'shared',
      shard_id: null,
      max_uses: null,
      min_level: 5,
      disabled_at: null,
    });
    expect(r.items).toEqual({ coin: 100 });
    expect(await syncNewbieCodes(t.db, [nc(c)], log())).toMatchObject({ inserted: 0, updated: 0 });
  });

  it('配置改了奖励和等级就更新；停用过的保持停用，用过的次数不变（Review Focus 1）', async () => {
    const c = randomCode();
    await syncNewbieCodes(t.db, [nc(c)], log());
    await t.db
      .updateTable('redeem_code')
      .set({ disabled_at: new Date(), used_count: 7 })
      .where('code', '=', c)
      .execute();
    const r1 = await syncNewbieCodes(t.db, [nc(c, { minLevel: 8, items: { coin: 200 } })], log());
    expect(r1.updated).toBe(1);
    const r = await row(c);
    expect(r.min_level).toBe(8);
    expect(r.items).toEqual({ coin: 200 });
    expect(r.disabled_at).not.toBeNull();
    expect(r.used_count).toBe(7);
  });

  it('后台手动建的同名码不覆盖，打警告', async () => {
    const c = randomCode();
    const admin = await createAccountRow(t.db);
    await t.db
      .insertInto('redeem_code')
      .values({
        code: c,
        kind: 'shared',
        items: JSON.stringify({ coin: 1 }),
        note: '手动',
        actor_account_id: admin,
      })
      .execute();
    const l = log();
    const r = await syncNewbieCodes(t.db, [nc(c)], l);
    expect(r.skipped).toEqual([c]);
    expect(l.warn).toHaveBeenCalled();
    expect((await row(c)).items).toEqual({ coin: 1 });
  });
});

describe('指引页新手码状态（设计 §4.3）', () => {
  it('ok / level / used / off / unavailable 五种状态，顺序和配置一致', async () => {
    const [a, b, c, d] = [randomCode(), randomCode(), randomCode(), randomCode()];
    const codes = [
      nc(a, { minLevel: 1 }),
      nc(b, { minLevel: 99 }),
      nc(c, { minLevel: 1 }),
      nc(d, { minLevel: 1 }),
    ];
    await syncNewbieCodes(t.db, codes.slice(0, 3), log());
    await t.db.updateTable('redeem_code').set({ disabled_at: new Date() }).where('code', '=', c).execute();
    const ctx = await newRestaurant(t);
    const list = await guideCodes(t.db, codes, ctx.restaurantId);
    expect(list.map((x) => [x.code, x.state])).toEqual([
      [a, 'ok'],
      [b, 'level'],
      [c, 'off'],
      // 没同步进库（比如启动时同步失败）：暂时不可用，不说已结束（backlog 新手码）
      [d, 'unavailable'],
    ]);
    await t.game.redeem.redeem(ctx, a);
    expect((await guideCodes(t.db, codes, ctx.restaurantId))[0]!.state).toBe('used');
  });

  it('领过的码后来停用，仍显示已领', async () => {
    const a = randomCode();
    await syncNewbieCodes(t.db, [nc(a, { minLevel: 1 })], log());
    const ctx = await newRestaurant(t);
    await t.game.redeem.redeem(ctx, a);
    await t.db.updateTable('redeem_code').set({ disabled_at: new Date() }).where('code', '=', a).execute();
    expect((await guideCodes(t.db, [nc(a, { minLevel: 1 })], ctx.restaurantId))[0]!.state).toBe('used');
  });
});

describe('backlog 新手码', () => {
  it('区服关了兑换码功能：没领过的显示暂时不可用，领过的仍是已领', async () => {
    const [a, b] = [randomCode(), randomCode()];
    const codes = [nc(a, { minLevel: 1 }), nc(b, { minLevel: 1 })];
    await syncNewbieCodes(t.db, codes, log());
    const ctx = await newRestaurant(t);
    await t.game.redeem.redeem(ctx, a);
    const list = await guideCodes(t.db, codes, ctx.restaurantId, { redeemOn: false });
    expect(list.map((x) => x.state)).toEqual(['used', 'unavailable']);
  });

  it('奖励有多个字段时，重复同步不会每次都"更新"（jsonb 的键顺序和配置不同）', async () => {
    const c = randomCode();
    const items = { goods: [{ id: 28, num: 3 }], coin: 50000, diamond: 10 };
    await syncNewbieCodes(t.db, [nc(c, { items })], log());
    expect(await syncNewbieCodes(t.db, [nc(c, { items })], log())).toMatchObject({ updated: 0 });
  });

  it('系统账号已经有了就不再 insert（以前每次都 insert … on conflict，白白消耗一个账号 id）', async () => {
    await npcAccountId(t.db);
    const inserts: string[] = [];
    const watch: KyselyPlugin = {
      transformQuery: (a) => {
        if (RawNode.is(a.node) && a.node.sqlFragments.join('').includes('insert into account'))
          inserts.push('x');
        return a.node;
      },
      transformResult: async (a) => a.result,
    };
    await npcAccountId(t.db.withPlugin(watch));
    expect(inserts).toEqual([]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SPONSOR_HATS } from '@dt/config';
import { runSystemOp } from '../../core/op';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { equipDisplayName, grantHatOp, hatDisplayName } from './hats';
import { gid } from '../../../test/items';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('命名帽子（设计 §5）', () => {
  it('显示名：玉•{名字}之帽 / 铉•{名字}之帽；普通厨具和没名字的帽子返回 null', () => {
    expect(hatDisplayName('jade', '大橘')).toBe('玉•大橘之帽');
    expect(hatDisplayName('xuan', '大橘')).toBe('铉•大橘之帽');
    expect(equipDisplayName(SPONSOR_HATS.jade, '大橘')).toBe('玉•大橘之帽');
    expect(equipDisplayName(SPONSOR_HATS.jade, null)).toBeNull();
    expect(equipDisplayName(30, '大橘')).toBeNull();
  });

  it('发一顶命名玉帽：生成厨具实例并存名字，记流水', async () => {
    const ctx = await newRestaurant(t);
    const id = await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (op) =>
      grantHatOp(op, 'jade', '大橘', 'mail.claim'),
    );
    const e = await t.db.selectFrom('equip').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
    expect(e).toMatchObject({
      rest_id: ctx.restaurantId,
      goods_id: SPONSOR_HATS.jade,
      custom_name: '大橘',
      part: 5,
    });
    expect(e.base_creatives).toBe(25);
    const ledger = await t.db
      .selectFrom('ledger')
      .select(['source', 'kind', 'item_id', 'delta'])
      .where('rest_id', '=', ctx.restaurantId)
      .execute();
    expect(ledger).toContainEqual(
      expect.objectContaining({ source: 'mail.claim', kind: 'goods', item_id: SPONSOR_HATS.jade, delta: 1 }),
    );
  });
});

describe('显示名下发', () => {
  it('厨具列表、详情、好友店里，命名帽子带显示名，普通厨具为 null', async () => {
    const ctx = await newRestaurant(t, { patch: { level: 20 } });
    const viewer = await newRestaurant(t, { shardId: ctx.shardId });
    const hatId = await runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, (op) =>
      grantHatOp(op, 'jade', '大橘', 'test'),
    );
    await t.db.updateTable('equip').set({ worn: true }).where('id', '=', hatId).execute();
    await t.db
      .insertInto('equip')
      .values({ rest_id: ctx.restaurantId, goods_id: gid('见习之铲'), part: 1, worn: true })
      .execute();
    const list = await t.game.equip.list(ctx, {});
    expect(list.find((e) => e.id === hatId)!.name).toBe('玉•大橘之帽');
    expect(list.find((e) => e.goodsId === gid('见习之铲'))!.name).toBeNull();
    expect((await t.game.equip.detail(ctx, hatId)).equip.name).toBe('玉•大橘之帽');
    const friend = await t.game.social.reads.detail(viewer, ctx.restaurantId);
    expect(friend.equips.map((e) => e.name)).toEqual([null, '玉•大橘之帽']);
  });
});

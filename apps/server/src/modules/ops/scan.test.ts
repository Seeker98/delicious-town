import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SPONSOR_HATS } from '@dt/config';
import { runSystemOp } from '../../core/op';
import { createShard } from '../../../test/fixtures';
import { createTestGame, newRestaurant, type TestGame } from '../../../test/game';
import { grantHatOp } from '../equip/hats';
import { scanHats } from './scan';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
async function hat(ctx: { shardId: number; restaurantId: number }, name: string | null) {
  return runSystemOp(t.game.deps, ctx.shardId, ctx.restaurantId, { source: 'test' }, async (op) => {
    const id = await grantHatOp(op, 'jade', name ?? 'x', 'test');
    if (name === null)
      await op.tx.updateTable('equip').set({ custom_name: null }).where('id', '=', id).execute();
    return id;
  });
}
const xuanMails = (restId: number) =>
  t.db
    .selectFrom('mail')
    .select(['items', 'title'])
    .where('rest_id', '=', restId)
    .where('source', '=', 'hat')
    .execute();

describe('六星换铉（设计 裁定 25）', () => {
  it('六星的店：每顶命名玉帽换一封同名铉帽邮件；重扫不重复；没命名的、不到六星的不换', async () => {
    const shardId = await createShard(t.db);
    const six = await newRestaurant(t, { shardId, patch: { star_level: 6 } });
    const five = await newRestaurant(t, { shardId, patch: { star_level: 5 } });
    await hat(six, '大橘');
    await hat(six, '小丽');
    await hat(six, null);
    await hat(five, '旺财');
    expect(await scanHats(t.game, log, shardId)).toEqual({ sent: 2, failed: 0 });
    expect(await scanHats(t.game, log, shardId)).toEqual({ sent: 0, failed: 0 });
    const mails = await xuanMails(six.restaurantId);
    expect(mails.map((m) => (m.items as { hats: Array<{ name: string }> }).hats[0]!.name).sort()).toEqual([
      '大橘',
      '小丽',
    ]);
    expect(await xuanMails(five.restaurantId)).toEqual([]);
    const jade = await t.db
      .selectFrom('equip')
      .select('xuan_sent_at')
      .where('rest_id', '=', six.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.jade)
      .where('custom_name', '=', '大橘')
      .executeTakeFirstOrThrow();
    expect(jade.xuan_sent_at).not.toBeNull();
  });

  it('领取换铉邮件后得到同名铉帽', async () => {
    const shardId = await createShard(t.db);
    const r = await newRestaurant(t, { shardId, patch: { star_level: 6 } });
    await hat(r, '大橘');
    await scanHats(t.game, log, shardId);
    const m = (await t.game.mail.list(r)).items.find((x) => x.source === 'hat')!;
    await t.game.mail.claim(r, m.id);
    const xuan = await t.db
      .selectFrom('equip')
      .select('custom_name')
      .where('rest_id', '=', r.restaurantId)
      .where('goods_id', '=', SPONSOR_HATS.xuan)
      .executeTakeFirstOrThrow();
    expect(xuan.custom_name).toBe('大橘');
  });
});

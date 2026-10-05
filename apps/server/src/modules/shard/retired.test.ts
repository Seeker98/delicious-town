import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGameConfig } from '@dt/config';
import { testConfig } from '../../../test/config';
import { createShard } from '../../../test/fixtures';
import { createTestGame, type TestGame } from '../../../test/game';
import { retiredInOverrides } from './retired';

let t: TestGame;
beforeAll(async () => {
  t = await createTestGame();
});
afterAll(() => t.close());

describe('已存的区服数值引用了下架的道具（问题记录 367 终审 I3）', () => {
  it('启动时逐个区服查一遍，列出区服和引用处', async () => {
    const shardId = await createShard(t.db);
    await t.db
      .insertInto('shard_config')
      .values({
        shard_id: shardId,
        override: JSON.stringify({ tuning: { tower: { rankGifts: [[1, 93]] } } }),
      })
      .execute();
    const base = testConfig();
    const retired = createGameConfig({
      ...base.bundle,
      goods: base.bundle.goods.map((g) => (g.id === 93 ? { ...g, retired: true as const } : g)),
    });
    const found = await retiredInOverrides(t.db, retired);
    expect(found.find((x) => x.shardId === shardId)).toEqual({
      shardId,
      errors: ['retired goods 93 is still used by 厨塔排行 ×1'],
    });
    // 名单是空的（默认）时不查
    expect(await retiredInOverrides(t.db, base)).toEqual([]);
  });
});

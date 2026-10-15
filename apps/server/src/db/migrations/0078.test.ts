import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';
import { testConfig } from '../../../test/config';
import { universalLevel } from '../../core/prices';
import { fid } from '../../../test/items';
import { clearFairRefs } from './0078_fair_price_refs';

const config = testConfig();
const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0078：公允价阶梯换锚，清掉 2~5 级的参考价', () => {
  it('食材编号的千位就是等级，万能食材 9001~9005 顶替 1~5 级（删的范围靠这个）', () => {
    for (const f of config.foods.values()) {
      const lv = universalLevel(f) ?? f.level;
      const hit = (f.id >= 2000 && f.id <= 5999) || (f.id >= 9002 && f.id <= 9005);
      expect(hit, `${f.id} ${f.name}`).toBe(lv >= 2 && lv <= 5);
    }
  });

  it('2~5 级和二~五级万能食材的参考价全删（含历史）；1 级、6 级、一级万能食材、别的区服不动', async () => {
    const shardId = await createShard(db);
    const other = await createShard(db);
    const at = (lv: number) => [...config.foods.values()].find((f) => f.level === lv)!.id;
    const kept = [at(1), at(6), fid('一级万能食材')];
    const gone = [at(2), fid('雪蛤'), at(4), fid('全麦粉'), fid('二级万能食材'), fid('五级万能食材')];
    const row = (shard: number, foods: number, day: string) => ({
      shard_id: shard,
      foods_id: foods,
      day,
      price: 1000,
    });
    await db
      .insertInto('exchange_ref')
      .values([
        ...[...kept, ...gone].flatMap((id) => [
          row(shardId, id, '2026-10-14'),
          row(shardId, id, '2026-10-15'),
        ]),
        row(other, fid('雪蛤'), '2026-10-15'),
      ])
      .execute();

    await clearFairRefs(db, [shardId]);

    const left = (shard: number) =>
      db
        .selectFrom('exchange_ref')
        .select('foods_id')
        .where('shard_id', '=', shard)
        .orderBy('foods_id')
        .execute()
        .then((rows) => rows.map((r) => r.foods_id));
    expect(await left(shardId)).toEqual([...kept, ...kept].sort((x, y) => x - y));
    expect(await left(other)).toEqual([fid('雪蛤')]);
  });
});

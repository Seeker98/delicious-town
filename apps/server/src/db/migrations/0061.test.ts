import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createShard } from '../../../test/fixtures';
import { up } from './0061_devil_payouts';

const db = testDb();
afterAll(() => db.destroy());

async function put(shardId: number, override: unknown) {
  await db
    .insertInto('shard_config')
    .values({ shard_id: shardId, override: JSON.stringify(override) })
    .onConflict((oc) => oc.column('shard_id').doUpdateSet({ override: JSON.stringify(override) }))
    .execute();
  await db
    .insertInto('shard_config_history')
    .values({ shard_id: shardId, version: 1, override: JSON.stringify(override), note: 'x' })
    .execute();
}

describe('迁移 0061：魔鬼辣杯的倍率换成赔付表（2026-10-09）', () => {
  it('删掉区服覆盖和历史版本里的旧键 rate，别的设置不动', async () => {
    const s = await createShard(db);
    await put(s, { tuning: { bar: { devil: { rate: 1.5, hangoverMinutes: 30 }, memory: { cost: 2 } } } });
    await up(db);
    const kept = { tuning: { bar: { devil: { hangoverMinutes: 30 }, memory: { cost: 2 } } } };
    for (const table of ['shard_config', 'shard_config_history'] as const) {
      const r = await db
        .selectFrom(table)
        .select('override')
        .where('shard_id', '=', s)
        .executeTakeFirstOrThrow();
      expect(r.override, table).toEqual(kept);
    }
  });

  it('改了押注档位或杯数、却没有赔付表的区服：迁移报错停下（不然那个区服的设置通不过校验、整个区服打不开）', async () => {
    const s = await createShard(db);
    await put(s, { tuning: { bar: { devil: { stakes: [1, 5, 10] } } } });
    try {
      await expect(up(db)).rejects.toThrow(String(s));
    } finally {
      await db.deleteFrom('shard_config_history').where('shard_id', '=', s).execute();
      await db.deleteFrom('shard_config').where('shard_id', '=', s).execute();
    }
    // 带了赔付表的不拦
    const ok = await createShard(db);
    await put(ok, {
      tuning: {
        bar: {
          devil: {
            stakes: [1, 5],
            payouts: [
              [1, 2, 3],
              [7, 9, 12],
            ],
          },
        },
      },
    });
    await expect(up(db)).resolves.toBeUndefined();
  });
});

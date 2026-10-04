import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../../../test/db';
import { createAccountRow, createRestaurantFull, createShard } from '../../../test/fixtures';
import { ownCurrentDoors } from './0048_rest_door';

const db = testDb();
afterAll(() => db.destroy());

describe('迁移 0048：买过的门永久拥有（问题记录 350）', () => {
  it('老店现在用着的门记成已拥有；默认门不记；重复执行不重复插入', async () => {
    const shardId = await createShard(db);
    const withDoor = await createRestaurantFull(db, shardId, await createAccountRow(db));
    const plain = await createRestaurantFull(db, shardId, await createAccountRow(db));
    await db.updateTable('restaurant').set({ door: 3 }).where('id', '=', withDoor).execute();
    await ownCurrentDoors(db);
    await ownCurrentDoors(db);
    const rows = await db
      .selectFrom('rest_door')
      .select(['rest_id', 'door_id'])
      .where('rest_id', 'in', [withDoor, plain])
      .execute();
    expect(rows).toEqual([{ rest_id: withDoor, door_id: 3 }]);
  });
});

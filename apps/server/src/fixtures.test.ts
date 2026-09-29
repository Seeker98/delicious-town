import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../test/db';
import { createShard } from '../test/fixtures';

const db = testDb();
afterAll(() => db.destroy());

describe('test fixtures', () => {
  it('并发创建区服时 id 不冲突（测试文件可能并行运行）', async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => createShard(db)));
    expect(new Set(ids).size).toBe(10);
  });
});

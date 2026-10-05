import { createDb } from '../db';
import { renumber } from '../db/migrations/0049_renumber';
import { loadEnv } from '../env';

/**
 * 重新编号只演练（上线前用，docs/deploy.md）：在一个事务里跑迁移 0049 的全部改写和自检，打印报告，然后总是回滚。
 * 在线上数据的副本上跑；直接对线上跑会在几秒到几十秒里锁住要改的行
 */
const env = loadEnv();
const db = createDb(env.DATABASE_URL, 1);
const ROLLBACK = new Error('dry run');
try {
  await db.transaction().execute(async (trx) => {
    await renumber(trx);
    throw ROLLBACK;
  });
} catch (e) {
  if (e !== ROLLBACK) throw e;
  console.log('dry run ok（已回滚）');
} finally {
  await db.destroy();
}

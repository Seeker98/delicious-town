import { randomBytes } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../db/schema';
import type { Env } from '../env';
import { setSeedSecret } from './seed';

const KEY = 'rng';

/**
 * 随机种子密钥（问题记录 262）：配了 RNG_SECRET 就用它；生产环境没配时，第一次启动生成一个存进数据库，
 * 之后一直读这个。密钥跟着每晚的数据库备份走，换机、重装、恢复备份后不变（变了的话还没开奖的
 * 系统题按种子重算会对不上）。多个进程同时首次启动时靠主键冲突只留一个。
 * 开发、测试环境没配就不混密钥，结果和公开算法一样，便于复现
 */
export async function resolveSeedSecret(
  db: Kysely<DB>,
  env: Pick<Env, 'NODE_ENV' | 'RNG_SECRET'>,
): Promise<string> {
  if (env.RNG_SECRET) return env.RNG_SECRET;
  if (env.NODE_ENV !== 'production') return '';
  await db
    .insertInto('server_secret')
    .values({ key: KEY, value: randomBytes(32).toString('hex') })
    .onConflict((oc) => oc.column('key').doNothing())
    .execute();
  const row = await db
    .selectFrom('server_secret')
    .select('value')
    .where('key', '=', KEY)
    .executeTakeFirstOrThrow();
  return row.value;
}

/** 启动时调用：在任何按种子算结果的代码运行之前设置好密钥 */
export async function initSeedSecret(d: { db: Kysely<DB>; env: Env }): Promise<void> {
  setSeedSecret(await resolveSeedSecret(d.db, d.env));
}

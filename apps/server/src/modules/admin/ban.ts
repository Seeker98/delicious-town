import { sql } from 'kysely';

const DAY = 86_400_000;

/** 是否在封号中（设计 §4）：banned_at 不为空，且 banned_until 为空（永久）或晚于现在；到期不清字段 */
export function isBanned(row: { banned_at: Date | null; banned_until: Date | null }, now: Date): boolean {
  return row.banned_at !== null && (row.banned_until === null || row.banned_until > now);
}

/** 封号到期时间：0 或不填为永久（null），否则 now + days 天 */
export function banUntil(days: number | undefined, now: Date): Date | null {
  return !days ? null : new Date(now.getTime() + days * DAY);
}

/** SQL：这个账号在封号中（alias 是 account 表的别名；按数据库时钟，到期即视为解封） */
export const bannedSql = (alias = 'a') =>
  sql<boolean>`(${sql.ref(`${alias}.banned_at`)} is not null and (${sql.ref(`${alias}.banned_until`)} is null or ${sql.ref(`${alias}.banned_until`)} > now()))`;
/** SQL：这个账号没在封号中 */
export const notBannedSql = (alias = 'a') => sql<boolean>`not ${bannedSql(alias)}`;

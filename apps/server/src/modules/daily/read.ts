import type { Kysely } from 'kysely';
import { addDays, gameDay, type DailyDto, type DailyHeadDto, type DailyLang } from '@dt/shared';
import { ErrorCode } from '@dt/shared';
import type { DB } from '../../db/schema';
import { AppError } from '../../http/errors';
import { listNews } from '../news/news';
import type { DailyContent } from './generate';
import { tokensIn, type DailyFacts } from './facts';

/** 玩家能翻几天（昨天往前数） */
export const VISIBLE_DAYS = 7;
const FALLBACK_SIZE = 5;

/** 昨天往前 7 天，新的在前 */
function window(now: Date): string[] {
  const y = addDays(gameDay(now), -1);
  return Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(y, -i));
}

/** 文字里的店记号：现在的名字，不存在为 null（各语言记号一样，看简中就行） */
export async function restNames(db: Kysely<DB>, text: string): Promise<Record<string, string | null>> {
  const ids = [
    ...new Set(
      tokensIn(text)
        .filter((x) => x.startsWith('r:'))
        .map((x) => Number(x.slice(2))),
    ),
  ];
  if (ids.length === 0) return {};
  const rows = await db.selectFrom('restaurant').select(['id', 'name']).where('id', 'in', ids).execute();
  const found = new Map(rows.map((r) => [r.id, r.name]));
  return Object.fromEntries(ids.map((id) => [String(id), found.get(id) ?? null]));
}

/** 某区服的日报：不带日期取最近一份已发布的（没有就昨天）；只能看最近 7 天 */
export async function readDaily(
  db: Kysely<DB>,
  shardId: number,
  day: string | undefined,
  now: Date,
): Promise<DailyDto> {
  const win = window(now);
  if (day !== undefined && !win.includes(day))
    throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'daily', day });
  const rows = await db
    .selectFrom('town_daily')
    .select(['day', 'status', 'facts', 'content'])
    .where('shard_id', '=', shardId)
    .where('day', 'in', win)
    .orderBy('day', 'desc')
    .execute();
  const pick = day ?? rows.find((r) => r.status === 'published')?.day ?? win[0]!;
  const row = rows.find((r) => r.day === pick);
  const out: DailyDto = { day: pick, days: rows.map((r) => r.day), article: null, fallback: [], rests: {} };
  if (!row) return out;
  if (row.status === 'published' && row.content) {
    const content = row.content as DailyContent;
    out.article = content;
    out.rests = await restNames(db, `${content['zh-CN'].title}\n${content['zh-CN'].body}`);
    return out;
  }
  const ids = ((row.facts as Partial<DailyFacts>).events ?? []).slice(0, FALLBACK_SIZE).map((e) => e.newsId);
  if (ids.length > 0) {
    const news = await listNews(db, shardId, { limit: FALLBACK_SIZE, ids });
    const order = new Map(ids.map((id, i) => [id, i]));
    out.fallback = news.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
  return out;
}

/** 首页入口：昨天的日报已发布时给日期和标题 */
export async function dailyHead(db: Kysely<DB>, shardId: number, now: Date): Promise<DailyHeadDto | null> {
  const day = addDays(gameDay(now), -1);
  const r = await db
    .selectFrom('town_daily')
    .select('content')
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .where('status', '=', 'published')
    .executeTakeFirst();
  if (!r?.content) return null;
  const c = r.content as DailyContent;
  const title = Object.fromEntries(
    (['zh-CN', 'en', 'zh-TW'] as DailyLang[]).map((l) => [l, c[l].title]),
  ) as Record<DailyLang, string>;
  return { day, title, rests: await restNames(db, title['zh-CN']) };
}

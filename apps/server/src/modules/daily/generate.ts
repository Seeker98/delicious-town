import { sql } from 'kysely';
import { addDays, gameDay, gameParts } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { invalidState } from '../../core/errors';
import type { PeriodicJob } from '../../core/jobs';
import type { DailyStatus } from '../../db/schema';
import type { Writer } from '../../infra/writer';
import { checkArticle, parseArticle, sameTokens, toTw, type Article } from './check';
import { buildFacts, type DailyFacts } from './facts';
import { TRANSLATE_SYSTEM, translateUser, WRITE_SYSTEM, writeUser } from './prompt';

export type DailyLang = 'zh-CN' | 'en' | 'zh-TW';
export type DailyContent = Record<DailyLang, Article>;

/** 日报留几天（玩家只能翻 7 天，后台看 30 天） */
export const KEEP_DAYS = 60;

export interface GenerateOptions {
  maxEvents: number;
  autoPublish: boolean;
  signal?: AbortSignal;
  /** 后台“重新生成”：草稿、撤下的也重写（结果一律是草稿）；已发布的要先撤下 */
  force?: boolean;
}

/** 素材少时正文可以短（设计 §六） */
const minBody = (f: DailyFacts) => (f.events.length >= 3 ? 250 : 80);

/** 调两次 AI，检查，转繁中 */
async function write(
  writer: Writer,
  facts: DailyFacts,
  used: { in: number; out: number; model: string | null },
  signal?: AbortSignal,
): Promise<DailyContent> {
  const a = await writer.chat(WRITE_SYSTEM, writeUser(facts), signal);
  used.in += a.tokensIn;
  used.out += a.tokensOut;
  used.model = a.model;
  const zh = parseArticle(a.text, 'zh-CN', minBody(facts));
  checkArticle(zh, facts);
  const b = await writer.chat(TRANSLATE_SYSTEM, translateUser(zh), signal);
  used.in += b.tokensIn;
  used.out += b.tokensOut;
  const en = parseArticle(b.text, 'en', 1);
  sameTokens(zh, en);
  checkArticle(en, facts);
  return { 'zh-CN': zh, en, 'zh-TW': toTw(zh) };
}

/**
 * 生成某区服某天的日报：素材写进行（没有就建 pending 行），调 AI，成功写内容和状态。
 * 失败时记下原因、累计 token 后抛错（周期任务据此重试）。已有草稿、发布、撤下的行不重写，除非 force
 */
export async function generateDaily(
  d: GameDeps,
  writer: Writer,
  shardId: number,
  day: string,
  o: GenerateOptions,
): Promise<{ status: DailyStatus; tokensIn: number; tokensOut: number }> {
  const existing = await d.db
    .selectFrom('town_daily')
    .select('status')
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .executeTakeFirst();
  if (existing && existing.status !== 'pending') {
    if (!o.force) return { status: existing.status, tokensIn: 0, tokensOut: 0 };
    if (existing.status === 'published') throw invalidState('daily_published', { day });
  }
  const facts = await buildFacts(d, shardId, day, o.maxEvents);
  await d.db
    .insertInto('town_daily')
    .values({ shard_id: shardId, day, status: 'pending', facts: JSON.stringify(facts) })
    .onConflict((oc) => oc.columns(['shard_id', 'day']).doUpdateSet({ facts: JSON.stringify(facts) }))
    .execute();

  const used = { in: 0, out: 0, model: null as string | null };
  const allowed: DailyStatus[] = o.force ? ['pending', 'draft', 'hidden'] : ['pending'];
  const base = d.db
    .updateTable('town_daily')
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .where('status', 'in', allowed);
  let content: DailyContent;
  try {
    content = await write(writer, facts, used, o.signal);
  } catch (err) {
    await base
      .set({
        tokens_in: sql<number>`tokens_in + ${used.in}`,
        tokens_out: sql<number>`tokens_out + ${used.out}`,
        attempts: sql<number>`attempts + 1`,
        error: String(err instanceof Error ? err.message : err).slice(0, 500),
        ...(used.model ? { model: used.model } : {}),
      })
      .execute();
    throw err;
  }
  const now = d.now();
  const status: DailyStatus = o.autoPublish && !o.force ? 'published' : 'draft';
  await base
    .set({
      status,
      content: JSON.stringify(content),
      model: used.model,
      tokens_in: sql<number>`tokens_in + ${used.in}`,
      tokens_out: sql<number>`tokens_out + ${used.out}`,
      attempts: sql<number>`attempts + 1`,
      regenerations: o.force ? sql<number>`regenerations + 1` : sql<number>`regenerations`,
      error: null,
      generated_at: now,
      published_at: status === 'published' ? now : null,
      published_by: null,
    })
    .execute();
  return { status, tokensIn: used.in, tokensOut: used.out };
}

/**
 * 每天一次（设计 §六）：游戏时间 hour:minute 以后写前一天的日报；失败 10 分钟后重试，最多 5 次。
 * 没配密钥只存素材（玩家看到“今日要闻”）；顺手清掉 60 天前的
 */
export function dailyJobs(d: GameDeps, writer: Writer | undefined): PeriodicJob[] {
  return [
    {
      name: 'town-daily',
      feature: 'daily',
      retry: true,
      period: (now, settings) => {
        const t = settings.tuning.daily;
        const p = gameParts(now);
        return p.hour * 60 + p.minute < t.hour * 60 + t.minute ? null : `daily-${gameDay(now)}`;
      },
      run: async ({ shardId, now, settings, signal }) => {
        const today = gameDay(now);
        const day = addDays(today, -1);
        const t = settings.tuning.daily;
        await d.db
          .deleteFrom('town_daily')
          .where('shard_id', '=', shardId)
          .where('day', '<=', addDays(day, -KEEP_DAYS))
          .execute();
        const had = await d.db
          .selectFrom('town_daily')
          .select('status')
          .where('shard_id', '=', shardId)
          .where('day', '=', day)
          .executeTakeFirst();
        if (had && had.status !== 'pending') return { day, skipped: had.status };
        if (!writer) {
          const facts = await buildFacts(d, shardId, day, t.maxEvents);
          await d.db
            .insertInto('town_daily')
            .values({ shard_id: shardId, day, status: 'pending', facts: JSON.stringify(facts) })
            .onConflict((oc) => oc.columns(['shard_id', 'day']).doUpdateSet({ facts: JSON.stringify(facts) }))
            .execute();
          return { day, noKey: true, events: facts.events.length };
        }
        const r = await generateDaily(d, writer, shardId, day, {
          maxEvents: t.maxEvents,
          autoPublish: t.autoPublish,
          signal,
        });
        return { day, ...r };
      },
    },
  ];
}

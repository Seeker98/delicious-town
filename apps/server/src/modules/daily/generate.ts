import { sql } from 'kysely';
import { addDays, gameDay, gameParts } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { invalidState } from '../../core/errors';
import type { PeriodicJob } from '../../core/jobs';
import type { DailyStatus } from '../../db/schema';
import { WriterError, type Writer } from '../../infra/writer';
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

type Used = { in: number; out: number; model: string | null };

/** 调一次 AI，记用量；回空内容的那次也记（backlog 1010） */
async function chat(writer: Writer, system: string, user: string, used: Used, signal?: AbortSignal) {
  try {
    const r = await writer.chat(system, user, signal);
    used.in += r.tokensIn;
    used.out += r.tokensOut;
    used.model = r.model;
    return r.text;
  } catch (err) {
    if (err instanceof WriterError) {
      used.in += err.usage.tokensIn;
      used.out += err.usage.tokensOut;
      used.model = err.usage.model;
    }
    throw err;
  }
}

/**
 * 合格的简中先留在进程里（backlog 1010）：翻译失败、重试时素材没变就直接拿来翻译（只复用一次），不重写也不重付。
 * 生成成功就删；只是省钱用的，进程重启丢了也没关系
 */
const zhDrafts = new Map<string, { facts: string; zh: Article }>();

/** 调两次 AI（简中已有合格的只调翻译），检查，转繁中 */
async function write(
  writer: Writer,
  facts: DailyFacts,
  used: Used,
  key: string,
  signal?: AbortSignal,
): Promise<DailyContent> {
  const factsKey = JSON.stringify(facts);
  const cached = zhDrafts.get(key);
  let zh: Article;
  // 只复用一次（终审）：翻译总过不了时下次从头写，免得一篇简中卡死一整天
  if (cached && cached.facts === factsKey) {
    zh = cached.zh;
    zhDrafts.delete(key);
  } else {
    zh = parseArticle(
      await chat(writer, WRITE_SYSTEM, writeUser(facts), used, signal),
      'zh-CN',
      minBody(facts),
    );
    checkArticle(zh, facts);
    if (zhDrafts.size >= 200) zhDrafts.clear();
    zhDrafts.set(key, { facts: factsKey, zh });
  }
  const en = parseArticle(await chat(writer, TRANSLATE_SYSTEM, translateUser(zh), used, signal), 'en', 1);
  sameTokens(zh, en);
  checkArticle(en, facts, 'en');
  zhDrafts.delete(key);
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
  const row = () =>
    d.db
      .selectFrom('town_daily')
      .select(['status', 'content'])
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .executeTakeFirst();
  const existing = await row();
  if (existing && existing.status !== 'pending') {
    if (!o.force) return { status: existing.status, tokensIn: 0, tokensOut: 0 };
    if (existing.status === 'published') throw invalidState('daily_published', { day });
  }
  const facts = await buildFacts(d, shardId, day, o.maxEvents);
  // 新行、还没生成成功的行先存素材（玩家看“当日要闻”用）；已有稿子的行等写成功了再连稿子一起换，
  // 不然 AI 失败时素材和稿子对不上（backlog）
  await d.db
    .insertInto('town_daily')
    .values({ shard_id: shardId, day, status: 'pending', facts: JSON.stringify(facts) })
    .onConflict((oc) =>
      oc
        .columns(['shard_id', 'day'])
        .doUpdateSet({ facts: JSON.stringify(facts) })
        .where('town_daily.status', '=', 'pending'),
    )
    .execute();

  const used: Used = { in: 0, out: 0, model: null };
  // 花掉的 token 和次数无条件记上：这一行中途被别人改了也要记（backlog）；
  // 错误只记在还没生成成功的行上，已有草稿的不显示过时的错误（backlog 1010，重新生成失败后台当场会报）
  const spend = (error?: string) =>
    d.db
      .updateTable('town_daily')
      .set({
        tokens_in: sql<number>`tokens_in + ${used.in}`,
        tokens_out: sql<number>`tokens_out + ${used.out}`,
        attempts: sql<number>`attempts + 1`,
        ...(used.model ? { model: used.model } : {}),
        ...(error !== undefined
          ? { error: sql<string | null>`case when status = 'pending' then ${error} else error end` }
          : {}),
      })
      .where('shard_id', '=', shardId)
      .where('day', '=', day)
      .execute();
  let content: DailyContent;
  try {
    content = await write(writer, facts, used, `${shardId}:${day}`, o.signal);
  } catch (err) {
    await spend(String(err instanceof Error ? err.message : err).slice(0, 500));
    throw err;
  }
  await spend();
  const now = d.now();
  const status: DailyStatus = o.autoPublish && !o.force ? 'published' : 'draft';
  const allowed: DailyStatus[] = o.force ? ['pending', 'draft', 'hidden'] : ['pending'];
  let q = d.db
    .updateTable('town_daily')
    .set({
      status,
      content: JSON.stringify(content),
      facts: JSON.stringify(facts),
      error: null,
      generated_at: now,
      published_at: status === 'published' ? now : null,
      published_by: null,
    })
    .where('shard_id', '=', shardId)
    .where('day', '=', day)
    .where('status', 'in', allowed);
  // 重新生成：开始以后被人手改、发布过、撤下过就不盖（backlog；状态也比，backlog 1010）
  if (o.force)
    q = q
      .where(
        sql<boolean>`content is not distinct from ${existing?.content ? JSON.stringify(existing.content) : null}::jsonb`,
      )
      .where('status', '=', existing?.status ?? 'pending');
  const r = await q.executeTakeFirst();
  if (Number(r.numUpdatedRows) === 0) {
    if (o.force) throw invalidState('daily_changed', { day });
    return { status: (await row())?.status ?? 'pending', tokensIn: used.in, tokensOut: used.out };
  }
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

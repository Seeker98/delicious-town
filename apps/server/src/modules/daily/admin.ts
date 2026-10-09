import {
  addDays,
  gameDay,
  ErrorCode,
  type AdminDailyDetailDto,
  type AdminDailyEditBody,
  type AdminDailyRowDto,
} from '@dt/shared';
import { sql } from 'kysely';
import { invalidState, limitReached } from '../../core/errors';
import type { Game } from '../../game';
import { AppError } from '../../http/errors';
import type { AdminActor } from '../admin/access';
import { writeAudit } from '../admin/audit';
import { checkArticle, parseArticle, sameTokens, toTw } from './check';
import type { DailyFacts } from './facts';
import { generateDaily, type DailyContent } from './generate';
import { restNames } from './read';

/** 后台列表看几天 */
const LIST_DAYS = 30;
/** 每区服每天最多重新生成几次（设计 §七） */
export const MAX_REGENERATIONS = 10;
/** 能重新生成最近几天（新闻留 30 天，留点余量） */
const REGEN_DAYS = 28;
/** 后台重新生成整体超时（两次 AI 调用；Cloudflare 100 秒断开） */
const REGEN_TIMEOUT_MS = 80_000;

/** 小镇日报后台：看、发布、撤下、手改、重新生成；写操作都写审计 */
export function createAdminDaily(game: Game) {
  const { db } = game.app;
  const d = game.deps;

  const base = () => db.selectFrom('town_daily').selectAll();
  type Row = Awaited<ReturnType<ReturnType<typeof base>['executeTakeFirstOrThrow']>>;
  const toRow = (r: Row): AdminDailyRowDto => ({
    shardId: r.shard_id,
    day: r.day,
    status: r.status,
    title: (r.content as DailyContent | null)?.['zh-CN'].title ?? null,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
    attempts: r.attempts,
    regenerations: r.regenerations,
    error: r.error,
    generatedAt: r.generated_at?.toISOString() ?? null,
    publishedAt: r.published_at?.toISOString() ?? null,
  });

  async function find(shardId: number, day: string): Promise<Row> {
    const r = await base().where('shard_id', '=', shardId).where('day', '=', day).executeTakeFirst();
    if (!r) throw new AppError(ErrorCode.NOT_FOUND, 404, { what: 'daily', shardId, day });
    return r;
  }

  async function detail(shardId: number, day: string): Promise<AdminDailyDetailDto> {
    const r = await find(shardId, day);
    const content = r.content as DailyContent | null;
    // 正文和素材里的店都给名字：后台改稿时知道记号是哪家
    const article = content ? `${content['zh-CN'].title}\n${content['zh-CN'].body}` : '';
    return {
      ...toRow(r),
      facts: r.facts,
      content,
      rests: await restNames(db, shardId, `${article}\n${JSON.stringify(r.facts)}`),
    };
  }

  const audit = (
    actor: AdminActor,
    action: string,
    shardId: number,
    day: string,
    detail?: Record<string, unknown>,
  ) => writeAudit(db, { actor, action, target: `daily:${shardId}:${day}`, detail });

  return {
    async list(shardId: number): Promise<AdminDailyRowDto[]> {
      const from = addDays(gameDay(d.now()), -LIST_DAYS);
      const rows = await base()
        .where('shard_id', '=', shardId)
        .where('day', '>=', from)
        .orderBy('day', 'desc')
        .execute();
      return rows.map(toRow);
    },
    detail,

    async publish(actor: AdminActor, shardId: number, day: string): Promise<AdminDailyDetailDto> {
      const r = await find(shardId, day);
      if (!r.content) throw invalidState('daily_no_content', { day });
      await db
        .updateTable('town_daily')
        .set({ status: 'published', published_at: d.now(), published_by: actor.accountId })
        .where('shard_id', '=', shardId)
        .where('day', '=', day)
        .execute();
      await audit(actor, 'daily.publish', shardId, day);
      return detail(shardId, day);
    },

    async hide(actor: AdminActor, shardId: number, day: string): Promise<AdminDailyDetailDto> {
      await find(shardId, day);
      await db
        .updateTable('town_daily')
        .set({ status: 'hidden' })
        .where('shard_id', '=', shardId)
        .where('day', '=', day)
        .execute();
      await audit(actor, 'daily.hide', shardId, day);
      return detail(shardId, day);
    },

    /** 手改简中、英文：和 AI 的输出一样检查；繁中重新转；还没内容的变成草稿 */
    async edit(
      actor: AdminActor,
      shardId: number,
      day: string,
      b: AdminDailyEditBody,
    ): Promise<AdminDailyDetailDto> {
      const r = await find(shardId, day);
      const facts = r.facts as DailyFacts;
      let content: DailyContent;
      try {
        const zh = parseArticle(JSON.stringify(b.zh), 'zh-CN', 1);
        const en = parseArticle(JSON.stringify(b.en), 'en', 1);
        checkArticle(zh, facts);
        sameTokens(zh, en);
        checkArticle(en, facts, 'en');
        content = { 'zh-CN': zh, en, 'zh-TW': toTw(zh) };
      } catch (err) {
        throw invalidState('daily_check', { message: err instanceof Error ? err.message : String(err) });
      }
      await db
        .updateTable('town_daily')
        .set({
          content: JSON.stringify(content),
          ...(r.status === 'pending' ? { status: 'draft' as const } : {}),
        })
        .where('shard_id', '=', shardId)
        .where('day', '=', day)
        .execute();
      await audit(actor, 'daily.edit', shardId, day);
      return detail(shardId, day);
    },

    /** 重新调用 AI；结果一律是草稿。已发布的要先撤下 */
    async regenerate(actor: AdminActor, shardId: number, day: string): Promise<AdminDailyDetailDto> {
      const writer = game.app.writer;
      if (!writer) throw invalidState('daily_no_key');
      const today = gameDay(d.now());
      if (day >= today) throw invalidState('daily_future', { day });
      // 新闻只留 30 天：更早的重新生成会拿几乎空的素材盖掉原来的（backlog）
      if (day < addDays(today, -REGEN_DAYS)) throw invalidState('daily_too_old', { day, days: REGEN_DAYS });
      // 不存在的区服先报出来：下面建行会撞外键报 500（backlog 1010）
      const shard = await db.selectFrom('shard').select('id').where('id', '=', shardId).executeTakeFirst();
      if (!shard) throw new AppError(ErrorCode.SHARD_NOT_FOUND, 404);
      // 行不存在先建（素材生成时写），再原子地占一次额度：同时点两次也超不过上限（backlog）
      await db
        .insertInto('town_daily')
        .values({ shard_id: shardId, day, status: 'pending', facts: '{}' })
        .onConflict((oc) => oc.columns(['shard_id', 'day']).doNothing())
        .execute();
      const took = await db
        .updateTable('town_daily')
        .set({ regenerations: sql<number>`regenerations + 1` })
        .where('shard_id', '=', shardId)
        .where('day', '=', day)
        .where('status', '!=', 'published')
        .where('regenerations', '<', MAX_REGENERATIONS)
        .returning('regenerations')
        .executeTakeFirst();
      if (!took) {
        if ((await find(shardId, day)).status === 'published') throw invalidState('daily_published', { day });
        throw limitReached('daily_regenerate', { max: MAX_REGENERATIONS });
      }
      const t = (await d.shards.settings(shardId)).tuning.daily;
      try {
        await generateDaily(d, writer, shardId, day, {
          maxEvents: t.maxEvents,
          autoPublish: false,
          force: true,
          // 后台是同步请求：赶在 Cloudflare 100 秒超时前结束（backlog）
          signal: AbortSignal.timeout(REGEN_TIMEOUT_MS),
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw invalidState('daily_failed', { message: err instanceof Error ? err.message : String(err) });
      }
      await audit(actor, 'daily.regenerate', shardId, day);
      return detail(shardId, day);
    },
  };
}

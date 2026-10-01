import { sql } from 'kysely';
import type { AnnouncementDto, AnnouncementsDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { notFound } from '../equip/service';

const LIMIT = 20;

/** 公告（设计 裁定 11、12）：按游戏时钟判断生效时间段；重要公告按账号记已看。不受功能开关影响 */
export function createAnnounceService(d: GameDeps) {
  function active() {
    const now = d.now();
    return d.db
      .selectFrom('announcement as a')
      .where('a.deleted_at', 'is', null)
      .where('a.starts_at', '<=', now)
      .where('a.ends_at', '>', now)
      .orderBy('a.important', 'desc')
      .orderBy('a.starts_at', 'desc')
      .orderBy('a.id', 'desc')
      .limit(LIMIT);
  }
  const toDto = (r: {
    id: number;
    title: string;
    body: string;
    important: boolean;
    starts_at: Date;
    ends_at: Date;
    seen: boolean;
  }): AnnouncementDto => ({
    id: r.id,
    title: r.title,
    body: r.body,
    important: r.important,
    startsAt: r.starts_at.toISOString(),
    endsAt: r.ends_at.toISOString(),
    seen: r.seen,
  });

  return {
    /** 本区服和全部区服的有效公告，带本账号是否已看 */
    async list(ctx: RestCtx): Promise<AnnouncementsDto> {
      const rows = await active()
        .where((eb) => eb.or([eb('a.shard_id', 'is', null), eb('a.shard_id', '=', ctx.shardId)]))
        .select(['a.id', 'a.title', 'a.body', 'a.important', 'a.starts_at', 'a.ends_at'])
        .select(
          sql<boolean>`exists (select 1 from announcement_seen s where s.announcement_id = a.id and s.account_id = ${ctx.accountId})`.as(
            'seen',
          ),
        )
        .execute();
      return { items: rows.map(toDto) };
    },
    /** 登录页用，不用登录：只给全部区服的公告（登录前不知道玩家在哪个区） */
    async publicList(): Promise<AnnouncementsDto> {
      const rows = await active()
        .where('a.shard_id', 'is', null)
        .select(['a.id', 'a.title', 'a.body', 'a.important', 'a.starts_at', 'a.ends_at'])
        .execute();
      return { items: rows.map((r) => toDto({ ...r, seen: true })) };
    },
    async seen(ctx: RestCtx, id: number): Promise<void> {
      const a = await d.db
        .selectFrom('announcement')
        .select('id')
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .where((eb) => eb.or([eb('shard_id', 'is', null), eb('shard_id', '=', ctx.shardId)]))
        .executeTakeFirst();
      if (!a) throw notFound('announcement', id);
      await d.db
        .insertInto('announcement_seen')
        .values({ account_id: ctx.accountId, announcement_id: id })
        .onConflict((oc) => oc.doNothing())
        .execute();
    },
  };
}
export type AnnounceService = ReturnType<typeof createAnnounceService>;

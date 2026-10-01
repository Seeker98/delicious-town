import type { MailListDto } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { runOp, type Op } from '../../core/op';
import type { JobLogger } from '../../worker/scheduler';
import { claimAll, claimOne, markRead, removeMail, unreadCount, visibleMails, type MailRest } from './inbox';

/** 玩家邮箱（子项目 6A） */
export function createMailService(d: GameDeps) {
  const op = <T>(ctx: RestCtx, source: string, fn: (o: Op) => Promise<T>) =>
    runOp(d, ctx, { feature: 'mail', source }, fn);
  /** 读接口不锁店：只读出判断可见性和等级要的字段 */
  async function restOf(ctx: RestCtx): Promise<MailRest> {
    return d.db
      .selectFrom('restaurant')
      .select(['id', 'shard_id', 'level'])
      .where('id', '=', ctx.restaurantId)
      .executeTakeFirstOrThrow();
  }

  return {
    async list(ctx: RestCtx): Promise<MailListDto> {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mail');
      const rest = await restOf(ctx);
      const [items, unread] = await Promise.all([
        visibleMails(d.db, d.config, rest, { limit: s.tuning.mail.listMax }),
        unreadCount(d.db, rest),
      ]);
      return { items, unread, level: rest.level };
    },
    async unread(ctx: RestCtx): Promise<{ count: number }> {
      await d.shards.ensureFeature(ctx.shardId, 'mail');
      return { count: await unreadCount(d.db, await restOf(ctx)) };
    },
    read: (ctx: RestCtx, id: number) => op(ctx, 'mail.read', (o) => markRead(o, id)),
    claim: (ctx: RestCtx, id: number) => op(ctx, 'mail.claim', (o) => claimOne(o, id)),
    async claimAll(ctx: RestCtx, log?: Pick<JobLogger, 'error'>) {
      const s = await d.shards.ensureFeature(ctx.shardId, 'mail');
      return claimAll(d, ctx, await restOf(ctx), s.tuning.mail.listMax, log);
    },
    remove: (ctx: RestCtx, id: number) => op(ctx, 'mail.delete', (o) => removeMail(o, id)),
  };
}
export type MailService = ReturnType<typeof createMailService>;

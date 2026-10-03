import { sql, type Kysely } from 'kysely';
import type { GameConfig } from '@dt/config';
import type { MailClaimAllDto, MailClaimDto, MailDto, MailTplKey, RewardItems } from '@dt/shared';
import type { GameDeps, RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { runOp, type Op, type OpResult } from '../../core/op';
import type { DB } from '../../db/schema';
import { notFound } from '../equip/service';
import { brokenItems, grantRewardOp } from './reward';
import { AppError } from '../../http/errors';
import type { JobLogger } from '../../worker/scheduler';
import { claimBlock, hasItems } from './rules';

/** 判断可见性需要的餐厅字段；created_at 不读出来，在 SQL 里按店 id 取，避免毫秒截断 */
export interface MailRest {
  id: number;
  shard_id: number;
  level: number;
}

/**
 * 对本店可见、没删除的邮件（设计 裁定 2、4、8）：没撤回、没过期；
 * 区服和全部区服的邮件只给发送时已存在的店（restaurant.created_at <= mail.created_at，都是数据库时钟）；
 * 单店邮件发给谁就是谁的，不比较时间
 */
function visibleQuery(db: Kysely<DB>, rest: MailRest) {
  const restCreated = sql<Date>`(select created_at from restaurant where id = ${rest.id})`;
  return db
    .selectFrom('mail as m')
    .leftJoin('mail_state as s', (j) => j.onRef('s.mail_id', '=', 'm.id').on('s.rest_id', '=', rest.id))
    .where('m.revoked_at', 'is', null)
    .where('m.expires_at', '>', sql<Date>`now()`)
    .where('s.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb.and([eb('m.scope', '=', 'rest'), eb('m.rest_id', '=', rest.id)]),
        eb.and([
          eb('m.scope', '=', 'shard'),
          eb('m.shard_id', '=', rest.shard_id),
          eb('m.created_at', '>=', restCreated),
        ]),
        eb.and([eb('m.scope', '=', 'all'), eb('m.created_at', '>=', restCreated)]),
      ]),
    );
}

export async function visibleMails(
  db: Kysely<DB>,
  config: GameConfig,
  rest: MailRest,
  opts: { id?: number; limit: number },
): Promise<MailDto[]> {
  let q = visibleQuery(db, rest).select([
    'm.id',
    'm.title',
    'm.body',
    'm.tpl',
    'm.tpl_params',
    'm.items',
    'm.source',
    'm.min_level',
    'm.created_at',
    'm.expires_at',
    's.read_at',
    's.claimed_at',
  ]);
  if (opts.id !== undefined) q = q.where('m.id', '=', opts.id);
  const rows = await q.orderBy('m.created_at', 'desc').orderBy('m.id', 'desc').limit(opts.limit).execute();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    tpl: r.tpl ? { key: r.tpl as MailTplKey, params: r.tpl_params ?? {} } : null,
    // 发送时已经校验过格式
    items: (r.items as RewardItems | null) ?? null,
    source: r.source,
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    read: r.read_at !== null,
    claimed: r.claimed_at !== null,
    minLevel: r.min_level,
    broken: brokenItems(config, (r.items as RewardItems | null) ?? null),
  }));
}

export async function unreadCount(db: Kysely<DB>, rest: MailRest): Promise<number> {
  const r = await visibleQuery(db, rest)
    .where('s.read_at', 'is', null)
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

async function mustSee(o: Op, id: number): Promise<MailDto> {
  const [m] = await visibleMails(o.tx, o.config, o.rest, { id, limit: 1 });
  if (!m) throw notFound('mail', id);
  return m;
}

/**
 * 领一封邮件的附件（设计 裁定 5）：在锁店事务里重新读邮件，撤回、过期后就领不了；
 * "已领"只能从空写一次，并发的第二次在锁店处排队，拿到锁后读到已领
 */
export async function claimOne(o: Op, id: number): Promise<MailClaimDto> {
  const m = await mustSee(o, id);
  const block = claimBlock(m, o.rest.level);
  if (block === 'mail_level') throw invalidState(block, { level: m.minLevel });
  if (block) throw invalidState(block);
  const r = await sql<{ mail_id: number }>`
    insert into mail_state (mail_id, rest_id, claimed_at, read_at)
    values (${id}, ${o.rest.id}, now(), now())
    on conflict (mail_id, rest_id) do update
      set claimed_at = now(), read_at = coalesce(mail_state.read_at, now())
      where mail_state.claimed_at is null
    returning mail_id`.execute(o.tx);
  if (r.rows.length === 0) throw invalidState('mail_claimed');
  const items = m.items!;
  await grantRewardOp(o, items, {
    source: 'mail.claim',
    logType: 'mail.claim',
    logParams: { mailId: id, title: m.title, ...(m.tpl ? { tpl: m.tpl } : {}) },
  });
  return { id, items };
}

export async function markRead(o: Op, id: number): Promise<void> {
  await mustSee(o, id);
  await sql`
    insert into mail_state (mail_id, rest_id, read_at) values (${id}, ${o.rest.id}, now())
    on conflict (mail_id, rest_id) do update set read_at = coalesce(mail_state.read_at, now())`.execute(o.tx);
}

/** 删除只影响自己；附件没领时不能删（设计 裁定 9），附件失效的除外 */
export async function removeMail(o: Op, id: number): Promise<void> {
  const m = await mustSee(o, id);
  if (hasItems(m.items) && !m.claimed && !m.broken) throw invalidState('mail_unclaimed');
  await sql`
    insert into mail_state (mail_id, rest_id, read_at, deleted_at) values (${id}, ${o.rest.id}, now(), now())
    on conflict (mail_id, rest_id) do update set deleted_at = now()`.execute(o.tx);
}

/**
 * 一键全领：每封各自一个事务，附件失效的不领；一封出错只计失败并记日志，
 * 其他照常领，出错的那封保持未领。别的标签页抢先领了（mail_claimed）不算失败
 */
export async function claimAll(
  d: GameDeps,
  ctx: RestCtx,
  rest: MailRest,
  limit: number,
  log?: Pick<JobLogger, 'error'>,
): Promise<OpResult<MailClaimAllDto>> {
  const ids = (await visibleMails(d.db, d.config, rest, { limit }))
    .filter((m) => claimBlock(m, rest.level) === null)
    .map((m) => m.id);
  const out: MailClaimAllDto = { claimed: 0, failed: 0, items: [] };
  const events: OpResult<unknown>['events'] = [];
  for (const id of ids) {
    try {
      const r = await runOp(d, ctx, { feature: 'mail', source: 'mail.claim' }, (o) => claimOne(o, id));
      out.claimed++;
      out.items.push(r.data.items);
      events.push(...r.events);
    } catch (err) {
      if (err instanceof AppError && err.code === 'INVALID_STATE' && err.params?.reason === 'mail_claimed')
        continue;
      out.failed++;
      log?.error({ err, mailId: id }, 'mail claim failed');
    }
  }
  return { data: out, events };
}

import { sql, type Kysely } from 'kysely';
import { gameDay, type RewardItems } from '@dt/shared';
import type { DB } from '../../db/schema';
import type { Game } from '../../game';
import type { JobLogger } from '../../worker/scheduler';
import { sendMail } from '../mail/send';

type Stage = 'lv10' | 'lv30';
const STAGES: Stage[] = ['lv10', 'lv30'];
const BATCH = 500;

export interface InviteScanResult {
  newbie: number;
  sent: number;
  pending: number;
  capped: number;
  failed: number;
}

/** 本月已计人数（设计 裁定 20）：发了或待发的不同被邀请人；超上限记 capped 的不算 */
export async function monthCount(db: Kysely<DB>, inviter: number, month: string): Promise<number> {
  const r = await db
    .selectFrom('invite_reward')
    .select(sql<string>`count(distinct invitee_account_id)`.as('n'))
    .where('inviter_account_id', '=', inviter)
    .where('month', '=', month)
    .where('status', 'in', ['sent', 'pending'])
    .executeTakeFirstOrThrow();
  return Number(r.n);
}

/** 邀请人在这个区服的店（非 NPC，最先开的那家）；没有为 undefined */
async function inviterRest(db: Kysely<DB>, inviter: number, shardId: number): Promise<number | undefined> {
  const r = await db
    .selectFrom('restaurant')
    .select('id')
    .where('account_id', '=', inviter)
    .where('shard_id', '=', shardId)
    .where('npc', '=', false)
    .orderBy('id')
    .limit(1)
    .executeTakeFirst();
  return r?.id;
}

const rewardMail = (restName: string, level: number) =>
  `你邀请的「${restName}」达到 ${level} 级, 感谢你把朋友带到小镇！`;

/**
 * 邀请扫描（设计 §7、裁定 18~21）：新手礼包、10 级和 30 级邀请人奖励、补发待发。
 * 每一项各自一个事务，出错记日志、计 failed，下一分钟会再扫到
 */
export async function scanInvites(game: Game, log: JobLogger, shardId: number): Promise<InviteScanResult> {
  const db = game.app.db;
  const tuning = (await game.shards.settings(shardId)).tuning.invite;
  const month = gameDay(game.deps.now()).slice(0, 7);
  const out: InviteScanResult = { newbie: 0, sent: 0, pending: 0, capped: 0, failed: 0 };

  async function each<T>(rows: T[], what: string, fn: (row: T) => Promise<void>) {
    for (const row of rows) {
      try {
        await fn(row);
      } catch (err) {
        out.failed++;
        log.error({ err, shardId, row }, `ops-scan invite ${what} failed`);
      }
    }
  }

  // 1. 新手礼包：发到被邀请人最先开的那家店，那家店在本区服时才发
  const newbies = await sql<{ account_id: number; rest_id: number }>`
    select a.id as account_id, r.id as rest_id
    from account a
    join lateral (
      select id, shard_id from restaurant where account_id = a.id and not npc order by id limit 1
    ) r on true
    where a.invited_by is not null
      and r.shard_id = ${shardId}
      and not exists (
        select 1 from invite_reward w where w.invitee_account_id = a.id and w.stage = 'newbie'
      )
    order by a.id
    limit ${BATCH}`.execute(db);
  await each(newbies.rows, 'newbie', async (row) => {
    await db.transaction().execute(async (tx) => {
      const hit = await tx
        .insertInto('invite_reward')
        .values({
          invitee_account_id: row.account_id,
          stage: 'newbie',
          inviter_account_id: null,
          shard_id: shardId,
          invitee_rest_id: row.rest_id,
          status: 'sent',
          month,
          sent_at: sql<Date>`now()`,
        })
        .onConflict((oc) => oc.doNothing())
        .returning('invitee_account_id')
        .executeTakeFirst();
      if (!hit) return;
      const mailId = await sendMail(tx, {
        scope: 'rest',
        shardId,
        restId: row.rest_id,
        minLevel: null,
        title: '欢迎来到小镇',
        body: '你是被朋友邀请来的, 送你一份新手礼包。',
        tpl: { key: 'invite.welcome', params: {} },
        items: tuning.newbie as RewardItems,
        source: 'invite',
        actorAccountId: null,
      });
      await tx
        .updateTable('invite_reward')
        .set({ mail_id: mailId })
        .where('invitee_account_id', '=', row.account_id)
        .where('stage', '=', 'newbie')
        .execute();
      out.newbie++;
    });
  });

  // 2. 邀请人奖励：被邀请人验证了邮箱、本区服有店达到该等级；每月上限按人计
  for (const stage of STAGES) {
    const level = tuning.levels[stage];
    const rows = await sql<{ invitee: number; inviter: number; rest_id: number; name: string }>`
      select distinct on (a.id) a.id as invitee, a.invited_by as inviter, r.id as rest_id, r.name
      from account a
      join restaurant r on r.account_id = a.id and r.shard_id = ${shardId} and not r.npc and r.level >= ${level}
      where a.invited_by is not null
        and a.email_verified_at is not null
        and not exists (
          select 1 from invite_reward w where w.invitee_account_id = a.id and w.stage = ${stage}
        )
      order by a.id, r.level desc, r.id
      limit ${BATCH}`.execute(db);
    await each(rows.rows, stage, async (row) => {
      await db.transaction().execute(async (tx) => {
        await sql`select pg_advisory_xact_lock(hashtext(${`invite:${row.inviter}`}))`.execute(tx);
        const already = await tx
          .selectFrom('invite_reward')
          .select('invitee_account_id')
          .where('inviter_account_id', '=', row.inviter)
          .where('invitee_account_id', '=', row.invitee)
          .where('month', '=', month)
          .where('status', 'in', ['sent', 'pending'])
          .executeTakeFirst();
        const full = !already && (await monthCount(tx, row.inviter, month)) >= tuning.monthlyCap;
        const target = full ? undefined : await inviterRest(tx, row.inviter, shardId);
        const status = full ? 'capped' : target === undefined ? 'pending' : 'sent';
        const hit = await tx
          .insertInto('invite_reward')
          .values({
            invitee_account_id: row.invitee,
            stage,
            inviter_account_id: row.inviter,
            shard_id: shardId,
            invitee_rest_id: row.rest_id,
            status,
            month,
            sent_at: status === 'sent' ? sql<Date>`now()` : null,
          })
          .onConflict((oc) => oc.doNothing())
          .returning('invitee_account_id')
          .executeTakeFirst();
        if (!hit) return;
        if (status === 'sent') {
          const mailId = await sendMail(tx, {
            scope: 'rest',
            shardId,
            restId: target!,
            minLevel: null,
            title: '邀请奖励',
            body: rewardMail(row.name, level),
            tpl: { key: 'invite.reward', params: { rest: row.name, level } },
            items: tuning.rewards[stage] as RewardItems,
            source: 'invite',
            actorAccountId: null,
          });
          await tx
            .updateTable('invite_reward')
            .set({ mail_id: mailId })
            .where('invitee_account_id', '=', row.invitee)
            .where('stage', '=', stage)
            .execute();
        }
        out[status]++;
      });
    });
  }

  // 3. 补发待发：邀请人后来在本区服开了店；不再重新判断上限
  const pending = await db
    .selectFrom('invite_reward as w')
    .innerJoin('restaurant as r', 'r.id', 'w.invitee_rest_id')
    .select(['w.invitee_account_id', 'w.stage', 'w.inviter_account_id', 'r.name'])
    .where('w.shard_id', '=', shardId)
    .where('w.status', '=', 'pending')
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom('restaurant as ir')
          .select('ir.id')
          .whereRef('ir.account_id', '=', 'w.inviter_account_id')
          .where('ir.shard_id', '=', shardId)
          .where('ir.npc', '=', false),
      ),
    )
    .orderBy('w.created_at')
    .limit(BATCH)
    .execute();
  await each(pending, 'pending', async (row) => {
    const stage = row.stage as Stage;
    await db.transaction().execute(async (tx) => {
      const target = await inviterRest(tx, row.inviter_account_id!, shardId);
      if (target === undefined) return;
      const hit = await tx
        .updateTable('invite_reward')
        .set({ status: 'sent', sent_at: sql<Date>`now()` })
        .where('invitee_account_id', '=', row.invitee_account_id)
        .where('stage', '=', stage)
        .where('status', '=', 'pending')
        .returning('invitee_account_id')
        .executeTakeFirst();
      if (!hit) return;
      const mailId = await sendMail(tx, {
        scope: 'rest',
        shardId,
        restId: target,
        minLevel: null,
        title: '邀请奖励',
        body: rewardMail(row.name, tuning.levels[stage]),
        tpl: { key: 'invite.reward', params: { rest: row.name, level: tuning.levels[stage] } },
        items: tuning.rewards[stage] as RewardItems,
        source: 'invite',
        actorAccountId: null,
      });
      await tx
        .updateTable('invite_reward')
        .set({ mail_id: mailId })
        .where('invitee_account_id', '=', row.invitee_account_id)
        .where('stage', '=', stage)
        .execute();
      out.sent++;
    });
  });

  return out;
}

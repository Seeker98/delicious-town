import { WISH_TREE_ICON } from '@dt/config';
import type { RewardItems } from '@dt/shared';
import type { GameDeps } from '../../core/deps';
import { restLog, runSystemOp } from '../../core/op';
import { isBanned } from '../admin/ban';
import { randomAward } from '../award/random';
import { sendMail } from '../mail/send';
import { postNews } from '../news/news';
import { pickWinner } from './rules';

type Log = { error(obj: object, msg: string): void };
const NO_LOG: Log = { error: () => {} };
/** 安慰奖一次最多处理几家（多出的下一分钟接着发） */
const BATCH = 500;

/**
 * 开奖（许愿树设计 §1.1）：到了开奖时刻还是 open 的轮，锁住这一轮（许愿拿共享锁），
 * 从许过愿、没被封号的店里等概率抽 1 家；同一个事务里发邮件（道具 + 称号）和广播新闻。
 * 被封号的店直接记成已处理（不发安慰奖）；没有能中奖的店时状态 empty，不发邮件和新闻
 */
export async function drawDue(d: GameDeps, shardId: number, now: Date): Promise<number> {
  const due = await d.db
    .selectFrom('wish_round')
    .select('id')
    .where('shard_id', '=', shardId)
    .where('status', '=', 'open')
    .where('ends_at', '<=', now)
    .execute();
  if (due.length === 0) return 0;
  const titleDays = (await d.shards.settings(shardId)).tuning.wishTree.titleDays;
  const icon = d.config.bundle.looks.icons.find((i) => i.key === WISH_TREE_ICON);
  let n = 0;
  for (const { id } of due) {
    const drawn = await d.db.transaction().execute(async (tx) => {
      const round = await tx
        .selectFrom('wish_round')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!round || round.status !== 'open') return false;
      const rows = await tx
        .selectFrom('wish_entry as e')
        .innerJoin('restaurant as r', 'r.id', 'e.rest_id')
        .innerJoin('account as a', 'a.id', 'r.account_id')
        .select(['e.rest_id', 'a.banned_at', 'a.banned_until'])
        .where('e.round_id', '=', id)
        .execute();
      const banned = rows.filter((x) => isBanned(x, now)).map((x) => x.rest_id);
      const winner = pickWinner(
        rows.filter((x) => !isBanned(x, now)).map((x) => x.rest_id),
        d.rng(),
      );
      await tx
        .updateTable('wish_round')
        .set({
          status: winner === null ? 'empty' : 'drawn',
          winner_rest_id: winner,
          entries: rows.length,
          drawn_at: now,
        })
        .where('id', '=', id)
        .execute();
      if (banned.length > 0)
        await tx
          .updateTable('wish_entry')
          .set({ settled_at: now })
          .where('round_id', '=', id)
          .where('rest_id', 'in', banned)
          .execute();
      if (winner === null) return true;
      await tx
        .updateTable('wish_entry')
        .set({ won: true, settled_at: now })
        .where('round_id', '=', id)
        .where('rest_id', '=', winner)
        .execute();
      const items: RewardItems = {
        goods: [{ id: round.goods_id, num: round.num }],
        icons: [{ key: WISH_TREE_ICON, title: icon?.title ?? '许愿成真', days: titleDays }],
      };
      await sendMail(tx, {
        scope: 'rest',
        shardId,
        restId: winner,
        minLevel: null,
        title: '许愿树: 愿望成真',
        body: `你在许愿树下许的愿成真了！附件是树上结的道具和称号「许愿成真」, 称号领取后 ${titleDays} 天有效。`,
        tpl: { key: 'wishtree.win', params: { goodsId: round.goods_id, num: round.num, titleDays } },
        items,
        source: 'wishtree',
        actorAccountId: null,
      });
      await postNews(
        tx,
        {
          shardId,
          type: 'wishtree.win',
          restId: winner,
          params: { goodsId: round.goods_id, num: round.num, entries: rows.length },
        },
        now,
      );
      return true;
    });
    if (drawn) n++;
  }
  return n;
}

/**
 * 安慰奖（许愿树设计 §3.2）：开过奖的轮里还没处理的许愿，每家店一个事务发一份随机奖励，写 award、settled_at；
 * 重跑只补没处理的，某家失败只记日志，下一分钟重试
 */
export async function consoleDue(
  d: GameDeps,
  shardId: number,
  now: Date,
  log: Log = NO_LOG,
): Promise<{ done: number; failed: number }> {
  const todo = await d.db
    .selectFrom('wish_entry as e')
    .innerJoin('wish_round as w', 'w.id', 'e.round_id')
    .select(['e.rest_id', 'e.round_id', 'w.goods_id', 'w.num'])
    .where('e.shard_id', '=', shardId)
    .where('e.settled_at', 'is', null)
    .where('w.status', '!=', 'open')
    .orderBy('e.round_id')
    .orderBy('e.rest_id')
    .limit(BATCH)
    .execute();
  let done = 0;
  let failed = 0;
  for (const x of todo) {
    try {
      const ok = await runSystemOp(d, shardId, x.rest_id, { source: 'wishtree', now }, async (op) => {
        // 锁住这一条再看一次：几个进程同时跑时只发一次
        const e = await op.tx
          .selectFrom('wish_entry')
          .select('settled_at')
          .where('round_id', '=', x.round_id)
          .where('rest_id', '=', x.rest_id)
          .forUpdate()
          .executeTakeFirst();
        if (!e || e.settled_at !== null) return false;
        const award = await randomAward(op, {
          level: op.tuning.wishTree.consolationLevel,
          source: 'wishtree.lost',
        });
        await op.tx
          .updateTable('wish_entry')
          .set({ award: JSON.stringify(award), settled_at: now })
          .where('round_id', '=', x.round_id)
          .where('rest_id', '=', x.rest_id)
          .execute();
        restLog(op, 'wishtree.lost', { roundId: Number(x.round_id), goodsId: x.goods_id, num: x.num, award });
        return true;
      });
      if (ok) done++;
    } catch (err) {
      log.error({ err, shardId, restId: x.rest_id }, 'wishtree consolation failed');
      failed++;
    }
  }
  return { done, failed };
}

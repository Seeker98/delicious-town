import { GOODS } from '@dt/config';
import {
  ErrorCode,
  addDays,
  gameDay,
  type GameEvent,
  type ReturnAllDto,
  type ThumbResultDto,
  type ThumbTodayDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import type { GameDeps, RestCtx } from '../../core/deps';
import { requirement } from '../../core/errors';
import { opAgg } from '../../core/luck';
import type { OpResult } from '../../core/op';
import { feedLog, runPairOp } from '../../core/pair';
import { gainRenown, gainStrength } from '../../core/resources';
import { AppError } from '../../http/errors';
import { incrementDaily } from '../counter/dailyCounter';
import { grantGoodsOp } from '../store/goods';
import { bumpCounters } from '../achieve/counters';

/** 连着这么多天给同一家店点赞：隐藏成就“死忠粉” */
const LOYAL_DAYS = 30;

/** 点赞、一键回赞（规格书 13 §13.7） */
export function createThumbs(d: GameDeps) {
  function up(ctx: RestCtx, restId: number): Promise<OpResult<ThumbResultDto>> {
    return runPairOp(
      d,
      ctx,
      restId,
      { feature: 'friend', source: 'thumbs.up', friend: 'required' },
      async (p) => {
        const { me, them } = p;
        const t = me.tuning.friend.thumbs;
        const day = gameDay(me.now);
        if (me.rest.renown < 0) throw requirement('renown');
        const done = await me.tx
          .selectFrom('thumb')
          .select('to_rest')
          .where('day', '=', day)
          .where('from_rest', '=', me.rest.id)
          .where('to_rest', '=', them.rest.id)
          .executeTakeFirst();
        if (done) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'thumb' });
        const ip = ctx.ip || null;
        if (ip) {
          const byIp = await me.tx
            .selectFrom('thumb')
            .select('to_rest')
            .where('day', '=', day)
            .where('ip', '=', ip)
            .where('to_rest', '=', them.rest.id)
            .executeTakeFirst();
          if (byIp) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'thumb_ip' });
        }
        // 对方今天已经先赞过我：我这一赞对对方来说就是回赞过了（问题记录 601：以前记成没回赞，
        // 对方一键回赞时又去点一次，被“今天已赞过”挡下，显示回赞失败）
        const theyFirst = await me.tx
          .selectFrom('thumb')
          .select('to_rest')
          .where('day', '=', day)
          .where('from_rest', '=', them.rest.id)
          .where('to_rest', '=', me.rest.id)
          .executeTakeFirst();
        await me.tx
          .insertInto('thumb')
          .values({
            day,
            from_rest: me.rest.id,
            to_rest: them.rest.id,
            ip,
            created_at: me.now,
            returned: theyFirst !== undefined,
          })
          .execute();
        // 隐藏成就“死忠粉”：连着 30 天给同一家店点赞（一天一条，最近 30 天每天都有就是连着）
        const loyal = await me.tx
          .selectFrom('thumb')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('from_rest', '=', me.rest.id)
          .where('to_rest', '=', them.rest.id)
          .where('day', '>', addDays(day, -LOYAL_DAYS))
          .executeTakeFirstOrThrow();
        if (Number(loyal.n) >= LOYAL_DAYS) await bumpCounters(me, [['thumbs.loyal', 1]]);
        const count = await incrementDaily(me.tx, me.rest.id, 'thumbs.given', 1, day);
        const rewarded = count <= t.rewardTimes;
        let tickets = 0;
        let strength = 0;
        if (rewarded) {
          tickets = me.rng.int(t.ticketMax + 1);
          await grantGoodsOp(me, GOODS.mysteryTicket, tickets);
          if (me.rng.chance((await opAgg(me)).getStrengthRate ?? 0)) {
            strength = me.rng.intMin1(t.strengthMax);
            gainStrength(me, strength);
          }
        } else gainRenown(me, t.overRenown);
        await me.tx
          .updateTable('thumb')
          .set({ returned: true })
          .where('day', '=', day)
          .where('from_rest', '=', them.rest.id)
          .where('to_rest', '=', me.rest.id)
          .execute();
        await emitAction(me, 'thumbs.up');
        await emitAction(them, 'thumbs.received');
        feedLog(p, 'thumb');
        return { count, rewarded, tickets, strength };
      },
    );
  }

  return {
    up,

    async today(ctx: RestCtx): Promise<ThumbTodayDto[]> {
      const day = gameDay(d.now());
      const rows = await d.db
        .selectFrom('thumb as t')
        .innerJoin('restaurant as r', 'r.id', 't.from_rest')
        .select(['r.id', 'r.name', 'r.avatar', 't.created_at', 't.returned'])
        .where('t.day', '=', day)
        .where('t.to_rest', '=', ctx.restaurantId)
        .orderBy('t.created_at')
        .execute();
      // 今天我已经赞过的店也算回赞过（问题记录 601 的旧数据）
      const mine = new Set(
        (
          await d.db
            .selectFrom('thumb')
            .select('to_rest')
            .where('day', '=', day)
            .where('from_rest', '=', ctx.restaurantId)
            .execute()
        ).map((x) => x.to_rest),
      );
      return rows.map((r) => ({
        restId: r.id,
        name: r.name,
        avatar: r.avatar,
        at: r.created_at.toISOString(),
        returned: r.returned || mine.has(r.id),
      }));
    },

    /** 逐家回赞，各自独立事务；失败的列出错误码，不影响其他 */
    async returnAll(ctx: RestCtx): Promise<OpResult<ReturnAllDto>> {
      const day = gameDay(d.now());
      // 今天我已经赞过的店不算没回赞（旧数据里“我先赞、对方后赞”记成了没回赞，问题记录 601）
      const pending = await d.db
        .selectFrom('thumb as t')
        .select('t.from_rest')
        .where('t.day', '=', day)
        .where('t.to_rest', '=', ctx.restaurantId)
        .where('t.returned', '=', false)
        .where(({ not, exists, selectFrom }) =>
          not(
            exists(
              selectFrom('thumb as mine')
                .select('mine.to_rest')
                .where('mine.day', '=', day)
                .where('mine.from_rest', '=', ctx.restaurantId)
                .whereRef('mine.to_rest', '=', 't.from_rest'),
            ),
          ),
        )
        .orderBy('t.created_at')
        .execute();
      const data: ReturnAllDto = { ok: [], failed: [] };
      const events: GameEvent[] = [];
      for (const { from_rest } of pending) {
        try {
          const r = await up(ctx, from_rest);
          data.ok.push(from_rest);
          events.push(...r.events);
        } catch (e) {
          if (!(e instanceof AppError)) throw e;
          data.failed.push({ restId: from_rest, code: e.code });
        }
      }
      return { data, events };
    },
  };
}

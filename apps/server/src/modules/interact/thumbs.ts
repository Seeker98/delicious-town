import { GOODS } from '@dt/config';
import {
  ErrorCode,
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
        await me.tx
          .insertInto('thumb')
          .values({ day, from_rest: me.rest.id, to_rest: them.rest.id, ip, created_at: me.now })
          .execute();
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
      const rows = await d.db
        .selectFrom('thumb as t')
        .innerJoin('restaurant as r', 'r.id', 't.from_rest')
        .select(['r.id', 'r.name', 'r.avatar', 't.created_at', 't.returned'])
        .where('t.day', '=', gameDay(d.now()))
        .where('t.to_rest', '=', ctx.restaurantId)
        .orderBy('t.created_at')
        .execute();
      return rows.map((r) => ({
        restId: r.id,
        name: r.name,
        avatar: r.avatar,
        at: r.created_at.toISOString(),
        returned: r.returned,
      }));
    },

    /** 逐家回赞，各自独立事务；失败的列出错误码，不影响其他 */
    async returnAll(ctx: RestCtx): Promise<OpResult<ReturnAllDto>> {
      const pending = await d.db
        .selectFrom('thumb')
        .select('from_rest')
        .where('day', '=', gameDay(d.now()))
        .where('to_rest', '=', ctx.restaurantId)
        .where('returned', '=', false)
        .orderBy('created_at')
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

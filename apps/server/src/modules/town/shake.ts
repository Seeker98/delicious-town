import { ErrorCode, gameDay, type ShakeResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { RestCtx } from '../../core/deps';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { AppError } from '../../http/errors';
import { grantGoodsOp } from '../store/goods';
import { shakeCoin, shakeEgg } from './rules';

async function shakenBy(o: Op, day: string, col: 'ip' | 'device', value: string): Promise<boolean> {
  const r = await o.tx
    .selectFrom('town_shake')
    .select('id')
    .where('shard_id', '=', o.shardId)
    .where('day', '=', day)
    .where(col, '=', value)
    .executeTakeFirst();
  return r !== undefined;
}

/** 摇蟹老板钱包（设计文档 §3.4、裁定 12~14）。me、krab 两家店已按店号顺序锁住 */
export async function shake(me: Op, krab: Op, ctx: RestCtx): Promise<ShakeResultDto> {
  const s = me.tuning.town.shake;
  const day = gameDay(me.now);
  const mine = await me.tx
    .selectFrom('town_shake')
    .select('id')
    .where('shard_id', '=', me.shardId)
    .where('day', '=', day)
    .where('rest_id', '=', me.rest.id)
    .executeTakeFirst();
  if (mine) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'shake' });
  const ip = ctx.ip ?? '';
  const device = ctx.deviceId ?? '';
  if (s.limitIp && ip !== '' && (await shakenBy(me, day, 'ip', ip))) throw limitReached('shake_device');
  if (s.limitDevice && device !== '' && (await shakenBy(me, day, 'device', device)))
    throw limitReached('shake_device');
  if (krab.rest.coin <= 0) throw invalidState('krab_broke');
  const coin = Math.min(krab.rest.coin, shakeCoin(me.rest.star_level, s, me.rng));
  spendCoin(krab, coin);
  gainCoin(me, coin);
  const row = await me.tx
    .insertInto('town_shake')
    .values({ shard_id: me.shardId, day, rest_id: me.rest.id, ip, device, coin, created_at: me.now })
    .returning('id')
    .executeTakeFirstOrThrow();
  const egg = shakeEgg(row.id, s);
  if (egg) {
    await grantGoodsOp(me, egg.goodsId, egg.num);
    opNews(me, 'town.shake.lucky', egg);
  }
  restLog(me, 'town.shake', { coin, egg });
  await emitAction(me, 'krab.shake');
  return { coin, egg };
}

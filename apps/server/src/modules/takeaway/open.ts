import { GOODS } from '@dt/config';
import { ErrorCode } from '@dt/shared';
import { emitAction } from '../../core/action';
import { notEnough, requirement } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { gainRenown, spendCoin, spendDiamond } from '../../core/resources';
import { AppError } from '../../http/errors';
import { consumeGoods } from '../store/goods';
import { stateOf } from './common';

/** 开通（设计文档 §3.1）：检查顺序 已开通 → 星级 → 声望 → 付费；自己成为 1 号骑手 */
export async function openTakeaway(o: Op, way: 'ticket' | 'coin'): Promise<{ opened: true }> {
  const t = o.tuning.takeaway;
  if (await stateOf(o.tx, o.rest.id)) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'takeaway' });
  if (o.rest.star_level < t.openStar)
    throw requirement('star', { need: t.openStar, have: o.rest.star_level });
  if (o.rest.renown < t.openRenown) throw notEnough('renown', t.openRenown, o.rest.renown);
  if (way === 'ticket') {
    await consumeGoods(o, GOODS.takeawayTicket, 1);
  } else {
    spendCoin(o, t.openCoin);
    spendDiamond(o, t.openDiamond);
  }
  gainRenown(o, -t.openRenown);
  await o.tx.insertInto('takeaway_state').values({ rest_id: o.rest.id, opened_at: o.now }).execute();
  await o.tx
    .insertInto('takeaway_rider')
    .values({ rest_id: o.rest.id, rider_rest_id: o.rest.id, hired_at: o.now })
    .execute();
  restLog(o, 'takeaway.open', { way });
  await emitAction(o, 'takeaway.open');
  return { opened: true };
}

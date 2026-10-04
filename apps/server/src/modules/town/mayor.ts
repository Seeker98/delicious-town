import { GOODS } from '@dt/config';
import { ErrorCode, gameDay, type HiphopPlace, type TalkResultDto } from '@dt/shared';
import { invalidState } from '../../core/errors';
import { restLog, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { incrementDaily } from '../counter/dailyCounter';
import { hiphopDay } from '../hiphop/day';
import { grantGoodsOp } from '../store/goods';

/**
 * 镇长问答（设计文档 §2.3）：先看今天有没有嘻哈男孩的记录（没有就不占次数），再占每日次数。
 * 按地点比较：在某家餐厅时答"某家餐厅"就算对
 */
export async function askMayor(o: Op, place: HiphopPlace): Promise<TalkResultDto> {
  const day = await hiphopDay(o.tx, o.shardId, o.now);
  if (!day) throw invalidState('hiphop_not_out', { hour: o.tuning.hiphop.hour });
  if ((await incrementDaily(o.tx, o.rest.id, 'town.talk.mayor', 1, gameDay(o.now))) > 1)
    throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'mayor' });
  const right = day.place === place;
  const goodsId = right ? GOODS.mayorFavor : GOODS.mayorAgainst;
  await grantGoodsOp(o, goodsId, 1);
  restLog(o, 'town.mayor', { place, right });
  return {
    npc: 'mayor',
    talk: right ? 'mayorRight' : 'mayorWrong',
    rewards: [{ kind: 'goods', id: goodsId, num: 1 }],
  };
}

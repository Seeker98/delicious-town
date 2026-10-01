import { GOODS } from '@dt/config';
import { ErrorCode, type HiphopTipBody, type HiphopTipDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import type { RestCtx } from '../../core/deps';
import { invalidState } from '../../core/errors';
import { opLuck } from '../../core/luck';
import { opNews, restLog, type Op } from '../../core/op';
import { gainExp, spendCoin, spendDiamond } from '../../core/resources';
import { AppError } from '../../http/errors';
import { subFoods } from '../cupboard/foods';
import { grantGoodsOp } from '../store/goods';
import type { WorldService } from '../world/service';
import { HIPHOP_RESTAURANT, hiphopDay, hiphopOut } from './day';
import { coinWorth, diamondWorth, foodWorth, krabRoll, tipExp, tipTickets } from './rules';

/**
 * 打赏（设计文档 §2.2）：今天他必须在请求说的地点；价值达到门槛时判定蟹币；
 * 餐厅地点的店主用食材打赏且中了蟹币时额外得神秘礼券（原版写在中蟹币的分支里）
 */
export async function tip(o: Op, world: WorldService, ctx: RestCtx, b: HiphopTipBody): Promise<HiphopTipDto> {
  const t = o.tuning.hiphop;
  const day = await hiphopDay(o.tx, o.shardId, o.now);
  const here =
    day !== null &&
    hiphopOut(o.now, t) &&
    day.place === b.place &&
    (b.place !== HIPHOP_RESTAURANT || day.rest_id === b.restId);
  if (!day || !here) throw invalidState('not_here');
  if (t.requireVerifiedEmail) {
    const acc = await o.tx
      .selectFrom('account')
      .select('email_verified_at')
      .where('id', '=', ctx.accountId)
      .executeTakeFirstOrThrow();
    if (!acc.email_verified_at) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403);
  }
  let worth = 0;
  let exp = 0;
  let fresh = true;
  if (b.kind === 'food') {
    if (!b.foodsId) throw invalidState('no_food');
    await subFoods(o, b.foodsId, b.num);
    if (b.foodsId === day.foods_id) {
      const f = o.config.requireFood(day.foods_id);
      worth = foodWorth(f.coin, f.level, b.num);
    } else fresh = false;
  } else if (b.kind === 'coin') {
    if (b.num > t.coinMax) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { max: t.coinMax });
    spendCoin(o, b.num);
    worth = coinWorth(b.num, t);
    exp = tipExp('coin', b.num, o.rng.next(), t);
  } else {
    if (b.num > t.diamondMax) throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { max: t.diamondMax });
    spendDiamond(o, b.num);
    worth = diamondWorth(b.num, t);
    exp = tipExp('diamond', b.num, o.rng.next(), t);
  }
  if (exp > 0) gainExp(o, exp);
  let krabCoin = 0;
  let tickets = 0;
  let rainbow = false;
  let reply: HiphopTipDto['reply'] = 'thanks';
  if (worth >= day.worth) {
    const snap = await world.ensure(o.shardId, o.now, o.tx);
    const weatherRate = snap.weather.effects.krabCoinRate ?? 0;
    const roll = krabRoll(o.rng.next(), t, weatherRate, b.kind === 'food', (await opLuck(o)).rate);
    reply = 'wanted';
    if (roll.hit) {
      reply = 'krab';
      rainbow = roll.rainbow;
      krabCoin = Math.floor(worth / day.worth);
      await grantGoodsOp(o, GOODS.krabCoin, krabCoin);
      if (b.kind === 'food' && day.place === HIPHOP_RESTAURANT && day.rest_id === o.rest.id) {
        tickets = tipTickets(b.num, o.config.requireFood(day.foods_id).level);
        await grantGoodsOp(o, GOODS.mysteryTicket, tickets);
      }
      opNews(o, 'hiphop.krab', { num: krabCoin });
    }
  }
  await o.tx
    .insertInto('hiphop_tip')
    .values({
      shard_id: o.shardId,
      rest_id: o.rest.id,
      kind: b.kind,
      num: b.num,
      foods_id: b.kind === 'food' ? b.foodsId! : null,
      worth,
      krab_coin: krabCoin,
      created_at: o.now,
    })
    .execute();
  await emitAction(o, 'hiphop.reward');
  restLog(o, 'hiphop.tip', {
    kind: b.kind,
    num: b.num,
    foodsId: b.foodsId ?? null,
    worth,
    krabCoin,
    tickets,
  });
  return { worth, exp, krabCoin, tickets, rainbow, fresh, reply };
}

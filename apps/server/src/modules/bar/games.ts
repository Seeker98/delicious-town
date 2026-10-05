import { GOODS } from '@dt/config';
import type { BarExchangeResultDto, CupResultDto, FgResultDto, NumResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opLuck } from '../../core/luck';
import { opNews, type Op } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { randomAward, type RandomAward } from '../award/random';
import { consumeGoods, countGoods, grantGoodsOp } from '../store/goods';
import { badInput, resultDto } from './common';
import {
  barHand,
  cupRound,
  cupWinRate,
  fgAwardLevel,
  fgOutcome,
  nextTimes,
  numHint,
  numMissValue,
  numWinRate,
  type BarResult,
} from './rules';
import { lockBarState, saveBarState } from './state';

/** 每局都计活跃"酒吧娱乐"（action_map：bar.play）和本游戏的计数 */
async function played(o: Op, game: 'fg' | 'cup' | 'num'): Promise<void> {
  await emitAction(o, 'bar.play');
  await emitAction(o, `bar.${game}`);
}

/** 划拳（设计文档 §3.2）。随机数顺序：胜平负 → 随机奖励 */
export async function playFg(o: Op, hand: number): Promise<FgResultDto> {
  const t = o.tuning.bar;
  await consumeGoods(o, GOODS.mysteryTicket, 1);
  const s = await lockBarState(o);
  const luck = await opLuck(o);
  const r = o.rng.next();
  const result = fgOutcome(r, luck.rate, t);
  const times = nextTimes(s.fg_result as BarResult | null, s.fg_times, result);
  await saveBarState(o, { fg_result: result, fg_times: times });
  const lucky = result === 1 && r >= t.fgWinRate;
  let coin = 0;
  let award: RandomAward | null = null;
  if (result === 1) {
    award = await randomAward(o, { level: fgAwardLevel(times), noTicket: true, bar: true });
    if (times >= t.fgNewsStreak) opNews(o, 'bar.fg', { times, lucky, award });
  } else if (result === 0) {
    coin = Math.max(0, o.rest.level * 10 + luck.sum);
    gainCoin(o, coin);
  }
  await played(o, 'fg');
  return { result: resultDto(result)!, barHand: barHand(hand, result), times, lucky, coin, award };
}

/**
 * 猜酒杯（设计文档 §3.3）。杯号不参与判定（计划裁定 7）；奖励不出礼券（计划裁定 1）。
 * 随机数顺序：猜中 → 随机奖励
 */
export async function playCup(o: Op): Promise<CupResultDto> {
  const t = o.tuning.bar;
  const s = await lockBarState(o);
  const prev = s.cup_result as BarResult | null;
  const n = cupRound(prev, s.cup_times);
  await consumeGoods(o, GOODS.mysteryTicket, n);
  const luck = await opLuck(o);
  const r = o.rng.next();
  const win = r < cupWinRate(n, luck.rate);
  const lucky = win && r >= 1 / (n + 1);
  const times = win ? n : nextTimes(prev, s.cup_times, -1);
  await saveBarState(o, { cup_result: win ? 1 : -1, cup_times: times });
  let award: RandomAward | null = null;
  if (win) {
    award = await randomAward(o, { level: 2 + (n - 1), noTicket: true, bar: true });
    if (n >= t.cupNewsStreak) opNews(o, 'bar.cup', { times: n, lucky });
  }
  await played(o, 'cup');
  return { win, cost: n, times, lucky, award };
}

/**
 * 转数字（设计文档 §3.4）。
 * 随机数顺序：中奖 → 随机奖励（只给物品，没有类型那一次）；没中时 → 转到的数字（计划裁定 3）
 */
export async function playNum(o: Op, num: number): Promise<NumResultDto> {
  const t = o.tuning.bar;
  if (num > t.numMax) throw badInput('num');
  await consumeGoods(o, GOODS.mysteryTicket, t.numCost);
  const s = await lockBarState(o);
  const luck = await opLuck(o);
  const r = o.rng.next();
  const win = r < numWinRate(luck.rate, t);
  const result: BarResult = win ? 1 : -1;
  const times = nextTimes(s.num_result as BarResult | null, s.num_times, result);
  await saveBarState(o, { num_result: result, num_times: times });
  await played(o, 'num');
  if (!win) {
    const barNum = numMissValue(num, o.rng.int(t.numMax - 1));
    return { win, barNum, hint: numHint(num, barNum), times, lucky: false, award: null };
  }
  const lucky = r >= 1 / t.numMax;
  const award = await randomAward(o, { level: t.numAwardLevel, onlyGoods: true, noTicket: true });
  opNews(o, 'bar.num', { lucky, award });
  return { win, barNum: num, hint: null, times, lucky, award };
}

/** 礼券换蟹币（设计文档 §3.6）：krabCoinTickets 张换 1 个；不计活跃 */
export async function exchangeKrabCoin(o: Op, num: number): Promise<BarExchangeResultDto> {
  await consumeGoods(o, GOODS.mysteryTicket, o.tuning.bar.krabCoinTickets * num);
  await grantGoodsOp(o, GOODS.krabCoin, num);
  return {
    krabCoins: await countGoods(o, GOODS.krabCoin),
    tickets: await countGoods(o, GOODS.mysteryTicket),
  };
}

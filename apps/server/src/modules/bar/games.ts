import { GOODS } from '@dt/config';
import type { FgResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opLuck } from '../../core/luck';
import { opNews, type Op } from '../../core/op';
import { gainCoin } from '../../core/resources';
import { randomAward, type RandomAward } from '../award/random';
import { consumeGoods } from '../store/goods';
import { resultDto } from './common';
import { barHand, fgAwardLevel, fgOutcome, nextTimes, type BarResult } from './rules';
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
    award = await randomAward(o, { level: fgAwardLevel(times), noTicket: true });
    if (times >= t.fgNewsStreak) opNews(o, 'bar.fg', { times, lucky, award });
  } else if (result === 0) {
    coin = Math.max(0, o.rest.level * 10 + luck.sum);
    gainCoin(o, coin);
  }
  await played(o, 'fg');
  return { result: resultDto(result)!, barHand: barHand(hand, result), times, lucky, coin, award };
}

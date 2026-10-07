import { GOODS, type Tuning } from '@dt/config';
import { type BarAwardDto, type CupDto, type CupGuessDto, type CupTierDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState } from '../../core/errors';
import { opLuck } from '../../core/luck';
import { opNews, restLog, type Op } from '../../core/op';
import { randomAward } from '../award/random';
import { consumeGoods } from '../store/goods';
import { badInput } from './common';
import { endRound, loadRound, saveRound } from './round';
import { cupWinRate, nextTimes, type BarResult } from './rules';
import { lockBarState, recordStreak, saveBarState } from './state';

type T = Tuning['bar']['cup'];

/** 猜酒杯的服务端局面（问题记录 427-5）：round 从 0 起；won 是这一轮已猜中、等玩家选 */
export interface CupState {
  round: number;
  won: boolean;
  /** 最近一次猜的结果，刷新后还能看到翻开的杯子 */
  last: CupGuessDto | null;
}

export function cupView(s: CupState, t: T): CupDto {
  return { round: s.round, cups: t.cups[s.round]!, won: s.won, last: s.last, result: null, awards: [] };
}

/** 奖励档给前端写说明：不给奖励等级 */
export const cupTiers = (t: T): CupTierDto[] => t.tiers.map((x) => ({ awards: x.awards, news: x.news }));

/** 连胜、连败按局计（收手或通关算赢，猜错算输） */
async function streak(o: Op, result: BarResult): Promise<void> {
  const s = await lockBarState(o);
  const times = nextTimes(s.cup_result as BarResult | null, s.cup_times, result);
  await saveBarState(o, { cup_result: result, cup_times: times });
  await recordStreak(o, 'cup', result, times);
}

/** 收手或通关：发这一档的奖励；有新闻的档每次都写，不限条数（用户 2026-10-07 定） */
async function finish(o: Op, s: CupState, result: 'stop' | 'clear'): Promise<CupDto> {
  const t = o.tuning.bar.cup;
  const tier = t.tiers[s.round]!;
  await endRound(o, 'cup');
  const awards: BarAwardDto[] = [];
  for (let i = 0; i < tier.awards; i++)
    awards.push(await randomAward(o, { level: tier.level, noTicket: true, bar: true }));
  await streak(o, 1);
  const cups = t.cups[s.round]!;
  if (tier.news)
    opNews(o, tier.news === 'broadcast' ? 'bar.cup.big' : 'bar.cup', { round: s.round + 1, cups });
  restLog(o, 'bar.cup', { result, round: s.round + 1, awards: tier.awards });
  return { ...cupView(s, t), won: false, result, awards };
}

/**
 * 猜这一轮的一个杯子；没有局时先开局（扣礼券、计活跃）。round 是前端看到的这一轮。
 * 随机数顺序：猜中 → 猜错时骰子在哪个杯子（跳过选的那个）
 */
export async function cupGuess(o: Op, cup: number, round: number | null): Promise<CupDto> {
  const t = o.tuning.bar.cup;
  let s = await load(o);
  // 前端看到的轮次（没有局为 null）要和服务端一致：概览晚到时别把点击算到另一轮、另一局上（终审 1）
  if ((s?.round ?? null) !== round) throw invalidState('cup_round');
  if (s?.won) throw invalidState('cup_decide');
  const cups = t.cups[s?.round ?? 0]!;
  if (cup >= cups) throw badInput('cup');
  if (!s) {
    await consumeGoods(o, GOODS.mysteryTicket, t.cost);
    await emitAction(o, 'bar.play');
    await emitAction(o, 'bar.cup');
    s = { round: 0, won: false, last: null };
  }
  const luck = await opLuck(o);
  const r = o.rng.next();
  const win = r < cupWinRate(cups, luck.rate, t.maxRate);
  if (win) {
    s.last = { pick: cup, ball: cup, win, lucky: r >= 1 / cups };
    if (s.round === t.cups.length - 1) return finish(o, s, 'clear');
    s.won = true;
    await saveRound(o, 'cup', s);
    return cupView(s, t);
  }
  const k = o.rng.int(cups - 1);
  s.last = { pick: cup, ball: k >= cup ? k + 1 : k, win, lucky: false };
  await endRound(o, 'cup');
  await streak(o, -1);
  restLog(o, 'bar.cup', { result: 'lose', round: s.round + 1 });
  return { ...cupView(s, t), result: 'lose' };
}

/** 进行中的局；区服数值把轮数改少了时，超出的旧局作废 */
async function load(o: Op): Promise<CupState | null> {
  const s = await loadRound<CupState>(o, 'cup');
  if (s && s.round >= o.tuning.bar.cup.cups.length) {
    await endRound(o, 'cup');
    return null;
  }
  return s;
}

async function wonRound(o: Op): Promise<CupState> {
  const s = await load(o);
  if (!s) throw invalidState('no_round');
  if (!s.won) throw invalidState('cup_not_won');
  return s;
}

/** 收手：拿这一档的奖励 */
export async function cupStop(o: Op): Promise<CupDto> {
  return finish(o, await wonRound(o), 'stop');
}

/** 继续：这一档作废，进下一轮（最后一轮猜中直接通关；区服把轮数改少后已没有下一轮时按通关发奖，终审 2） */
export async function cupNext(o: Op): Promise<CupDto> {
  const s = await wonRound(o);
  if (s.round + 1 >= o.tuning.bar.cup.cups.length) return finish(o, s, 'clear');
  const n: CupState = { round: s.round + 1, won: false, last: null };
  await saveRound(o, 'cup', n);
  return cupView(n, o.tuning.bar.cup);
}

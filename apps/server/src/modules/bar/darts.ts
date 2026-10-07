import { GOODS } from '@dt/config';
import {
  buildPool,
  gameDay,
  pickWeighted,
  type BarResultDto,
  type DartsAimDto,
  type DartsDto,
  type DartsThrowDto,
} from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { randomAward, type RandomAward } from '../award/random';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods, grantGoodsOp } from '../store/goods';
import { assertNoRound, endRound, loadRound, saveRound } from './round';
import { dartScore, dartX } from './rules';

/** 服务端局面：老板分数只在这里 */
interface DartsState {
  boss: number[];
  throws: number[];
  /** 当前这一镖的摆动参数和发出时刻（毫秒）；投出后清空 */
  aim: { period: number; phase: number; at: number } | null;
}

const THROWS = 3;

/** 开局（设计文档 §2.3）：每局扣 cost，每天最多 dailyMax 局；老板三镖先定好 */
export async function dartsStart(o: Op): Promise<DartsDto> {
  const d = o.tuning.bar.darts;
  await assertNoRound(o, 'darts');
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'bar.darts', day)) >= d.dailyMax)
    throw limitReached('bar_daily', { max: d.dailyMax });
  await consumeGoods(o, GOODS.mysteryTicket, d.cost);
  await incrementDaily(o.tx, o.rest.id, 'bar.darts', 1, day);
  const pool = buildPool(d.bossOdds, ([, w]) => w);
  const boss = Array.from({ length: THROWS }, () => pickWeighted(pool, o.rng)[0]);
  await saveRound(o, 'darts', { boss, throws: [], aim: null } satisfies DartsState);
  await emitAction(o, 'bar.play');
  await emitAction(o, 'bar.darts');
  return { throws: [], aiming: false };
}

/** 瞄准：服务端定这一镖的摆动周期和相位，记下发出时刻 */
export async function dartsAim(o: Op): Promise<DartsAimDto> {
  const d = o.tuning.bar.darts;
  const s = await loadRound<DartsState>(o, 'darts');
  if (!s) throw invalidState('no_round');
  const period = d.periodMs[0] + o.rng.int(d.periodMs[1] - d.periodMs[0] + 1);
  const phase = o.rng.next();
  await saveRound(o, 'darts', { ...s, aim: { period, phase, at: o.now.getTime() } });
  return { period, phase };
}

/**
 * 投掷：前端上报从拿到瞄准参数到点击的毫秒数。不能晚于服务端实际经过的时间 + futureMs，
 * 也不能比它早 latencyMs 以上，否则这一镖记 0 分（设计文档 §2.4）
 */
export async function dartsThrow(o: Op, elapsedMs: number): Promise<DartsThrowDto> {
  const d = o.tuning.bar.darts;
  const s = await loadRound<DartsState>(o, 'darts');
  if (!s) throw invalidState('no_round');
  if (!s.aim) throw invalidState('no_aim');
  const serverElapsed = o.now.getTime() - s.aim.at;
  const valid = elapsedMs <= serverElapsed + d.futureMs && elapsedMs >= serverElapsed - d.latencyMs;
  const x = valid ? dartX(elapsedMs, s.aim.period, s.aim.phase) : null;
  const score = x === null ? 0 : dartScore(x, d.rings);
  const best = d.rings[0]![1];
  if (score === best) await incrementDaily(o.tx, o.rest.id, 'bar.darts.bull', 1, gameDay(o.now));
  const day = gameDay(o.now);
  const throws = [...s.throws, score];
  if (throws.length < THROWS) {
    await saveRound(o, 'darts', { ...s, throws, aim: null });
    return { x, score, throws, finished: false, boss: null, result: null, award: null, refund: 0 };
  }
  await endRound(o, 'darts');
  const mine = throws.reduce((a, b) => a + b, 0);
  const theirs = s.boss.reduce((a, b) => a + b, 0);
  const result: BarResultDto = mine > theirs ? 'win' : mine === theirs ? 'draw' : 'lose';
  const perfect = throws.every((x) => x === best);
  // 支线“酒桌高手”：赢老板、三镖全中靶心（问题记录 515）
  if (result === 'win') await emitAction(o, 'bar.darts.win');
  if (perfect) await emitAction(o, 'bar.darts.perfect');
  let award: RandomAward | null = null;
  let refund = 0;
  if (result === 'win') {
    award = await randomAward(o, { level: perfect ? d.perfectLevel : d.winLevel, noTicket: true, bar: true });
    // 每家店每天只写一条新闻（终审 I4：脚本刷屏）
    if (perfect && (await incrementDaily(o.tx, o.rest.id, 'bar.darts.news', 1, day)) === 1)
      opNews(o, 'bar.darts', { score: mine });
  } else if (result === 'draw') {
    refund = d.tieRefund;
    await grantGoodsOp(o, GOODS.mysteryTicket, refund);
  }
  restLog(o, 'bar.darts', { throws, boss: s.boss, result });
  return { x, score, throws, finished: true, boss: s.boss, result, award, refund };
}

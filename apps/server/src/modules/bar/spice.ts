import { GOODS, type Tuning } from '@dt/config';
import { gameDay, type BarAwardDto, type SpiceDto, type SpiceGuessDto, type SpiceTierDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { gainRenown } from '../../core/resources';
import { randomAward } from '../award/random';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { consumeGoods } from '../store/goods';
import { badInput } from './common';
import { assertNoRound, endRound, loadRound, saveRound } from './round';
import { spiceScore, spiceTier } from './rules';

type T = Tuning['bar']['spice'];

/** 秘制调料的服务端局面（设计 §5）：secret 只在这里，结束时才给前端 */
export interface SpiceState {
  secret: number[];
  guesses: SpiceGuessDto[];
  /** 开局时的调料种数、最多次数：区服中途改数值时这一局照旧（#191 审查）；旧局没有，按当前数值 */
  kinds?: number;
  tries?: number;
}

/** 进行中的局给前端看的样子（不含配方） */
export function spiceView(s: SpiceState, t: T): SpiceDto {
  return {
    guesses: s.guesses,
    left: (s.tries ?? t.tries) - s.guesses.length,
    length: s.secret.length,
    kinds: s.kinds ?? t.kinds,
    result: null,
    secret: null,
    tier: null,
    renown: 0,
    award: null,
  };
}

/** 奖励档给前端写说明：不给 news 开关 */
export const spiceTiers = (t: T): SpiceTierDto[] =>
  t.tiers.map((x) => ({ maxTries: x.maxTries, awardLevel: x.awardLevel, renown: x.renown }));

/** 开局（设计 §4.2）：扣礼券、计次数；配方是 kinds 种里不重复的 length 种（洗牌取前几个） */
export async function spiceStart(o: Op): Promise<SpiceDto> {
  const t = o.tuning.bar.spice;
  await assertNoRound(o, 'spice');
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'bar.spice', day)) >= t.dailyMax)
    throw limitReached('bar_daily', { max: t.dailyMax });
  await consumeGoods(o, GOODS.mysteryTicket, t.cost);
  await incrementDaily(o.tx, o.rest.id, 'bar.spice', 1, day);
  const pool = Array.from({ length: t.kinds }, (_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = o.rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const s: SpiceState = { secret: pool.slice(0, t.length), guesses: [], kinds: t.kinds, tries: t.tries };
  await saveRound(o, 'spice', s);
  await emitAction(o, 'bar.play');
  await emitAction(o, 'bar.spice');
  return spiceView(s, t);
}

/** 交一个组合：先校验（不合法不算一次），再回答几 A 几 B；猜中按次数分档发奖，次数用完就输 */
export async function spiceGuess(o: Op, guess: number[]): Promise<SpiceDto> {
  const t = o.tuning.bar.spice;
  const s = await loadRound<SpiceState>(o, 'spice');
  if (!s) throw invalidState('no_round');
  const kinds = s.kinds ?? t.kinds;
  if (
    guess.length !== s.secret.length ||
    guess.some((x) => !Number.isInteger(x) || x < 0 || x >= kinds) ||
    new Set(guess).size !== guess.length
  )
    throw badInput('guess');
  s.guesses.push({ guess, ...spiceScore(s.secret, guess) });
  const tries = s.guesses.length;
  const view = spiceView(s, t);
  if (s.guesses.at(-1)!.a === s.secret.length) {
    const tier = spiceTier(tries, t.tiers);
    const x = t.tiers[tier]!;
    await endRound(o, 'spice');
    gainRenown(o, x.renown);
    const award: BarAwardDto = await randomAward(o, { level: x.awardLevel, noTicket: true, bar: true });
    // 每家店每天只写一条新闻（和记忆调酒一样，免得脚本刷屏）
    if (x.news && (await incrementDaily(o.tx, o.rest.id, 'bar.spice.news', 1, gameDay(o.now))) === 1)
      opNews(o, 'bar.spice', { tries });
    restLog(o, 'bar.spice', { result: 'win', tries });
    return { ...view, result: 'win', secret: s.secret, tier, renown: x.renown, award };
  }
  if (tries >= (s.tries ?? t.tries)) {
    await endRound(o, 'spice');
    restLog(o, 'bar.spice', { result: 'lose', tries });
    return { ...view, result: 'lose', secret: s.secret };
  }
  await saveRound(o, 'spice', s);
  return view;
}

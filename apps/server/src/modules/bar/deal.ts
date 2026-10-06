import { FOODS, type Tuning } from '@dt/config';
import { buildPool, gameDay, pickWeighted, type DealDto, type DealPrizeDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import { opNews, restLog, type Op } from '../../core/op';
import { gainCoin, spendCoin } from '../../core/resources';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { addFoods } from '../cupboard/foods';
import { badInput } from './common';
import { assertNoRound, endRound, loadRound, saveRound } from './round';
import { dealOffer } from './rules';

type T = Tuning['bar']['deal'];

/** 一掷千金的服务端局面（设计 §6）：boxes 只在这里，没开的箱子结束时才给前端 */
export interface DealState {
  boxes: DealPrizeDto[];
  /** 自己的箱子；还没选为 null */
  mine: number | null;
  /** 已开的箱子，按开的顺序 */
  opened: number[];
  round: number;
  /** 当前报价；这一轮还没开够为 null */
  offer: number | null;
  /** 最大奖所在的箱子（写新闻用） */
  top: number;
}

/** 前几轮一共该开几个 */
const openedBefore = (t: T, round: number) => t.opens.slice(0, round).reduce((a, b) => a + b, 0);

/** 进行中的局给前端看的样子：只给已开的箱子；没开的奖品按价值列出，不说在哪个箱子里 */
export function dealView(s: DealState, t: T): DealDto {
  const openedSet = new Set(s.opened);
  const toOpen =
    s.offer !== null ? 0 : (t.opens[s.round] ?? 0) - (s.opened.length - openedBefore(t, s.round));
  return {
    count: s.boxes.length,
    mine: s.mine,
    round: s.round,
    toOpen: s.mine === null ? (t.opens[0] ?? 0) : Math.max(0, toOpen),
    opened: s.opened.map((box) => ({ box, ...s.boxes[box]! })),
    left: s.boxes
      .filter((_, i) => !openedSet.has(i))
      .sort((a, b) => b.value - a.value || a.foodsId - b.foodsId),
    offer: s.offer,
    result: null,
    coin: 0,
    prize: null,
    all: null,
  };
}

/** 这一级的普通食材里按出现权重抽一种（不出下架的） */
function pickFood(o: Op, level: number): number {
  const pool = o.config.bundle.foods
    .filter((f) => f.level === level && f.odds === 100 && !f.retired)
    .sort((a, b) => a.id - b.id);
  return pickWeighted(
    buildPool(pool, (f) => f.weight),
    o.rng,
  ).id;
}

/** 开局（设计 §4）：扣银币、计次数；定下每份奖品的食材，洗进箱子 */
export async function dealStart(o: Op): Promise<DealDto> {
  const t = o.tuning.bar.deal;
  await assertNoRound(o, 'deal');
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'bar.deal', day)) >= t.dailyMax)
    throw limitReached('bar_daily', { max: t.dailyMax });
  spendCoin(o, t.cost);
  await incrementDaily(o.tx, o.rest.id, 'bar.deal', 1, day);
  const boxes: DealPrizeDto[] = t.prizes.map((p) => {
    const foodsId = p.kind === 'master' ? FOODS.masterBase + p.level : pickFood(o, p.level);
    return { foodsId, num: p.num, value: o.config.requireFood(foodsId).coin * p.num };
  });
  for (let i = boxes.length - 1; i > 0; i--) {
    const j = o.rng.int(i + 1);
    [boxes[i], boxes[j]] = [boxes[j]!, boxes[i]!];
  }
  let top = 0;
  boxes.forEach((b, i) => {
    if (b.value > boxes[top]!.value) top = i;
  });
  const s: DealState = { boxes, mine: null, opened: [], round: 0, offer: null, top };
  await saveRound(o, 'deal', s);
  await emitAction(o, 'bar.play');
  await emitAction(o, 'bar.deal');
  return dealView(s, t);
}

async function load(o: Op): Promise<DealState> {
  const s = await loadRound<DealState>(o, 'deal');
  if (!s) throw invalidState('no_round');
  return s;
}

/** 选自己的箱子，之后不能换 */
export async function dealPick(o: Op, box: number): Promise<DealDto> {
  const s = await load(o);
  if (s.mine !== null) throw invalidState('deal_picked');
  if (box < 0 || box >= s.boxes.length) throw badInput('box');
  s.mine = box;
  await saveRound(o, 'deal', s);
  return dealView(s, o.tuning.bar.deal);
}

/** 开一个别的箱子；这一轮开够了，银行家报价 */
export async function dealOpen(o: Op, box: number): Promise<DealDto> {
  const t = o.tuning.bar.deal;
  const s = await load(o);
  if (s.mine === null) throw invalidState('deal_pick_first');
  if (s.offer !== null) throw invalidState('deal_offer');
  if (box < 0 || box >= s.boxes.length || box === s.mine || s.opened.includes(box)) throw badInput('box');
  s.opened.push(box);
  if (s.opened.length >= openedBefore(t, s.round + 1)) {
    const left = s.boxes.filter((_, i) => !s.opened.includes(i)).map((b) => b.value);
    s.offer = dealOffer(left, t.offerRates[s.round] ?? 0, t.valueRate);
  }
  await saveRound(o, 'deal', s);
  return dealView(s, t);
}

/** 回答报价：成交拿银币；不成交进下一轮，最后一轮不成交就开自己的箱子 */
export async function dealAnswer(o: Op, deal: boolean): Promise<DealDto> {
  const t = o.tuning.bar.deal;
  const s = await load(o);
  if (s.offer === null || s.mine === null) throw invalidState('deal_no_offer');
  const prize = s.boxes[s.mine]!;
  const ended = (result: 'deal' | 'box', coin: number): DealDto => ({
    ...dealView(s, t),
    result,
    coin,
    prize,
    all: s.boxes,
  });
  if (deal) {
    const coin = s.offer;
    await endRound(o, 'deal');
    gainCoin(o, coin);
    restLog(o, 'bar.deal', { result: 'deal', coin });
    return ended('deal', coin);
  }
  if (s.round + 1 < t.opens.length) {
    s.round += 1;
    s.offer = null;
    await saveRound(o, 'deal', s);
    return dealView(s, t);
  }
  await endRound(o, 'deal');
  await addFoods(o, prize.foodsId, prize.num);
  // 一路不成交、开出最大奖才写新闻，每家店每天最多一条
  if (s.mine === s.top && (await incrementDaily(o.tx, o.rest.id, 'bar.deal.news', 1, gameDay(o.now))) === 1)
    opNews(o, 'bar.deal', { foodsId: prize.foodsId, num: prize.num });
  restLog(o, 'bar.deal', { result: 'box', foodsId: prize.foodsId, num: prize.num });
  return ended('box', 0);
}

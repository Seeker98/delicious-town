import { GOODS } from '@dt/config';
import { ErrorCode, gameDay, type DevilDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, limitReached } from '../../core/errors';
import { invalidateAgg } from '../../core/luck';
import { opNews, restLog, type Op } from '../../core/op';
import { getDaily, incrementDaily } from '../counter/dailyCounter';
import { AppError } from '../../http/errors';
import { upsertEffectSource } from '../effects/service';
import { consumeGoods, grantGoodsOp } from '../store/goods';
import { badInput } from './common';
import { assertNoRound, endRound, loadRound, saveRound } from './round';
import { devilPayout } from './rules';

/** 服务端局面：spiked 只在这里 */
export interface DevilState {
  stake: number;
  spiked: number;
  cups: Array<'me' | 'bartender' | null>;
  survived: number;
}

/** 宿醉的加成来源（设计文档 §3） */
export const HANGOVER = { sourceType: 'bar', sourceId: 1 } as const;

function dto(s: DevilState, patch: Partial<DevilDto> = {}): DevilDto {
  return {
    stake: s.stake,
    cups: s.cups,
    survived: s.survived,
    result: null,
    spiked: null,
    payout: 0,
    hangoverUntil: null,
    lastBartender: null,
    ...patch,
  };
}

/** 进行中的局给前端看的样子（不含特辣酒位置） */
export function devilView(s: DevilState): DevilDto {
  return dto(s);
}

/** 开局（设计文档 §2.1）：扣押注，特辣酒位置只存在服务端；每天最多 dailyMax 局（2026-10-09） */
export async function devilStart(o: Op, stake: number): Promise<DevilDto> {
  const t = o.tuning.bar.devil;
  if (!t.stakes.includes(stake)) throw badInput('stake');
  await assertNoRound(o, 'devil');
  const day = gameDay(o.now);
  if ((await getDaily(o.tx, o.rest.id, 'bar.devil', day)) >= t.dailyMax)
    throw limitReached('bar_daily', { max: t.dailyMax });
  await incrementDaily(o.tx, o.rest.id, 'bar.devil', 1, day);
  await consumeGoods(o, GOODS.mysteryTicket, stake);
  const s: DevilState = { stake, spiked: o.rng.int(t.cups), cups: Array(t.cups).fill(null), survived: 0 };
  await saveRound(o, 'devil', s);
  await emitAction(o, 'bar.play');
  await emitAction(o, 'bar.devil');
  return dto(s);
}

/** 喝一杯：玩家先喝，没事就轮到调酒师随机喝一杯 */
export async function devilDrink(o: Op, cup: number): Promise<DevilDto> {
  const t = o.tuning.bar.devil;
  const s = await loadRound<DevilState>(o, 'devil');
  if (!s) throw invalidState('no_round');
  if (cup < 0 || cup >= s.cups.length) throw badInput('cup');
  if (s.cups[cup] !== null) throw new AppError(ErrorCode.ALREADY_DONE, 400, { what: 'cup_taken' });
  s.cups[cup] = 'me';
  if (cup === s.spiked) {
    await endRound(o, 'devil');
    const until = new Date(o.now.getTime() + t.hangoverMinutes * 60_000);
    await upsertEffectSource(o.tx, o.rest.id, {
      ...HANGOVER,
      effects: { atRate: t.hangoverAtRate },
      expiresAt: until,
    });
    invalidateAgg(o);
    restLog(o, 'bar.devil', { stake: s.stake, result: 'lose', survived: s.survived });
    return dto(s, { result: 'lose', spiked: s.spiked, hangoverUntil: until.toISOString() });
  }
  s.survived += 1;
  const left = s.cups.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  const pick = left[o.rng.int(left.length)]!;
  s.cups[pick] = 'bartender';
  if (pick === s.spiked) {
    await endRound(o, 'devil');
    const payout = devilPayout(t, s.stake, s.survived);
    await grantGoodsOp(o, GOODS.mysteryTicket, payout);
    // 排行“本周赢得礼券”（问题记录 569）
    await incrementDaily(o.tx, o.rest.id, 'bar.devil.payout', payout, gameDay(o.now));
    if (s.survived >= t.newsSurvived) opNews(o, 'bar.devil', { stake: s.stake, payout });
    // 支线“酒运”：赢、活过 3 杯（问题记录 515）
    await emitAction(o, 'bar.devil.win');
    if (s.survived >= 3) await emitAction(o, 'bar.devil.survive3');
    restLog(o, 'bar.devil', { stake: s.stake, result: 'win', survived: s.survived, payout });
    return dto(s, { result: 'win', spiked: s.spiked, payout, lastBartender: pick });
  }
  await saveRound(o, 'devil', s);
  return dto(s, { lastBartender: pick });
}

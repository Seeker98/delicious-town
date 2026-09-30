import { GOODS, type Tuning } from '@dt/config';
import type { Rng } from '@dt/shared';
import { grantGoodsOp } from '../modules/store/goods';
import { opLuck } from './luck';
import type { Op } from './op';

/** 美味券：每次以 基础×节日倍数 + 幸运率/除数 的概率得 1 张；超出基础概率的那部分算"幸运" */
export function dtTicketDraws(
  times: number,
  luckRate: number,
  holiday: number,
  t: Tuning['settlement'],
  rng: Rng,
): { num: number; lucky: number } {
  const base = t.dtTicketBaseRate * holiday;
  const p = base + luckRate / t.dtTicketLuckDivisor;
  let num = 0;
  let lucky = 0;
  for (let i = 0; i < times; i++) {
    const r = rng.next();
    if (r < p) {
      num += 1;
      if (r >= base) lucky += 1;
    }
  }
  return { num, lucky };
}

/** 在一个操作里抽 times 次美味券并发放，返回张数 */
export async function drawDtTickets(op: Op, times: number): Promise<number> {
  if (times <= 0) return 0;
  const { rate } = await opLuck(op);
  const r = dtTicketDraws(times, rate, op.config.holidayMultiplier(op.now), op.tuning.settlement, op.rng);
  if (r.num > 0) await grantGoodsOp(op, GOODS.dtTicket, r.num, { lucky: r.lucky > 0 });
  return r.num;
}

import { sql } from 'kysely';
import { GOODS } from '@dt/config';
import { ErrorCode, pickWeighted, type SlotResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { opNews, type Op } from '../../core/op';
import { AppError } from '../../http/errors';
import { addFoods } from '../cupboard/foods';
import { consumeGoods, countGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { slotFloorLeft, slotFloorRate, slotForced } from './rules';
import { lockBarState, saveBarState } from './state';

/** 老虎机要验证邮箱（设计文档裁定 7） */
async function assertVerified(o: Op): Promise<void> {
  const acc = await o.tx
    .selectFrom('account')
    .select('email_verified_at')
    .where('id', '=', o.rest.account_id)
    .executeTakeFirstOrThrow();
  if (!acc.email_verified_at) throw new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 403);
}

/**
 * 老虎机（设计文档 §3.5）：每次 slotCells 格；同一请求里相同奖项合并发放，稀有或标了新闻的每种发一条新闻。
 * 每格随机数顺序：已到强制保底时不抽；否则先抽一个判提前保底，再按权重抽一个（计划裁定 5）
 */
export async function playSlot(o: Op, times: number): Promise<SlotResultDto> {
  const t = o.tuning.bar;
  await assertVerified(o);
  await consumeGoods(o, GOODS.krabCoin, times);
  const s = await lockBarState(o);
  const lamp = await hasValidHonor(o, GOODS.magicLamp);
  const floorAward = o.config.slotAwards.get(t.slotFloorAwardId)!;
  let fail = s.slot_fail;
  const spins: number[][] = [];
  /** 奖项 id → 格数 */
  const got = new Map<number, number>();
  for (let i = 0; i < times; i++) {
    const spin: number[] = [];
    for (let c = 0; c < t.slotCells; c++) {
      const floor = slotForced(fail, t) || o.rng.next() < slotFloorRate(fail, lamp, t);
      const a = floor ? floorAward : pickWeighted(o.config.slotPool, o.rng);
      fail = floor || a.rare ? 0 : fail + 1;
      spin.push(a.id);
      got.set(a.id, (got.get(a.id) ?? 0) + 1);
    }
    spins.push(spin);
  }
  await saveBarState(o, { slot_fail: fail });
  await o.tx
    .insertInto('bar_slot_stat')
    .values([...got].map(([award_id, num]) => ({ rest_id: o.rest.id, award_id, num })))
    .onConflict((oc) =>
      oc.columns(['rest_id', 'award_id']).doUpdateSet({ num: sql<number>`bar_slot_stat.num + excluded.num` }),
    )
    .execute();

  const rewards: SlotResultDto['rewards'] = [];
  for (const [id, cells] of [...got].sort((x, y) => x[0] - y[0])) {
    const a = o.config.slotAwards.get(id)!;
    if (a.kind === 'empty' || a.itemId === null) continue;
    const num = cells * a.getNum;
    if (a.kind === 'foods') await addFoods(o, a.itemId, num);
    else await grantGoodsOp(o, a.itemId, num);
    rewards.push({ awardId: id, kind: a.kind, itemId: a.itemId, num });
    if (a.rare || a.news) opNews(o, 'bar.slot', { awardId: id, kind: a.kind, itemId: a.itemId, num });
  }
  await emitAction(o, 'bar.play', times);
  await emitAction(o, 'bar.slot', times);
  return {
    spins,
    rewards,
    krabCoins: await countGoods(o, GOODS.krabCoin),
    floorLeft: slotFloorLeft(fail, t),
  };
}

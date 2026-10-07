import { GOODS } from '@dt/config';
import { buildPool, pickWeighted, type TrialResultDto } from '@dt/shared';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opAgg, opLuck } from '../../core/luck';
import { restLog, type Op } from '../../core/op';
import { spendCoin } from '../../core/resources';
import { subFoods } from '../cupboard/foods';
import { equipOff, restGear } from '../equip/power';
import { addProficiency } from '../mysterious/rules';
import { consumeGoods, grantGoodsOp, hasValidHonor } from '../store/goods';
import { badInput, learnedUpTo } from './common';
import { foodsTrial, trialBase, trialGainCaps } from './rules';

const ready = async (o: Op) =>
  (await hasValidHonor(o, GOODS.creativePotion)) || (await hasValidHonor(o, GOODS.meditation));

function assertStar(o: Op): void {
  if (o.rest.star_level < 1) throw requirement('star', { need: 1, have: o.rest.star_level });
}

async function saveTarget(o: Op, mcId: number, way: number): Promise<void> {
  await o.tx
    .insertInto('rest_trial')
    .values({ rest_id: o.rest.id, mc_id: mcId, way, prepared_at: o.now })
    .onConflict((oc) => oc.column('rest_id').doUpdateSet({ mc_id: mcId, way, prepared_at: o.now }))
    .execute();
}

/** 准备试炼：注射（25 万银币）或冥想（免费），抽一道已学的 ≤5 级菜（设计文档 裁定 1、7） */
export async function prepareTrial(o: Op, b: { way: 1 | 2 }): Promise<{ mcId: number }> {
  assertStar(o);
  if (await ready(o)) throw invalidState('trial_ready');
  const learned = await learnedUpTo(o, 5);
  if (learned.length === 0) throw requirement('mc_count', { need: 1 });
  if (b.way === 1) spendCoin(o, o.tuning.temple.injectCoin);
  await grantGoodsOp(o, b.way === 1 ? GOODS.creativePotion : GOODS.meditation, 1);
  const mc = pickWeighted(
    buildPool(learned, (m) => m.odds),
    o.rng,
  );
  await saveTarget(o, mc.id, b.way);
  return { mcId: mc.id };
}

/** 换对象：不指定时花银币重抽；指定时花 1 条触手 */
export async function refreshTrial(o: Op, b: { mcId?: number }): Promise<{ mcId: number }> {
  assertStar(o);
  const row = await o.tx
    .selectFrom('rest_trial')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirst();
  if (!row) throw invalidState('no_trial');
  const learned = await learnedUpTo(o, 5);
  let mcId: number;
  if (b.mcId !== undefined) {
    if (!learned.some((m) => m.id === b.mcId)) throw invalidState('mc_not_learned');
    await consumeGoods(o, GOODS.tentacle, 1);
    mcId = b.mcId;
  } else {
    if (learned.length === 0) throw requirement('mc_count', { need: 1 });
    spendCoin(o, o.tuning.temple.refreshCoin);
    mcId = pickWeighted(
      buildPool(learned, (m) => m.odds),
      o.rng,
    ).id;
  }
  await saveTarget(o, mcId, row.way);
  return { mcId };
}

/** 试炼（规格书 09 §9.4） */
export async function startTrial(
  o: Op,
  b: { mainFoodsId: number; subFoodsId: number },
): Promise<TrialResultDto> {
  const t = o.tuning.temple;
  assertStar(o);
  const row = await o.tx
    .selectFrom('rest_trial')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .executeTakeFirst();
  if (!row || !(await ready(o))) throw invalidState('no_trial');
  const mcRow = await o.tx
    .selectFrom('rest_mc')
    .selectAll()
    .where('rest_id', '=', o.rest.id)
    .where('mc_id', '=', row.mc_id)
    .executeTakeFirst();
  if (!mcRow) throw invalidState('mc_not_learned');
  const mc = o.config.requireMc(row.mc_id);
  const main = o.config.foods.get(b.mainFoodsId);
  const sub = o.config.foods.get(b.subFoodsId);
  if (!main || !sub) throw badInput('bad_food');

  spendCoin(o, t.trialCoin);
  if (main.id === sub.id) await subFoods(o, main.id, 2);
  else {
    await subFoods(o, main.id, 1);
    await subFoods(o, sub.id, 1);
  }
  for (const f of mc.foods) await subFoods(o, f, 1);

  const agg = await opAgg(o);
  const { rate: luck } = await opLuck(o);
  const gear = await restGear(o.tx, o.rest, o.config.suits, equipOff(o.settings));
  const base = trialBase(gear.total.creatives + (agg.creatives ?? 0), t) + foodsTrial(mc.level, main, sub);
  const roll = o.rng.next();
  const success = roll < base + luck / 5;
  let addWorth = 0;
  let addExp = 0;
  let proficiency = 0;
  let curlevel = mcRow.curlevel;
  if (success) {
    const { n, m } = trialGainCaps(main.odds < t.rareOdds, sub.odds < t.rareOdds);
    // 上限调低后（用户 2026-10-07 定：50 → 30），以前攒得多的先压到上限，成功时存回去
    const cur = Math.min(mcRow.trial_worth, t.trialWorthMax);
    const worth = n > 0 ? Math.min(t.trialWorthMax, cur + o.rng.intMin1(n)) : cur;
    const exp = Math.min(t.trialExpMax, mcRow.trial_exp + o.rng.intMin1(m));
    addWorth = worth - cur;
    addExp = exp - mcRow.trial_exp;
    proficiency = t.trialProficiencyPerLevel * mcRow.curlevel;
    const prof = addProficiency(mcRow.curlevel, mcRow.curexp, proficiency, o.config.mcProficiency);
    curlevel = prof.curlevel;
    await o.tx
      .updateTable('rest_mc')
      .set({ trial_worth: worth, trial_exp: exp, curlevel: prof.curlevel, curexp: prof.curexp })
      .where('rest_id', '=', o.rest.id)
      .where('mc_id', '=', mc.id)
      .execute();
  }
  restLog(o, 'temple.trial', { mcId: mc.id, success, worth: addWorth, exp: addExp });
  await emitAction(o, 'temple.trial');
  if (success) await emitAction(o, 'temple.trial.success');
  return { success, lucky: success && roll >= base, addWorth, addExp, proficiency, curlevel };
}

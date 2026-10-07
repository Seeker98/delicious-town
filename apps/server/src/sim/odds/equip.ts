import { GOODS } from '@dt/config';
import { luckRate } from '@dt/shared';
import type { TestGame } from '../../../test/game';
import { stressRate, gemRate } from '../../modules/equip/rules';
import { Trials, rate, shops, spread, times, trials } from './harness';

/** 厨具强化、宝石升阶（规格书 07 §7.7，设计 2B）：天气晴（不加强化、升阶） */

const LUCK = 100;

export async function equipOdds(t: TestGame): Promise<void> {
  const config = t.deps.config;
  const te = config.tuning.equip;

  // ---------- 强化：一件新厨具从 0 强化到满，每次按当时的等级和连续失败算成功率 ----------
  const goodsId = [...config.goods.values()].find((g) => g.equip && !g.retired)!.id;
  const def = config.requireGoods(goodsId).equip!;
  for (const luck of [0, LUCK]) {
    const ctxs = await shops(t, 16, {
      patch: { coin: 1e12, luck },
      goods: { [GOODS.essence]: 100_000_000 },
    });
    const byStress = Array.from({ length: te.maxStress }, () => new Trials());
    const n = times(2_000);
    await spread(ctxs, n, async (ctx) => {
      const r = await t.db
        .insertInto('equip')
        .values({ rest_id: ctx.restaurantId, goods_id: goodsId, part: def.part, suit_id: def.suitId })
        .returning('id')
        .executeTakeFirstOrThrow();
      let stress = 0;
      let fail = 0;
      while (stress < te.maxStress) {
        const p = stressRate(stress, luck, 0, fail, te).total;
        const d = (await t.game.equip.stress(ctx, { id: r.id, stone: false })).data;
        byStress[stress]!.add(p, d.success);
        if (d.success) {
          stress++;
          fail = 0;
        } else fail++;
      }
    });
    byStress.forEach((x, s) => trials('厨具强化', `幸运 ${luck}：${s} → ${s + 1}（含连续失败的保底）`, x));
  }

  // ---------- 宝石升阶：每组先按基础概率，失败再按幸运率补救 ----------
  const gems = [...config.goods.values()].filter((g) => g.gem && g.gem.nextId !== null && !g.retired);
  const byLevel = new Map<number, number>();
  for (const g of gems) if (!byLevel.has(g.gem!.level)) byLevel.set(g.gem!.level, g.id);
  for (const luck of [0, LUCK]) {
    for (const [level, id] of [...byLevel].sort((a, b) => a[0] - b[0])) {
      const ctxs = await shops(t, 16, {
        patch: { luck, strength: 1e9, strength_max: 1e9 },
        goods: { [id]: 100_000_000 },
      });
      let ok = 0;
      let all = 0;
      const n = times(400);
      await spread(ctxs, n, async (ctx) => {
        const d = (await t.game.equip.gemLevelUp(ctx, { goodsId: id, num: 99 })).data;
        ok += d.success;
        all += d.success + d.fail;
      });
      const base = Math.max(0, gemRate(level, 0, te));
      rate(
        '宝石升阶',
        `幸运 ${luck}：${level} 阶 → ${level + 1} 阶`,
        ok,
        all,
        base + (1 - base) * luckRate(luck),
      );
    }
  }
}

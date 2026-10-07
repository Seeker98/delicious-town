import type { TestGame } from '../../../test/game';
import { exploreSplit, guardianHp, guardianScale } from '../../modules/temple/rules';
import { streetMysteriousRate } from '../../modules/temple/explore';
import { Mean, Ratio, mean, rate, ratio, shops, spread, times } from './harness';

/** 神殿（规格书 09，设计 4B-1，问题记录 475~493 的飞弹改版）：幸运 0、天气没有加成、没有勋章和套装 */

export async function templeOdds(t: TestGame): Promise<void> {
  const config = t.deps.config;
  const tt = config.tuning.temple;
  const temple = t.game.temple;

  // ---------- 飞弹：每发的命中、暴击、伤害、暴击掉落；打死的奖励 ----------
  for (const [goodsId, base] of config.missiles) {
    if (config.requireGoods(goodsId).retired) continue;
    const over = tt.missileAttack.find(([id]) => id === goodsId);
    const def = over ? { ...base, attack: [over[1], over[2]] as [number, number] } : base;
    const name = config.requireGoods(goodsId).name;
    for (const star of [1, 5]) {
      const ctxs = await shops(t, 16, { goods: { [goodsId]: 1_000_000 }, patch: { star_level: star } });
      const shots = new Mean();
      let hits = 0;
      let crits = 0;
      const plain = new Mean();
      const critDmg = new Mean();
      const tickets = new Ratio();
      let maps = 0;
      const rares = new Mean();
      const lv = new Map([3, 2, 1].map((l) => [l, new Mean()]));
      let kills = 0;
      const days = Math.ceil(times(1_600) / ctxs.length);
      for (let day = 0; day < days; day++) {
        await spread(ctxs, ctxs.length, async (ctx) => {
          const d = (await temple.missile(ctx, { goodsId, num: 99 })).data;
          let c = 0;
          for (const s of d.shots) {
            shots.add(1);
            if (!s.hit) continue;
            hits++;
            if (s.crit) {
              crits++;
              c++;
              critDmg.add(s.damage);
            } else plain.add(s.damage);
          }
          tickets.add(d.drops.tickets, c);
          maps += d.drops.maps;
          if (!d.killed) return;
          kills++;
          const byLevel = new Map<number, number>();
          for (const f of d.drops.foods) {
            const l = config.requireFood(f.foodsId).level;
            byLevel.set(l, (byLevel.get(l) ?? 0) + f.num);
          }
          rares.add(byLevel.get(7) ?? 0);
          for (const [l, m] of lv) m.add(byLevel.get(l) ?? 0);
        });
        t.clock.advance(86_400_000);
      }
      const g = `飞弹 ${name}`;
      const [lo, hi] = def.attack;
      rate(g, `${star} 星：命中`, hits, shots.n, def.hitRate);
      rate(g, `${star} 星：命中里暴击`, crits, hits, def.crit);
      mean(g, `${star} 星：不暴击的伤害`, plain, lo === hi ? lo : lo + (hi - lo - 1) / 2);
      // 暴击伤害 = ⌊伤害 × 暴击倍数⌋；礼券 = 概率 × rand[1, ⌊暴击伤害/100⌋]；探险图 = 概率
      let cd = 0;
      let ct = 0;
      const span = lo === hi ? [lo] : Array.from({ length: hi - lo }, (_, i) => lo + i);
      for (const x of span) {
        const c = Math.floor(x * def.critRate);
        cd += c;
        ct += tt.missileTicketRate * ((Math.floor(c / 100) + 1) / 2);
      }
      mean(g, `${star} 星：暴击伤害`, critDmg, cd / span.length);
      ratio(g, `${star} 星：每次暴击掉的礼券（张）`, tickets, ct / span.length);
      rate(g, `${star} 星：暴击掉探险图`, maps, crits, tt.missileMapRate);
      // 打死的奖励（用户 2026-10-07 定：跟着血量涨）
      const scale = guardianScale(star, tt);
      mean(
        g,
        `${star} 星（血 ${guardianHp(star, tt).toLocaleString()}）：打死得神秘食材（个）`,
        rares,
        tt.guardianRareRate * scale,
      );
      for (const [l, m] of lv) {
        let e = 0;
        const half = Math.floor(tt.guardianFoodsSpread / 2);
        for (let u = 0; u < tt.guardianFoodsSpread; u++)
          e += Math.max(0, Math.round((Math.floor(tt.guardianFoodsBase / l) + u - half) * scale));
        mean(g, `${star} 星：打死得 ${l} 级食材（个）`, m, e / tt.guardianFoodsSpread);
      }
      rate(g, `${star} 星：每天打死（只报实测）`, kills, days * ctxs.length, null);
    }
  }

  // ---------- 探险 ----------
  for (const [goodsId, def] of config.maps) {
    const g = config.requireGoods(goodsId);
    if (g.retired) continue;
    const ctxs = await shops(t, 16, {
      goods: { [goodsId]: 10_000_000 },
      patch: { strength: 1e9, strength_max: 1e9 },
    });
    const street = (
      await t.db
        .selectFrom('restaurant')
        .select('street_id')
        .where('id', '=', ctxs[0]!.restaurantId)
        .executeTakeFirstOrThrow()
    ).street_id;
    let ok = 0;
    let all = 0;
    let rare = 0;
    const foods = new Ratio();
    const n = times(3_000);
    await spread(ctxs, n, async (ctx) => {
      const d = (await temple.explore(ctx, { goodsId, times: 99 })).data;
      ok += d.success;
      all += d.success + d.fail;
      rare += d.rare.reduce((a, x) => a + x.num, 0);
      foods.add(
        d.foods.reduce((a, x) => a + x.num, 0),
        d.success,
      );
    });
    const [min, max] = def.num;
    let e = 0;
    for (let k = min + 1; k <= max; k++) e += exploreSplit(def, k).reduce((a, x) => a + x.num, 0);
    rate(`探险 ${g.name}`, '成功', ok, all, def.rate);
    rate(
      `探险 ${g.name}`,
      '成功里出神秘食材',
      rare,
      ok,
      def.mysteriousRate + streetMysteriousRate(config, street),
    );
    ratio(
      `探险 ${g.name}`,
      `成功一次的普通食材（个，数量 rand[1, ${max - min}] + ${min}）`,
      foods,
      e / (max - min),
    );
  }
}

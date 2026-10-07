import { GOODS } from '@dt/config';
import type { TestGame } from '../../../test/game';
import { Ratio, Tally, rate, ratio, shops, spread, times } from './harness';

/** 神秘菜谱鉴定（规格书 04）：幸运 0、天气晴、没有星神之书；成功率 = 鉴定工具的 rate，菜谱按 odds 抽，张数 rand[1, num] */
export async function mysteriousOdds(t: TestGame): Promise<void> {
  const config = t.deps.config;
  for (const [toolId, def] of config.appraiseTools) {
    const tool = config.requireGoods(toolId);
    if (tool.retired) continue;
    const ctxs = await shops(t, 16, {
      patch: { star_level: 1 },
      goods: { [GOODS.mysteryRecipe]: 10_000_000, [toolId]: 10_000_000 },
    });
    let ok = 0;
    let all = 0;
    const byMc = new Tally<number>();
    const num = new Ratio();
    const n = times(1_500);
    await spread(ctxs, n, async (ctx) => {
      const d = (await t.game.mysterious.appraise(ctx, { toolId, times: 99, noRetry: true })).data;
      let got = 0;
      let hits = 0;
      for (const r of d.results) {
        all++;
        if (!r.ok) continue;
        ok++;
        hits++;
        got += r.num!;
        byMc.add(r.mcId!);
      }
      num.add(got, hits);
    });
    const g = `鉴定 ${tool.name}`;
    rate(g, '成功', ok, all, def.rate);
    ratio(g, `成功一次的残卷（张，rand[1, ${def.num}]）`, num, (1 + def.num) / 2);
    const pool = config.bundle.mysteriousCookbooks.filter(
      (m) => m.appraisable && m.level >= def.min && m.level <= def.max,
    );
    const total = pool.reduce((a, m) => a + m.odds, 0);
    // 按等级合起来看（单道菜谱太多）
    const levels = [...new Set(pool.map((m) => m.level))].sort((a, b) => a - b);
    for (const level of levels) {
      const inLevel = pool.filter((m) => m.level === level);
      rate(
        g,
        `成功时出 ${level} 级菜谱`,
        inLevel.reduce((a, m) => a + byMc.get(m.id), 0),
        byMc.n,
        inLevel.reduce((a, m) => a + m.odds, 0) / total,
      );
    }
  }
}

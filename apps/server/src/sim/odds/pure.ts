import { hashSeed, seededRng } from '@dt/shared';
import type { TestGame } from '../../../test/game';
import { marketRareChance, weatherTypeShares } from '../../modules/predict/auto/odds';
import { rollWeather } from '../../modules/world/rules';
import { rate, rows, times } from './harness';

/** 不用开店的：竞猜出题的初始概率和实际判定用的抽取对不对得上（238-2） */
export async function pureOdds(t: TestGame): Promise<void> {
  const config = t.deps.config;
  const w = config.tuning.world;
  const n = times(200_000);
  for (const hour of [w.weatherHours[0]!, w.weatherHours[6]!]) {
    const shares = weatherTypeShares(config, w, hour);
    const got = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const x = rollWeather(config, hour, w, seededRng(hashSeed('odds-weather', hour, i)));
      got.set(x.type, (got.get(x.type) ?? 0) + 1);
    }
    for (const [type, p] of shares)
      rate('竞猜：天气', `${hour} 点自动轮换是第 ${type} 类（出题用的占比）`, got.get(type) ?? 0, n, p);
  }
  const mt = config.tuning.market;
  for (const hour of [mt.dailyHours[0]!, mt.dailyHours.at(-1)!])
    for (const level of [1, 2]) {
      // 出题时模拟 2000 次估概率；这里用 20 倍次数当真值，看出题的估计差多少
      const est = marketRareChance(
        config,
        mt,
        hour,
        level,
        2_000,
        seededRng(hashSeed('odds-market-est', hour, level)),
      );
      const big = times(40_000);
      const truth = marketRareChance(
        config,
        mt,
        hour,
        level,
        big,
        seededRng(hashSeed('odds-market', hour, level)),
      );
      // 标准误把出题那 2000 次的误差也算上
      rows.push({
        game: '竞猜：货架',
        item: `${hour} 点出 ${level} 级稀有（期望 = 出题时 2000 次的估计）`,
        expected: est,
        measured: truth,
        n: big,
        se: Math.sqrt(truth * (1 - truth) * (1 / big + 1 / 2_000)),
        pct: true,
      });
    }
}

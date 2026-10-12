import { hashSeed, seededRng } from '@dt/shared';
import type { TestGame } from '../../../test/game';
import { gameTime } from '@dt/shared';
import { chainTypeShares, marketRareChance } from '../../modules/predict/auto/odds';
import { chainRow, pickRow } from '../../modules/world/chain';
import { isNight } from '../../modules/world/rules';
import { rate, rows, times } from './harness';

/** 不用开店的：竞猜出题的初始概率和实际判定用的抽取对不对得上（238-2） */
export async function pureOdds(t: TestGame): Promise<void> {
  const config = t.deps.config;
  const w = config.tuning.world;
  const n = times(200_000);
  // 天气改版：从晴天出发，沿天气链推两轮；出题算的概率和真的一轮一轮抽对得上
  const sunny = [...config.weather.values()].find((x) => x.name === '晴')!.id;
  const from = gameTime('2026-11-03', 6);
  const target = gameTime('2026-11-03', 13);
  const shares = chainTypeShares(config, w, sunny, from, target);
  const got = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const rng = seededRng(hashSeed('odds-weather', i));
    let id = sunny;
    for (const hour of [9, 13])
      id = pickRow(chainRow(config.bundle.weatherChain, config.weather, id, isNight(hour, w)), rng)!;
    const type = config.weather.get(id)!.type;
    got.set(type, (got.get(type) ?? 0) + 1);
  }
  for (const [type, p] of shares)
    rate('竞猜：天气', `晴天 6 点出题、13 点换天后是第 ${type} 类`, got.get(type) ?? 0, n, p);
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

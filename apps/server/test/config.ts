import { readFileSync } from 'node:fs';
import { createGameConfig, type ConfigBundle, type GameConfig } from '@dt/config';

let config: GameConfig | null = null;
/**
 * 测试用的配置：真实数据，但菜谱的存储位倒过来排（重新编号 PR 3）。
 * 真实数据里存储位暂时等于编号，按编号去取学会记录的代码在线上碰巧也对；测试里故意让两者不同，
 * 这类代码就会让测试失败。行为上和真实配置完全一样
 */
export function testConfig(): GameConfig {
  if (!config) {
    const b = JSON.parse(readFileSync(process.env.CONFIG_BUNDLE_PATH!, 'utf8')) as ConfigBundle;
    const n = b.cookbooks.length;
    config = createGameConfig({ ...b, cookbooks: b.cookbooks.map((c, i) => ({ ...c, slot: n - 1 - i })) });
  }
  return config;
}

/**
 * 菜价倍率设回原版 1 的配置（240-1）：按原版公式断言具体数值的测试用，比如外卖的银币、回扣。
 * 菜价倍率本身的效果由各模块里标了 240-1 的测试单独覆盖
 */
export function originalDishConfig(): GameConfig {
  const c = testConfig();
  const tuning = { ...c.tuning, settlement: { ...c.tuning.settlement, dishCoinRate: 1 } };
  return Object.assign(Object.create(Object.getPrototypeOf(c) as object) as GameConfig, c, { tuning });
}

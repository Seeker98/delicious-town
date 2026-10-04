import { loadGameConfig, type GameConfig } from '@dt/config';

let config: GameConfig | null = null;
export function testConfig(): GameConfig {
  config ??= loadGameConfig(process.env.CONFIG_BUNDLE_PATH!);
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
